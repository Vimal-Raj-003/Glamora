import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, addressSchema, HttpError, money, shippingFor, MIN_ORDER_PAISE } from '../lib.js'
import {
  createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature, confirmPaymentWithRazorpay, razorpayConfigured,
} from '../services/razorpay.js'
import { finalizePaidOrder } from '../services/orders.js'

// What a customer may see about their own payments (never the signature).
export const paymentSelect = { select: { id: true, razorpayOrderId: true, razorpayPaymentId: true, amount: true, status: true, createdAt: true } }
const orderInclude = { items: true, payments: paymentSelect }

const PENDING_REUSE_MINUTES = 60

const payInit = (order) => ({
  orderId: order.id,
  razorpayOrderId: order.razorpayOrderId,
  amount: Math.round(Number(order.total) * 100),
  keyId: process.env.RAZORPAY_KEY_ID,
})

const sameItems = (orderItems, wanted) =>
  orderItems.length === wanted.size && orderItems.every((i) => wanted.get(i.productId) === i.quantity)

export function ordersRouter(prisma, { requireUser }) {
  const r = Router()
  r.use(requireUser)

  r.get('/', ah(async (req, res) => {
    res.json(await prisma.order.findMany({ where: { userId: req.user.id }, include: orderInclude, orderBy: { createdAt: 'desc' } }))
  }))

  r.get('/:id', ah(async (req, res) => {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: orderInclude })
    if (!order) throw new HttpError(404, 'Order not found.')
    res.json(order)
  }))

  // Creates (or re-uses) a pending order for the cart and the matching Razorpay order.
  // Every price, the shipping fee and the payable amount are calculated HERE from the database;
  // the browser only says which products and how many.
  r.post('/', ah(async (req, res) => {
    if (!razorpayConfigured()) throw new HttpError(503, 'Payments are not configured yet.')

    const { items, address } = parse(
      z.object({
        items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(50) })).min(1, 'Your cart is empty.').max(100),
        address: addressSchema,
      }),
      req.body,
    )

    const wanted = new Map()
    for (const i of items) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.quantity)

    const products = await prisma.product.findMany({ where: { id: { in: [...wanted.keys()] } } })

    let subtotal = 0
    const orderItems = []
    const cartProducts = []
    for (const [id, quantity] of wanted) {
      const p = products.find((x) => x.id === id)
      if (!p || !p.isActive) throw new HttpError(400, 'A product in your cart is no longer available.')
      if (p.stock < quantity) throw new HttpError(400, `Only ${p.stock} of “${p.name}” left in stock.`)
      if (p.maxPerOrder && quantity > p.maxPerOrder) {
        throw new HttpError(400, `You can buy at most ${p.maxPerOrder} of “${p.name}” per order.`)
      }
      subtotal += Number(p.price) * quantity
      cartProducts.push(p)
      orderItems.push({ productId: p.id, name: p.name, price: p.price, quantity, imageUrl: p.imageUrl })
    }
    subtotal = money(subtotal)
    const shippingFee = shippingFor(subtotal, cartProducts)
    const total = money(subtotal + shippingFee)
    const amount = Math.round(total * 100)
    if (!Number.isInteger(amount) || amount < MIN_ORDER_PAISE) throw new HttpError(400, 'The order total must be at least ₹1.')

    const { isDefault, ...shippingAddress } = address

    // Retry protection: if this customer already has an unpaid order for exactly this cart and total,
    // hand back that same order instead of creating another one.
    const since = new Date(Date.now() - PENDING_REUSE_MINUTES * 60_000)
    const candidates = await prisma.order.findMany({
      where: { userId: req.user.id, status: 'pending', total, createdAt: { gte: since }, razorpayOrderId: { not: null } },
      include: { items: true, payments: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    const reusable = candidates.find((o) => o.payments.length === 0 && sameItems(o.items, wanted))
    if (reusable) {
      const updated = await prisma.order.update({ where: { id: reusable.id }, data: { shippingAddress } })
      return res.status(200).json({ ...payInit(updated), reused: true })
    }

    const order = await prisma.order.create({
      data: { userId: req.user.id, subtotal, shippingFee, total, shippingAddress, items: { create: orderItems } },
    })

    try {
      const rzp = await createRazorpayOrder({ amount, receipt: order.id.slice(0, 40), notes: { orderId: order.id } })
      const saved = await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rzp.id } })
      res.status(201).json({ ...payInit(saved), reused: false })
    } catch (err) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } })
      throw err
    }
  }))

  // "Complete payment" for an order that is still unpaid (customer closed the popup, payment failed, ...).
  r.post('/:id/pay', ah(async (req, res) => {
    if (!razorpayConfigured()) throw new HttpError(503, 'Payments are not configured yet.')
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { items: true, payments: { select: { id: true } } } })
    if (!order) throw new HttpError(404, 'Order not found.')
    if (order.status !== 'pending' || order.payments.length > 0) throw new HttpError(400, 'This order does not need a payment.')
    if (!order.razorpayOrderId) throw new HttpError(400, 'This order cannot be paid. Please place it again from your cart.')

    // Make sure the goods are still available before taking money.
    const products = await prisma.product.findMany({ where: { id: { in: order.items.map((i) => i.productId).filter(Boolean) } } })
    for (const item of order.items) {
      const p = products.find((x) => x.id === item.productId)
      if (!p || !p.isActive || p.stock < item.quantity) {
        throw new HttpError(400, `“${item.name}” is no longer available. Please place a new order.`)
      }
    }
    res.json(payInit(order))
  }))

  // Called by the browser after Razorpay checkout succeeds. Nothing the browser says is trusted:
  // the signature is verified, then Razorpay itself is asked for the real payment status and amount.
  r.post('/verify', ah(async (req, res) => {
    const body = parse(
      z.object({
        orderId: z.string().min(1),
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        razorpaySignature: z.string().min(1),
      }),
      req.body,
    )

    const order = await prisma.order.findFirst({ where: { id: body.orderId, userId: req.user.id } })
    if (!order) throw new HttpError(404, 'Order not found.')
    if (order.razorpayOrderId !== body.razorpayOrderId) throw new HttpError(400, 'Order mismatch.')
    if (!verifyPaymentSignature({ razorpayOrderId: body.razorpayOrderId, razorpayPaymentId: body.razorpayPaymentId, signature: body.razorpaySignature })) {
      throw new HttpError(400, 'Payment signature verification failed.')
    }

    await confirmPaymentWithRazorpay({
      razorpayPaymentId: body.razorpayPaymentId,
      razorpayOrderId: body.razorpayOrderId,
      expectedPaise: Math.round(Number(order.total) * 100),
    })

    const { result } = await finalizePaidOrder(prisma, {
      orderId: order.id,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    })
    if (result === 'duplicate') console.warn(`[payments] duplicate payment recorded for order ${order.id} - refund needed`)
    res.json({ ok: true, result })
  }))

  return r
}

// Razorpay webhook (backup in case the customer closes the tab right after paying).
// Mounted with express.raw() so the signature can be checked against the exact bytes.
export function razorpayWebhookHandler(prisma) {
  return ah(async (req, res) => {
    const raw = req.body.toString('utf8')
    if (!verifyWebhookSignature(raw, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'Invalid signature' })

    const event = JSON.parse(raw)
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity
      if (payment?.order_id && payment?.id) {
        const order = await prisma.order.findUnique({ where: { razorpayOrderId: payment.order_id } })
        if (order && payment.amount === Math.round(Number(order.total) * 100) && payment.currency === 'INR') {
          await finalizePaidOrder(prisma, { orderId: order.id, razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id })
        }
      }
    }
    res.json({ ok: true })
  })
}
