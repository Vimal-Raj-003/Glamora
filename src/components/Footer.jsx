import { Link } from 'react-router-dom'
import { CATEGORY_LINKS, STORE } from '../config/store'

const POLICIES = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms-and-conditions', label: 'Terms & Conditions' },
  { to: '/shipping-policy', label: 'Shipping Policy' },
  { to: '/return-refund-policy', label: 'Return & Refund Policy' },
]

export default function Footer() {
  return (
    <footer className="mt-12 bg-ink text-white md:mt-24">
      <div className="container-x grid grid-cols-2 gap-x-6 gap-y-5 py-8 md:grid-cols-4 md:gap-10 md:py-14">
        <div className="col-span-2 md:col-span-1">
          <p className="font-serif text-2xl font-bold tracking-[0.18em]">
            GLAM<span className="text-crimson">ORA</span>
          </p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60 md:mt-4">
            Premium makeup for every face. Bold colour, flawless finish and formulas you can trust.
          </p>
          <div className="mt-4 hidden md:block">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50">Customer Care</h4>
            <ul className="mt-1 text-sm">
              <li><a href={`tel:${STORE.supportPhoneTel}`} className="inline-block py-2 text-white/80 hover:text-crimson">Call Support</a></li>
              <li><a href={`mailto:${STORE.supportEmail}`} className="inline-block py-2 text-white/80 hover:text-crimson">Email Support</a></li>
            </ul>
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50">Shop</h4>
          <ul className="mt-1 space-y-0 text-sm md:mt-3">
            {CATEGORY_LINKS.map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className="block py-2 text-white/80 hover:text-crimson md:inline-block md:py-2.5">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50">Account</h4>
          <ul className="mt-1 space-y-0 text-sm md:mt-3">
            <li><Link to="/account" className="block py-2 text-white/80 hover:text-crimson md:inline-block md:py-2.5">My orders</Link></li>
            <li><Link to="/wishlist" className="block py-2 text-white/80 hover:text-crimson md:inline-block md:py-2.5">Wishlist</Link></li>
            <li><Link to="/cart" className="block py-2 text-white/80 hover:text-crimson md:inline-block md:py-2.5">Cart</Link></li>
            <li><Link to="/login" className="block py-2 text-white/80 hover:text-crimson md:inline-block md:py-2.5">Log in</Link></li>
          </ul>
        </div>
        <div className="md:hidden">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50">Customer Care</h4>
          <ul className="mt-1 space-y-0 text-sm">
            <li><a href={`tel:${STORE.supportPhoneTel}`} className="block py-2 text-white/80 hover:text-crimson">Call Support</a></li>
            <li><a href={`mailto:${STORE.supportEmail}`} className="block py-2 text-white/80 hover:text-crimson">Email Support</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50"><span className="md:hidden">Legal</span><span className="hidden md:inline">Policies</span></h4>
          <ul className="mt-1 space-y-0 text-sm md:mt-3">
            {POLICIES.map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="block py-2 text-white/80 hover:text-crimson md:inline-block md:py-2.5">{p.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 pb-20 pt-4 text-center text-xs text-white/50 md:py-5">
        © {new Date().getFullYear()} {STORE.name}. All rights reserved.
      </div>
    </footer>
  )
}
