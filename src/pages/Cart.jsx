import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatPrice, FREE_SHIPPING_THRESHOLD, maxQuantity } from '../lib/format'
import QuantityStepper from '../components/QuantityStepper'
import { PageHeader, Empty } from '../components/ui'

export default function Cart() {
  const { lines, subtotal, shipping, total, setQuantity, remove } = useCart()

  return (
    <>
      <PageHeader title="Your cart" />
      {lines.length === 0 ? (
        <Empty title="Your cart is empty" text="Looks like you haven’t added anything yet." actionTo="/shop" actionLabel="Start shopping" />
      ) : (
        <div className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_22rem]">
          <ul className="divide-y divide-line border-y border-line">
            {lines.map((l) => (
              <li key={l.productId} className="flex gap-4 py-5 sm:gap-6">
                <Link to={`/product/${l.product.slug}`}>
                  <img src={l.product.imageUrl} alt={l.product.name} className="h-24 w-24 rounded bg-mist object-contain p-2 mix-blend-multiply sm:h-28 sm:w-28" />
                </Link>
                <div className="flex flex-1 flex-col justify-between sm:flex-row sm:items-center">
                  <div>
                    <Link to={`/product/${l.product.slug}`} className="font-medium hover:text-crimson">{l.product.name}</Link>
                    <p className="mt-1 text-sm text-muted">{formatPrice(l.product.price)}</p>
                    <button onClick={() => remove(l.productId)} className="mt-2 text-xs text-muted underline hover:text-crimson">Remove</button>
                  </div>
                  <div className="mt-3 flex items-center gap-6 sm:mt-0">
                    <QuantityStepper value={l.quantity} max={maxQuantity(l.product)} onChange={(q) => setQuantity(l.productId, q)} />
                    <span className="w-20 text-right font-semibold">{formatPrice(l.quantity * l.product.price)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-lg bg-mist p-6">
            <h2 className="font-serif text-xl font-semibold">Order summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? 'Free' : formatPrice(shipping)}</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd>{formatPrice(total)}</dd></div>
            </dl>
            {shipping > 0 && (
              <p className="mt-3 text-xs text-muted">Add {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} more for free shipping.</p>
            )}
            <Link to="/checkout" className="btn btn-primary mt-6 w-full">Proceed to checkout</Link>
            <Link to="/shop" className="btn btn-ghost mt-2 w-full">Continue shopping</Link>
          </aside>
        </div>
      )}
    </>
  )
}
