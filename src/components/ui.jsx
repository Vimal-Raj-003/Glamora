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
    <div className="bg-ink py-12 text-white sm:py-16">
      <div className="container-x">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">{subtitle}</p>}
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

export function DemoNotice() {
  return (
    <div className="rounded-md border border-line bg-mist px-4 py-3 text-sm text-muted">
      Supabase isn’t configured yet, so the store is running in <strong>demo mode</strong>. Add your keys to
      <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">.env</code> to enable sign-in, checkout and admin.
    </div>
  )
}
