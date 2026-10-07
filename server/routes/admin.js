import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, HttpError, ORDER_STATUSES } from '../lib.js'
import { productInclude } from './catalog.js'
import { adminEmails, FREE_SHIPPING_BELOW, SHIPPING_FEE } from '../lib.js'
import { clerkConfigured } from '../auth.js'

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const productSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  slug: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).default(''),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullish(),
  stock: z.number().int().min(0),
  categoryId: z.string().min(1, 'Choose a category'),
  // A site path, an https:// address, or an uploaded picture (small data: URL). Anything else (such as javascript:) is refused.
  imageUrl: z
    .string()
    .trim()
    .min(1, 'Add an image')
    .max(300000, 'That image is too large')
    .refine((v) => /^(\/(?!\/)|https?:\/\/|data:image\/(png|jpe?g|webp|avif);base64,)/i.test(v), 'Image must be a /path, an https:// address or an uploaded picture'),
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

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).nullish().transform((v) => v || null),
  imageUrl: z.string().trim().max(300000).nullish().transform((v) => v || null),
  sortOrder: z.number().int().min(0).max(1000).default(0),
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

    const recent = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, status: true, total: true, createdAt: true, user: { select: { fullName: true, email: true } }, payments: { select: { status: true } } },
    })

    res.json({
      days,
      recent,
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

  // ----- payments (every Razorpay payment we recorded, plus orders still waiting for a payment) -----
  r.get('/payments', ah(async (req, res) => {
    const who = { select: { fullName: true, email: true, phone: true } }
    const [payments, unpaid] = await Promise.all([
      prisma.payment.findMany({
        select: { ...adminPayments.select, order: { select: { id: true, total: true, status: true, user: who } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      prisma.order.findMany({
        where: { payments: { none: {} } },
        select: { id: true, total: true, status: true, razorpayOrderId: true, createdAt: true, user: who },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ])
    res.json({ payments, unpaid })
  }))

  // ----- categories -----
  r.get('/categories', ah(async (req, res) => {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } })
    res.json(cats.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })))
  }))

  r.post('/categories', ah(async (req, res) => {
    const data = parse(categorySchema, req.body)
    const created = await prisma.category
      .create({ data: { ...data, slug: data.slug || slugify(data.name) } })
      .catch(() => Promise.reject(new HttpError(409, 'A category with that name or slug already exists.')))
    res.status(201).json(created)
  }))

  // The slug is the category's web address (and the header links use it), so it is never changed on edit.
  r.put('/categories/:id', ah(async (req, res) => {
    const { slug, ...data } = parse(categorySchema, req.body)
    const updated = await prisma.category.update({ where: { id: req.params.id }, data }).catch((e) => {
      throw e?.code === 'P2025' ? new HttpError(404, 'Category not found.') : e
    })
    res.json(updated)
  }))

  r.delete('/categories/:id', ah(async (req, res) => {
    const count = await prisma.product.count({ where: { categoryId: req.params.id } })
    if (count > 0) throw new HttpError(409, `This category still has ${count} product${count === 1 ? '' : 's'}. Move or delete them first.`)
    await prisma.category.delete({ where: { id: req.params.id } }).catch((e) => {
      throw e?.code === 'P2025' ? new HttpError(404, 'Category not found.') : e
    })
    res.json({ ok: true })
  }))

  // ----- system information (yes/no flags and public facts only; never a key or password) -----
  r.get('/system', ah(async (req, res) => {
    const keyId = process.env.RAZORPAY_KEY_ID || ''
    const [users, orders, paidOrders, products, categories, unpaidOld] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.order.count({ where: { payments: { some: { status: 'captured' } } } }),
      prisma.product.count(),
      prisma.category.count(),
      prisma.order.count({ where: { status: 'pending', createdAt: { lt: new Date(Date.now() - 86400000) } } }),
    ])
    res.json({
      database: { connected: true, users, orders, paidOrders, products, categories },
      razorpay: {
        configured: Boolean(keyId && process.env.RAZORPAY_KEY_SECRET),
        mode: keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : 'unknown',
        webhookSecretSet: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      },
      clerk: { configured: clerkConfigured() },
      superAdminEmails: adminEmails().size,
      shipping: { freeBelow: FREE_SHIPPING_BELOW, fee: SHIPPING_FEE },
      attention: { unpaidOrdersOlderThan24h: unpaidOld },
      serverTime: new Date().toISOString(),
    })
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

  // One customer with their full order history.
  r.get('/customers/:id', ah(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        addresses: { orderBy: { createdAt: 'desc' }, take: 5 },
        orders: { orderBy: { createdAt: 'desc' }, take: 100, include: { items: true, payments: adminPayments } },
      },
    })
    if (!user) throw new HttpError(404, 'Customer not found.')
    const { clerkId, ...safe } = user
    res.json(safe)
  }))

  return r
}
