import { useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../context/ToastContext'
import {
  getCategories, adminGetStats, adminGetProducts, adminSaveProduct, adminDeleteProduct,
  adminGetOrders, adminUpdateOrderStatus, adminGetCustomers,
} from '../lib/api'
import { formatPrice, formatDate, slugify } from '../lib/format'
import { PageHeader, Spinner, ErrorBox, Field } from '../components/ui'
import { STATUS_STYLES } from './Account'

const TABS = ['Dashboard', 'Products', 'Orders', 'Customers']
const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']

const BLANK = {
  name: '', slug: '', description: '', price: '', compareAtPrice: '', stock: 0, categoryId: '',
  imageUrl: '', isFeatured: false, isActive: true, popularity: 0,
}

function Dashboard() {
  const { data, loading, error } = useAsync(adminGetStats, [])
  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />
  const cards = [
    { label: 'Revenue (paid orders)', value: formatPrice(data.revenue) },
    { label: 'Orders', value: data.orders },
    { label: 'To fulfil', value: data.toFulfil },
    { label: 'Customers', value: data.customers },
    { label: 'Low stock (≤ 5)', value: data.lowStock },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-line p-5">
          <p className="label">{c.label}</p>
          <p className="font-serif text-3xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  )
}

function ProductForm({ product, categories, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState(
    product.id ? { ...product, compareAtPrice: product.compareAtPrice ?? '' } : { ...BLANK, categoryId: categories[0]?.id || '' },
  )
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const bind = (n) => ({ value: form[n] ?? '', onChange: (e) => setForm((f) => ({ ...f, [n]: e.target.value })) })

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Required'
    if (form.price === '' || Number(form.price) < 0) errs.price = 'Enter a valid price'
    if (!form.imageUrl) errs.imageUrl = 'Add an image'
    if (!form.categoryId) errs.categoryId = 'Choose a category'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    try {
      await adminSaveProduct({
        id: form.id,
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        description: form.description || '',
        price: Number(form.price),
        compareAtPrice: form.compareAtPrice === '' ? null : Number(form.compareAtPrice),
        stock: Math.max(0, parseInt(form.stock, 10) || 0),
        categoryId: form.categoryId,
        imageUrl: form.imageUrl.trim(),
        isFeatured: form.isFeatured,
        isActive: form.isActive,
        popularity: parseInt(form.popularity, 10) || 0,
      })
      toast('Product saved')
      onDone()
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label="Name" error={errors.name}><input className="input" {...bind('name')} /></Field>
      <Field label="Slug (auto if empty)"><input className="input" {...bind('slug')} /></Field>
      <Field label="Category" error={errors.categoryId}>
        <select className="input" {...bind('categoryId')}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Stock"><input type="number" min="0" className="input" {...bind('stock')} /></Field>
      <Field label="Price (₹)" error={errors.price}><input type="number" min="0" step="0.01" className="input" {...bind('price')} /></Field>
      <Field label="Compare-at price (₹)"><input type="number" min="0" step="0.01" className="input" {...bind('compareAtPrice')} /></Field>
      <div className="sm:col-span-2"><Field label="Description"><textarea rows={4} className="input" {...bind('description')} /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Image path or URL" error={errors.imageUrl}>
          <div className="flex gap-3">
            <input className="input" placeholder="/images/lips/1.jpg or https://…" {...bind('imageUrl')} />
            {form.imageUrl && <img src={form.imageUrl} alt="" className="h-11 w-11 rounded bg-mist object-contain" />}
          </div>
        </Field>
        <p className="mt-1 text-xs text-muted">Put image files in <code>public/images/…</code> and use a path like <code>/images/lips/4.jpg</code>, or paste any image URL.</p>
      </div>
      <Field label="Popularity score"><input type="number" className="input" {...bind('popularity')} /></Field>
      <div className="flex items-end gap-6 pb-2.5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-crimson" checked={form.isFeatured} onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))} />Featured</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-crimson" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />Visible</label>
      </div>
      <div className="flex gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function Products() {
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const cats = useAsync(getCategories, [])
  const { data, loading, error } = useAsync(adminGetProducts, [version])

  const remove = async (p) => {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone. (Past orders keep their details.)`)) return
    try {
      await adminDeleteProduct(p.id)
      toast('Product deleted')
      setVersion((v) => v + 1)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (loading || cats.loading) return <Spinner />
  if (error || cats.error) return <ErrorBox message={error || cats.error} />

  if (editing) {
    return <ProductForm product={editing} categories={cats.data} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setVersion((v) => v + 1) }} />
  }

  return (
    <div>
      <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New product</button>
      <div className="mt-6 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-mist text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-3">Product</th><th className="p-3">Category</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map((p) => (
              <tr key={p.id}>
                <td className="flex items-center gap-3 p-3"><img src={p.imageUrl} alt="" className="h-10 w-10 rounded bg-mist object-contain" />{p.name}</td>
                <td className="p-3">{p.category?.name}</td>
                <td className="p-3">{formatPrice(p.price)}</td>
                <td className={`p-3 ${p.stock <= 5 ? 'font-semibold text-crimson' : ''}`}>{p.stock}</td>
                <td className="p-3">{p.isActive ? 'Visible' : 'Hidden'}{p.isFeatured && ' · Featured'}</td>
                <td className="space-x-3 p-3 text-right text-xs">
                  <button className="underline hover:text-crimson" onClick={() => setEditing(p)}>Edit</button>
                  <button className="underline hover:text-crimson" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Orders() {
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const { data, loading, error } = useAsync(adminGetOrders, [version])

  const change = async (id, status) => {
    try {
      await adminUpdateOrderStatus(id, status)
      toast('Order updated')
      setVersion((v) => v + 1)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data.length) return <p className="text-sm text-muted">No orders yet.</p>

  return (
    <ul className="space-y-4">
      {data.map((o) => (
        <li key={o.id} className="rounded-lg border border-line p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-semibold">#{o.id.slice(0, 8).toUpperCase()}</span>
              <span className="ml-3 text-muted">{formatDate(o.createdAt)} · {o.user?.fullName || o.user?.email || 'Customer'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatPrice(o.total)}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[o.status]}`}>{o.status}</span>
              <select aria-label="Update status" value={o.status} onChange={(e) => change(o.id, e.target.value)} className="input w-36 py-1.5">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-3 text-muted">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p>
          {o.shippingAddress && (
            <p className="mt-2 text-xs text-muted">
              Ship to: {o.shippingAddress.fullName}, {o.shippingAddress.line1}, {o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode} · {o.shippingAddress.phone}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Customers() {
  const { data, loading, error } = useAsync(adminGetCustomers, [])
  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data.length) return <p className="text-sm text-muted">No customers yet.</p>

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-mist text-xs uppercase tracking-wider text-muted">
          <tr><th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3">Joined</th><th className="p-3">Orders</th><th className="p-3">Total spent</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.map((c) => (
            <tr key={c.id}>
              <td className="p-3">
                <p className="font-medium">{c.fullName || '—'} {c.role === 'super_admin' && <span className="ml-1 rounded bg-crimson-soft px-1.5 py-0.5 text-[10px] font-bold text-crimson">SUPER ADMIN</span>}</p>
                <p className="text-xs text-muted">{c.email}</p>
              </td>
              <td className="p-3">{c.phone || '—'}</td>
              <td className="p-3">{formatDate(c.createdAt)}</td>
              <td className="p-3">{c.orderCount}</td>
              <td className="p-3 font-semibold">{formatPrice(c.totalSpent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('Dashboard')
  return (
    <>
      <PageHeader eyebrow="Super Admin" title="Store management" />
      <div className="container-x py-10">
        <div className="mb-8 flex flex-wrap gap-2 border-b border-line">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${tab === t ? 'border-crimson text-crimson' : 'border-transparent text-muted hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Dashboard' && <Dashboard />}
        {tab === 'Products' && <Products />}
        {tab === 'Orders' && <Orders />}
        {tab === 'Customers' && <Customers />}
      </div>
    </>
  )
}
