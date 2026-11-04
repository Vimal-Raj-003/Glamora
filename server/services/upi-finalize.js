import crypto from 'node:crypto'
import { classifyCredit, paise } from './upi-security.js'

// Re-read durable evidence inside the same transaction as the order and stock update.
// No browser result, package callback or UTR alone can call an order paid.
export async function finalizeUpiOrder(store, paymentId) {
  return store.transaction(async (c) => {
    const p = (await c.query('SELECT payload FROM glamora_upi_attempts WHERE id=$1 FOR UPDATE', [paymentId])).rows[0]?.payload
    if (!p || p.status !== 'paid') return 'not_paid'
    const a = (await c.query('SELECT payload FROM glamora_upi_credits WHERE utr=$1 AND "paymentId"=$2', [p.utr, p.id])).rows[0]?.payload
    if (classifyCredit(p, a) !== 'paid' || p.evidenceHash !== a.evidenceHash ||
      p.destination !== store.config.vpa || a.accountLast4 !== store.config.account ||
      !store.config.senders.includes(a.sender)) throw new Error('UPI_EVIDENCE_MISMATCH')
    const order = (await c.query('SELECT * FROM "Order" WHERE id=$1 FOR UPDATE', [p.orderId])).rows[0]
    if (!order || paise(order.total) !== paise(p.amount)) throw new Error('UPI_ORDER_MISMATCH')
    const recorded = (await c.query('SELECT id FROM "Payment" WHERE "upiPaymentId"=$1 OR utr=$2', [p.id, p.utr])).rows
    if (recorded.length) return 'already'
    const existing = (await c.query('SELECT id FROM "Payment" WHERE "orderId"=$1 AND status=\'captured\'', [order.id])).rows
    const items = (await c.query('SELECT * FROM "OrderItem" WHERE "orderId"=$1 ORDER BY "productId"', [order.id])).rows
    let outcome = existing.length ? 'duplicate' : order.status !== 'pending' ? 'review' : 'captured'
    // Lock products in a stable order. A late credit must not silently oversell stock.
    for (const i of items) {
      const product = i.productId && (await c.query('SELECT stock,"isActive" FROM "Product" WHERE id=$1 FOR UPDATE', [i.productId])).rows[0]
      if (!product || !product.isActive || product.stock < i.quantity) { if (outcome === 'captured') outcome = 'review' }
    }
    await c.query(`INSERT INTO "Payment"(id,"orderId",provider,"upiPaymentId",utr,"payableAmount",amount,status,"createdAt")
      VALUES($1,$2,'upi',$3,$4,$5,$6,$7,now())`, [crypto.randomUUID(), order.id, p.id, p.utr, p.payAmount, p.paidAmount, outcome])
    if (outcome !== 'captured') return outcome
    await c.query('UPDATE "Order" SET status=\'paid\' WHERE id=$1', [order.id])
    for (const i of items) {
      await c.query('UPDATE "Product" SET stock=stock-$2 WHERE id=$1', [i.productId, i.quantity])
      await c.query('DELETE FROM "CartItem" WHERE "userId"=$1 AND "productId"=$2', [order.userId, i.productId])
    }
    return 'paid'
  })
}
