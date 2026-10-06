// Marks an order paid exactly once: records the payment, reduces stock and empties the cart.
// Safe to call repeatedly (browser verify + webhook can both arrive).
export async function finalizePaidOrder(prisma, { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature = null }) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({ where: { id: orderId, status: 'pending' }, data: { status: 'paid' } })
    if (claimed.count === 0) return { alreadyProcessed: true }

    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } })

    await tx.payment.upsert({
      where: { razorpayPaymentId },
      update: {},
      create: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, amount: order.total },
    })

    for (const item of order.items) {
      if (!item.productId) continue
      await tx.$executeRaw`UPDATE "Product" SET "stock" = GREATEST("stock" - ${item.quantity}, 0) WHERE "id" = ${item.productId}`
    }

    await tx.cartItem.deleteMany({ where: { userId: order.userId } })
    return { alreadyProcessed: false }
  })
}
