const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const formatPrice = (n) => inr.format(Number(n) || 0)

export const FREE_SHIPPING_THRESHOLD = 999
export const SHIPPING_FEE = 80

export const shippingFor = (subtotal) => (subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE)

export const discountPercent = (price, compare) =>
  compare && compare > price ? Math.round(((compare - price) / compare) * 100) : 0

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
