// Turns the ₹1 Razorpay live-payment test offer on or off for ONE product.
//   npm run offer:on     -> price becomes ₹1 (original price kept as the struck-through "was" price)
//   npm run offer:off    -> original price restored, offer flags cleared
// The offer product ships free and is limited to 1 per order, so a ₹1 order can never be abused for bulk buying.
import '../server/env.js'
import { prisma } from '../server/db.js'

const SLUG = 'soft-contour-beauty-sponge'
const LABEL = '₹1 Live Test Offer'
const mode = process.argv[2]

if (!['on', 'off'].includes(mode)) {
  console.error('Usage: node scripts/test-offer.mjs on|off')
  process.exit(1)
}

try {
  const p = await prisma.product.findUnique({ where: { slug: SLUG } })
  if (!p) throw new Error(`Product "${SLUG}" was not found. Run npm run db:seed first.`)

  if (mode === 'on') {
    if (p.offerLabel === LABEL) {
      console.log(`Offer already ON: "${p.name}" is ₹${Number(p.price)} (was ₹${Number(p.compareAtPrice)}).`)
    } else {
      const original = Number(p.price)
      await prisma.product.update({
        where: { id: p.id },
        data: { price: 1, compareAtPrice: original, freeShipping: true, maxPerOrder: 1, offerLabel: LABEL },
      })
      console.log(`Offer ON: "${p.name}" is now ₹1 (was ₹${original}), max 1 per order.`)
    }
  } else if (p.offerLabel !== LABEL) {
    console.log('Offer is not active - nothing to do.')
  } else {
    const original = Number(p.compareAtPrice)
    await prisma.product.update({
      where: { id: p.id },
      data: { price: original, compareAtPrice: null, freeShipping: false, maxPerOrder: null, offerLabel: null },
    })
    console.log(`Offer OFF: "${p.name}" restored to ₹${original}.`)
  }
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
