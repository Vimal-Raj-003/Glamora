import { classifyCredit, paise } from './upi-security.js'
import { HttpError } from '../lib.js'

const payloads = (r) => r.rows.map((r) => r.payload)
export class GlamoraUpiStore {
  constructor(pool, config) { this.pool = pool; this.config = config }
  async init() {} // Schema is installed explicitly; never migrate on a request.
  async transaction(fn) {
    const c = await this.pool.connect()
    try {
      await c.query('BEGIN')
      await c.query("SELECT pg_advisory_xact_lock(71492021)")
      const out = await fn(c)
      await c.query('COMMIT')
      return out
    } catch (e) { await c.query('ROLLBACK'); throw e } finally { c.release() }
  }
  async getPayment(id) { return payloads(await this.pool.query('SELECT payload FROM glamora_upi_attempts WHERE id=$1', [id]))[0] || null }
  async listPayments({ orderId = null, status = null, limit = 50 } = {}) {
    return payloads(await this.pool.query(`SELECT payload FROM glamora_upi_attempts
      WHERE ($1::text IS NULL OR payload->>'orderId'=$1) AND ($2::text IS NULL OR payload->>'status'=$2)
      ORDER BY payload->>'createdAt' DESC LIMIT $3`, [orderId, status, Math.min(limit, 500)]))
  }
  async createPayment(i) {
    return this.transaction(async (c) => {
      const order = (await c.query('SELECT status,total FROM "Order" WHERE id=$1 FOR UPDATE', [i.orderId])).rows[0]
      if (!order || order.status !== 'pending' || paise(order.total) !== paise(i.amount)) throw new HttpError(409, 'Order no longer payable.')
      const old = payloads(await c.query("SELECT payload FROM glamora_upi_attempts WHERE payload->>'orderId'=$1", [i.orderId]))
      const reusable = old.find((p) => p.status === 'pending' && Date.parse(p.expiresAt) > Date.now() + 120000)
      if (reusable) return reusable
      if (old.some((p) => ['paid', 'underpaid', 'overpaid'].includes(p.status))) throw new HttpError(409, 'A credit needs confirmation or support review. Do not pay again.')
      if (old.filter((p) => Date.parse(p.expiresAt) > Date.now()).length >= 5) throw new HttpError(429, 'Too many open attempts. Wait before retrying.')
      // Amounts are never used to attribute payments: only verified references.
      // New customer QR codes request the exact server-calculated order total.
      const p = { ...i, payAmount: paise(i.amount) / 100, status: 'pending',
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(),
        paidAt: null, paidAmount: null, utr: null, bank: null, payer: null, matchedBy: null, utrTries: 0,
        destination: this.config.vpa, accountLast4: this.config.account }
      await c.query('INSERT INTO glamora_upi_attempts(id,payload) VALUES($1,$2)', [p.id, JSON.stringify(p)])
      return p
    })
  }
  async ingestAlerts(alerts) {
    return this.transaction(async (c) => {
      for (const a of alerts) {
        if (!a.verified || !a.evidenceHash || !/^\d{12}$/.test(a.utr) ||
          a.accountLast4 !== this.config.account || !this.config.senders.includes(a.sender)) continue
        await c.query('INSERT INTO glamora_upi_credits(utr,payload) VALUES($1,$2) ON CONFLICT(utr) DO NOTHING', [a.utr, JSON.stringify(a)])
      }
      return this.match(c)
    })
  }
  async match(c) {
    const alerts = payloads(await c.query('SELECT payload FROM glamora_upi_credits WHERE "paymentId" IS NULL ORDER BY payload->>\'receivedAt\''))
    const payments = payloads(await c.query("SELECT payload FROM glamora_upi_attempts WHERE payload->>'status'='pending'"))
    const settled = []
    for (const a of alerts) {
      const p = payments.find((p) => p.status === 'pending' && p.ref === a.ref)
      const status = p && classifyCredit(p, a)
      if (!status) continue // Missing/wrong reference never falls back to amount alone.
      Object.assign(p, { status, paidAmount: a.amount, paidAt: new Date().toISOString(), utr: a.utr,
        bank: a.bank, matchedBy: 'ref', evidenceHash: a.evidenceHash })
      await c.query('UPDATE glamora_upi_credits SET "paymentId"=$1 WHERE utr=$2', [p.id, a.utr])
      await c.query('UPDATE glamora_upi_attempts SET payload=$2 WHERE id=$1', [p.id, JSON.stringify(p)])
      settled.push(p)
    }
    return settled
  }
  async matchAlerts() { return this.transaction((c) => this.match(c)) }
  async claimUtr(id, utr) {
    return this.transaction(async (c) => {
      const p = payloads(await c.query('SELECT payload FROM glamora_upi_attempts WHERE id=$1', [id]))[0]
      if (!p) throw new HttpError(404, 'Payment not found.')
      if (p.status !== 'pending') return { result: p.status, settled: false, payment: p }
      if (p.utrTries >= 5) throw new HttpError(429, 'Too many UTR checks. Please contact support.')
      p.utrTries++
      await c.query('UPDATE glamora_upi_attempts SET payload=$2 WHERE id=$1', [id, JSON.stringify(p)])
      const a = (await c.query('SELECT "paymentId",payload FROM glamora_upi_credits WHERE utr=$1', [utr])).rows[0]
      if (a?.paymentId && a.paymentId !== id) return { result: 'used', settled: false, payment: p }
      // A typed UTR is a lookup hint, never independent authority to claim somebody else's credit.
      if (!a || a.payload.ref !== p.ref) return { result: 'not_found', settled: false, payment: p }
      const matched = await this.match(c)
      const done = matched.find((x) => x.id === id)
      return { result: done?.status || 'not_found', settled: Boolean(done), payment: done || p }
    })
  }
  async claimSync(minSeconds = 10) {
    const token = crypto.randomUUID()
    const r = await this.pool.query(`UPDATE glamora_upi_inbox SET "leaseToken"=$1,"leaseUntil"=now()+interval '25 seconds',"lastRun"=now()
      WHERE id=1 AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) AND ("lastRun" IS NULL OR "lastRun"<now()-($2*interval '1 second')) RETURNING *`, [token, minSeconds])
    if (!r.rows.length) return null
    this.token = token
    return { lastUid: Number(r.rows[0].lastUid), uidValidity: r.rows[0].uidValidity }
  }
  async finishSync(r) {
    await this.pool.query(`UPDATE glamora_upi_inbox SET "lastUid"=COALESCE($2,"lastUid"),"uidValidity"=COALESCE($3,"uidValidity"),
      "lastError"=$4,"lastOk"=CASE WHEN $4::text IS NULL THEN now() ELSE "lastOk" END,"leaseUntil"=NULL,"leaseToken"=NULL
      WHERE id=1 AND "leaseToken"=$1`, [this.token, r.lastUid, r.uidValidity == null ? null : String(r.uidValidity), r.error])
  }
  async syncStatus() { return (await this.pool.query('SELECT "lastRun","lastOk","lastError" FROM glamora_upi_inbox WHERE id=1')).rows[0] }
  async unmatchedAlerts(limit = 50) { return payloads(await this.pool.query('SELECT payload FROM glamora_upi_credits WHERE "paymentId" IS NULL LIMIT $1', [limit])) }
}
