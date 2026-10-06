import { PrismaClient } from '@prisma/client'
import { CATEGORIES, PRODUCTS } from './seedData.js'

const prisma = new PrismaClient()

async function main() {
  const bySlug = {}
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: c })
    bySlug[c.slug] = row.id
  }

  // Only inserts products that do not exist yet, so re-running never overwrites your edits.
  for (const { categorySlug, ...p } of PRODUCTS) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...p, categoryId: bySlug[categorySlug] },
    })
  }
  console.log(`Seeded ${CATEGORIES.length} categories and ${PRODUCTS.length} products.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
