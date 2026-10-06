import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatPrice, discountPercent } from '../lib/format'

export default function ProductCard({ product }) {
  const { add } = useCart()
  const off = discountPercent(product.price, product.compare_at_price)
  const soldOut = product.stock <= 0

  return (
    <article className="group flex flex-col">
      <Link to={`/product/${product.slug}`} className="relative block aspect-[4/5] overflow-hidden rounded-lg bg-mist">
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-contain p-4 mix-blend-multiply transition duration-500 group-hover:scale-105"
        />
        {off > 0 && !soldOut && (
          <span className="absolute left-3 top-3 rounded bg-crimson px-2 py-1 text-[11px] font-bold text-white">{off}% OFF</span>
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded bg-ink px-2 py-1 text-[11px] font-bold text-white">SOLD OUT</span>
        )}
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{product.category?.name}</p>
        <Link to={`/product/${product.slug}`} className="mt-1 font-medium leading-snug hover:text-crimson">
          {product.name}
        </Link>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-semibold">{formatPrice(product.price)}</span>
          {off > 0 && <span className="text-sm text-muted line-through">{formatPrice(product.compare_at_price)}</span>}
        </div>
        <button
          onClick={() => add(product)}
          disabled={soldOut}
          className="btn btn-outline btn-sm mt-3 w-full"
          aria-label={`Add ${product.name} to cart`}
        >
          {soldOut ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </article>
  )
}
