import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useAsync } from '../hooks/useAsync'
import { getMyOrders, getAddresses, saveAddress, deleteAddress, updateMe } from '../lib/api'
import { formatPrice, formatDate } from '../lib/format'
import { INDIAN_STATES, validateAddress } from '../lib/india'
import { PageHeader, Spinner, ErrorBox, Empty, Field } from '../components/ui'
import PayNowButton from '../components/PayNowButton'
import { STATUS_STYLES, STATUS_LABELS } from '../lib/status'

const TABS = ['Orders', 'Addresses', 'Profile']

export { STATUS_STYLES, STATUS_LABELS }

function Orders({ userId }) {
  const [version, setVersion] = useState(0)
  const { data, loading, error } = useAsync(() => getMyOrders(), [userId, version])
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data.length) return <Empty title="No orders yet" text="When you place an order it will appear here." actionTo="/shop" actionLabel="Start shopping" />
  return (
    <ul className="space-y-4">
      {data.map((o) => (
        <li key={o.id} className="rounded-lg border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <Link to={`/order/${o.id}`} className="font-semibold hover:text-crimson">#{o.id.slice(0, 8).toUpperCase()}</Link>
              <span className="ml-3 text-muted">{formatDate(o.createdAt)}</span>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status] || o.status}</span>
          </div>
          <p className="mt-3 text-sm text-muted">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">{formatPrice(o.total)} <span className="text-xs font-normal text-muted">· {Number(o.shippingFee) > 0 ? `incl. ${formatPrice(o.shippingFee)} shipping` : 'Free shipping'}</span></p>
            {o.status === 'pending' ? (
              <PayNowButton order={o} onPaid={() => setVersion((v) => v + 1)} />
            ) : (
              o.payments?.find((p) => p.status === 'captured') && (
                <p className="text-xs text-muted">Paid · <span className="font-mono">{o.payments.find((p) => p.status === 'captured').razorpayPaymentId}</span></p>
              )
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

const EMPTY = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India', isDefault: false }

function Addresses({ userId }) {
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const { data, loading, error } = useAsync(() => getAddresses(), [userId, version])
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (name) => ({ value: editing[name] ?? '', onChange: (e) => setEditing((a) => ({ ...a, [name]: e.target.value })) })

  const submit = async (e) => {
    e.preventDefault()
    const errs = validateAddress(editing)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await saveAddress(editing)
      toast('Address saved')
      setEditing(null)
      setVersion((v) => v + 1)
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  const remove = async (id) => {
    try {
      await deleteAddress(id)
      setVersion((v) => v + 1)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (editing) {
    return (
      <form onSubmit={submit} noValidate className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.fullName}><input className="input" {...set('fullName')} /></Field>
        <Field label="Mobile number" error={errors.phone}><input inputMode="numeric" maxLength={10} className="input" {...set('phone')} /></Field>
        <div className="sm:col-span-2"><Field label="Address line 1" error={errors.line1}><input className="input" {...set('line1')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Address line 2 (optional)"><input className="input" {...set('line2')} /></Field></div>
        <Field label="City" error={errors.city}><input className="input" {...set('city')} /></Field>
        <Field label="State" error={errors.state}>
          <select className="input" {...set('state')}>
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="PIN code" error={errors.postalCode}><input inputMode="numeric" maxLength={6} className="input" {...set('postalCode')} /></Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" checked={!!editing.isDefault} onChange={(e) => setEditing((a) => ({ ...a, isDefault: e.target.checked }))} className="h-4 w-4 accent-crimson" />
          Make default
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setErrors({}) }}>Cancel</button>
        </div>
      </form>
    )
  }

  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />
  return (
    <div>
      <button className="btn btn-dark btn-sm" onClick={() => setEditing({ ...EMPTY, isDefault: data.length === 0 })}>+ Add address</button>
      {data.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No saved addresses yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {data.map((a) => (
            <li key={a.id} className="rounded-lg border border-line p-5 text-sm">
              {a.isDefault && <span className="mb-2 inline-block rounded bg-crimson-soft px-2 py-0.5 text-[11px] font-bold text-crimson">DEFAULT</span>}
              <p className="font-semibold">{a.fullName}</p>
              <p className="mt-1 text-muted">{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</p>
              <div className="mt-3 flex gap-4 text-xs">
                <button className="link-btn" onClick={() => setEditing(a)}>Edit</button>
                <button className="link-btn" onClick={() => remove(a.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.fullName || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await updateMe({ fullName: name.trim(), phone: phone.trim() })
      await refreshProfile()
      toast('Profile updated')
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-5">
      <Field label="Email"><input className="input bg-mist" value={user.email} disabled /></Field>
      <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" /></Field>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  )
}

export default function Account() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const [tab, setTab] = useState('Orders')

  return (
    <>
      <PageHeader eyebrow="My account" title={`Hello, ${profile?.fullName?.split(' ')[0] || 'there'}`} subtitle={user.email} />
      <div className="container-x py-10">
        <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${tab === t ? 'border-crimson text-crimson' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
          <div className="ml-auto flex gap-2 pb-2">
            <Link to="/wishlist" className="btn btn-outline btn-sm">Wishlist</Link>
            {isAdmin && <Link to="/admin" className="btn btn-dark btn-sm">Super Admin</Link>}
            <button onClick={signOut} className="btn btn-outline btn-sm">Log out</button>
          </div>
        </div>
        {tab === 'Orders' && <Orders userId={user.id} />}
        {tab === 'Addresses' && <Addresses userId={user.id} />}
        {tab === 'Profile' && <Profile />}
      </div>
    </>
  )
}
