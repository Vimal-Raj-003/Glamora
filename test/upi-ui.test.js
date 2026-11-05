import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import express from 'express'
import { ordersRouter } from '../server/routes/orders.js'

const require = createRequire(import.meta.url)
const compiled = await build({
  entryPoints: ['src/components/UpiPayment.jsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  plugins: [{ name: 'no-network-api', setup(b) {
    b.onResolve({ filter: /lib\/api$/ }, () => ({ path: 'api', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: 'export function getUpiStatus() { throw new Error("Unexpected network call") }',
    }))
  } }],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports)
const UpiPayment = module.exports.default

test('customer-entered UTR endpoint is unavailable even to authenticated customers', async (t) => {
  const app = express()
  let claims = 0
  app.use('/orders', ordersRouter({}, { requireUser(req, res, next) {
    req.user = { id: 'fixture-user' }; next()
  } }, { claim() { claims++; throw new Error('Manual claim must never run') } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => server.close())
  const response = await fetch(`http://127.0.0.1:${server.address().port}/orders/fixture/payments/fixture/utr`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utr: '123456789012' }),
  })
  assert.equal(response.status, 404)
  assert.equal(claims, 0)
})

for (const verificationEnabled of [false, true]) {
  test(`QR checkout has no manual payment controls (verification ${verificationEnabled})`, () => {
    const html = renderToStaticMarkup(React.createElement(UpiPayment, {
      init: { orderId: 'fixture-order', verificationEnabled, payment: {
        id: 'fixture-payment', status: 'pending', payAmount: 125.5,
        payeeName: 'Fixture Merchant', upiId: 'fixture@upi',
        ref: 'GLMABCDEFGH', qr: '<svg></svg>', expiresAt: new Date(Date.now() + 60000).toISOString(),
      } }, onPaid() { throw new Error('Rendering cannot confirm payment') },
    }))
    assert.match(html, /Scan this UPI payment QR/)
    assert.match(html, /Fixture Merchant/)
    assert.match(html, /Pay exactly ₹125\.5/)
    assert.match(html, /Google Pay, PhonePe/)
    assert.doesNotMatch(html, /<input|<form|<a\b|UTR|Check payment|Payment Successful|Order Confirmed/i)
    if (!verificationEnabled) assert.match(html, /Payment pending.*verification is unavailable/)
  })
}
