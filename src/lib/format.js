const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatPrice = (n) => inr.format(Number(n) || 0)

// Orders below Rs 1000 ship free; Rs 1000 or more pay a flat Rs 80. This is only for showing the amount:
// the server applies the same rule itself when it prices the order and creates the payment.
export const FREE_SHIPPING_BELOW = 1000
export const SHIPPING_FEE = 80
export const shippingFor = (subtotal) => (Number(subtotal) >= FREE_SHIPPING_BELOW ? SHIPPING_FEE : 0)

// Most a customer may put in the cart for a product (stock and any per-order limit)
export const maxQuantity = (product) => Math.max(Math.min(product.stock ?? 99, product.maxPerOrder ?? 99), 0)

export const discountPercent = (price, compare) =>
  compare && compare > price ? Math.round(((compare - price) / compare) * 100) : 0

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
