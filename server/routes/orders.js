import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, addressSchema, HttpError, money, shippingFor } from '../lib.js'
import { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature, razorpayConfigured } from '../services/razorpay.js'
import { finalizePaidOrder } from '../services/orders.js'

const orderInclude = { items: true }

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

  // Creates a pending order from the cart (prices always come from the database) and a Razorpay order.
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
    for (const [id, quantity] of wanted) {
      const p = products.find((x) => x.id === id)
      if (!p || !p.isActive) throw new HttpError(400, 'A product in your cart is no longer available.')
      if (p.stock < quantity) throw new HttpError(400, `Only ${p.stock} of “${p.name}” left in stock.`)
      subtotal += Number(p.price) * quantity
      orderItems.push({ productId: p.id, name: p.name, price: p.price, quantity, imageUrl: p.imageUrl })
    }
    subtotal = money(subtotal)
    const shippingFee = shippingFor(subtotal)
    const total = money(subtotal + shippingFee)

    const { isDefault, ...shippingAddress } = address
    const order = await prisma.order.create({
      data: { userId: req.user.id, subtotal, shippingFee, total, shippingAddress, items: { create: orderItems } },
    })

    try {
      const amount = Math.round(total * 100)
      const rzp = await createRazorpayOrder({ amount, receipt: order.id.slice(0, 40), notes: { orderId: order.id } })
      await prisma.order.update({ where: { id: order.id }, data: { razorpayOrderId: rzp.id } })
      res.status(201).json({ orderId: order.id, razorpayOrderId: rzp.id, amount, keyId: process.env.RAZORPAY_KEY_ID })
    } catch (err) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } })
      throw err
    }
  }))

  // Called by the browser after Razorpay checkout succeeds. The signature is verified here, server-side.
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

    await finalizePaidOrder(prisma, {
      orderId: order.id,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    })
    res.json({ ok: true })
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
        if (order && payment.amount === Math.round(Number(order.total) * 100)) {
          await finalizePaidOrder(prisma, { orderId: order.id, razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id })
        }
      }
    }
    res.json({ ok: true })
  })
}
