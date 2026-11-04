import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { GlamoraUpiStore } from '../server/services/upi-store.js'
import { finalizeUpiOrder } from '../server/services/upi-finalize.js'
import { verifyCredit, classifyCredit } from '../server/services/upi-security.js'
import { createUpiService } from '../server/services/upi.js'
import { priceOrder, ordersRouter } from '../server/routes/orders.js'
import express from 'express'
import { readVerifiedInbox } from '../server/services/upi-inbox.js'

// Synthetic identifiers only. These never use .env, Neon, Gmail or real money.
const config = { ready: true, vpa: 'fixture@upi', name: 'Fixture Shop', account: '1234', senders: ['alerts@fixture-bank.test'] }
const rawEmail = ({ amount = '100.37', account = 'XX1234', auth = 'pass', ref = 'GLMAAAA2222', debit = false } = {}) => Buffer.from([
  'Authentication-Results: mx.google.com; dmarc=' + auth + ' header.from=fixture-bank.test',
  'From: alerts@fixture-bank.test', 'To: fixtures@example.test', 'Subject: Bank credit alert',
  'Content-Type: text/plain; charset=UTF-8', '',
  `Rs.${amount} has been ${debit ? 'debited' : 'credited'} to your account ${account}. UPI Ref 427712345678. Remarks: ${ref}`,
].join('\r\n'))

async function database(t) {
  const db = new PGlite()
  await db.exec(fs.readFileSync(new URL('./fixtures/baseline.sql', import.meta.url), 'utf8'))
  await db.exec(`INSERT INTO "User"(id,"clerkId",email) VALUES('u','clerk-fixture','fixture@example.test');
    INSERT INTO "Category"(id,slug,name) VALUES('c','fixture','Fixture');
    INSERT INTO "Product"(id,"categoryId",slug,name,price,stock,"imageUrl") VALUES('p','c','p','Product',100,10,'/fixture'),('q','c','q','Other',250,10,'/fixture');
    INSERT INTO "Order"(id,"userId",subtotal,total,"shippingAddress") VALUES('o','u',100,100,'{}');
    INSERT INTO "OrderItem"(id,"orderId","productId",name,price,quantity) VALUES('i','o','p','Product',100,1);
    INSERT INTO "CartItem"(id,"userId","productId",quantity) VALUES('cp','u','p',1),('cq','u','q',2);`)
  await db.exec(fs.readFileSync(new URL('../prisma/upi-migration.sql', import.meta.url), 'utf8'))
  let tail = Promise.resolve()
  const pool = { query: (s, p) => db.query(s, p), async connect() {
    const previous = tail; let release; tail = new Promise((r) => { release = r }); await previous
    return { query: (s, p) => db.query(s, p), release }
  } }
  t.after(() => db.close())
  return { db, store: new GlamoraUpiStore(pool, config), pool }
}
const create = (store, extra = {}) => store.createPayment({ id: 'pay_' + crypto.randomBytes(12).toString('hex'), ref: 'GLMAAAA2222', orderId: 'o', amount: 100, ...extra })
const credit = (p, extra = {}) => ({ verified: true, evidenceHash: 'fixture-hash', utr: '427712345678', amount: p.payAmount,
  ref: p.ref, receivedAt: new Date().toISOString(), sender: config.senders[0], accountLast4: config.account, bank: 'Fixture', ...extra })

test('single-product Buy Now: server price ignores client price and preserves quantity', async () => {
  const prisma = { product: { findMany: async () => [{ id: 'p', name: 'P', price: 19.99, stock: 5, isActive: true }] } }
  const r = await priceOrder(prisma, [{ productId: 'p', quantity: 2, price: 0.01 }])
  assert.equal(r.total, 39.98); assert.equal(r.orderItems[0].quantity, 2)
})
test('multi-product checkout: duplicate lines merge; existing shipping boundary preserved', async () => {
  const prisma = { product: { findMany: async () => [{ id: 'p', name: 'P', price: 250, stock: 10, isActive: true }, { id: 'q', name: 'Q', price: 500, stock: 10, isActive: true }] } }
  const r = await priceOrder(prisma, [{ productId: 'p', quantity: 1 }, { productId: 'p', quantity: 1 }, { productId: 'q', quantity: 1 }])
  assert.equal(r.subtotal, 1000); assert.equal(r.shippingFee, 80); assert.equal(r.total, 1080)
  assert.equal(r.orderItems.length, 2)
  await assert.rejects(priceOrder(prisma, [{ productId: 'p', quantity: 11 }]))
})
test('genuine fixture email passes sender, authentication, account and parsing checks', async () => {
  const a = await verifyCredit(rawEmail(), new Date(), config)
  assert.equal(a.amount, 100.37); assert.equal(a.utr, '427712345678'); assert.equal(a.ref, 'GLMAAAA2222'); assert.equal(a.evidenceHash.length, 64)
})
test('invalid bank emails: failed authentication, wrong account, debit, forged header', async () => {
  for (const opts of [{ auth: 'fail' }, { account: 'XX9876' }, { debit: true }]) assert.equal(await verifyCredit(rawEmail(opts), new Date(), config), null)
  const forged = Buffer.concat([Buffer.from('Authentication-Results: mx.google.com; dmarc=fail header.from=fixture-bank.test\r\n'), rawEmail()])
  assert.equal(await verifyCredit(forged, new Date(), config), null)
  assert.equal(await verifyCredit(rawEmail(), new Date(), { ...config, senders: ['other@fixture-bank.test'] }), null)
})

test('observed HDFC wording parses but a missing order note never settles a payment', async () => {
  // Synthetic values and authentication headers: format regression only, not
  // evidence that the screenshot or any real message has been authenticated.
  const make = (account = '1234', auth = 'pass', tail = '') => Buffer.from([
    `Authentication-Results: mx.google.com; dmarc=${auth} header.from=fixture-bank.test`,
    'From: alerts@fixture-bank.test', 'Subject: View: Account update for your HDFC Bank A/c',
    'Content-Type: text/plain; charset=UTF-8', '',
    `We're writing to inform you that Rs.1.00 has been successfully credited to your HDFC Bank account ending in ${account}.`,
    'Transaction Details:', 'a. Date: 04-11-26', 'b. Sender: Fixture (VPA: *******0000@fixture)',
    'c. UPI Reference No.: 427712345678', tail,
  ].join('\r\n'))
  const a = await verifyCredit(make(), new Date(), config)
  assert.equal(a.amount, 1); assert.equal(a.utr, '427712345678'); assert.equal(a.ref, '')
  const p = { ref: 'GLMAAAA2222', payAmount: 1, createdAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }
  assert.equal(classifyCredit(p, a), null)
  assert.equal(await verifyCredit(make('9876'), new Date(), config), null)
  assert.equal(await verifyCredit(make('1234', 'fail'), new Date(), config), null)
  const withNote = await verifyCredit(make('1234', 'pass', 'Remarks: GLMAAAA2222'), new Date(), config)
  assert.equal(classifyCredit(p, withNote), 'paid')
})
test('matching requires exact amount, reference, evidence and valid timing', () => {
  const p = { ref: 'GLMAAAA2222', payAmount: 100.37, createdAt: new Date(Date.now() - 10000).toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }
  assert.equal(classifyCredit(p, credit(p)), 'paid')
  assert.equal(classifyCredit(p, credit(p, { amount: 100 })), 'underpaid')
  assert.equal(classifyCredit(p, credit(p, { amount: 101 })), 'overpaid')
  assert.equal(classifyCredit(p, credit(p, { ref: 'WRONG' })), null)
  assert.equal(classifyCredit(p, credit(p, { receivedAt: new Date(Date.now() - 20000).toISOString() })), null)
  assert.equal(classifyCredit(p, credit(p, { receivedAt: new Date(Date.now() + 3600000).toISOString() })), null)
  assert.equal(classifyCredit(p, credit(p, { receivedAt: 'invalid' })), null)
  assert.equal(classifyCredit(p, credit(p, { amount: NaN })), null)
  assert.equal(classifyCredit(p, credit(p, { receivedAt: new Date(Date.parse(p.createdAt) - 500).toISOString() })), 'paid')
})
test('migration preserves pre-existing data; new payment allocation produces exact extra paise', async (t) => {
  const { store, db } = await database(t)
  const p = await create(store)
  assert.ok(p.payAmount > 100 && p.payAmount < 101)
  assert.equal((await create(store)).id, p.id)
  assert.equal((await db.query('SELECT count(*)::int n FROM "User"')).rows[0].n, 1)
  assert.equal((await db.query('SELECT stock FROM "Product" WHERE id=\'p\'')).rows[0].stock, 10)
})
test('verified credit finalizes once; duplicate notifications and concurrent recovery preserve stock', async (t) => {
  const { store, db } = await database(t)
  const p = await create(store), a = credit(p)
  await store.ingestAlerts([a, a]); await store.ingestAlerts([a])
  const results = await Promise.all([finalizeUpiOrder(store, p.id), finalizeUpiOrder(store, p.id)])
  assert.deepEqual(results, ['paid', 'already'])
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'paid')
  assert.equal((await db.query('SELECT stock FROM "Product" WHERE id=\'p\'')).rows[0].stock, 9)
  assert.equal((await db.query('SELECT "productId" FROM "CartItem"')).rows[0].productId, 'q')
  assert.equal((await db.query('SELECT count(*)::int n FROM "Payment"')).rows[0].n, 1)
})
test('multi-product finalization reduces every purchased line and clears purchased cart only', async (t) => {
  const { store, db } = await database(t)
  await db.exec(`UPDATE "Order" SET total=600,subtotal=600; INSERT INTO "OrderItem"(id,"orderId","productId",name,price,quantity) VALUES('j','o','q','Other',250,2);`)
  const p = await create(store, { amount: 600 })
  await store.ingestAlerts([credit(p)])
  assert.equal(await finalizeUpiOrder(store, p.id), 'paid')
  assert.deepEqual((await db.query('SELECT stock FROM "Product" ORDER BY id')).rows.map((r) => r.stock), [9, 8])
  assert.equal((await db.query('SELECT count(*)::int n FROM "CartItem"')).rows[0].n, 0)
})
test('underpayment and overpayment never fulfill; no top-up or repeat charge offered', async (t) => {
  const { store, db } = await database(t)
  const p = await create(store)
  await store.ingestAlerts([credit(p, { amount: p.payAmount - 0.01 })])
  assert.equal((await store.getPayment(p.id)).status, 'underpaid')
  assert.equal(await finalizeUpiOrder(store, p.id), 'not_paid')
  await assert.rejects(create(store))
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'pending')
})
test('wrong reference and typed stranger UTR cannot steal a genuine credit', async (t) => {
  const { store } = await database(t)
  const p = await create(store)
  await store.ingestAlerts([credit(p, { ref: 'GLMBBBB3333' })])
  assert.equal((await store.claimUtr(p.id, '427712345678')).result, 'not_found')
  assert.equal((await store.getPayment(p.id)).status, 'pending')
})
test('unverified or wrong-account evidence cannot settle an order', async (t) => {
  const { store } = await database(t), p = await create(store)
  await store.ingestAlerts([credit(p, { verified: false }), credit(p, { accountLast4: '9876' })])
  assert.equal(await finalizeUpiOrder(store, p.id), 'not_paid')
})
test('stock shortage or cancelled order records verified money for review without fulfillment', async (t) => {
  const { store, db } = await database(t), p = await create(store)
  await store.ingestAlerts([credit(p)])
  await db.exec('UPDATE "Product" SET stock=0 WHERE id=\'p\'')
  assert.equal(await finalizeUpiOrder(store, p.id), 'review')
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'pending')
  assert.equal((await db.query('SELECT count(*)::int n FROM "CartItem"')).rows[0].n, 2)
})
test('expired QR accepts correctly referenced delayed bank notification within grace', async (t) => {
  const { store, db } = await database(t), p = await create(store)
  p.createdAt = new Date(Date.now() - 900000).toISOString(); p.expiresAt = new Date(Date.now() - 300000).toISOString()
  await db.query('UPDATE glamora_upi_attempts SET payload=$1 WHERE id=$2', [JSON.stringify(p), p.id])
  await store.ingestAlerts([credit(p)])
  assert.equal(await finalizeUpiOrder(store, p.id), 'paid')
})
test('inbox lease excludes forced overlapping readers and checkpoints persist', async (t) => {
  const { store } = await database(t)
  assert.ok(await store.claimSync(0)); assert.equal(await store.claimSync(0), null)
  await store.finishSync({ lastUid: 100, uidValidity: '7', error: null })
  const next = await store.claimSync(0); assert.equal(next.lastUid, 100)
  await store.finishSync({ lastUid: null, uidValidity: null, error: 'Delayed' })
  assert.equal((await store.syncStatus()).lastError, 'Delayed')
})
test('production service cannot simulate or open checkout before explicit bank validation', async () => {
  const service = createUpiService({ env: {}, pool: {} })
  assert.equal(service.enabled, false)
  await assert.rejects(service.create({ total: 100 }), (e) => e.status === 503)
  assert.equal(service.simulatePayment, undefined)
})
test('payment HTTP routes enforce authentication and order ownership before polling', async (t) => {
  const app = express(); app.use(express.json())
  const service = { status() { throw new Error('must not be called') } }
  const prisma = { order: { findFirst: async () => null } }
  const auth = { requireUser(req, res, next) { if (!req.get('authorization')) return res.sendStatus(401); req.user = { id: 'intruder' }; next() } }
  app.use('/orders', ordersRouter(prisma, auth, service))
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }))
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); t.after(() => server.close())
  const url = `http://127.0.0.1:${server.address().port}/orders/o/payments/pay_fixture`
  assert.equal((await fetch(url)).status, 401)
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer fixture' } })).status, 404)
})

test('overpayment stays review-only and does not mark the order paid', async (t) => {
  const { store, db } = await database(t), p = await create(store)
  await store.ingestAlerts([credit(p, { amount: p.payAmount + 1 })])
  assert.equal((await store.getPayment(p.id)).status, 'overpaid')
  assert.equal(await finalizeUpiOrder(store, p.id), 'not_paid')
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'pending')
})
test('a UTR already allocated to a different payment cannot be reused', async (t) => {
  const { store, db } = await database(t), p = await create(store)
  await store.ingestAlerts([credit(p)])
  await db.exec(`INSERT INTO "Order"(id,"userId",subtotal,total,"shippingAddress") VALUES('other','u',100,100,'{}')`)
  const q = await create(store, { orderId: 'other', ref: 'GLMBBBB3333' })
  assert.equal((await store.claimUtr(q.id, p.utr || '427712345678')).result, 'used')
})
test('a crash during stock/cart finalization rolls back the entire operation; retry recovers', async (t) => {
  const { store, db } = await database(t), p = await create(store)
  await store.ingestAlerts([credit(p)])
  const original = store.pool.connect
  store.pool.connect = async () => {
    const c = await original()
    return { ...c, query: (sql, args) => {
      if (sql.startsWith('DELETE FROM "CartItem"')) throw new Error('fixture crash')
      return c.query(sql, args)
    } }
  }
  await assert.rejects(finalizeUpiOrder(store, p.id))
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'pending')
  assert.equal((await db.query('SELECT stock FROM "Product" WHERE id=\'p\'')).rows[0].stock, 10)
  assert.equal((await db.query('SELECT count(*)::int n FROM "Payment"')).rows[0].n, 0)
  store.pool.connect = original
  assert.equal(await finalizeUpiOrder(store, p.id), 'paid')
})
test('inbox batching processes the oldest 100 messages without skipping a backlog', async () => {
  let requested
  class FakeImap {
    mailbox = { uidValidity: 7, uidNext: 202 }
    async connect() {}
    async getMailboxLock(name, opts) { assert.equal(name, 'INBOX'); assert.equal(opts.readOnly, true); return { release() {} } }
    async search() { return Array.from({ length: 200 }, (_, n) => n + 2) }
    async *fetch(uids) {
      requested = uids
      for (const uid of uids) yield { uid, source: Buffer.from('From: nobody@example.test\r\n\r\nFixture'), internalDate: new Date() }
    }
    close() {}
  }
  const r = await readVerifiedInbox(config, { uidValidity: '7', lastUid: 1 }, { GMAIL_ADDRESS: 'fixture@example.test', GMAIL_APP_PASSWORD: 'fixture' }, FakeImap)
  assert.equal(requested[0], 2); assert.equal(requested.at(-1), 101); assert.equal(r.lastUid, 101)
})
test('Gmail connection failure remains delayed, logs no credentials and preserves pending order', async (t) => {
  const { pool, store, db } = await database(t)
  const p = await create(store)
  const env = { UPI_ID: config.vpa, UPI_NAME: config.name, UPI_ALERT_SENDERS: config.senders[0], UPI_RECEIVING_ACCOUNT_LAST4: config.account,
    GMAIL_ADDRESS: 'fixture@example.test', GMAIL_APP_PASSWORD: 'fixture-password', UPI_API_KEY: 'fixture-key', UPI_VERIFICATION_ENABLED: '1' }
  const service = createUpiService({ env, pool, inboxReader: async () => { throw new Error('fixture-password') } })
  const result = await service.status('o', p.id)
  assert.equal(result.delayed, true); assert.equal(result.finalized, false)
  assert.ok(!JSON.stringify(result).includes('fixture-password'))
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'pending')
  await assert.rejects(service.create({ id: 'o', total: 100 }), (e) => e.status === 503)
})

test('SDK QR/link use the environment destination, preserve base total and confirm only after finalization', async (t) => {
  const { pool, db } = await database(t)
  const env = { UPI_ID: config.vpa, UPI_NAME: config.name, UPI_ALERT_SENDERS: config.senders[0], UPI_RECEIVING_ACCOUNT_LAST4: config.account,
    GMAIL_ADDRESS: 'fixture@example.test', GMAIL_APP_PASSWORD: 'fixture-password', UPI_API_KEY: 'fixture-key', UPI_VERIFICATION_ENABLED: '1' }
  const queue = []
  const service = createUpiService({ env, pool, inboxReader: async () => ({ alerts: queue.splice(0), lastUid: 1, uidValidity: '7' }) })
  const init = await service.create({ id: 'o', total: 100 })
  assert.equal(init.payment.amount, 100)
  assert.ok(init.payment.extraPaise >= 1 && init.payment.extraPaise <= 99)
  assert.match(init.payment.qr, /^<svg/)
  const link = new URL(init.payment.link)
  assert.equal(link.searchParams.get('pa'), config.vpa)
  assert.equal(link.searchParams.get('am'), init.payment.payAmount.toFixed(2))
  queue.push(credit(init.payment))
  const r = await service.status('o', init.payment.id)
  assert.equal(r.finalized, true)
  assert.equal((await db.query('SELECT total FROM "Order"')).rows[0].total, '100.00')
})

test('two different verified credits for one order are recorded without a second stock reduction', async (t) => {
  const { store, db } = await database(t), first = await create(store)
  first.expiresAt = new Date(Date.now() + 60000).toISOString()
  await db.query('UPDATE glamora_upi_attempts SET payload=$1 WHERE id=$2', [JSON.stringify(first), first.id])
  const second = await create(store, { ref: 'GLMBBBB3333' })
  await store.ingestAlerts([credit(first), credit(second, { utr: '427712345679' })])
  assert.equal(await finalizeUpiOrder(store, first.id), 'paid')
  assert.equal(await finalizeUpiOrder(store, second.id), 'duplicate')
  assert.equal((await db.query('SELECT stock FROM "Product" WHERE id=\'p\'')).rows[0].stock, 9)
  assert.deepEqual((await db.query('SELECT status FROM "Payment" ORDER BY status')).rows.map((r) => r.status), ['captured', 'duplicate'])
})

test('additive migration retains historical Razorpay identifiers and confirmed payment records', async (t) => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(fs.readFileSync(new URL('./fixtures/baseline.sql', import.meta.url), 'utf8'))
  await db.exec(`INSERT INTO "User"(id,"clerkId",email) VALUES('legacy-user','legacy-clerk','legacy@example.test');
    INSERT INTO "Order"(id,"userId",status,subtotal,total,"shippingAddress","razorpayOrderId") VALUES('legacy-order','legacy-user','paid',100,100,'{}','order_fixture');
    INSERT INTO "Payment"(id,"orderId","razorpayOrderId","razorpayPaymentId",amount,status) VALUES('legacy-payment','legacy-order','order_fixture','pay_fixture',100,'captured');`)
  await db.exec(fs.readFileSync(new URL('../prisma/upi-migration.sql', import.meta.url), 'utf8'))
  const row = (await db.query('SELECT * FROM "Payment" WHERE id=\'legacy-payment\'')).rows[0]
  assert.equal(row.razorpayOrderId, 'order_fixture'); assert.equal(row.razorpayPaymentId, 'pay_fixture')
  assert.equal(row.status, 'captured'); assert.equal(row.provider, 'razorpay')
  assert.equal((await db.query('SELECT status FROM "Order"')).rows[0].status, 'paid')
})
