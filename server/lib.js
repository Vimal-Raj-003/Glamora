import { z } from 'zod'

// Shipping rule: orders below Rs 1000 ship free; orders of Rs 1000 or more pay a flat Rs 80.
export const FREE_SHIPPING_BELOW = 1000
export const SHIPPING_FEE = 80
export const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']
export const PAID_STATUSES = ['paid', 'processing', 'shipped', 'delivered']
export const MIN_ORDER_PAISE = 100 // Razorpay's minimum is ₹1

// Wraps an async route so rejected promises reach the Express error handler.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const parse = (schema, data) => {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
    throw new HttpError(400, `${path}${issue.message}`)
  }
  return result.data
}

export const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).nullish().transform((v) => v || null),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  country: z.string().trim().max(60).default('India'),
  isDefault: z.boolean().optional().default(false),
})

export const money = (n) => Math.round(Number(n) * 100) / 100

// The order code asks here. `subtotal` is the items total (before shipping); the server is the only source of truth.
export const shippingFor = (subtotal) => (Number(subtotal) >= FREE_SHIPPING_BELOW ? SHIPPING_FEE : 0)

export const adminEmails = () =>
  new Set(
    (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
