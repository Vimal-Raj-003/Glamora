// Records a successful Razorpay payment against an order exactly once.
//
// Safe to call repeatedly and concurrently (browser verify + webhook can both arrive):
//   'paid'      - first successful payment: order marked paid, payment saved, stock reduced, cart emptied
//   'already'   - this very payment id was already recorded (nothing changes)
//   'duplicate' - a DIFFERENT payment id arrived for an order that is already paid. It is saved with
//                 status "duplicate" so the admin can see it and refund it. The order is not touched.
export async function finalizePaidOrder(prisma, { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature = null }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } })
      if (!order) throw new Error('Order not found')

      const base = { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount: order.total }

      if (order.payments.some((p) => p.razorpayPaymentId === razorpayPaymentId)) return { result: 'already' }

      if (order.payments.some((p) => p.status === 'captured')) {
        await tx.payment.create({ data: { ...base, status: 'duplicate' } })
        return { result: 'duplicate' }
      }

      // pending (normal) or cancelled (customer paid a stale order) -> paid. Exactly one caller wins.
      const claimed = await tx.order.updateMany({ where: { id: orderId, status: { in: ['pending', 'cancelled'] } }, data: { status: 'paid' } })
      if (claimed.count === 0) {
        // Lost a race with another payment, or an admin already moved the order on.
        const taken = await tx.payment.count({ where: { orderId, status: 'captured' } })
        await tx.payment.create({ data: { ...base, status: taken > 0 ? 'duplicate' : 'captured' } })
        return { result: taken > 0 ? 'duplicate' : 'paid' }
      }

      await tx.payment.create({ data: { ...base, status: 'captured' } })

      for (const item of order.items) {
        if (!item.productId) continue
        await tx.$executeRaw`UPDATE "Product" SET "stock" = GREATEST("stock" - ${item.quantity}, 0) WHERE "id" = ${item.productId}`
      }
      // Only the products that were bought leave the cart (a "Buy now" must not empty the rest of it).
      await tx.cartItem.deleteMany({ where: { userId: order.userId, productId: { in: order.items.map((i) => i.productId).filter(Boolean) } } })
      return { result: 'paid' }
    })
  } catch (err) {
    // Same payment id inserted twice at the same moment: the other call already did the work.
    if (err?.code === 'P2002') return { result: 'already' }
    throw err
  }
}
