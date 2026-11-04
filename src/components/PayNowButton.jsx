import { useState } from 'react'
import { getPayInit } from '../lib/api'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import UpiPayment from './UpiPayment'
import RazorpayPayNowButton from './RazorpayPayNowButton'

function UpiPayNowButton({ order, onPaid, className = 'btn btn-primary btn-sm' }) {
  const [init, setInit] = useState(null)
  const [busy, setBusy] = useState(false)
  const cart = useCart()
  const toast = useToast()
  const pay = async () => {
    setBusy(true)
    try { setInit(await getPayInit(order.id)) } catch (e) { toast(e.message, 'error') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" onClick={pay} disabled={busy} className={className}>{busy ? 'Checking...' : 'Check / complete UPI payment'}</button>
    {init && <UpiPayment init={init} onClose={() => setInit(null)} onPaid={() => {
      order.items.forEach((i) => cart.remove(i.productId)); setInit(null); onPaid?.()
    }} />}
  </>
}

export default function PayNowButton(props) {
  return import.meta.env.VITE_PAYMENT_PROVIDER === 'razorpay'
    ? <RazorpayPayNowButton {...props} /> : <UpiPayNowButton {...props} />
}
