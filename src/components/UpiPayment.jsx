import { useEffect, useRef, useState } from 'react'
import { claimUpiUtr, getUpiStatus } from '../lib/api'
import { formatPrice } from '../lib/format'

// Every request uses the existing Clerk bearer-token API client.
export default function UpiPayment({ init, onPaid, onClose }) {
  const [payment, setPayment] = useState(init.payment)
  const [verificationEnabled, setVerificationEnabled] = useState(init.verificationEnabled !== false)
  const [message, setMessage] = useState(init.verificationEnabled === false
    ? 'Payment pending. Automatic verification is unavailable: do not send money until support confirms readiness.'
    : 'Waiting for the bank confirmation. Keep the payment note unchanged.')
  const [utr, setUtr] = useState('')
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((Date.parse(init.payment.expiresAt) - Date.now()) / 1000)))
  const done = useRef(false)
  const callback = useRef(onPaid)
  callback.current = onPaid
  const apply = (r) => {
    setPayment(r.payment)
    setVerificationEnabled(r.verificationEnabled !== false)
    if (r.finalized && !done.current) { done.current = true; callback.current?.(); return }
    if (r.verificationEnabled === false) setMessage('Payment pending. Automatic verification is unavailable. If you already paid, contact support with your UTR and do not pay again.')
    else if (r.review) setMessage('Credit received, but this order needs support review. Do not pay again.')
    else if (r.delayed) setMessage('Bank confirmation is delayed. If you paid, do not pay again. You can return to this order later.')
    else if (r.payment.status === 'underpaid') setMessage('The bank reported less than the exact amount. Contact support with your UTR; do not send a top-up.')
    else if (r.payment.status === 'overpaid') setMessage('The bank reported more than the exact amount. Contact support with your UTR; do not pay again.')
    else if (r.payment.status === 'paid') setMessage('Credit verified. Finishing your order; do not pay again.')
    else if (r.payment.status === 'expired') setMessage('This QR expired. If you paid, wait for confirmation or contact support before retrying.')
    else if (r.result === 'used') setMessage('That UTR belongs to another payment. Contact support.')
    else if (r.result === 'not_found') setMessage('No matching verified bank credit yet. Do not pay again if money was deducted.')
  }
  useEffect(() => {
    let cancelled = false, timer
    const poll = async () => {
      try { const r = await getUpiStatus(init.orderId, init.payment.id); if (!cancelled) apply(r) }
      catch (e) { if (!cancelled) setMessage(e.message + ' If you paid, do not pay again.') }
      if (!cancelled && !done.current && Date.now() < Date.parse(init.payment.expiresAt) + 1800000) timer = setTimeout(poll, 5000)
    }
    poll()
    const tick = setInterval(() => setRemaining(Math.max(0, Math.ceil((Date.parse(init.payment.expiresAt) - Date.now()) / 1000))), 1000)
    return () => { cancelled = true; clearTimeout(timer); clearInterval(tick) }
  }, [init.orderId, init.payment.id])
  const claim = async () => {
    setBusy(true)
    try { apply(await claimUpiUtr(init.orderId, payment.id, utr)) } catch (e) { setMessage(e.message) }
    finally { setBusy(false) }
  }
  const open = payment.status === 'pending' && Date.parse(payment.expiresAt) > Date.now()
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="UPI payment">
    <section className="my-4 w-full max-w-md rounded-xl bg-white p-6 text-ink shadow-xl">
      <h2 className="font-serif text-2xl font-semibold">Pay with UPI</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt>Order total</dt><dd>{formatPrice(payment.amount)}</dd></div>
        {payment.extraPaise > 0 && <div className="flex justify-between"><dt>Existing attempt adjustment</dt><dd>{formatPrice(payment.extraPaise / 100)}</dd></div>}
        <div className="flex justify-between font-bold"><dt>Pay exactly</dt><dd>{formatPrice(payment.payAmount)}</dd></div>
      </dl>
      <p className="mt-2 break-all text-sm">To: {payment.payeeName} · {payment.upiId}</p>
      {open && <>
        <img className="mx-auto my-4 h-52 w-52" alt="Scan this UPI payment QR" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(payment.qr)}`} />
        {verificationEnabled && <a className="btn btn-primary w-full" href={payment.link}>Open UPI app · {formatPrice(payment.payAmount)}</a>}
        <p className="mt-2 text-center text-xs">QR expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
      </>}
      <p className="mt-3 break-all text-sm">Payment note: <strong>{payment.ref}</strong></p>
      <p className="mt-3 text-sm" role="status">{message}</p>
      <label className="mt-4 block text-sm" htmlFor="upi-utr">Already paid? Enter the 12-digit UTR</label>
      <input id="upi-utr" className="input mt-1 w-full" inputMode="numeric" maxLength={12} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))} />
      <button type="button" className="btn btn-outline mt-2 w-full" disabled={!verificationEnabled || busy || utr.length !== 12} onClick={claim}>{busy ? 'Checking bank confirmation…' : 'Check payment'}</button>
      <button type="button" className="btn btn-ghost mt-2 w-full" onClick={onClose}>Close · return to order later</button>
    </section>
  </div>
}
