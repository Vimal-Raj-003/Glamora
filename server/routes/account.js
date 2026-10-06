// Routes for the signed-in customer: profile, cart, wishlist, addresses.
import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, addressSchema, HttpError } from '../lib.js'
import { productInclude } from './catalog.js'

const publicUser = (u) => ({ id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role, createdAt: u.createdAt })

export function accountRouter(prisma, { requireUser }) {
  const r = Router()
  r.use(['/me', '/cart', '/wishlist', '/addresses'], requireUser)

  // ----- profile -----
  r.get('/me', (req, res) => res.json(publicUser(req.user)))

  r.patch('/me', ah(async (req, res) => {
    const data = parse(
      z.object({
        fullName: z.string().trim().max(120).optional(),
        phone: z.string().trim().max(20).nullish(),
      }),
      req.body,
    )
    const user = await prisma.user.update({ where: { id: req.user.id }, data })
    res.json(publicUser(user))
  }))

  // ----- cart (server copy of the browser cart) -----
  r.get('/cart', ah(async (req, res) => {
    const rows = await prisma.cartItem.findMany({ where: { userId: req.user.id } })
    res.json(rows.map((i) => ({ productId: i.productId, quantity: i.quantity })))
  }))

  r.put('/cart', ah(async (req, res) => {
    const { items } = parse(
      z.object({
        items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).max(100),
      }),
      req.body,
    )
    const merged = new Map()
    for (const i of items) merged.set(i.productId, Math.min((merged.get(i.productId) || 0) + i.quantity, 99))

    const existing = await prisma.product.findMany({ where: { id: { in: [...merged.keys()] } }, select: { id: true } })
    const valid = new Set(existing.map((p) => p.id))

    await prisma.$transaction([
      prisma.cartItem.deleteMany({ where: { userId: req.user.id } }),
      prisma.cartItem.createMany({
        data: [...merged].filter(([id]) => valid.has(id)).map(([productId, quantity]) => ({ userId: req.user.id, productId, quantity })),
      }),
    ])
    res.json({ ok: true })
  }))

  // ----- wishlist -----
  r.get('/wishlist', ah(async (req, res) => {
    const rows = await prisma.wishlistItem.findMany({
      where: { userId: req.user.id, product: { isActive: true } },
      include: { product: { include: productInclude } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(rows.map((w) => w.product))
  }))

  r.put('/wishlist/:productId', ah(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.productId }, select: { id: true } })
    if (!product) throw new HttpError(404, 'Product not found.')
    await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: req.user.id, productId: product.id } },
      update: {},
      create: { userId: req.user.id, productId: product.id },
    })
    res.json({ ok: true })
  }))

  r.delete('/wishlist/:productId', ah(async (req, res) => {
    await prisma.wishlistItem.deleteMany({ where: { userId: req.user.id, productId: req.params.productId } })
    res.json({ ok: true })
  }))

  // ----- addresses -----
  const clearOtherDefaults = (tx, userId, exceptId) =>
    tx.address.updateMany({ where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isDefault: false } })

  r.get('/addresses', ah(async (req, res) => {
    res.json(await prisma.address.findMany({ where: { userId: req.user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }))
  }))

  r.post('/addresses', ah(async (req, res) => {
    const data = parse(addressSchema, req.body)
    const created = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await clearOtherDefaults(tx, req.user.id)
      return tx.address.create({ data: { ...data, userId: req.user.id } })
    })
    res.status(201).json(created)
  }))

  r.put('/addresses/:id', ah(async (req, res) => {
    const data = parse(addressSchema, req.body)
    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.address.findFirst({ where: { id: req.params.id, userId: req.user.id } })
      if (!found) throw new HttpError(404, 'Address not found.')
      if (data.isDefault) await clearOtherDefaults(tx, req.user.id, found.id)
      return tx.address.update({ where: { id: found.id }, data })
    })
    res.json(updated)
  }))

  r.delete('/addresses/:id', ah(async (req, res) => {
    await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user.id } })
    res.json({ ok: true })
  }))

  return r
}
