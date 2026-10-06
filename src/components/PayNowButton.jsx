import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getPayInit } from '../lib/api'
import { startPayment, confirmOnServer } from '../lib/razorpay'

// "Complete payment" for an order that is still unpaid. The amount comes from the server, never from this page.
export default function PayNowButton({ order, onPaid, className = 'btn btn-primary btn-sm' }) {
  const { user } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [unverified, setUnverified] = useState(null)

  const a = order.shippingAddress || {}
  const prefill = { name: a.fullName, email: user?.email, contact: a.phone }

  const pay = async () => {
    setBusy(true)
    try {
      const init = await getPayInit(order.id)
      await startPayment({
        init,
        prefill,
        onPaid: () => {
          setBusy(false)
          toast('Payment successful')
          onPaid?.()
        },
        onDismiss: () => {
          setBusy(false)
          toast('Payment not completed. You can retry any time.', 'error')
        },
        onFailed: (message) => toast(message, 'error'),
        onVerifyError: (err, resp) => {
          setBusy(false)
          setUnverified(resp)
          toast(`Payment received but not confirmed yet (${err.message}). Tap “Confirm payment”. Do not pay again.`, 'error')
        },
      })
    } catch (err) {
      setBusy(false)
      toast(err.message, 'error')
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      await confirmOnServer(order.id, unverified)
      setUnverified(null)
      toast('Payment confirmed')
      onPaid?.()
    } catch (err) {
      toast(err.message, 'error')
    }
    setBusy(false)
  }

  return unverified ? (
    <button onClick={confirm} disabled={busy} className={className}>{busy ? 'Confirming…' : 'Confirm payment'}</button>
  ) : (
    <button onClick={pay} disabled={busy} className={className}>{busy ? 'Opening…' : 'Complete payment'}</button>
  )
}
