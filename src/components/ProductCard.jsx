import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useWishlist } from '../context/WishlistContext'
import { formatPrice, discountPercent } from '../lib/format'

export default function ProductCard({ product }) {
  const { add } = useCart()
  const wishlist = useWishlist()
  const liked = wishlist.has(product.id)
  const off = discountPercent(product.price, product.compareAtPrice)
  const soldOut = product.stock <= 0

  return (
    <article className="group flex flex-col">
      <div className="relative">
        <Link to={`/product/${product.slug}`} className="relative block aspect-[4/5] overflow-hidden rounded-lg bg-mist">
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-4 mix-blend-multiply transition duration-500 group-hover:scale-105"
          />
          {(product.offerLabel || off > 0) && !soldOut && (
            <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-4rem)] rounded bg-crimson px-2 py-1 text-[10px] font-bold uppercase leading-tight text-white sm:left-3 sm:top-3 sm:text-[11px]">
              {product.offerLabel || `${off}% OFF`}
            </span>
          )}
          {soldOut && (
            <span className="absolute left-3 top-3 rounded bg-ink px-2 py-1 text-[11px] font-bold text-white">SOLD OUT</span>
          )}
        </Link>
        <button
          onClick={() => wishlist.toggle(product)}
          aria-pressed={liked}
          aria-label={liked ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          className="absolute right-2.5 top-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow transition hover:scale-110"
        >
          <svg viewBox="0 0 24 24" className={`h-5 w-5 ${liked ? 'fill-crimson text-crimson' : 'fill-none text-ink'}`} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 5 6.8 5c1.9 0 3.4 1 4.2 2.4h2C13.8 6 15.3 5 17.2 5c3.2 0 5.1 3 4 6.2-1.7 4.7-9.2 9.3-9.2 9.3z" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{product.category?.name}</p>
        <Link to={`/product/${product.slug}`} className="mt-1 block py-2 font-medium leading-snug hover:text-crimson">
          {product.name}
        </Link>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="font-semibold">{formatPrice(product.price)}</span>
          {off > 0 && <span className="text-sm text-muted line-through">{formatPrice(product.compareAtPrice)}</span>}
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
