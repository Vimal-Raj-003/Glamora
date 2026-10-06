import { useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../context/ToastContext'
import {
  getCategories, getProducts, adminSaveProduct, adminDeleteProduct, adminUploadImage, adminGetOrders, adminUpdateOrderStatus,
} from '../lib/api'
import { formatPrice, formatDate, slugify } from '../lib/format'
import { PageHeader, Spinner, ErrorBox, Field } from '../components/ui'
import { STATUS_STYLES } from './Account'

const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']

const BLANK = {
  name: '', slug: '', description: '', price: '', compare_at_price: '', stock: 0, category_id: '',
  image_url: '', is_featured: false, is_active: true, popularity: 0,
}

function ProductForm({ product, categories, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState(product.id ? { ...product, compare_at_price: product.compare_at_price ?? '' } : { ...BLANK, category_id: categories[0]?.id })
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})

  const bind = (n) => ({ value: form[n] ?? '', onChange: (e) => setForm((f) => ({ ...f, [n]: e.target.value })) })

  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      setBusy(true)
      const url = await adminUploadImage(file)
      setForm((f) => ({ ...f, image_url: url }))
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Required'
    if (form.price === '' || Number(form.price) < 0) errs.price = 'Enter a valid price'
    if (!form.image_url) errs.image_url = 'Add an image'
    if (!form.category_id) errs.category_id = 'Choose a category'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    try {
      await adminSaveProduct({
        ...form,
        slug: form.slug.trim() || slugify(form.name),
        name: form.name.trim(),
        price: Number(form.price),
        compare_at_price: form.compare_at_price === '' ? null : Number(form.compare_at_price),
        stock: Number(form.stock) || 0,
        popularity: Number(form.popularity) || 0,
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
      <Field label="Category" error={errors.category_id}>
        <select className="input" {...bind('category_id')}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Stock"><input type="number" min="0" className="input" {...bind('stock')} /></Field>
      <Field label="Price (₹)" error={errors.price}><input type="number" min="0" step="0.01" className="input" {...bind('price')} /></Field>
      <Field label="Compare-at price (₹)"><input type="number" min="0" step="0.01" className="input" {...bind('compare_at_price')} /></Field>
      <div className="sm:col-span-2"><Field label="Description"><textarea rows={4} className="input" {...bind('description')} /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Image URL" error={errors.image_url}>
          <div className="flex gap-3">
            <input className="input" placeholder="/images/lips/1.jpg or https://…" {...bind('image_url')} />
            {form.image_url && <img src={form.image_url} alt="" className="h-11 w-11 rounded bg-mist object-contain" />}
          </div>
        </Field>
        <label className="mt-2 inline-block cursor-pointer text-xs text-muted underline hover:text-crimson">
          …or upload an image
          <input type="file" accept="image/*" className="hidden" onChange={upload} />
        </label>
      </div>
      <Field label="Popularity score"><input type="number" className="input" {...bind('popularity')} /></Field>
      <div className="flex items-end gap-6 pb-2.5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-crimson" checked={form.is_featured} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))} />Featured</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-crimson" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />Visible</label>
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
  const { data, loading, error } = useAsync(() => getProducts({ sort: 'newest', includeInactive: true }), [version])

  const remove = async (p) => {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return
    try {
      await adminDeleteProduct(p.id)
      toast('Product deleted')
      setVersion((v) => v + 1)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (loading || cats.loading) return <Spinner />
  if (error) return <ErrorBox message={error} />

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
                <td className="flex items-center gap-3 p-3"><img src={p.image_url} alt="" className="h-10 w-10 rounded bg-mist object-contain" />{p.name}</td>
                <td className="p-3">{p.category?.name}</td>
                <td className="p-3">{formatPrice(p.price)}</td>
                <td className={`p-3 ${p.stock <= 5 ? 'font-semibold text-crimson' : ''}`}>{p.stock}</td>
                <td className="p-3">{p.is_active ? 'Visible' : 'Hidden'}{p.is_featured && ' · Featured'}</td>
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
              <span className="ml-3 text-muted">{formatDate(o.created_at)} · {o.profile?.full_name || 'Customer'}</span>
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
          {o.shipping_address && (
            <p className="mt-2 text-xs text-muted">
              Ship to: {o.shipping_address.full_name}, {o.shipping_address.line1}, {o.shipping_address.city}, {o.shipping_address.state} {o.shipping_address.postal_code} · {o.shipping_address.phone}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('Products')
  return (
    <>
      <PageHeader eyebrow="Admin" title="Store management" />
      <div className="container-x py-10">
        <div className="mb-8 flex gap-2 border-b border-line">
          {['Products', 'Orders'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-3 text-sm font-semibold ${tab === t ? 'border-crimson text-crimson' : 'border-transparent text-muted hover:text-ink'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Products' ? <Products /> : <Orders />}
      </div>
    </>
  )
}
