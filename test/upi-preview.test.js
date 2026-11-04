import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import http from 'node:http'
import { upiPreviewRouter } from '../server/routes/upi-preview.js'

async function serve(t, env) {
  const app = express()
  app.use('/api', upiPreviewRouter(env))
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
test('QR preview is unavailable in production and on Vercel', async (t) => {
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
    const url = await serve(t, { ...env, UPI_ID: 'fixture@upi', UPI_NAME: 'Fixture Shop' })
    assert.equal((await fetch(url)).status, 404)
  }
})
