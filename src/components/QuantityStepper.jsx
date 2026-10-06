export default function QuantityStepper({ value, onChange, max = 99 }) {
  const btn = 'flex h-10 w-10 items-center justify-center text-lg hover:bg-mist disabled:opacity-40'
  return (
    <div className="inline-flex items-center rounded-md border border-line" role="group" aria-label="Quantity">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} aria-label="Decrease quantity">−</button>
      <span className="w-8 text-center text-sm font-medium" aria-live="polite">{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity">+</button>
    </div>
  )
}
