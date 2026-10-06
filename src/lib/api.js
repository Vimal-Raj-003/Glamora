import { supabase, isSupabaseConfigured } from './supabase'
import { SEED_CATEGORIES, SEED_PRODUCTS } from '../data/seed'

const PRODUCT_SELECT = '*, category:categories(slug, name)'

const SORTS = {
  popular: { column: 'popularity', ascending: false },
  newest: { column: 'created_at', ascending: false },
  'price-asc': { column: 'price', ascending: true },
  'price-desc': { column: 'price', ascending: false },
}

const withSeedCategory = (prod) => {
  const c = SEED_CATEGORIES.find((x) => x.id === prod.category_id)
  return { ...prod, category: c ? { slug: c.slug, name: c.name } : null }
}

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

// ---------- Catalogue ----------

export async function getCategories() {
  if (!isSupabaseConfigured) return SEED_CATEGORIES
  return unwrap(await supabase.from('categories').select('*').order('sort_order'))
}

export async function getProducts({ categorySlug, search, sort = 'popular', featured, limit, includeInactive = false } = {}) {
  if (!isSupabaseConfigured) {
    let list = SEED_PRODUCTS.map(withSeedCategory)
    if (categorySlug) list = list.filter((x) => x.category?.slug === categorySlug)
    if (featured) list = list.filter((x) => x.is_featured)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((x) => x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q))
    }
    const s = SORTS[sort] || SORTS.popular
    list.sort((a, b) => {
      const av = s.column === 'created_at' ? new Date(a.created_at) : a[s.column]
      const bv = s.column === 'created_at' ? new Date(b.created_at) : b[s.column]
      return s.ascending ? av - bv : bv - av
    })
    return limit ? list.slice(0, limit) : list
  }

  let categoryId
  if (categorySlug) {
    const cat = unwrap(await supabase.from('categories').select('id').eq('slug', categorySlug).maybeSingle())
    if (!cat) return []
    categoryId = cat.id
  }

  const s = SORTS[sort] || SORTS.popular
  let q = supabase.from('products').select(PRODUCT_SELECT).order(s.column, { ascending: s.ascending })
  if (!includeInactive) q = q.eq('is_active', true)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (featured) q = q.eq('is_featured', true)
  if (search) {
    const safe = search.replace(/[,()%*]/g, ' ').trim()
    if (safe) q = q.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`)
  }
  if (limit) q = q.limit(limit)
  return unwrap(await q)
}

export async function getProduct(slug) {
  if (!isSupabaseConfigured) {
    const prod = SEED_PRODUCTS.find((x) => x.slug === slug)
    return prod ? withSeedCategory(prod) : null
  }
  return unwrap(await supabase.from('products').select(PRODUCT_SELECT).eq('slug', slug).eq('is_active', true).maybeSingle())
}

export async function getProductsByIds(ids) {
  if (!ids.length) return []
  if (!isSupabaseConfigured) return SEED_PRODUCTS.filter((x) => ids.includes(x.id)).map(withSeedCategory)
  return unwrap(await supabase.from('products').select(PRODUCT_SELECT).in('id', ids))
}

// ---------- Cart sync ----------

export async function fetchRemoteCart(userId) {
  const rows = unwrap(await supabase.from('cart_items').select('product_id, quantity').eq('user_id', userId))
  return rows.map((r) => ({ productId: r.product_id, quantity: r.quantity }))
}

export async function replaceRemoteCart(userId, items) {
  unwrap(await supabase.from('cart_items').delete().eq('user_id', userId))
  if (items.length) {
    unwrap(
      await supabase.from('cart_items').insert(items.map((i) => ({ user_id: userId, product_id: i.productId, quantity: i.quantity }))),
    )
  }
}

// ---------- Addresses ----------

export async function getAddresses(userId) {
  return unwrap(await supabase.from('addresses').select('*').eq('user_id', userId).order('created_at', { ascending: false }))
}

export async function saveAddress(userId, address) {
  const payload = { ...address, user_id: userId }
  if (payload.id) {
    return unwrap(await supabase.from('addresses').update(payload).eq('id', payload.id).select().single())
  }
  delete payload.id
  return unwrap(await supabase.from('addresses').insert(payload).select().single())
}

export async function deleteAddress(id) {
  unwrap(await supabase.from('addresses').delete().eq('id', id))
}

// ---------- Orders ----------

export async function getMyOrders(userId) {
  return unwrap(
    await supabase.from('orders').select('*, items:order_items(*)').eq('user_id', userId).order('created_at', { ascending: false }),
  )
}

export async function getOrder(id) {
  return unwrap(await supabase.from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle())
}

export async function createOrder(items, address) {
  const { data, error } = await supabase.functions.invoke('create-order', {
    body: { items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })), address },
  })
  if (error) throw new Error(await edgeError(error))
  if (data?.error) throw new Error(data.error)
  return data
}

export async function verifyPayment(payload) {
  const { data, error } = await supabase.functions.invoke('verify-payment', { body: payload })
  if (error) throw new Error(await edgeError(error))
  if (data?.error) throw new Error(data.error)
  return data
}

async function edgeError(error) {
  try {
    const body = await error.context.json()
    return body.error || error.message
  } catch {
    return error.message
  }
}

// ---------- Admin ----------

export async function adminSaveProduct(product) {
  const payload = { ...product }
  delete payload.category
  if (payload.id) {
    return unwrap(await supabase.from('products').update(payload).eq('id', payload.id).select().single())
  }
  delete payload.id
  return unwrap(await supabase.from('products').insert(payload).select().single())
}

export async function adminDeleteProduct(id) {
  unwrap(await supabase.from('products').delete().eq('id', id))
}

export async function adminUploadImage(file) {
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(path, file, { cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

export async function adminGetOrders() {
  return unwrap(
    await supabase
      .from('orders')
      .select('*, items:order_items(*), profile:profiles(full_name, phone)')
      .order('created_at', { ascending: false }),
  )
}

export async function adminUpdateOrderStatus(id, status) {
  unwrap(await supabase.from('orders').update({ status }).eq('id', id))
}
