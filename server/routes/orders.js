import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { ah, parse, addressSchema, HttpError, shippingFor } from '../lib.js'

export const paymentSelect = { select: { id: true, provider: true, upiPaymentId: true, utr: true, payableAmount: true,
  razorpayOrderId: true, razorpayPaymentId: true, amount: true, status: true, createdAt: true } }
const include = { items: true, payments: paymentSelect }

export async function priceOrder(prisma, items) {
  const wanted = new Map()
  for (const i of items) wanted.set(i.productId, (wanted.get(i.productId) || 0) + i.quantity)
  const products = await prisma.product.findMany({ where: { id: { in: [...wanted.keys()] } } })
  let cents = 0
  const orderItems = []
  for (const [id, quantity] of wanted) {
    const p = products.find((p) => p.id === id)
    if (!p || !p.isActive || p.stock < quantity) throw new HttpError(400, 'A product is unavailable or has insufficient stock.')
    if (quantity > 50 || (p.maxPerOrder && quantity > p.maxPerOrder)) throw new HttpError(400, 'Product quantity limit exceeded.')
    cents += Math.round(Number(p.price) * 100) * quantity
    orderItems.push({ productId: p.id, name: p.name, price: p.price, quantity, imageUrl: p.imageUrl })
  }
  const subtotal = cents / 100
  const shippingFee = shippingFor(subtotal)
  const total = (cents + Math.round(shippingFee * 100)) / 100
  if (total < 1) throw new HttpError(400, 'Order total must be at least ₹1.')
  return { subtotal, shippingFee, total, orderItems, wanted }
}

export function ordersRouter(prisma, { requireUser }, upi) {
  const r = Router()
  r.use(requireUser)
  const ownOrder = async (req) => {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user.id }, include })
    if (!order) throw new HttpError(404, 'Order not found.')
    return order
  }
  r.get('/', ah(async (req, res) => res.json(await prisma.order.findMany({ where: { userId: req.user.id }, include, orderBy: { createdAt: 'desc' } }))))
  r.get('/:id', ah(async (req, res) => res.json(await ownOrder(req))))
  r.post('/', ah(async (req, res) => {
    upi.requireReady()
    const { items, address } = parse(z.object({
      items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(50) })).min(1).max(100),
      address: addressSchema,
    }), req.body)
    const priced = await priceOrder(prisma, items)
    const { isDefault, ...shippingAddress } = address
    const order = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}))::text`
      const candidates = await tx.order.findMany({ where: { userId: req.user.id, status: 'pending', total: priced.total,
        razorpayOrderId: null, createdAt: { gte: new Date(Date.now() - 3600000) } }, include, take: 10, orderBy: { createdAt: 'desc' } })
      const old = candidates.find((o) => !o.payments.length && o.items.length === priced.wanted.size &&
        o.items.every((i) => priced.wanted.get(i.productId) === i.quantity))
      if (old) return tx.order.update({ where: { id: old.id }, data: { shippingAddress } })
      return tx.order.create({ data: { userId: req.user.id, subtotal: priced.subtotal, shippingFee: priced.shippingFee,
        total: priced.total, shippingAddress, items: { create: priced.orderItems } } })
    })
    res.status(201).json(await upi.create(order))
  }))
  r.post('/:id/pay', ah(async (req, res) => {
    const order = await ownOrder(req)
    if (order.status !== 'pending' || order.payments.length) throw new HttpError(409, 'This order is paid or requires support review.')
    if (order.razorpayOrderId) throw new HttpError(409, 'This older payment must be resolved with support before starting UPI. Do not pay twice.')
    const recovered = upi.enabled ? await upi.sync() : { delayed: false }
    if (recovered.delayed) throw new HttpError(503, 'Bank confirmation is delayed. Do not pay again; check this order later.')
    await priceOrder(prisma, order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })))
    res.json(await upi.create(order))
  }))
  r.get('/:id/payments/:paymentId', ah(async (req, res) => {
    await ownOrder(req)
    res.json(await upi.status(req.params.id, req.params.paymentId))
  }))
  r.post('/:id/payments/:paymentId/utr', rateLimit({ windowMs: 60000, limit: 10 }), ah(async (req, res) => {
    await ownOrder(req)
    const { utr } = parse(z.object({ utr: z.string().regex(/^\d{12}$/) }), req.body)
    res.json(await upi.claim(req.params.id, req.params.paymentId, utr))
  }))
  return r
}
