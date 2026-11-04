import crypto from 'node:crypto'
import pg from 'pg'
import upiPackage from 'codemode-upi-pay'
import { GlamoraUpiStore } from './upi-store.js'
import { paymentConfig } from './upi-security.js'
import { readVerifiedInbox } from './upi-inbox.js'
import { finalizeUpiOrder } from './upi-finalize.js'
import { HttpError } from '../lib.js'

export function createUpiService({ env = process.env, pool: suppliedPool, inboxReader = readVerifiedInbox } = {}) {
  const config = paymentConfig(env)
  // Deliberately no HTTP simulation route or environment-driven live test mode.
  const enabled = config.ready && env.UPI_VERIFICATION_ENABLED === '1'
  const pool = suppliedPool || new pg.Pool({ connectionString: env.DATABASE_URL, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, query_timeout: 8000 })
  const store = new GlamoraUpiStore(pool, config)
  const sdk = config.vpa && config.name ? upiPackage.createUpiPay({ vpa: config.vpa, payeeName: config.name,
    store, refPrefix: 'GLM', testMode: false, logger: { info() {}, warn() {}, error() {} } }) : null
  let running
  const requireReady = () => {
    if (!enabled || !sdk) throw new HttpError(503, 'UPI checkout is awaiting bank-email verification setup. Please contact support before paying.')
  }
  async function reconcile() {
    const rows = await pool.query(`SELECT a.id FROM glamora_upi_attempts a
      WHERE a.payload->>'status'='paid' AND NOT EXISTS(SELECT 1 FROM "Payment" p WHERE p."upiPaymentId"=a.id) LIMIT 50`)
    for (const r of rows.rows) await finalizeUpiOrder(store, r.id)
  }
  async function sync() {
    requireReady()
    if (running) return running
    running = (async () => {
      let error = null
      const state = await store.claimSync(10)
      if (state) {
        try {
          const result = await inboxReader(config, state, env)
          await store.ingestAlerts(result.alerts)
          await store.finishSync({ ...result, error: null })
        } catch {
          error = 'Bank confirmation is temporarily delayed. Do not pay again; check this order later or contact support.'
          await store.finishSync({ lastUid: null, uidValidity: null, error })
        }
      }
      await reconcile() // Also recover settlements committed before a crash.
      const last = await store.syncStatus()
      return { delayed: Boolean(error || last?.lastError) }
    })()
    try { return await running } finally { running = null }
  }
  async function publicPayment(id) {
    const p = await store.getPayment(id)
    if (!p) throw new HttpError(404, 'Payment not found.')
    const publicP = await sdk.toPublic(p, true)
    // The library knows pending/paid/underpaid; retain our overpayment review status.
    return { ...publicP, status: p.status === 'overpaid' ? 'overpaid' : publicP.status }
  }
  return {
    store, enabled, requireReady, sync, reconcile,
    async create(order) {
      requireReady()
      if ((await store.listPayments({ orderId: order.id, limit: 1 })).length) {
        const recovered = await sync()
        if (recovered.delayed) throw new HttpError(503, 'Bank confirmation is delayed. Do not pay again; check your order later.')
      }
      // SDK's Number equality rejects some valid decimal totals. Validate in integer
      // paise, allocate with our atomic Store, and use the SDK's public QR/link output.
      const cents = Math.round(Number(order.total) * 100)
      if (!Number.isSafeInteger(cents) || cents < 100) throw new HttpError(400, 'Order total must be at least ₹1.')
      const ref = 'GLM' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('')
      const p = await store.createPayment({ id: 'pay_' + crypto.randomBytes(12).toString('hex'), ref,
        amount: cents / 100, orderId: order.id, metadata: {} })
      return { orderId: order.id, payment: await publicPayment(p.id) }
    },
    async status(orderId, id) {
      requireReady()
      const p = await store.getPayment(id)
      if (!p || p.orderId !== orderId) throw new HttpError(404, 'Payment not found.')
      const result = await sync()
      const payment = await publicPayment(id)
      const recorded = (await pool.query('SELECT status FROM "Payment" WHERE "upiPaymentId"=$1', [id])).rows[0]
      return { payment, ...result, finalized: recorded?.status === 'captured', review: recorded?.status === 'review' || recorded?.status === 'duplicate' }
    },
    async claim(orderId, id, utr) {
      requireReady()
      const p = await store.getPayment(id)
      if (!p || p.orderId !== orderId) throw new HttpError(404, 'Payment not found.')
      if (!/^\d{12}$/.test(utr)) throw new HttpError(400, 'Enter a 12-digit UTR.')
      await sync()
      const claim = await store.claimUtr(id, utr)
      return { ...(await this.status(orderId, id)), result: claim.result, triesLeft: Math.max(0, 5 - claim.payment.utrTries) }
    },
    async diagnostics() { return { configured: config.ready, enabled, ...(await store.syncStatus()) } },
    close: () => pool.end(),
  }
}
