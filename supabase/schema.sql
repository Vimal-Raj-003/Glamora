-- =====================================================================
-- GLAMORA — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / ON CONFLICT where possible.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  image_url    text,
  sort_order   int not null default 0
);

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid not null references public.categories(id) on delete restrict,
  slug              text not null unique,
  name              text not null,
  description       text,
  price             numeric(10,2) not null check (price >= 0),
  compare_at_price  numeric(10,2) check (compare_at_price is null or compare_at_price >= 0),
  stock             int not null default 0 check (stock >= 0),
  image_url         text not null,
  is_featured       boolean not null default false,
  is_active         boolean not null default true,
  popularity        int not null default 0,
  created_at        timestamptz not null default now()
);

create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  sort_order  int not null default 0
);

create table if not exists public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  quantity    int not null check (quantity > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  full_name    text not null,
  phone        text not null,
  line1        text not null,
  line2        text,
  city         text not null,
  state        text not null,
  postal_code  text not null,
  country      text not null default 'India',
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete restrict,
  status             text not null default 'pending'
                       check (status in ('pending','paid','processing','shipped','delivered','cancelled')),
  subtotal           numeric(10,2) not null check (subtotal >= 0),
  shipping_fee       numeric(10,2) not null default 0 check (shipping_fee >= 0),
  total              numeric(10,2) not null check (total >= 0),
  shipping_address   jsonb not null,
  razorpay_order_id  text unique,
  created_at         timestamptz not null default now()
);

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  name        text not null,
  price       numeric(10,2) not null check (price >= 0),
  quantity    int not null check (quantity > 0),
  image_url   text
);

create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  razorpay_order_id     text not null,
  razorpay_payment_id   text not null unique,
  razorpay_signature    text not null,
  amount                numeric(10,2) not null,
  status                text not null default 'captured',
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------

create index if not exists idx_products_category   on public.products (category_id);
create index if not exists idx_products_active     on public.products (is_active, is_featured);
create index if not exists idx_products_created    on public.products (created_at desc);
create index if not exists idx_product_images_prod on public.product_images (product_id);
create index if not exists idx_cart_items_user     on public.cart_items (user_id);
create index if not exists idx_addresses_user      on public.addresses (user_id);
create index if not exists idx_orders_user         on public.orders (user_id, created_at desc);
create index if not exists idx_order_items_order   on public.order_items (order_id);
create index if not exists idx_payments_order      on public.payments (order_id);

-- ---------------------------------------------------------------------
-- 3. FUNCTIONS & TRIGGERS
-- ---------------------------------------------------------------------

-- Is the current user an admin? (security definer avoids RLS recursion on profiles)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Create a profile whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only one default address per user
create or replace function public.enforce_single_default_address()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.addresses set is_default = false
    where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_single_default_address on public.addresses;
create trigger trg_single_default_address
  after insert or update of is_default on public.addresses
  for each row when (new.is_default)
  execute function public.enforce_single_default_address();

-- Called ONLY by the verify-payment Edge Function (service role).
-- Marks the order paid, records the payment, reduces stock and empties the cart — atomically.
create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Idempotent: already finalised
  if v_order.status <> 'pending' then
    return;
  end if;

  update public.orders set status = 'paid' where id = p_order_id;

  insert into public.payments (order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature, amount)
  values (p_order_id, p_razorpay_order_id, p_razorpay_payment_id, p_razorpay_signature, v_order.total)
  on conflict (razorpay_payment_id) do nothing;

  update public.products p
     set stock = greatest(p.stock - oi.quantity, 0)
    from public.order_items oi
   where oi.order_id = p_order_id and oi.product_id = p.id;

  delete from public.cart_items where user_id = v_order.user_id;
end;
$$;

revoke all on function public.finalize_paid_order(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_paid_order(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.cart_items     enable row level security;
alter table public.addresses      enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.payments       enable row level security;

-- profiles: read/update own (but never change own role); admins read all
drop policy if exists "profiles_select_own"   on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_own"   on public.profiles;
create policy "profiles_select_own"   on public.profiles for select using (id = auth.uid());
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_own"   on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- categories: public read, admin write
drop policy if exists "categories_read"        on public.categories;
drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_read"        on public.categories for select using (true);
create policy "categories_admin_write" on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- products: public sees active ones, admin sees & writes everything
drop policy if exists "products_read_active"  on public.products;
drop policy if exists "products_admin_all"    on public.products;
create policy "products_read_active" on public.products for select using (is_active or public.is_admin());
create policy "products_admin_all"   on public.products for all using (public.is_admin()) with check (public.is_admin());

-- product_images: public read, admin write
drop policy if exists "product_images_read"  on public.product_images;
drop policy if exists "product_images_admin" on public.product_images;
create policy "product_images_read"  on public.product_images for select using (true);
create policy "product_images_admin" on public.product_images for all using (public.is_admin()) with check (public.is_admin());

-- cart_items: own rows only
drop policy if exists "cart_own" on public.cart_items;
create policy "cart_own" on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- addresses: own rows only
drop policy if exists "addresses_own" on public.addresses;
create policy "addresses_own" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- orders: read own; admins read all & update status. Inserts happen only via the Edge Function (service role).
drop policy if exists "orders_select_own"   on public.orders;
drop policy if exists "orders_select_admin" on public.orders;
drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_select_own"   on public.orders for select using (user_id = auth.uid());
create policy "orders_select_admin" on public.orders for select using (public.is_admin());
create policy "orders_update_admin" on public.orders for update using (public.is_admin()) with check (public.is_admin());

-- order_items: read via parent order
drop policy if exists "order_items_select_own"   on public.order_items;
drop policy if exists "order_items_select_admin" on public.order_items;
create policy "order_items_select_own" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "order_items_select_admin" on public.order_items for select using (public.is_admin());

-- payments: read via parent order
drop policy if exists "payments_select_own"   on public.payments;
drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_own" on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "payments_select_admin" on public.payments for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. STORAGE (product image uploads from the admin panel)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read"  on storage.objects;
drop policy if exists "product_images_admin_insert" on storage.objects;
drop policy if exists "product_images_admin_update" on storage.objects;
drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_public_read"  on storage.objects for select using (bucket_id = 'product-images');
create policy "product_images_admin_insert" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_update" on storage.objects for update using (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_delete" on storage.objects for delete using (bucket_id = 'product-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- 6. SEED DATA
-- (Images are served from the website's /images folder. Replace with
--  Supabase Storage URLs later if you prefer.)
-- ---------------------------------------------------------------------

insert into public.categories (slug, name, description, image_url, sort_order) values
  ('face',         'Face',         'Foundation, concealer and blush for a flawless base.',  '/images/face/2.avif',  1),
  ('eyes',         'Eyes',         'Kajal, liner and mascara for a statement look.',        '/images/eyes/3.jpg',   2),
  ('lips',         'Lips',         'Lipsticks, glosses and liners in every shade.',         '/images/lips/1.jpg',   3),
  ('makeup-tools', 'Makeup Tools', 'Brushes, sponges and tools for pro application.',       '/images/tools/1.avif', 4)
on conflict (slug) do nothing;

insert into public.products (category_id, slug, name, description, price, compare_at_price, stock, image_url, is_featured, popularity)
select c.id, v.slug, v.name, v.description, v.price, v.compare_at_price, v.stock, v.image_url, v.is_featured, v.popularity
from (values
  ('face','silk-skin-liquid-foundation','Silk Skin Liquid Foundation','Lightweight, buildable coverage with a natural satin finish. Blends seamlessly and lasts up to 16 hours without caking.',899,1199,40,'/images/face/2.avif',true,95),
  ('face','radiance-liquid-concealer','Radiance Liquid Concealer','Full-coverage, crease-proof concealer that hides dark circles and blemishes while brightening the under-eye area.',549,699,60,'/images/face/3.avif',false,80),
  ('face','rose-petal-powder-blush','Rose Petal Powder Blush','Silky, finely milled blush in a soft rose shade that gives cheeks a fresh, healthy flush. Easily buildable.',499,null,35,'/images/face/1.jpg',true,70),
  ('eyes','smokey-black-kajal-duo','Smokey Black Kajal Duo','Intense, waterproof black kajal pencils (set of 2) with a built-in smudger. Smudge-proof and long-lasting.',349,449,80,'/images/eyes/1.jpg',true,90),
  ('eyes','volume-lash-mascara','Volume Lash Mascara','Dramatic volume and length with a flake-free formula. The flexible brush coats every lash from root to tip.',599,749,50,'/images/eyes/2.avif',false,85),
  ('eyes','precision-liquid-eyeliner','Precision Liquid Eyeliner','Ultra-fine felt tip for sharp wings and bold lines. Jet-black, quick-drying and smudge-proof all day.',399,null,70,'/images/eyes/3.jpg',true,75),
  ('lips','satin-nude-lipstick','Satin Nude Lipstick','Creamy, comfortable satin lipstick in a flattering nude-rose shade with rich, one-swipe colour payoff.',649,799,45,'/images/lips/1.jpg',true,92),
  ('lips','rosewood-lip-gloss','Rosewood Lip Gloss','High-shine, non-sticky gloss in a soft rosewood tint that adds plump, glassy dimension to lips.',449,null,55,'/images/lips/2.png',false,65),
  ('lips','coral-lip-liner','Coral Lip Liner','Creamy, long-wear lip pencil that defines and shapes lips without feathering. Pairs with any lipstick.',299,399,90,'/images/lips/3.avif',false,60),
  ('makeup-tools','professional-brush-set','Professional 11-Piece Brush Set','Complete set of soft, cruelty-free brushes for face and eyes: from foundation and powder to blending and spooley.',1499,1999,25,'/images/tools/1.avif',true,88),
  ('makeup-tools','soft-contour-beauty-sponge','Soft Contour Beauty Sponge','Ultra-soft, latex-free sponge with a precision tip for a streak-free, airbrushed finish. Expands when wet.',249,null,100,'/images/tools/2.jpg',false,72),
  ('makeup-tools','steel-eyelash-curler','Steel Eyelash Curler','Stainless-steel curler with a cushioned pad that lifts and curls lashes for a wide-awake look.',299,399,65,'/images/tools/3.jpg',false,55)
) as v(category_slug, slug, name, description, price, compare_at_price, stock, image_url, is_featured, popularity)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 7. MAKE YOURSELF AN ADMIN (run AFTER you have signed up on the site)
-- Replace the email, then run this single statement:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------------
