import { Router } from 'express'
import upiPackage from 'codemode-upi-pay'
import rateLimit from 'express-rate-limit'
import { ah, HttpError } from '../lib.js'

export function upiPreviewRouter(env = process.env, { requireAdmin } = {}) {
  const router = Router()
  const preview = ah(async (req, res) => {
    const vpa = (env.UPI_ID || '').trim()
    const name = (env.UPI_NAME || '').trim()
    if (!/^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$/i.test(vpa) || !name || name.length > 120) {
      throw new HttpError(503, 'UPI preview requires a valid UPI_ID and UPI_NAME on the server.')
    }
    // No order, payment attempt, Gmail access or database writes. This note
    // cannot match a production GLM payment reference. No client input is used.
    const link = upiPackage.payLink({ vpa, name, amount: 1.01, ref: 'GLAMORA_PREVIEW_DO_NOT_PAY' })
    res.set({ 'Cache-Control': 'private, no-store', Vary: 'Authorization' }).json({ preview: true,
      upiId: vpa, payeeName: name, amount: 1.01, link, qr: await upiPackage.qrSvg(link), paymentConfirmation: false })
  })
  // Production-capable endpoint: Clerk session plus server-side super_admin role.
  // Missing authentication middleware fails closed, including in isolated use.
  router.get('/upi/preview', ...(requireAdmin || [(req, res) => res.status(401).json({ error: 'Authentication required.' })]),
    rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false }), preview)
  router.get('/dev/upi-preview', ah(async (req, res) => {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)
    if (env.NODE_ENV === 'production' || env.VERCEL || !loopback || !localHost) throw new HttpError(404, 'Not found.')
    return preview(req, res)
  }))
  return router
}
