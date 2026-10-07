const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatPrice = (n) => inr.format(Number(n) || 0)

// Every order ships free (the server applies the same rule when it prices an order).
export const SHIPPING_FEE = 0
export const shippingFor = () => SHIPPING_FEE

// Most a customer may put in the cart for a product (stock and any per-order limit)
export const maxQuantity = (product) => Math.max(Math.min(product.stock ?? 99, product.maxPerOrder ?? 99), 0)

export const discountPercent = (price, compare) =>
  compare && compare > price ? Math.round(((compare - price) / compare) * 100) : 0

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
