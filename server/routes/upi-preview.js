import { Router } from 'express'
import upiPackage from 'codemode-upi-pay'
import { ah, HttpError } from '../lib.js'

export function upiPreviewRouter(env = process.env) {
  const router = Router()
  router.get('/dev/upi-preview', ah(async (req, res) => {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)
    if (env.NODE_ENV === 'production' || env.VERCEL || !loopback || !localHost) throw new HttpError(404, 'Not found.')
    if (!env.UPI_ID || !env.UPI_NAME) throw new HttpError(503, 'Set UPI_ID and UPI_NAME in the local environment file.')
    // Visual destination check only. No order, payment attempt, Gmail access or
    // database writes. This note cannot match a production GLM payment reference.
    const link = upiPackage.payLink({ vpa: env.UPI_ID, name: env.UPI_NAME, amount: 1.01, ref: 'GLAMORA_PREVIEW_DO_NOT_PAY' })
    res.set('Cache-Control', 'no-store').json({ preview: true, upiId: env.UPI_ID, payeeName: env.UPI_NAME,
      amount: 1.01, link, qr: await upiPackage.qrSvg(link), paymentConfirmation: false })
  }))
  return router
}
