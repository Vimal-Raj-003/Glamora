export const STATUS_STYLES = {
  pending: 'bg-mist text-muted',
  paid: 'bg-emerald-100 text-emerald-700',
  processing: 'bg-amber-100 text-amber-700',
  shipped: 'bg-sky-100 text-sky-700',
  delivered: 'bg-ink text-white',
  cancelled: 'bg-crimson-soft text-crimson',
}

// "paid" is shown to people as "Confirmed"; "pending" means the payment has not been received yet.
export const STATUS_LABELS = {
  pending: 'Awaiting payment',
  paid: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
