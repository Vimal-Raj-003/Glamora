import { Link } from 'react-router-dom'

export function Spinner({ className = '' }) {
  return (
    <div className={`flex justify-center py-16 ${className}`} role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-crimson" />
    </div>
  )
}

export function ErrorBox({ message }) {
  return (
    <div className="rounded-md border border-crimson/30 bg-crimson-soft px-4 py-3 text-sm text-crimson-dark" role="alert">
      {message || 'Something went wrong. Please try again.'}
    </div>
  )
}

export function Empty({ title, text, actionTo, actionLabel }) {
  return (
    <div className="py-20 text-center">
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      {text && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{text}</p>}
      {actionTo && (
        <Link to={actionTo} className="btn btn-primary mt-6">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="bg-ink py-6 text-white sm:py-8">
      <div className="container-x">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-sm text-white/70 sm:text-base">{subtitle}</p>}
      </div>
    </div>
  )
}

export function Field({ label, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-crimson">{error}</p>}
    </div>
  )
}

