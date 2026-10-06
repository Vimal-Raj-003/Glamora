import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { getAddresses, saveAddress, createOrder, verifyPayment } from '../lib/api'
import { formatPrice } from '../lib/format'
import { INDIAN_STATES, validateAddress as validate } from '../lib/india'
import { PageHeader, Field, ErrorBox, Empty, Spinner } from '../components/ui'

const EMPTY = { full_name: '', phone: '', line1: '', line2: '', city: '', state: '', postal_code: '' }

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Razorpay. Check your connection and try again.'))
    document.body.appendChild(s)
  })
}

export default function Checkout() {
  const { user, profile } = useAuth()
  const { lines, subtotal, shipping, total, clear } = useCart()
  const toast = useToast()
  const navigate = useNavigate()

  const [saved, setSaved] = useState(null)
  const [selected, setSelected] = useState('new')
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [saveForLater, setSaveForLater] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getAddresses(user.id)
      .then((list) => {
        setSaved(list)
        const def = list.find((a) => a.is_default) || list[0]
        if (def) setSelected(def.id)
      })
      .catch(() => setSaved([]))
  }, [user.id])

  useEffect(() => {
    if (profile?.full_name) setForm((f) => (f.full_name ? f : { ...f, full_name: profile.full_name }))
  }, [profile])

  if (lines.length === 0) {
    return <Empty title="Your cart is empty" text="Add some products before checking out." actionTo="/shop" actionLabel="Start shopping" />
  }
  if (!saved) return <Spinner />

  const set = (name) => ({ value: form[name], onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })) })

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
      address = { full_name: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2, city: a.city, state: a.state, postal_code: a.postal_code, country: a.country }
    }

    setBusy(true)
    try {
      if (selected === 'new' && saveForLater) {
        await saveAddress(user.id, { ...address, is_default: saved.length === 0 }).catch(() => {})
      }
      const order = await createOrder(lines, address)
      await loadRazorpay()

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: 'INR',
        name: 'Glamora',
        description: `Order #${order.order_id.slice(0, 8)}`,
        order_id: order.razorpay_order_id,
        prefill: { name: address.full_name, email: user.email, contact: address.phone },
        theme: { color: '#c8102e' },
        modal: {
          ondismiss: () => {
            setBusy(false)
            toast('Payment cancelled. Your cart is still saved.', 'error')
          },
        },
        handler: async (resp) => {
          try {
            await verifyPayment({
              order_id: order.order_id,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            })
            clear()
            navigate(`/order/${order.order_id}`, { replace: true })
          } catch (err) {
            setBusy(false)
            setError(`Payment received but could not be verified: ${err.message}. Please contact support with payment ID ${resp.razorpay_payment_id}.`)
          }
        },
      })
      rzp.on('payment.failed', (r) => {
        setBusy(false)
        setError(r.error?.description || 'Payment failed. Please try again.')
      })
      rzp.open()
    } catch (err) {
      setBusy(false)
      setError(err.message)
    }
  }

  return (
    <>
      <PageHeader title="Checkout" />
      <form onSubmit={pay} className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_24rem]" noValidate>
        <div className="space-y-8">
          <section>
            <h2 className="font-serif text-2xl font-semibold">Shipping address</h2>

            {saved.length > 0 && (
              <div className="mt-5 space-y-3">
                {saved.map((a) => (
                  <label key={a.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 text-sm ${selected === a.id ? 'border-crimson bg-crimson-soft/40' : 'border-line'}`}>
                    <input type="radio" name="address" className="mt-1 accent-crimson" checked={selected === a.id} onChange={() => setSelected(a.id)} />
                    <span>
                      <strong>{a.full_name}</strong> · {a.phone}<br />
                      {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postal_code}
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
                <Field label="Full name" error={errors.full_name}><input autoComplete="name" className="input" {...set('full_name')} /></Field>
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
                <Field label="PIN code" error={errors.postal_code}><input inputMode="numeric" maxLength={6} autoComplete="postal-code" className="input" {...set('postal_code')} /></Field>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={saveForLater} onChange={(e) => setSaveForLater(e.target.checked)} className="h-4 w-4 accent-crimson" />
                  Save this address for next time
                </label>
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-lg bg-mist p-6">
          <h2 className="font-serif text-xl font-semibold">Order summary</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {lines.map((l) => (
              <li key={l.productId} className="flex justify-between gap-3 py-2.5">
                <span>{l.product.name} <span className="text-muted">× {l.quantity}</span></span>
                <span className="shrink-0">{formatPrice(l.quantity * l.product.price)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? 'Free' : formatPrice(shipping)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold"><dt>Total</dt><dd>{formatPrice(total)}</dd></div>
          </dl>
          {error && <div className="mt-4"><ErrorBox message={error} /></div>}
          <button className="btn btn-primary mt-5 w-full" disabled={busy}>{busy ? 'Processing…' : `Pay ${formatPrice(total)}`}</button>
          <p className="mt-3 text-center text-xs text-muted">Secure payment via Razorpay (UPI, cards, netbanking, wallets)</p>
          <Link to="/cart" className="mt-2 block text-center text-xs text-muted underline hover:text-crimson">Edit cart</Link>
        </aside>
      </form>
    </>
  )
}
