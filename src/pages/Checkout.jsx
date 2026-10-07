import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { getAddresses, saveAddress, createOrder, getProductsByIds } from '../lib/api'
import { startPayment, confirmOnServer } from '../lib/razorpay'
import { formatPrice, shippingFor, maxQuantity } from '../lib/format'
import { INDIAN_STATES, validateAddress as validate } from '../lib/india'
import { PageHeader, Field, ErrorBox, Empty, Spinner } from '../components/ui'
import { ChatHelpButton } from '../components/ChatWidget'
import QuantityStepper from '../components/QuantityStepper'

const EMPTY = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '' }

export default function Checkout() {
  const { user, profile } = useAuth()
  const cart = useCart()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // "Buy now": /checkout?buy=<productId>&qty=<n> buys ONLY that product. The cart is left exactly as it was.
  const buyId = params.get('buy')
  const [buyProduct, setBuyProduct] = useState(undefined) // undefined = loading, null = not available
  const [buyQty, setBuyQty] = useState(Math.max(1, parseInt(params.get('qty') || '1', 10) || 1))

  const [saved, setSaved] = useState(null)
  const [selected, setSelected] = useState('new')
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saveForLater, setSaveForLater] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(false) // customer closed the popup once
  const [unverified, setUnverified] = useState(null) // paid in Razorpay but not yet confirmed by our server

  useEffect(() => {
    getAddresses()
      .then((list) => {
        setSaved(list)
        const def = list.find((a) => a.isDefault) || list[0]
        if (def) setSelected(def.id)
      })
      .catch(() => setSaved([]))
  }, [user.id])

  useEffect(() => {
    if (profile?.fullName) setForm((f) => (f.fullName ? f : { ...f, fullName: profile.fullName }))
  }, [profile])

  useEffect(() => {
    if (!buyId) return
    setBuyProduct(undefined)
    getProductsByIds([buyId])
      .then((list) => setBuyProduct(list[0] || null))
      .catch(() => setBuyProduct(null))
  }, [buyId])

  const buyMode = Boolean(buyId)
  const buyAvailable = buyMode && buyProduct && buyProduct.isActive !== false && buyProduct.stock > 0
  const quantity = buyAvailable ? Math.min(Math.max(1, buyQty), maxQuantity(buyProduct)) : 0

  // What is being bought: just the one product (Buy now) or the whole cart.
  const lines = buyMode ? (buyAvailable ? [{ productId: buyProduct.id, quantity, product: buyProduct }] : []) : cart.lines
  const subtotal = lines.reduce((n, l) => n + l.quantity * Number(l.product.price), 0)
  const shipping = shippingFor(subtotal, lines)
  const total = subtotal + shipping

  if (buyMode && buyProduct === undefined) return <Spinner />
  if (buyMode && !buyAvailable) {
    return <Empty title="This product isn’t available" text="It may be out of stock or no longer sold. Your cart has not been changed." actionTo="/shop" actionLabel="Continue shopping" />
  }
  if (!buyMode && lines.length === 0) {
    return <Empty title="Your cart is empty" text="Add some products before checking out." actionTo="/shop" actionLabel="Start shopping" />
  }
  if (!saved) return <Spinner />

  const set = (name) => ({ value: form[name], onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })) })

  // After a successful payment: Buy now removes only the bought product from the cart; a normal checkout empties it.
  const afterPaid = (orderId) => {
    if (buyMode) cart.remove(buyProduct.id)
    else cart.clear()
    navigate(`/order/${orderId}`, { replace: true })
  }

  const pay = async (e) => {
    e.preventDefault()
    setError('')
    let address
    if (selected === 'new') {
      const errs = validate(form)
      setErrors(errs)
      if (Object.keys(errs).length) return
      address = { ...form, country: 'India' }
    } else {
      const a = saved.find((x) => x.id === selected)
      address = { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country }
    }

    setBusy(true)
    try {
      if (selected === 'new' && saveForLater) {
        await saveAddress({ ...address, isDefault: saved.length === 0 }).catch(() => {})
      }
      // The server prices the order from the database and prepares the Razorpay order. If this exact purchase is
      // still unpaid from an earlier attempt, the same order is returned, so retrying never creates duplicates.
      const init = await createOrder(lines, address)
      await startPayment({
        init,
        prefill: { name: address.fullName, email: user.email, contact: address.phone },
        onPaid: () => afterPaid(init.orderId),
        onDismiss: () => {
          setBusy(false)
          setRetry(true)
          toast('Payment not completed. Your order is saved - tap "Retry payment" when you are ready.', 'error')
        },
        onFailed: (message) => setError(message),
        onVerifyError: (err, resp) => {
          setBusy(false)
          setUnverified({ orderId: init.orderId, resp })
          setError(`Your payment went through but we could not confirm it yet (${err.message}). Do not pay again - use "Confirm my payment" below. Payment ID: ${resp.razorpay_payment_id}`)
        },
      })
    } catch (err) {
      setBusy(false)
      setError(err.message)
    }
  }

  // Safe to press more than once: the server records a payment only once.
  const confirmAgain = async () => {
    setBusy(true)
    setError('')
    try {
      await confirmOnServer(unverified.orderId, unverified.resp)
      afterPaid(unverified.orderId)
    } catch (err) {
      setBusy(false)
      setError(`Still could not confirm the payment: ${err.message}. Please contact support with payment ID ${unverified.resp.razorpay_payment_id}.`)
    }
  }

  return (
    <>
      <PageHeader eyebrow={buyMode ? 'Buy now' : undefined} title="Checkout" />
      <form onSubmit={pay} className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_24rem]" noValidate>
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="font-serif text-2xl font-semibold">Shipping address</h2>

            {saved.length > 0 && (
              <div className="mt-5 space-y-3">
                {saved.map((a) => (
                  <label key={a.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 text-sm ${selected === a.id ? 'border-crimson bg-crimson-soft/40' : 'border-line'}`}>
                    <input type="radio" name="address" className="mt-1 accent-crimson" checked={selected === a.id} onChange={() => setSelected(a.id)} />
                    <span className="min-w-0">
                      <strong>{a.fullName}</strong> · {a.phone}<br />
                      {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postalCode}
                    </span>
                  </label>
                ))}
                <label className={`flex cursor-pointer gap-3 rounded-lg border p-4 text-sm ${selected === 'new' ? 'border-crimson bg-crimson-soft/40' : 'border-line'}`}>
                  <input type="radio" name="address" className="mt-1 accent-crimson" checked={selected === 'new'} onChange={() => setSelected('new')} />
                  <strong>Use a new address</strong>
                </label>
              </div>
            )}

            {selected === 'new' && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={errors.fullName}><input autoComplete="name" className="input" {...set('fullName')} /></Field>
                <Field label="Mobile number" error={errors.phone}><input inputMode="numeric" maxLength={10} autoComplete="tel-national" className="input" {...set('phone')} /></Field>
                <div className="sm:col-span-2"><Field label="Address line 1" error={errors.line1}><input autoComplete="address-line1" className="input" {...set('line1')} /></Field></div>
                <div className="sm:col-span-2"><Field label="Address line 2 (optional)"><input autoComplete="address-line2" className="input" {...set('line2')} /></Field></div>
                <Field label="City" error={errors.city}><input autoComplete="address-level2" className="input" {...set('city')} /></Field>
                <Field label="State" error={errors.state}>
                  <select className="input" {...set('state')}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="PIN code" error={errors.postalCode}><input inputMode="numeric" maxLength={6} autoComplete="postal-code" className="input" {...set('postalCode')} /></Field>
                <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={saveForLater} onChange={(e) => setSaveForLater(e.target.checked)} className="h-4 w-4 accent-crimson" />
                  Save this address for next time
                </label>
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit min-w-0 rounded-lg bg-mist p-5 sm:p-6">
          <h2 className="font-serif text-xl font-semibold">{buyMode ? 'Buying now' : 'Order summary'}</h2>
          {buyMode && (
            <p className="mt-1 text-xs text-muted">
              Only this product is in this order.{' '}
              {cart.count > 0 ? `Your cart (${cart.count} item${cart.count === 1 ? '' : 's'}) is saved and unchanged.` : ''}
            </p>
          )}
          <ul className="mt-4 divide-y divide-line text-sm">
            {lines.map((l) => (
              <li key={l.productId} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words">{l.product.name} <span className="text-muted">× {l.quantity}</span></span>
                  <span className="shrink-0">{formatPrice(l.quantity * l.product.price)}</span>
                </div>
                {buyMode && (
                  <div className="mt-2">
                    <QuantityStepper value={quantity} max={maxQuantity(buyProduct)} onChange={(v) => setBuyQty(Math.max(1, v))} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? 'Free' : formatPrice(shipping)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd>{formatPrice(total)}</dd></div>
          </dl>
          {error && <div className="mt-4"><ErrorBox message={error} /></div>}
          {unverified ? (
            <button type="button" onClick={confirmAgain} className="btn btn-primary mt-5 min-h-12 w-full" disabled={busy}>
              {busy ? 'Confirming…' : 'Confirm my payment'}
            </button>
          ) : (
            <button className="btn btn-primary mt-5 min-h-12 w-full" disabled={busy}>
              {busy ? 'Processing…' : `${retry ? 'Retry payment' : 'Pay'} ${formatPrice(total)}`}
            </button>
          )}
          <p className="mt-3 text-center text-xs text-muted">Secure payment via Razorpay (UPI, cards, netbanking, wallets)</p>
          <p className="mt-2 text-center text-xs text-muted">
            By placing your order you agree to our <Link to="/terms-and-conditions" className="underline hover:text-crimson">Terms</Link>,{' '}
            <Link to="/shipping-policy" className="underline hover:text-crimson">Shipping</Link> and{' '}
            <Link to="/return-refund-policy" className="underline hover:text-crimson">Return &amp; Refund</Link> policies.
          </p>
          {buyMode ? (
            <Link to={`/product/${buyProduct.slug}`} className="mt-2 block py-3 text-center text-xs text-muted underline hover:text-crimson">Back to product</Link>
          ) : (
            <Link to="/cart" className="mt-2 block py-3 text-center text-xs text-muted underline hover:text-crimson">Edit cart</Link>
          )}
          <div className="text-center"><ChatHelpButton /></div>
        </aside>
      </form>
    </>
  )
}
