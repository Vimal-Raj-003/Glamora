import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import { upiPreviewRouter } from '../server/routes/upi-preview.js'
import { ordersRouter } from '../server/routes/orders.js'
import { createUpiService } from '../server/services/upi.js'

async function serve(t, env, auth) {
  const app = express()
  app.use('/api', upiPreviewRouter(env, auth))
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(() => server.close())
  return `http://127.0.0.1:${server.address().port}/api/dev/upi-preview`
}
test('localhost QR preview encodes configured destination without order creation or confirmation', async (t) => {
  const url = await serve(t, { UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture Shop' })
  const r = await fetch(url), p = await r.json()
  assert.equal(r.status, 200)
  assert.equal(new URL(p.link).searchParams.get('pa'), 'fixture@upi')
  assert.equal(new URL(p.link).searchParams.get('pn'), 'Fixture Shop')
  assert.match(p.qr, /^<svg/)
  assert.equal(p.paymentConfirmation, false)
  assert.equal(p.orderId, undefined)
  const externalHostStatus = await new Promise((resolve, reject) => {
    http.get(url, { headers: { Host: 'external.example' } }, (res) => { res.resume(); resolve(res.statusCode) }).on('error', reject)
  })
  assert.equal(externalHostStatus, 404)
})

const fixtureAuth = { requireAdmin: [
  (req, res, next) => {
    if (!req.get('authorization')) return res.status(401).json({ error: 'Authentication required.' })
    if (req.get('authorization') !== 'Bearer fixture-owner') return res.status(403).json({ error: 'Admins only.' })
    next()
  },
] }

test('production preview requires admin and works with confirmation off and no Gmail or database config', async (t) => {
  const url = (await serve(t, { VERCEL: '1', NODE_ENV: 'production', UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture Shop',
    UPI_VERIFICATION_ENABLED: '0' }, fixtureAuth)).replace('/dev/upi-preview', '/upi/preview')
  assert.equal((await fetch(url)).status, 401)
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer fixture-customer' } })).status, 403)
  const r = await fetch(url + '?UPI_ID=other@upi&amount=1000', { headers: { Authorization: 'Bearer fixture-owner' } })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'private, no-store')
  const p = await r.json(), link = new URL(p.link)
  assert.equal(link.searchParams.get('pa'), 'fixture@upi')
  assert.equal(link.searchParams.get('pn'), 'Fixture Shop')
  assert.equal(link.searchParams.get('am'), '1.01')
  assert.equal(p.preview, true); assert.equal(p.paymentConfirmation, false)
  assert.equal(p.orderId, undefined); assert.equal(p.id, undefined); assert.equal(p.status, undefined)
  assert.doesNotMatch(link.searchParams.get('tn'), /^GLM[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  assert.match(p.qr, /^<svg/)
})

test('protected preview fails closed without auth middleware and reports incomplete destination', async (t) => {
  const noAuth = (await serve(t, { UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture' })).replace('/dev/upi-preview', '/upi/preview')
  assert.equal((await fetch(noAuth)).status, 401)
  const incomplete = (await serve(t, { NODE_ENV: 'production' }, fixtureAuth)).replace('/dev/upi-preview', '/upi/preview')
  assert.equal((await fetch(incomplete, { headers: { Authorization: 'Bearer fixture-owner' } })).status, 503)
})

test('admin QR previews are rate limited', async (t) => {
  const url = (await serve(t, { UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture' }, fixtureAuth)).replace('/dev/upi-preview', '/upi/preview')
  for (let i = 0; i < 10; i++) assert.equal((await fetch(url, { headers: { Authorization: 'Bearer fixture-owner' } })).status, 200)
  assert.equal((await fetch(url, { headers: { Authorization: 'Bearer fixture-owner' } })).status, 429)
})

test('customer QR readiness is independent of verification; malformed checkout still creates no records', async (t) => {
  const app = express(); app.use(express.json())
  const upi = createUpiService({ env: { UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture', UPI_VERIFICATION_ENABLED: '0' }, pool: {} })
  const prisma = new Proxy({}, { get() { throw new Error('No database access expected') } })
  app.use('/api/orders', ordersRouter(prisma, { requireUser(req, res, next) { req.user = { id: 'fixture-user' }; next() } }, upi))
  app.use((e, req, res, next) => res.status(e.status || 500).json({ error: e.message }))
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); t.after(() => server.close())
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(r.status, 400); assert.equal(upi.enabled, false)
  assert.doesNotThrow(() => upi.requireReady())
  await assert.rejects(upi.sync(), (e) => e.status === 503)
  await assert.rejects(upi.reconcile(), (e) => e.status === 503)
  await assert.rejects(upi.claim('o', 'p', '427712345678'), (e) => e.status === 503)
})
test('QR preview is unavailable in production and on Vercel', async (t) => {
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
    const url = await serve(t, { ...env, UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture Shop' })
    assert.equal((await fetch(url)).status, 404)
  }
})
