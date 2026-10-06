import crypto from 'node:crypto'
import { HttpError } from '../lib.js'

const isReal = (v) => Boolean(v) && !/x{4,}/i.test(v)

export const razorpayConfigured = () => isReal(process.env.RAZORPAY_KEY_ID) && isReal(process.env.RAZORPAY_KEY_SECRET)

// amount is in paise
export async function createRazorpayOrder({ amount, receipt, notes }) {
  if (!razorpayConfigured()) throw new HttpError(503, 'Payments are not configured yet.')
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount, currency: 'INR', receipt, notes }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('Razorpay order error', body)
    throw new HttpError(502, body?.error?.description || 'Could not start payment. Please try again.')
  }
  return body
}

const hmac = (secret, message) => crypto.createHmac('sha256', secret).update(message).digest('hex')

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'utf8')
  const y = Buffer.from(String(b), 'utf8')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Checkout signature: HMAC_SHA256(razorpay_order_id|razorpay_payment_id, key_secret)
export function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  const expected = hmac(process.env.RAZORPAY_KEY_SECRET || '', `${razorpayOrderId}|${razorpayPaymentId}`)
  return safeEqualHex(expected, signature)
}

// Webhook signature: HMAC_SHA256(raw body, webhook_secret)
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  return safeEqualHex(hmac(secret, rawBody), signature)
}
