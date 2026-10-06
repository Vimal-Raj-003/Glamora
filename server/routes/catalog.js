import { Router } from 'express'
import { ah, HttpError } from '../lib.js'

const SORTS = {
  popular: { popularity: 'desc' },
  newest: { createdAt: 'desc' },
  'price-asc': { price: 'asc' },
  'price-desc': { price: 'desc' },
}

export const productInclude = { category: { select: { slug: true, name: true } } }

export function catalogRouter(prisma) {
  const r = Router()

  r.get('/categories', ah(async (req, res) => {
    res.json(await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }))
  }))

  r.get('/products', ah(async (req, res) => {
    const { category, search, sort = 'popular', featured, ids } = req.query
    const limit = Math.min(Number(req.query.limit) || 100, 200)

    const where = { isActive: true }
    if (category) where.category = { slug: String(category) }
    if (featured === '1' || featured === 'true') where.isFeatured = true
    if (ids) where.id = { in: String(ids).split(',').slice(0, 100) }
    if (search && String(search).trim()) {
      const q = String(search).trim().slice(0, 80)
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ]
    }

    res.json(
      await prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: SORTS[sort] || SORTS.popular,
        take: limit,
      }),
    )
  }))

  r.get('/products/:slug', ah(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { slug: req.params.slug, isActive: true },
      include: productInclude,
    })
    if (!product) throw new HttpError(404, 'Product not found.')
    res.json(product)
  }))

  return r
}
