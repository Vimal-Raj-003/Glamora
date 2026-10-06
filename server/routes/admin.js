import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, HttpError, ORDER_STATUSES, PAID_STATUSES } from '../lib.js'
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
})

const mapUnique = (err) => {
  if (err?.code === 'P2002') throw new HttpError(409, 'A product with that slug already exists.')
  throw err
}

export function adminRouter(prisma, { requireAdmin }) {
  const r = Router()
  r.use(requireAdmin)

  r.get('/stats', ah(async (req, res) => {
    const [customers, orders, pending, revenue, lowStock] = await Promise.all([
      prisma.user.count({ where: { role: 'customer' } }),
      prisma.order.count({ where: { status: { not: 'pending' } } }),
      prisma.order.count({ where: { status: { in: ['paid', 'processing'] } } }),
      prisma.order.aggregate({ where: { status: { in: PAID_STATUSES } }, _sum: { total: true } }),
      prisma.product.count({ where: { stock: { lte: 5 }, isActive: true } }),
    ])
    res.json({ customers, orders, toFulfil: pending, revenue: Number(revenue._sum.total || 0), lowStock })
  }))

  // ----- products -----
  r.get('/products', ah(async (req, res) => {
    res.json(await prisma.product.findMany({ include: productInclude, orderBy: { createdAt: 'desc' } }))
  }))

  r.post('/products', ah(async (req, res) => {
    const data = parse(productSchema, req.body)
    const created = await prisma.product
      .create({ data: { ...data, slug: data.slug || slugify(data.name), compareAtPrice: data.compareAtPrice ?? null }, include: productInclude })
      .catch(mapUnique)
    res.status(201).json(created)
  }))

  r.put('/products/:id', ah(async (req, res) => {
    const data = parse(productSchema, req.body)
    const updated = await prisma.product
      .update({ where: { id: req.params.id }, data: { ...data, slug: data.slug || slugify(data.name), compareAtPrice: data.compareAtPrice ?? null }, include: productInclude })
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
        include: { items: true, user: { select: { fullName: true, email: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    )
  }))

  r.patch('/orders/:id/status', ah(async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(ORDER_STATUSES) }), req.body)
    const order = await prisma.order.update({ where: { id: req.params.id }, data: { status } }).catch((e) => {
      if (e?.code === 'P2025') throw new HttpError(404, 'Order not found.')
      throw e
    })
    res.json(order)
  }))

  // ----- customers -----
  r.get('/customers', ah(async (req, res) => {
    const [users, totals] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.order.groupBy({ by: ['userId'], where: { status: { in: PAID_STATUSES } }, _sum: { total: true }, _count: { _all: true } }),
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
