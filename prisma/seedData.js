// Sample catalogue used by `npm run db:seed`.

export const CATEGORIES = [
  { slug: 'face', name: 'Face', description: 'Foundation, concealer and blush for a flawless base.', imageUrl: '/images/face/2.avif', sortOrder: 1 },
  { slug: 'eyes', name: 'Eyes', description: 'Kajal, liner and mascara for a statement look.', imageUrl: '/images/eyes/3.jpg', sortOrder: 2 },
  { slug: 'lips', name: 'Lips', description: 'Lipsticks, glosses and liners in every shade.', imageUrl: '/images/lips/1.jpg', sortOrder: 3 },
  { slug: 'makeup-tools', name: 'Makeup Tools', description: 'Brushes, sponges and tools for pro application.', imageUrl: '/images/tools/1.avif', sortOrder: 4 },
]

// [category, slug, name, description, price, compareAtPrice, stock, imageUrl, isFeatured, popularity, daysAgo]
const ROWS = [
  ['face', 'silk-skin-liquid-foundation', 'Silk Skin Liquid Foundation', 'Lightweight, buildable coverage with a natural satin finish. Blends seamlessly and lasts up to 16 hours without caking.', 899, 1199, 40, '/images/face/2.avif', true, 95, 3],
  ['face', 'radiance-liquid-concealer', 'Radiance Liquid Concealer', 'Full-coverage, crease-proof concealer that hides dark circles and blemishes while brightening the under-eye area.', 549, 699, 60, '/images/face/3.avif', false, 80, 10],
  ['face', 'rose-petal-powder-blush', 'Rose Petal Powder Blush', 'Silky, finely milled blush in a soft rose shade that gives cheeks a fresh, healthy flush. Easily buildable.', 499, null, 35, '/images/face/1.jpg', true, 70, 20],

  ['eyes', 'smokey-black-kajal-duo', 'Smokey Black Kajal Duo', 'Intense, waterproof black kajal pencils (set of 2) with a built-in smudger. Smudge-proof and long-lasting.', 349, 449, 80, '/images/eyes/1.jpg', true, 90, 5],
  ['eyes', 'volume-lash-mascara', 'Volume Lash Mascara', 'Dramatic volume and length with a flake-free formula. The flexible brush coats every lash from root to tip.', 599, 749, 50, '/images/eyes/2.avif', false, 85, 8],
  ['eyes', 'precision-liquid-eyeliner', 'Precision Liquid Eyeliner', 'Ultra-fine felt tip for sharp wings and bold lines. Jet-black, quick-drying and smudge-proof all day.', 399, null, 70, '/images/eyes/3.jpg', true, 75, 1],

  ['lips', 'satin-nude-lipstick', 'Satin Nude Lipstick', 'Creamy, comfortable satin lipstick in a flattering nude-rose shade with rich, one-swipe colour payoff.', 649, 799, 45, '/images/lips/1.jpg', true, 92, 6],
  ['lips', 'rosewood-lip-gloss', 'Rosewood Lip Gloss', 'High-shine, non-sticky gloss in a soft rosewood tint that adds plump, glassy dimension to lips.', 449, null, 55, '/images/lips/2.png', false, 65, 14],
  ['lips', 'coral-lip-liner', 'Coral Lip Liner', 'Creamy, long-wear lip pencil that defines and shapes lips without feathering. Pairs with any lipstick.', 299, 399, 90, '/images/lips/3.avif', false, 60, 2],

  ['makeup-tools', 'professional-brush-set', 'Professional 11-Piece Brush Set', 'Complete set of soft, cruelty-free brushes for face and eyes: from foundation and powder to blending and spooley.', 1499, 1999, 25, '/images/tools/1.avif', true, 88, 4],
  ['makeup-tools', 'soft-contour-beauty-sponge', 'Soft Contour Beauty Sponge', 'Ultra-soft, latex-free sponge with a precision tip for a streak-free, airbrushed finish. Expands when wet.', 249, null, 100, '/images/tools/2.jpg', false, 72, 12],
  ['makeup-tools', 'steel-eyelash-curler', 'Steel Eyelash Curler', 'Stainless-steel curler with a cushioned pad that lifts and curls lashes for a wide-awake look.', 299, 399, 65, '/images/tools/3.jpg', false, 55, 18],
]

export const PRODUCTS = ROWS.map(
  ([categorySlug, slug, name, description, price, compareAtPrice, stock, imageUrl, isFeatured, popularity, daysAgo]) => ({
    categorySlug, slug, name, description, price, compareAtPrice, stock, imageUrl, isFeatured, popularity,
    createdAt: new Date(Date.now() - daysAgo * 86400000),
  }),
)
