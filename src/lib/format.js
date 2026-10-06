const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatPrice = (n) => inr.format(Number(n) || 0)

export const FREE_SHIPPING_THRESHOLD = 999
export const SHIPPING_FEE = 80

// Cart lines look like { quantity, product }. Free when the cart is empty, over the threshold, or when
// every product in it is a free-shipping product (e.g. the ₹1 test offer). The server applies the same rule.
export const isFreeShippingCart = (lines) => lines.length > 0 && lines.every((l) => l.product.freeShipping)

export const shippingFor = (subtotal, lines = []) =>
  subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD || isFreeShippingCart(lines) ? 0 : SHIPPING_FEE

// Most a customer may put in the cart for a product (stock and any per-order limit)
export const maxQuantity = (product) => Math.max(Math.min(product.stock ?? 99, product.maxPerOrder ?? 99), 0)

export const discountPercent = (price, compare) =>
  compare && compare > price ? Math.round(((compare - price) / compare) * 100) : 0

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
