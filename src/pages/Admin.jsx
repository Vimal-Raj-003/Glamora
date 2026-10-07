import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../context/ToastContext'
import {
  getCategories, adminGetStats, adminGetProducts, adminSaveProduct, adminDeleteProduct,
  adminGetOrders, adminUpdateOrderStatus, adminGetCustomers, adminGetCustomer, adminGetPayments,
  adminGetCategories, adminSaveCategory, adminDeleteCategory, adminGetSystem,
} from '../lib/api'
import { STORE } from '../config/store'
import { formatPrice, formatDate, slugify } from '../lib/format'
import { PageHeader, Spinner, ErrorBox, Field } from '../components/ui'
import { STATUS_STYLES, STATUS_LABELS } from './Account'
import { ChartCard, TimeChart, StatusBars, DataTable, compactINR, dayLabel } from '../components/charts'

const TABS = ['Dashboard', 'Products', 'Orders', 'Payments', 'Customers', 'Categories', 'System']
const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']

const BLANK = {
  name: '', slug: '', description: '', price: '', compareAtPrice: '', stock: 0, categoryId: '',
  imageUrl: '', isFeatured: false, isActive: true, popularity: 0,
  maxPerOrder: '', offerLabel: '',
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

      <div className="rounded-lg border border-line p-5">
        <h3 className="font-serif text-lg font-semibold">Recent orders</h3>
        {data.recent?.length ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0">
                  <span className="font-semibold">#{o.id.slice(0, 8).toUpperCase()}</span>
                  <span className="ml-2 break-all text-muted">{o.user?.fullName || o.user?.email} · {formatDate(o.createdAt)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{formatPrice(o.total)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No orders yet.</p>
        )}
      </div>
    </div>
  )
}

function ProductForm({ product, categories, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState(
    product.id ? { ...product, discount: product.compareAtPrice > product.price ? String(Math.round((1 - product.price / product.compareAtPrice) * 1000) / 10) : '', compareAtPrice: product.compareAtPrice ?? '', maxPerOrder: product.maxPerOrder ?? '', offerLabel: product.offerLabel ?? '' } : { ...BLANK, categoryId: categories[0]?.id || '' },
  )
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const upload = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Please choose an image file', 'error')
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      // Shrink to at most 640px and re-save as JPEG so the picture stays small enough to store with the product.
      const scale = Math.min(1, 640 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      let out = c.toDataURL('image/jpeg', 0.82)
      if (out.length > 220000) out = c.toDataURL('image/jpeg', 0.6)
      if (out.length > 220000) return toast('That picture is too detailed. Please use a smaller image.', 'error')
      setForm((f) => ({ ...f, imageUrl: out }))
    }
    img.onerror = () => toast('That file could not be read as an image', 'error')
    img.src = url
  }

  // Original price, selling price and discount % stay in step with each other.
  const setPricing = (field, raw) =>
    setForm((f) => {
      const n = { ...f, [field]: raw }
      const orig = Number(n.compareAtPrice)
      if (field === 'discount' && orig > 0 && raw !== '') {
        n.price = String(Math.round(orig * (1 - Math.min(Number(raw), 99) / 100) * 100) / 100)
      } else if (field !== 'discount' && orig > 0 && n.price !== '' && Number(n.price) <= orig) {
        n.discount = String(Math.round((1 - Number(n.price) / orig) * 1000) / 10)
      } else if (!(orig > 0)) {
        n.discount = ''
      }
      return n
    })

  const bind = (n) => ({ value: form[n] ?? '', onChange: (e) => setForm((f) => ({ ...f, [n]: e.target.value })) })

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Required'
    if (form.price === '' || Number(form.price) < 0) errs.price = 'Enter a valid price'
    if (form.compareAtPrice !== '' && form.compareAtPrice != null && Number(form.compareAtPrice) < Number(form.price)) errs.compareAtPrice = 'Original price must be at least the selling price'
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
      <Field label="Stock quantity"><input type="number" min="0" className="input" {...bind('stock')} /></Field>
      <Field label="Original price / MRP (₹)" error={errors.compareAtPrice}><input type="number" min="0" step="0.01" className="input" value={form.compareAtPrice ?? ''} onChange={(e) => setPricing('compareAtPrice', e.target.value)} /></Field>
      <Field label="Selling price (₹)" error={errors.price}><input type="number" min="0" step="0.01" className="input" value={form.price ?? ''} onChange={(e) => setPricing('price', e.target.value)} /></Field>
      <Field label="Discount (%)"><input type="number" min="0" max="99" step="0.1" className="input" placeholder="Needs an original price" disabled={!form.compareAtPrice} value={form.discount ?? ''} onChange={(e) => setPricing('discount', e.target.value)} /></Field>
      <p className="-mt-1 self-end pb-3 text-xs text-muted">Enter the original price and a discount % to fill the selling price automatically, or type the selling price and the discount is worked out for you. Leave the original price empty for no discount.</p>
      <div className="sm:col-span-2"><Field label="Description"><textarea rows={4} className="input" {...bind('description')} /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Image path or URL" error={errors.imageUrl}>
          <div className="flex gap-3">
            <input className="input" placeholder="/images/lips/1.jpg or https://…" value={String(form.imageUrl || '').startsWith('data:') ? 'Uploaded picture' : form.imageUrl ?? ''} readOnly={String(form.imageUrl || '').startsWith('data:')} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} />
            {form.imageUrl && <img src={form.imageUrl} alt="" className="h-11 w-11 rounded bg-mist object-contain" />}
          </div>
        </Field>
        <label className="btn btn-outline btn-sm mt-2 cursor-pointer">
          Upload a picture
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <p className="mt-1 text-xs text-muted">Upload a picture from your device (it is resized automatically), or type an image path / paste an image URL.</p>
      </div>
      <Field label="Offer badge text (optional)"><input className="input" placeholder="e.g. Launch offer" maxLength={60} {...bind('offerLabel')} /></Field>
      <Field label="Max quantity per order (optional)"><input type="number" min="1" className="input" {...bind('maxPerOrder')} /></Field>
      <Field label="Popularity score"><input type="number" className="input" {...bind('popularity')} /></Field>
      <Field label="Status">
        <select className="input" value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === 'active' }))}>
          <option value="active">Active (visible to customers)</option>
          <option value="inactive">Inactive (hidden)</option>
        </select>
      </Field>
      <div className="flex items-end gap-6 pb-2.5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-crimson" checked={form.isFeatured} onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))} />Featured</label>
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
      <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ Add Product</button>
      <div className="mt-6 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="hidden bg-mist text-xs uppercase tracking-wider text-muted md:table-header-group">
            <tr><th className="p-3">Product</th><th className="p-3">Category</th><th className="p-3">Price</th><th className="p-3">Stock</th><th className="p-3">Status</th><th className="p-3" /></tr>
          </thead>
          <tbody className="block divide-y divide-line md:table-row-group">
            {data.map((p) => (
              <tr key={p.id} className="block space-y-2 p-4 md:table-row md:space-y-0 md:p-0">
                <td className="block md:table-cell md:p-3"><span className="flex items-center gap-3 font-medium md:font-normal"><img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded bg-mist object-contain md:h-10 md:w-10" />{p.name}{p.offerLabel && <span className="rounded bg-crimson-soft px-1.5 py-0.5 text-[10px] font-bold text-crimson">{p.offerLabel}</span>}</span></td>
                <td data-label="Category" className="flex items-center justify-between gap-3 before:text-[11px] before:font-semibold before:uppercase before:tracking-wider before:text-muted before:content-[attr(data-label)] md:table-cell md:p-3 md:before:content-none">{p.category?.name}</td>
                <td data-label="Price" className="flex items-center justify-between gap-3 before:text-[11px] before:font-semibold before:uppercase before:tracking-wider before:text-muted before:content-[attr(data-label)] md:table-cell md:p-3 md:before:content-none">{formatPrice(p.price)}</td>
                <td data-label="Stock" className={`flex items-center justify-between gap-3 before:text-[11px] before:font-semibold before:uppercase before:tracking-wider before:text-muted before:content-[attr(data-label)] md:table-cell md:p-3 md:before:content-none ${p.stock <= 5 ? 'font-semibold text-crimson' : ''}`}>{p.stock}</td>
                <td data-label="Status" className="flex items-center justify-between gap-3 before:text-[11px] before:font-semibold before:uppercase before:tracking-wider before:text-muted before:content-[attr(data-label)] md:table-cell md:p-3 md:before:content-none">{p.isActive ? 'Visible' : 'Hidden'}{p.isFeatured && ' · Featured'}</td>
                <td className="flex gap-2 pt-1 md:table-cell md:space-x-3 md:p-3 md:pt-3 md:text-right">
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
          <p className="mt-2 break-all text-xs text-muted">
            {o.user?.fullName || 'Customer'} · {o.user?.email}{o.user?.phone ? ` · ${o.user.phone}` : ''}
          </p>
          <ul className="mt-2 space-y-0.5 text-muted">
            {o.items.map((i) => (
              <li key={i.id}>{i.name} × {i.quantity} <span className="text-xs">({formatPrice(i.price)} each = {formatPrice(Number(i.price) * i.quantity)})</span></li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Items {formatPrice(o.subtotal)} · Shipping {Number(o.shippingFee) > 0 ? formatPrice(o.shippingFee) : 'Free'} · Total {formatPrice(o.total)}</p>
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

const CELL = 'flex items-center justify-between gap-3 before:text-[11px] before:font-semibold before:uppercase before:tracking-wider before:text-muted before:content-[attr(data-label)] md:table-cell md:p-3 md:before:content-none'

function CustomerHistory({ id, onClose }) {
  const { data, loading, error } = useAsync(() => adminGetCustomer(id), [id])
  return (
    <div className="mb-6 rounded-lg border border-crimson/40 bg-mist/50 p-5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {data && (
            <>
              <p className="font-semibold">{data.fullName || '—'} <span className="font-normal text-muted">· joined {formatDate(data.createdAt)}</span></p>
              <p className="break-all text-xs text-muted">{data.email}{data.phone ? ` · ${data.phone}` : ''}</p>
            </>
          )}
        </div>
        <button className="link-btn shrink-0" onClick={onClose}>Close</button>
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox message={error} /> : (
        <>
          {data.addresses?.length > 0 && (
            <p className="mt-3 text-xs text-muted">Saved address: {data.addresses[0].line1}, {data.addresses[0].city}, {data.addresses[0].state} {data.addresses[0].postalCode} · {data.addresses[0].phone}</p>
          )}
          <h4 className="mt-4 font-semibold">Order history ({data.orders.length})</h4>
          {data.orders.length === 0 ? <p className="mt-1 text-muted">No orders yet.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {data.orders.map((o) => {
                const paid = o.payments.find((p) => p.status === 'captured')
                return (
                  <li key={o.id} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-semibold">#{o.id.slice(0, 8).toUpperCase()}</span> <span className="text-muted">{formatDate(o.createdAt)}</span></span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold">{formatPrice(o.total)}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{o.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')} · Shipping {Number(o.shippingFee) > 0 ? formatPrice(o.shippingFee) : 'Free'} · {paid ? 'Paid' : 'Not paid'}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function Customers() {
  const { data, loading, error } = useAsync(adminGetCustomers, [])
  const [open, setOpen] = useState(null)
  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data.length) return <p className="text-sm text-muted">No customers yet.</p>

  return (
    <div>
      {open && <CustomerHistory id={open} onClose={() => setOpen(null)} />}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="hidden bg-mist text-xs uppercase tracking-wider text-muted md:table-header-group">
            <tr><th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3">Joined</th><th className="p-3">Orders</th><th className="p-3">Total spent</th><th className="p-3" /></tr>
          </thead>
          <tbody className="block divide-y divide-line md:table-row-group">
            {data.map((c) => (
              <tr key={c.id} className="block space-y-2 p-4 md:table-row md:space-y-0 md:p-0">
                <td className="block min-w-0 md:table-cell md:p-3">
                  <p className="break-words font-medium">{c.fullName || '—'} {c.role === 'super_admin' && <span className="ml-1 rounded bg-crimson-soft px-1.5 py-0.5 text-[10px] font-bold text-crimson">SUPER ADMIN</span>}</p>
                  <p className="break-all text-xs text-muted">{c.email}</p>
                </td>
                <td data-label="Phone" className={CELL}>{c.phone || '—'}</td>
                <td data-label="Joined" className={CELL}>{formatDate(c.createdAt)}</td>
                <td data-label="Orders" className={CELL}>{c.orderCount}</td>
                <td data-label="Total spent" className={`${CELL} font-semibold`}>{formatPrice(c.totalSpent)}</td>
                <td className="md:table-cell md:p-3 md:text-right"><button className="link-btn" onClick={() => { setOpen(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>View orders</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const PAY_STATUS = {
  captured: { label: 'Success', style: 'bg-emerald-50 text-emerald-700' },
  duplicate: { label: 'Duplicate - refund', style: 'bg-crimson-soft text-crimson' },
  pending: { label: 'Pending', style: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Not paid (cancelled)', style: 'bg-mist text-muted' },
}

function Payments() {
  const { data, loading, error } = useAsync(adminGetPayments, [])
  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />

  const rows = [
    ...data.payments.map((p) => ({
      key: p.id, date: p.createdAt, kind: p.status, amount: p.amount, orderId: p.order.id, user: p.order.user,
      payId: p.razorpayPaymentId, rzpOrder: p.razorpayOrderId,
    })),
    ...data.unpaid.map((o) => ({
      key: o.id, date: o.createdAt, kind: o.status === 'cancelled' ? 'cancelled' : 'pending', amount: o.total, orderId: o.id, user: o.user,
      payId: null, rzpOrder: o.razorpayOrderId,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  if (!rows.length) return <p className="text-sm text-muted">No payments yet.</p>
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Successful payments and duplicates are recorded when Razorpay confirms them. “Pending” orders have been created but no payment has been received.
        Individual failed card/UPI attempts are not stored here - see the Razorpay dashboard for those.
      </p>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="hidden bg-mist text-xs uppercase tracking-wider text-muted md:table-header-group">
            <tr><th className="p-3">Date</th><th className="p-3">Customer</th><th className="p-3">Order</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Razorpay IDs</th></tr>
          </thead>
          <tbody className="block divide-y divide-line md:table-row-group">
            {rows.map((r) => (
              <tr key={r.key} className="block space-y-2 p-4 md:table-row md:space-y-0 md:p-0">
                <td data-label="Date" className={CELL}>{formatDate(r.date)} <span className="text-xs text-muted md:block">{new Date(r.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
                <td className="block min-w-0 md:table-cell md:p-3"><p className="break-words font-medium">{r.user?.fullName || '—'}</p><p className="break-all text-xs text-muted">{r.user?.email}{r.user?.phone ? ` · ${r.user.phone}` : ''}</p></td>
                <td data-label="Order" className={`${CELL} font-semibold`}>#{r.orderId.slice(0, 8).toUpperCase()}</td>
                <td data-label="Amount" className={`${CELL} font-semibold`}>{formatPrice(r.amount)}</td>
                <td data-label="Status" className={CELL}><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PAY_STATUS[r.kind]?.style}`}>{PAY_STATUS[r.kind]?.label || r.kind}</span></td>
                <td className="block break-all font-mono text-[11px] text-muted md:table-cell md:p-3">
                  {r.payId ? <>Payment {r.payId}<br /></> : null}Order {r.rzpOrder || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryForm({ category, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState(
    category.id
      ? { ...category, description: category.description ?? '', imageUrl: category.imageUrl ?? '' }
      : { name: '', slug: '', description: '', imageUrl: '', sortOrder: 0 },
  )
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast('Name is required', 'error')
    setBusy(true)
    try {
      await adminSaveCategory({
        id: form.id,
        name: form.name.trim(),
        slug: form.id ? undefined : form.slug.trim() || slugify(form.name),
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        sortOrder: Math.max(0, parseInt(form.sortOrder, 10) || 0),
      })
      toast('Category saved')
      onDone()
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <Field label="Name"><input className="input" value={form.name} onChange={set('name')} /></Field>
      <Field label={form.id ? 'Slug (cannot be changed)' : 'Slug (auto if empty)'}><input className="input" value={form.slug || ''} onChange={set('slug')} disabled={Boolean(form.id)} /></Field>
      <div className="sm:col-span-2"><Field label="Description"><input className="input" value={form.description} onChange={set('description')} /></Field></div>
      <Field label="Image path or URL"><input className="input" placeholder="/images/lips/1.jpg" value={form.imageUrl} onChange={set('imageUrl')} /></Field>
      <Field label="Display order"><input type="number" min="0" className="input" value={form.sortOrder} onChange={set('sortOrder')} /></Field>
      <div className="flex gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save category'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function Categories() {
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const { data, loading, error } = useAsync(adminGetCategories, [version])

  const remove = async (c) => {
    if (!window.confirm(`Delete the category “${c.name}”?`)) return
    try {
      await adminDeleteCategory(c.id)
      toast('Category deleted')
      setVersion((v) => v + 1)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (editing) return <CategoryForm category={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setVersion((v) => v + 1) }} />

  return (
    <div>
      <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}>+ New category</button>
      <p className="mt-3 text-xs text-muted">The top menu and footer links are fixed in the site code, so a brand-new category appears in the shop, on its own page and in product forms, but not in the top menu until a developer adds it.</p>
      <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
        {data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">{c.name} <span className="font-normal text-muted">/{c.slug}</span></p>
              <p className="text-xs text-muted">{c.productCount} product{c.productCount === 1 ? '' : 's'} · order {c.sortOrder}</p>
            </div>
            <div className="flex gap-3">
              <button className="link-btn" onClick={() => setEditing(c)}>Edit</button>
              <button className="link-btn" onClick={() => remove(c)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function System() {
  const { data, loading, error } = useAsync(adminGetSystem, [])
  if (loading) return <Spinner />
  if (error) return <ErrorBox message={error} />
  const flag = (ok, yes, no) => <span className={`font-semibold ${ok ? 'text-emerald-700' : 'text-crimson'}`}>{ok ? yes : no}</span>
  const money = (n) => `₹${n.toLocaleString('en-IN')}`
  const rows = [
    ['Database (Neon)', flag(data.database.connected, 'Connected', 'Not connected')],
    ['Payments (Razorpay)', data.razorpay.configured ? <span className="font-semibold">{data.razorpay.mode === 'live' ? <span className="text-emerald-700">LIVE mode</span> : data.razorpay.mode === 'test' ? 'TEST mode' : 'Configured'}</span> : flag(false, '', 'Not configured')],
    ['Razorpay webhook secret', flag(data.razorpay.webhookSecretSet, 'Set', 'Not set (optional)')],
    ['Sign-in (Clerk)', flag(data.clerk.configured, 'Configured', 'Not configured')],
    ['Super Admin emails', <span className="font-semibold">{data.superAdminEmails} listed</span>],
    ['Shipping rule', <span className="font-semibold">Free below {money(data.shipping.freeBelow)}, {money(data.shipping.fee)} from {money(data.shipping.freeBelow)}</span>],
    ['Unpaid orders older than 24h', <span className="font-semibold">{data.attention.unpaidOrdersOlderThan24h}</span>],
    ['Totals', <span className="font-semibold">{data.database.products} products · {data.database.categories} categories · {data.database.users} accounts · {data.database.orders} orders ({data.database.paidOrders} paid)</span>],
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-line p-5">
        <h3 className="font-serif text-lg font-semibold">System status</h3>
        <dl className="mt-3 divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Only yes/no status is shown. Keys and passwords are never sent to the browser.</p>
      </div>
      <div className="rounded-lg border border-line p-5">
        <h3 className="font-serif text-lg font-semibold">Support details shown to customers</h3>
        <dl className="mt-3 divide-y divide-line text-sm">
          {[['Support phone', STORE.supportPhone], ['Support email', STORE.supportEmail], ['Address', STORE.address], ['Website', STORE.website]].map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt className="text-muted">{k}</dt><dd className="break-all text-right font-medium">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">These are set in the site code (<code>src/config/store.js</code>). Ask a developer to change them.</p>
      </div>
    </div>
  )
}

export default function Admin() {
  // The tab lives in the address (/admin?tab=products) so a refresh or a shared link keeps the same tab.
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.toLowerCase() === params.get('tab')) || 'Dashboard'
  const setTab = (t) => setParams(t === 'Dashboard' ? {} : { tab: t.toLowerCase() }, { replace: true })
  return (
    <>
      <PageHeader eyebrow="Super Admin" title="Store management" />
      <div className="container-x py-10">
        <div className="mb-8 flex flex-wrap gap-2 border-b border-line" role="tablist" aria-label="Super Admin sections">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3.5 py-3 text-sm font-semibold sm:px-4 ${tab === t ? 'border-crimson text-crimson' : 'border-transparent text-muted hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Dashboard' && <Dashboard />}
        {tab === 'Products' && <Products />}
        {tab === 'Orders' && <Orders />}
        {tab === 'Payments' && <Payments />}
        {tab === 'Customers' && <Customers />}
        {tab === 'Categories' && <Categories />}
        {tab === 'System' && <System />}
      </div>
    </>
  )
}
