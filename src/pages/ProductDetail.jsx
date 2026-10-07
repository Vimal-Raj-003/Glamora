import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getProduct, getProducts } from '../lib/api'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { formatPrice, discountPercent, maxQuantity } from '../lib/format'
import QuantityStepper from '../components/QuantityStepper'
import ProductGrid from '../components/ProductGrid'
import { Spinner, ErrorBox, Empty } from '../components/ui'

export default function ProductDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { add } = useCart()
  const wishlist = useWishlist()
  const [qty, setQty] = useState(1)
  useEffect(() => setQty(1), [slug]) // a different product starts at quantity 1
  const { data: product, loading, error } = useAsync(() => getProduct(slug), [slug])
  const related = useAsync(
    () => (product ? getProducts({ categorySlug: product.category?.slug, limit: 5 }) : Promise.resolve([])),
    [product?.id],
  )

  if (loading) return <Spinner />
  if (error) return <div className="container-x py-10"><ErrorBox message={error} /></div>
  if (!product) return <Empty title="Product not found" actionTo="/shop" actionLabel="Back to shop" />

  const off = discountPercent(product.price, product.compareAtPrice)
  const soldOut = product.stock <= 0
  const lowStock = product.stock > 0 && product.stock <= 10
  const buyNow = () => navigate(`/checkout?buy=${encodeURIComponent(product.id)}&qty=${qty}`)
  const others = (related.data || []).filter((p) => p.id !== product.id).slice(0, 4)

  return (
    <div className="container-x py-3 sm:py-4 lg:py-5">
      <nav className="mb-2 text-xs text-muted sm:text-sm" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-crimson">Home</Link> /{' '}
        {product.category && (
          <>
            <Link to={`/category/${product.category.slug}`} className="hover:text-crimson">{product.category.name}</Link> /{' '}
          </>
        )}
        <span className="text-ink">{product.name}</span>
      </nav>

      {/* Image and details sit side by side from tablet up. The image height is limited by the screen height,
          so the price and the buy buttons are in the first view on laptops and desktops. */}
      <div className="grid items-start gap-3 sm:gap-4 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <div className="flex h-28 w-full items-center justify-center rounded-xl bg-mist p-2 sm:h-36 md:h-44 lg:h-64 lg:p-4">
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain mix-blend-multiply" />
        </div>

        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-semibold uppercase tracking-widest text-crimson">{product.category?.name}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold leading-tight sm:text-3xl">{product.name}</h1>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold">{formatPrice(product.price)}</span>
            {off > 0 && (
              <>
                <span className="text-base text-muted line-through sm:text-lg">{formatPrice(product.compareAtPrice)}</span>
                <span className="rounded bg-crimson-soft px-2 py-0.5 text-xs font-bold uppercase text-crimson">{product.offerLabel || `${off}% OFF`}</span>
              </>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${soldOut ? 'text-crimson' : lowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
              {soldOut ? 'Out of stock' : lowStock ? `Only ${product.stock} left` : 'In stock'}
            </span>
            <span>
              Inclusive of all taxes
              {' · Free shipping'}
              {product.maxPerOrder ? ` · Limit ${product.maxPerOrder} per order` : ''}
            </span>
          </p>

          {/* Quantity + actions. Phone: [quantity | wishlist] then [Add to cart | Buy now]. Laptop+: one row. */}
          <div className="order-2 mt-3 grid grid-cols-2 gap-3 md:order-1 md:mt-4 lg:flex lg:flex-wrap lg:items-center">
            <div className="order-1 flex items-center gap-2">
              <span className="label !mb-0 hidden sm:inline lg:hidden">Qty</span>
              <QuantityStepper value={qty} max={maxQuantity(product)} onChange={(v) => setQty(Math.max(1, v))} />
            </div>
            <button onClick={() => add(product, qty)} disabled={soldOut} className="btn btn-dark order-3 min-h-12 lg:order-2 lg:min-w-[9.5rem]">
              Add to cart
            </button>
            {/* Buy Now goes straight to checkout with ONLY this product and quantity; the cart is not touched. */}
            <button onClick={buyNow} disabled={soldOut} className="btn btn-primary order-4 min-h-12 lg:order-3 lg:min-w-[9.5rem]">
              Buy now
            </button>
            <button onClick={() => wishlist.toggle(product)} aria-pressed={wishlist.has(product.id)} className="btn btn-outline order-2 min-h-12 justify-self-end px-4 lg:order-4">
              {wishlist.has(product.id) ? '♥ Saved' : '♡ Wishlist'}
            </button>
          </div>

          <p className="order-3 mt-3 text-[15px] leading-relaxed text-graphite md:order-none">{product.description}</p>

          <ul className="order-4 mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-muted">
            <li>✓ Free shipping on every order</li>
            <li>✓ 100% authentic</li>
            <li>✓ Secure Razorpay checkout</li>
          </ul>
        </div>
      </div>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-6">You may also like</h2>
          <ProductGrid products={others} />
        </section>
      )}
    </div>
  )
}
