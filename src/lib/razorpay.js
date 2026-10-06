import { verifyPayment } from './api'

export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Razorpay. Check your connection and try again.'))
    document.body.appendChild(s)
  })
}

// Sends Razorpay's result to OUR server, which re-checks the signature and asks Razorpay for the real amount.
export const confirmOnServer = (orderId, resp) =>
  verifyPayment({
    orderId,
    razorpayOrderId: resp.razorpay_order_id,
    razorpayPaymentId: resp.razorpay_payment_id,
    razorpaySignature: resp.razorpay_signature,
  })

// Opens the Razorpay popup for an order the server has already prepared (`init` comes from the API:
// orderId, razorpayOrderId, amount in paise, keyId). The amount is never decided in the browser.
//   onPaid()                 - server confirmed the payment
//   onDismiss()              - customer closed the popup without paying
//   onFailed(message)        - Razorpay reported a failed attempt (the popup stays open for another try)
//   onVerifyError(err, resp) - money was taken but our server could not confirm it yet (safe to retry confirmOnServer)
export async function startPayment({ init, prefill, onPaid, onDismiss, onFailed, onVerifyError }) {
  await loadRazorpay()
  let handled = false // a payment result is only ever processed once

  const rzp = new window.Razorpay({
    key: init.keyId,
    amount: init.amount,
    currency: 'INR',
    name: 'Glamora',
    description: `Order #${init.orderId.slice(0, 8).toUpperCase()}`,
    order_id: init.razorpayOrderId,
    prefill,
    theme: { color: '#c8102e' },
    modal: {
      ondismiss: () => {
        if (!handled) onDismiss?.()
      },
    },
    handler: async (resp) => {
      if (handled) return
      handled = true
      try {
        await confirmOnServer(init.orderId, resp)
        onPaid?.()
      } catch (err) {
        onVerifyError?.(err, resp)
      }
    },
  })
  rzp.on('payment.failed', (r) => onFailed?.(r.error?.description || 'Payment failed. Please try again.'))
  rzp.open()
}
