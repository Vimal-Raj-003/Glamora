import crypto from 'node:crypto'
import { HttpError } from '../lib.js'

const isReal = (v) => Boolean(v) && !/x{4,}/i.test(v)

export const razorpayConfigured = () => isReal(process.env.RAZORPAY_KEY_ID) && isReal(process.env.RAZORPAY_KEY_SECRET)

const authHeader = () =>
  `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`

async function rzp(method, path, body) {
  if (!razorpayConfigured()) throw new HttpError(503, 'Payments are not configured yet.')
  let res
  try {
    res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new HttpError(502, 'Could not reach Razorpay. Please try again in a moment.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('Razorpay API error', method, path.replace(/pay_\w+/, 'pay_…'), res.status, data?.error?.code)
    throw new HttpError(502, data?.error?.description || 'Razorpay request failed. Please try again.')
  }
  return data
}

// amount is in paise
export const createRazorpayOrder = ({ amount, receipt, notes }) =>
  rzp('POST', '/orders', { amount, currency: 'INR', receipt, notes })

export const fetchRazorpayPayment = (paymentId) => rzp('GET', `/payments/${encodeURIComponent(paymentId)}`)

export const captureRazorpayPayment = (paymentId, amount) =>
  rzp('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency: 'INR' })

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

// Asks Razorpay what actually happened to this payment and confirms it matches our order:
// same Razorpay order, same amount in paise, INR, and a successful status. Captures an
// "authorized" payment when the account is not set to auto-capture.
export async function confirmPaymentWithRazorpay({ razorpayPaymentId, razorpayOrderId, expectedPaise }) {
  let payment = await fetchRazorpayPayment(razorpayPaymentId)
  if (payment.order_id !== razorpayOrderId) throw new HttpError(400, 'This payment belongs to a different order.')
  if (payment.currency !== 'INR' || Number(payment.amount) !== expectedPaise) {
    throw new HttpError(400, 'The paid amount does not match the order total.')
  }
  if (payment.status === 'authorized') payment = await captureRazorpayPayment(razorpayPaymentId, expectedPaise)
  if (payment.status !== 'captured') throw new HttpError(400, `Payment is not complete (status: ${payment.status}).`)
  return payment
}
