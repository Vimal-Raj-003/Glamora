import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createAuthMiddleware } from './auth.js'
import { catalogRouter } from './routes/catalog.js'
import { accountRouter } from './routes/account.js'
import { ordersRouter } from './routes/orders.js'
import { ordersRouter as razorpayOrdersRouter, razorpayWebhookHandler } from './routes/razorpay-orders.js'
import { createUpiService } from './services/upi.js'
import { upiPreviewRouter } from './routes/upi-preview.js'
import crypto from 'node:crypto'
import { adminRouter } from './routes/admin.js'
import { HttpError } from './lib.js'
import { corsMiddleware } from './cors.js'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

export function createApp({ prisma, authProvider, upiService }) {
  const app = express()
  const upi = upiService || createUpiService()
  app.locals.upi = upi
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  // The API is called from a different website (Vercel), so responses must be readable cross-origin.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }))

  // The webhook needs the raw request body, so it is mounted before express.json().
  app.post('/api/razorpay/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhookHandler(prisma))

  // CORS comes first so browsers' preflight (OPTIONS) requests are answered before anything else runs.
  app.use('/api', corsMiddleware())
  // Admin product forms can carry a small uploaded picture; everything else stays small.
  app.use('/api/admin', express.json({ limit: '600kb' }))
  app.use(express.json({ limit: '100kb' }))
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }))
  app.use('/api', authProvider.middleware)

  const auth = createAuthMiddleware(authProvider, prisma)

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  // Database check for deployment troubleshooting. Reports only yes/no flags and an error code, never a value or message.
  app.get('/api/health/db', async (req, res) => {
    const shape = (v) => (v ? { length: v.length, hasScheme: v.includes('://'), startsWith: /^postgres(ql)?:\/\//i.test(v), hasAtSign: v.includes('@'), hasSpace: /\s/.test(v), pooler: /-pooler\./i.test(v) } : false)
    const env = { DATABASE_URL: shape(process.env.DATABASE_URL), DIRECT_URL: shape(process.env.DIRECT_URL) }
    try {
      await prisma.$queryRaw`SELECT 1`
      const [categories, products] = await Promise.all([prisma.category.count(), prisma.product.count()])
      res.json({ ok: true, env, databaseUrlSource: process.env.DATABASE_URL_SOURCE, categories, products })
    } catch (e) {
      console.error('[health/db]', e)
      res.status(503).json({ ok: false, env, error: e?.name || 'Error', code: e?.code || e?.errorCode || null, detail: String(e?.message || '').replace(/[a-z]+:\/\/\S+/gi, '<url>').replace(/\s+/g, ' ').slice(-450) })
    }
  })
  app.use('/api', catalogRouter(prisma))
  app.use('/api', upiPreviewRouter())
  app.use('/api/admin', adminRouter(prisma, auth, upi))
  const legacyOrders = razorpayOrdersRouter(prisma, auth)
  // Accept verification callbacks for already-open Razorpay checkouts only.
  app.use('/api/orders', (req, res, next) => req.path === '/verify' ? legacyOrders(req, res, next) : next())
  app.use('/api/orders', process.env.PAYMENT_PROVIDER === 'razorpay' ? legacyOrders : ordersRouter(prisma, auth, upi))
  app.get('/api/cron/upi', async (req, res, next) => {
    const secret = process.env.CRON_SECRET || process.env.UPI_API_KEY
    const got = Buffer.from(req.get('authorization') || '')
    const want = Buffer.from(`Bearer ${secret || ''}`)
    if (!secret || got.length !== want.length || !crypto.timingSafeEqual(got, want)) return res.status(401).json({ error: 'Unauthorized' })
    try { res.json(await upi.sync()) } catch (e) { next(e) }
  })
  app.use('/api', accountRouter(prisma, auth))
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

  // In production the same server also serves the built website.
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }))
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' })
    console.error(err)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return app
}
