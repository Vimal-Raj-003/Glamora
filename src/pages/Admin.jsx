import { useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../context/ToastContext'
import {
  getCategories, adminGetStats, adminGetProducts, adminSaveProduct, adminDeleteProduct,
  adminGetOrders, adminUpdateOrderStatus, adminGetCustomers,
} from '../lib/api'
import { formatPrice, formatDate, slugify } from '../lib/format'
import { PageHeader, Spinner, ErrorBox, Field } from '../components/ui'
import { STATUS_STYLES, STATUS_LABELS } from './Account'
import { ChartCard, TimeChart, StatusBars, DataTable, compactINR, dayLabel } from '../components/charts'

const TABS = ['Dashboard', 'Products', 'Orders', 'Customers']
const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']

const BLANK = {
  name: '', slug: '', description: '', price: '', compareAtPrice: '', stock: 0, categoryId: '',
  imageUrl: '', isFeatured: false, isActive: true, popularity: 0,
  freeShipping: false, maxPerOrder: '', offerLabel: '',
}

const RANGES = [7, 30, 90]

function Dashboard() {
  const [days, setDays] = useState(30)
  const { data, loading, error } = useAsync(() => adminGetStats(days), [days])
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />

  const { totals, daily, statuses } = data
  const periodRevenue = daily.reduce((n, d) => n + d.revenue, 0)
  const periodOrders = daily.reduce((n, d) => n + d.orders, 0)

  const cards = [
    { label: 'Total revenue', value: formatPrice(totals.revenue), note: 'From confirmed payments' },
    { label: 'Total orders', value: totals.orders, note: 'Paid orders' },
    { label: 'Total customers', value: totals.customers, note: 'Registered accounts' },
    { label: 'Total products', value: totals.products, note: `${totals.activeProducts} visible${totals.lowStock ? `, ${totals.lowStock} low on stock` : ''}` },
  ]

  const statusRows = [
    { key: 'paid', label: STATUS_LABELS.paid, count: statuses.paid },
    { key: 'processing', label: STATUS_LABELS.processing, count: statuses.processing },
    { key: 'shipped', label: STATUS_LABELS.shipped, count: statuses.shipped },
    { key: 'delivered', label: STATUS_LABELS.delivered, count: statuses.delivered },
    { key: 'cancelled', label: STATUS_LABELS.cancelled, count: statuses.cancelled, accent: true },
    { key: 'pending', label: STATUS_LABELS.pending, count: statuses.pending, muted: true },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-line p-5">
            <p className="label">{c.label}</p>
            <p className="font-serif text-3xl font-semibold">{c.value}</p>
            <p className="mt-1 text-xs text-muted">{c.note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Last {days} days: <strong className="text-ink">{formatPrice(periodRevenue)}</strong> from <strong className="text-ink">{periodOrders}</strong> {periodOrders === 1 ? 'order' : 'orders'}
        </p>
        <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={`min-h-10 rounded px-3.5 py-2 text-xs font-semibold transition ${days === r ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      <ChartCard
        title="Revenue"
        subtitle="Confirmed payments per day (Indian time)"
        table={
          <DataTable
            columns={[{ key: 'date', label: 'Day', render: (r) => dayLabel(r.date) }, { key: 'revenue', label: 'Revenue', render: (r) => formatPrice(r.revenue) }, { key: 'orders', label: 'Orders' }]}
            rows={[...daily].reverse()}
          />
        }
      >
        <TimeChart
          data={daily}
          valueKey="revenue"
          kind="area"
          color="var(--color-crimson)"
          formatValue={formatPrice}
          axisFormat={compactINR}
          ariaLabel={`Revenue per day for the last ${days} days. Total ${formatPrice(periodRevenue)}.`}
          emptyText="No sales in this period yet"
        />
      </ChartCard>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <ChartCard title="Orders" subtitle="Confirmed orders per day">
          <TimeChart
            data={daily}
            valueKey="orders"
            kind="bars"
            color="var(--color-graphite)"
            formatValue={(v) => `${v} ${v === 1 ? 'order' : 'orders'}`}
            axisFormat={(v) => String(Math.round(v))}
            ariaLabel={`Orders per day for the last ${days} days. Total ${periodOrders}.`}
            emptyText="No orders in this period yet"
            height={220}
          />
        </ChartCard>

        <ChartCard title="Order status" subtitle="All orders by current status">
          <StatusBars rows={statusRows} />
        </ChartCard>
      </div>
    </div>
  )
}

function ProductForm({ product, categories, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState(
    product.id ? { ...product, compareAtPrice: product.compareAtPrice ?? '', maxPerOrder: product.maxPerOrder ?? '', offerLabel: product.offerLabel ?? '' } : { ...BLANK, categoryId: categories[0]?.id || '' },
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
        freeShipping: form.freeShipping,
        maxPerOrder: form.maxPerOrder === '' ? null : Math.max(1, parseInt(form.maxPerOrder, 10) || 1),
        offerLabel: String(form.offerLabel || '').trim() || null,
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
      <Field label="Offer badge text (optional)"><input className="input" placeholder="e.g. Launch offer" maxLength={60} {...bind('offerLabel')} /></Field>
      <Field label="Max quantity per order (optional)"><input type="number" min="1" className="input" {...bind('maxPerOrder')} /></Field>
      <Field label="Popularity score"><input type="number" className="input" {...bind('popularity')} /></Field>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-crimson" checked={form.freeShipping} onChange={(e) => setForm((f) => ({ ...f, freeShipping: e.target.checked }))} />
        Always ships free
      </label>
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
                  <button className="link-btn" onClick={() => setEditing(p)}>Edit</button>
                  <button className="link-btn" onClick={() => remove(p)}>Delete</button>
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

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data.length) return <p className="text-sm text-muted">No orders yet.</p>

  return (
    <ul className="space-y-4">
      {data.map((o) => {
        const captured = o.payments.find((p) => p.status === 'captured')
        const duplicates = o.payments.filter((p) => p.status === 'duplicate')
        return (
        <li key={o.id} className="rounded-lg border border-line p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-semibold">#{o.id.slice(0, 8).toUpperCase()}</span>
              <span className="ml-3 text-muted">{formatDate(o.createdAt)} · {o.user?.fullName || o.user?.email || 'Customer'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{formatPrice(o.total)}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status]}</span>
              <select aria-label="Update status" value={o.status} onChange={(e) => change(o.id, e.target.value)} className="input w-44 py-2">
                {STATUSES.map((s) => (
                  // an unpaid order can only stay pending or be cancelled
                  <option key={s} value={s} disabled={!captured && s !== 'pending' && s !== 'cancelled'}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-3 text-muted">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}</p>
          <div className="mt-2 rounded-md bg-mist px-3 py-2 text-xs">
            {captured ? (
              <p>
                <strong className="text-emerald-700">Payment received</strong> {formatPrice(captured.amount)} on {formatDate(captured.createdAt)}
                <span className="block break-all text-muted sm:inline sm:before:content-['_·_']">Razorpay payment <span className="font-mono">{captured.razorpayPaymentId}</span>, order <span className="font-mono">{captured.razorpayOrderId}</span></span>
              </p>
            ) : (
              <p className="text-muted">
                <strong className="text-ink">Not paid</strong>
                {o.razorpayOrderId && <> · Razorpay order <span className="font-mono">{o.razorpayOrderId}</span></>}
              </p>
            )}
            {duplicates.map((p) => (
              <p key={p.id} className="mt-1 font-semibold text-crimson">
                Duplicate payment {formatPrice(p.amount)} ({p.razorpayPaymentId}) - refund this in the Razorpay dashboard.
              </p>
            ))}
          </div>
          {o.shippingAddress && (
            <p className="mt-2 text-xs text-muted">
              Ship to: {o.shippingAddress.fullName}, {o.shippingAddress.line1}, {o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode} · {o.shippingAddress.phone}
            </p>
          )}
        </li>
        )
      })}
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
