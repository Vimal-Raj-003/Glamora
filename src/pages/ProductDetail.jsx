import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getProduct, getProducts } from '../lib/api'
import { useCart } from '../context/CartContext'
import { formatPrice, discountPercent } from '../lib/format'
import QuantityStepper from '../components/QuantityStepper'
import ProductGrid from '../components/ProductGrid'
import { Spinner, ErrorBox, Empty } from '../components/ui'

export default function ProductDetail() {
  const { slug } = useParams()
  const { add } = useCart()
  const [qty, setQty] = useState(1)
  const { data: product, loading, error } = useAsync(() => getProduct(slug), [slug])
  const related = useAsync(
    () => (product ? getProducts({ categorySlug: product.category?.slug, limit: 5 }) : Promise.resolve([])),
    [product?.id],
  )

  if (loading) return <Spinner />
  if (error) return <div className="container-x py-10"><ErrorBox message={error} /></div>
  if (!product) return <Empty title="Product not found" actionTo="/shop" actionLabel="Back to shop" />

  const off = discountPercent(product.price, product.compare_at_price)
  const soldOut = product.stock <= 0
  const lowStock = product.stock > 0 && product.stock <= 10
  const others = (related.data || []).filter((p) => p.id !== product.id).slice(0, 4)

  return (
    <div className="container-x py-8">
      <nav className="mb-6 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-crimson">Home</Link> /{' '}
        {product.category && (
          <>
            <Link to={`/category/${product.category.slug}`} className="hover:text-crimson">{product.category.name}</Link> /{' '}
          </>
        )}
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="flex aspect-square items-center justify-center rounded-xl bg-mist p-8">
          <img src={product.image_url} alt={product.name} className="max-h-full max-w-full object-contain mix-blend-multiply" />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-crimson">{product.category?.name}</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">{product.name}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-bold">{formatPrice(product.price)}</span>
            {off > 0 && (
              <>
                <span className="text-lg text-muted line-through">{formatPrice(product.compare_at_price)}</span>
                <span className="rounded bg-crimson-soft px-2 py-0.5 text-xs font-bold text-crimson">{off}% OFF</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>

          <p className="mt-6 leading-relaxed text-graphite">{product.description}</p>

          <p className={`mt-6 text-sm font-medium ${soldOut ? 'text-crimson' : lowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
            {soldOut ? 'Out of stock' : lowStock ? `Only ${product.stock} left` : 'In stock'}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <QuantityStepper value={qty} max={product.stock} onChange={(v) => setQty(Math.max(1, v))} />
            <button onClick={() => add(product, qty)} disabled={soldOut} className="btn btn-primary flex-1 sm:flex-none sm:px-12">
              Add to cart
            </button>
          </div>

          <ul className="mt-8 space-y-2 border-t border-line pt-6 text-sm text-muted">
            <li>✓ Free shipping on orders above ₹999</li>
            <li>✓ 100% authentic products</li>
            <li>✓ Secure checkout with Razorpay</li>
          </ul>
        </div>
      </div>

      {others.length > 0 && (
        <section className="mt-20">
          <h2 className="section-title mb-8">You may also like</h2>
          <ProductGrid products={others} />
        </section>
      )}
    </div>
  )
}
