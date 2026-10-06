// Thin client for the Glamora API (Express + Prisma + Neon). All calls go to /api/*.

let tokenGetter = null
export const setTokenGetter = (fn) => {
  tokenGetter = fn
}

async function request(path, { method = 'GET', body, query } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const token = tokenGetter ? await tokenGetter().catch(() => null) : null
  if (token) headers.Authorization = `Bearer ${token}`

  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : ''
  let res
  try {
    res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error('Cannot reach the server. Please check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

// ---------- Catalogue ----------
export const getCategories = () => request('/categories')

export const getProducts = ({ categorySlug, search, sort, featured, limit } = {}) =>
  request('/products', { query: { category: categorySlug, search, sort, featured: featured ? '1' : undefined, limit } })

export const getProduct = (slug) => request(`/products/${encodeURIComponent(slug)}`).catch((e) => (/not found/i.test(e.message) ? null : Promise.reject(e)))

export const getProductsByIds = (ids) => (ids.length ? request('/products', { query: { ids: ids.join(',') } }) : Promise.resolve([]))

// ---------- Account ----------
export const getMe = () => request('/me')
export const updateMe = (data) => request('/me', { method: 'PATCH', body: data })

export const fetchRemoteCart = () => request('/cart')
export const replaceRemoteCart = (items) => request('/cart', { method: 'PUT', body: { items } })

export const getWishlist = () => request('/wishlist')
export const addToWishlist = (productId) => request(`/wishlist/${productId}`, { method: 'PUT' })
export const removeFromWishlist = (productId) => request(`/wishlist/${productId}`, { method: 'DELETE' })

export const getAddresses = () => request('/addresses')
export const saveAddress = (address) => {
  const { id, ...data } = address
  return id ? request(`/addresses/${id}`, { method: 'PUT', body: data }) : request('/addresses', { method: 'POST', body: data })
}
export const deleteAddress = (id) => request(`/addresses/${id}`, { method: 'DELETE' })

// ---------- Orders & payments ----------
export const getMyOrders = () => request('/orders')
export const getOrder = (id) => request(`/orders/${id}`)
export const createOrder = (items, address) => request('/orders', { method: 'POST', body: { items, address } })
// Re-opens payment for an order that is still unpaid (popup closed, payment failed, ...)
export const getPayInit = (orderId) => request(`/orders/${orderId}/pay`, { method: 'POST' })
export const verifyPayment = (payload) => request('/orders/verify', { method: 'POST', body: payload })

// ---------- Admin (Super Admin only) ----------
export const adminGetStats = (days = 30) => request('/admin/stats', { query: { days } })
export const adminGetProducts = () => request('/admin/products')
export const adminSaveProduct = (product) => {
  const { id, ...data } = product
  return id ? request(`/admin/products/${id}`, { method: 'PUT', body: data }) : request('/admin/products', { method: 'POST', body: data })
}
export const adminDeleteProduct = (id) => request(`/admin/products/${id}`, { method: 'DELETE' })
export const adminGetOrders = () => request('/admin/orders')
export const adminUpdateOrderStatus = (id, status) => request(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status } })
export const adminGetCustomers = () => request('/admin/customers')
