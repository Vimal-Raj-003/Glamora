import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatPrice, maxQuantity } from '../lib/format'
import QuantityStepper from './QuantityStepper'

export default function CartDrawer() {
  const { open, setOpen, lines, subtotal, shipping, remove, setQuantity } = useCart()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-2">
          <h2 className="font-serif text-xl font-semibold">Your cart</h2>
          <button onClick={() => setOpen(false)} className="relative z-10 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-2xl leading-none text-muted hover:text-ink" aria-label="Close cart">×</button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-muted">Your cart is empty.</p>
            <Link to="/shop" onClick={() => setOpen(false)} className="btn btn-primary">Start shopping</Link>
          </div>
        ) : (
          <>
            <div className="border-b border-line bg-mist px-5 py-2.5 text-xs">
              <strong className="text-crimson">Free shipping</strong> on orders below ₹1,000
            </div>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.productId} className="flex gap-4 py-4">
                  <img src={l.product.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded bg-mist object-contain p-1 mix-blend-multiply" />
                  <div className="flex-1">
                    <Link to={`/product/${l.product.slug}`} onClick={() => setOpen(false)} className="text-sm font-medium hover:text-crimson">
                      {l.product.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">{formatPrice(l.product.price)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <QuantityStepper value={l.quantity} max={maxQuantity(l.product)} onChange={(q) => setQuantity(l.productId, q)} />
                      <button onClick={() => remove(l.productId)} className="link-btn text-muted">Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line p-5">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-semibold">{formatPrice(subtotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">Shipping: <strong className="text-ink">{shipping === 0 ? 'Free' : formatPrice(shipping)}</strong></p>
              <Link to="/checkout" onClick={() => setOpen(false)} className="btn btn-primary mt-4 w-full">Checkout</Link>
              <Link to="/cart" onClick={() => setOpen(false)} className="btn btn-ghost mt-2 w-full">View cart</Link>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
