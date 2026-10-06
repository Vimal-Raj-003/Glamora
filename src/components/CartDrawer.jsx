import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatPrice, FREE_SHIPPING_THRESHOLD } from '../lib/format'
import QuantityStepper from './QuantityStepper'

export default function CartDrawer() {
  const { open, setOpen, lines, subtotal, remove, setQuantity } = useCart()

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
  const remaining = Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0)

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-serif text-xl font-semibold">Your cart</h2>
          <button onClick={() => setOpen(false)} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close cart">×</button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-muted">Your cart is empty.</p>
            <Link to="/shop" onClick={() => setOpen(false)} className="btn btn-primary">Start shopping</Link>
          </div>
        ) : (
          <>
            <div className="border-b border-line bg-mist px-5 py-2.5 text-xs">
              {remaining > 0 ? (
                <>Add <strong>{formatPrice(remaining)}</strong> more for free shipping</>
              ) : (
                <strong className="text-crimson">You’ve unlocked free shipping!</strong>
              )}
            </div>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.productId} className="flex gap-4 py-4">
                  <img src={l.product.image_url} alt="" className="h-20 w-20 shrink-0 rounded bg-mist object-contain p-1 mix-blend-multiply" />
                  <div className="flex-1">
                    <Link to={`/product/${l.product.slug}`} onClick={() => setOpen(false)} className="text-sm font-medium hover:text-crimson">
                      {l.product.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">{formatPrice(l.product.price)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <QuantityStepper value={l.quantity} max={l.product.stock} onChange={(q) => setQuantity(l.productId, q)} />
                      <button onClick={() => remove(l.productId)} className="text-xs text-muted underline hover:text-crimson">Remove</button>
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
              <p className="mt-1 text-xs text-muted">Shipping calculated at checkout.</p>
              <Link to="/checkout" onClick={() => setOpen(false)} className="btn btn-primary mt-4 w-full">Checkout</Link>
              <Link to="/cart" onClick={() => setOpen(false)} className="btn btn-ghost mt-2 w-full">View cart</Link>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
