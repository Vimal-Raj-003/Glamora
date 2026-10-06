import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, HttpError, ORDER_STATUSES } from '../lib.js'
import { productInclude } from './catalog.js'

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  slug: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).default(''),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullish(),
  stock: z.number().int().min(0),
  categoryId: z.string().min(1, 'Choose a category'),
  imageUrl: z.string().trim().min(1, 'Add an image'),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  popularity: z.number().int().default(0),
  freeShipping: z.boolean().default(false),
  maxPerOrder: z.number().int().min(1).nullish(),
  offerLabel: z.string().trim().max(60).nullish().transform((v) => v || null),
})

const mapUnique = (err) => {
  if (err?.code === 'P2002') throw new HttpError(409, 'A product with that slug already exists.')
  throw err
}

const productData = (data) => ({
  ...data,
  slug: data.slug || slugify(data.name),
  compareAtPrice: data.compareAtPrice ?? null,
  maxPerOrder: data.maxPerOrder ?? null,
})

const DAY_OPTIONS = [7, 30, 90]

// Payment fields the admin may see (the signature is never sent to the browser).
const adminPayments = { select: { id: true, razorpayOrderId: true, razorpayPaymentId: true, amount: true, status: true, createdAt: true } }

export function adminRouter(prisma, { requireAdmin }) {
  const r = Router()
  r.use(requireAdmin)

  // Everything on the dashboard comes straight from the database.
  //  - Revenue = captured payments on orders that are not cancelled (so refunded/cancelled orders drop out
  //    and an unpaid order can never count, whatever its status says).
  //  - Days are bucketed in Indian time.
  r.get('/stats', ah(async (req, res) => {
    const days = DAY_OPTIONS.includes(Number(req.query.days)) ? Number(req.query.days) : 30
    const since = new Date(Date.now() - days * 86400000)

    const [revenue, paidOrders, customers, products, activeProducts, lowStock, byStatus, dailyRows] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'captured', order: { status: { not: 'cancelled' } } }, _sum: { amount: true } }),
      prisma.order.count({ where: { payments: { some: { status: 'captured' } }, status: { not: 'cancelled' } } }),
      prisma.user.count({ where: { role: 'customer' } }),
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { isActive: true, stock: { lte: 5 } } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.$queryRaw`
        SELECT to_char(((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
               SUM(p."amount")::float8 AS revenue,
               COUNT(DISTINCT p."orderId")::int AS orders
          FROM "Payment" p
          JOIN "Order" o ON o."id" = p."orderId"
         WHERE p."status" = 'captured' AND o."status" <> 'cancelled' AND p."createdAt" >= ${since}
         GROUP BY 1`,
    ])

    // One row per day, including days with no sales, oldest first.
    const byDay = new Map(dailyRows.map((d) => [d.day, d]))
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD
    const daily = []
    for (let i = days - 1; i >= 0; i--) {
      const day = fmt.format(new Date(Date.now() - i * 86400000))
      const row = byDay.get(day)
      daily.push({ date: day, revenue: row?.revenue || 0, orders: row?.orders || 0 })
    }

    const statuses = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]))
    for (const g of byStatus) statuses[g.status] = g._count._all

    res.json({
      days,
      totals: { revenue: Number(revenue._sum.amount || 0), orders: paidOrders, customers, products, activeProducts, lowStock },
      daily,
      statuses,
    })
  }))

  // ----- products -----
  r.get('/products', ah(async (req, res) => {
    res.json(await prisma.product.findMany({ include: productInclude, orderBy: { createdAt: 'desc' } }))
  }))

  r.post('/products', ah(async (req, res) => {
    const data = parse(productSchema, req.body)
    const created = await prisma.product.create({ data: productData(data), include: productInclude }).catch(mapUnique)
    res.status(201).json(created)
  }))

  r.put('/products/:id', ah(async (req, res) => {
    const data = parse(productSchema, req.body)
    const updated = await prisma.product
      .update({ where: { id: req.params.id }, data: productData(data), include: productInclude })
      .catch((e) => (e?.code === 'P2025' ? Promise.reject(new HttpError(404, 'Product not found.')) : mapUnique(e)))
    res.json(updated)
  }))

  r.delete('/products/:id', ah(async (req, res) => {
    await prisma.product.delete({ where: { id: req.params.id } }).catch((e) => {
      if (e?.code === 'P2025') throw new HttpError(404, 'Product not found.')
      throw e
    })
    res.json({ ok: true })
  }))

  // ----- orders -----
  r.get('/orders', ah(async (req, res) => {
    res.json(
      await prisma.order.findMany({
        include: { items: true, payments: adminPayments, user: { select: { fullName: true, email: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    )
  }))

  r.patch('/orders/:id/status', ah(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(ORDER_STATUSES) }), req.body)
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payments: { select: { status: true } } } })
    if (!order) throw new HttpError(404, 'Order not found.')

    const hasPayment = order.payments.some((p) => p.status === 'captured')
    // An unpaid order can only be cancelled; it can never be marked paid/processing/shipped by hand.
    if (!hasPayment && status !== 'cancelled' && status !== 'pending') {
      throw new HttpError(400, 'This order has no confirmed payment, so it can only be cancelled.')
    }
    // A paid order never goes back to "pending".
    if (hasPayment && status === 'pending') throw new HttpError(400, 'A paid order cannot be set back to pending.')

    res.json(await prisma.order.update({ where: { id: order.id }, data: { status } }))
  }))

  // ----- customers -----
  r.get('/customers', ah(async (req, res) => {
    const [users, totals] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.order.groupBy({ by: ['userId'], where: { payments: { some: { status: 'captured' } }, status: { not: 'cancelled' } }, _sum: { total: true }, _count: { _all: true } }),
    ])
    const byUser = new Map(totals.map((t) => [t.userId, t]))
    res.json(
      users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        createdAt: u.createdAt,
        orderCount: byUser.get(u.id)?._count._all || 0,
        totalSpent: Number(byUser.get(u.id)?._sum.total || 0),
      })),
    )
  }))

  return r
}
