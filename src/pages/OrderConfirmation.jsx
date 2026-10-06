import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getOrder } from '../lib/api'
import { formatPrice, formatDate } from '../lib/format'
import { Spinner, ErrorBox, Empty } from '../components/ui'

export default function OrderConfirmation() {
  const { id } = useParams()
  const { data: order, loading, error } = useAsync(() => getOrder(id), [id])

  if (loading) return <Spinner />
  if (error) return <div className="container-x py-10"><ErrorBox message={error} /></div>
  if (!order) return <Empty title="Order not found" actionTo="/account" actionLabel="My orders" />

  const paid = order.status !== 'pending' && order.status !== 'cancelled'
  const a = order.shipping_address

  return (
    <div className="container-x max-w-2xl py-14">
      <div className="text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white ${paid ? 'bg-crimson' : 'bg-ink'}`} aria-hidden="true">
          {paid ? '✓' : '…'}
        </div>
        <h1 className="mt-5 font-serif text-4xl font-semibold">{paid ? 'Thank you for your order!' : 'Order received'}</h1>
        <p className="mt-2 text-muted">
          {paid ? 'Your payment was successful. We’ll start packing your order right away.' : 'We haven’t confirmed your payment yet.'}
        </p>
      </div>

      <div className="mt-10 rounded-lg border border-line p-6">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <div><p className="label">Order</p>#{order.id.slice(0, 8).toUpperCase()}</div>
          <div><p className="label">Date</p>{formatDate(order.created_at)}</div>
          <div><p className="label">Status</p><span className="font-semibold capitalize text-crimson">{order.status}</span></div>
        </div>
        <ul className="mt-6 divide-y divide-line border-t border-line">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-4 py-3 text-sm">
              {i.image_url && <img src={i.image_url} alt="" className="h-14 w-14 rounded bg-mist object-contain p-1 mix-blend-multiply" />}
              <span className="flex-1">{i.name} <span className="text-muted">× {i.quantity}</span></span>
              <span>{formatPrice(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Shipping</dt><dd>{Number(order.shipping_fee) === 0 ? 'Free' : formatPrice(order.shipping_fee)}</dd></div>
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatPrice(order.total)}</dd></div>
        </dl>
        {a && (
          <div className="mt-6 border-t border-line pt-4 text-sm">
            <p className="label">Shipping to</p>
            {a.full_name}, {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postal_code}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Link to="/account" className="btn btn-outline">View my orders</Link>
        <Link to="/shop" className="btn btn-primary">Continue shopping</Link>
      </div>
    </div>
  )
}
