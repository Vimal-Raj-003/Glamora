import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function UpiPreview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    fetch('/api/dev/upi-preview').then(async (r) => {
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Local preview unavailable.')
      if (!cancelled) setData(d)
    }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])
  return <section className="container-x max-w-xl py-12">
    <h1 className="font-serif text-3xl font-semibold">Checkout · UPI QR preview</h1>
    <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold">Local preview only. Scan to inspect the destination, then cancel in your payment app. Do not tap Pay or enter your UPI PIN.</p>
    {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
    {!data && !error && <p className="mt-4">Preparing QR…</p>}
    {data && <div className="mt-6 rounded-lg border border-line bg-white p-6">
      <img className="mx-auto h-64 w-64" alt="UPI destination preview QR — do not pay" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.qr)}`} />
      <dl className="mt-5 space-y-3 text-sm">
        <div><dt className="font-semibold">Receiving UPI ID</dt><dd className="break-all">{data.upiId}</dd></div>
        <div><dt className="font-semibold">Payee name in QR</dt><dd>{data.payeeName}</dd></div>
        <div><dt className="font-semibold">Preview amount</dt><dd>₹{data.amount.toFixed(2)} · do not pay</dd></div>
      </dl>
      <p className="mt-4 text-sm">Automatic confirmation is disabled for this preview. No order or payment record is created.</p>
      <details className="mt-4 text-sm"><summary>Inspect QR link</summary><code className="mt-2 block break-all">{data.link}</code></details>
    </div>}
    <Link to="/shop" className="btn btn-outline mt-6">Back to shop</Link>
  </section>
}
