import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Field, ErrorBox, Empty } from '../components/ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function AuthShell({ title, subtitle, children, footer }) {
  const { enabled } = useAuth()
  if (!enabled) {
    return <Empty title="Accounts unavailable" text="Connect Supabase (see .env.example) to enable sign-in." actionTo="/shop" actionLabel="Continue shopping" />
  }
  return (
    <div className="container-x flex justify-center py-14">
      <div className="w-full max-w-md">
        <h1 className="font-serif text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        <div className="mt-8 space-y-5">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  )
}

function useForm(initial) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const bind = (name) => ({
    value: values[name],
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  })
  return { values, errors, setErrors, formError, setFormError, busy, setBusy, bind }
}

export function Login() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const f = useForm({ email: '', password: '' })
  const to = location.state?.from || '/account'

  if (user) return <Navigate to={to} replace />

  const submit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!EMAIL_RE.test(f.values.email)) errors.email = 'Enter a valid email address'
    if (!f.values.password) errors.password = 'Enter your password'
    f.setErrors(errors)
    if (Object.keys(errors).length) return
    f.setBusy(true)
    f.setFormError('')
    const { error } = await signIn(f.values.email.trim(), f.values.password)
    f.setBusy(false)
    if (error) f.setFormError(error.message)
    else navigate(to, { replace: true })
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to view your orders and check out faster."
      footer={<>New to Glamora? <Link to="/signup" className="font-semibold text-crimson hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {f.formError && <ErrorBox message={f.formError} />}
        <Field label="Email" error={f.errors.email}>
          <input type="email" autoComplete="email" className="input" {...f.bind('email')} />
        </Field>
        <Field label="Password" error={f.errors.password}>
          <input type="password" autoComplete="current-password" className="input" {...f.bind('password')} />
        </Field>
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm text-muted hover:text-crimson">Forgot password?</Link>
        </div>
        <button className="btn btn-primary w-full" disabled={f.busy}>{f.busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </AuthShell>
  )
}

export function Signup() {
  const { signUp, user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const f = useForm({ name: '', email: '', password: '' })

  if (user) return <Navigate to="/account" replace />

  const submit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (f.values.name.trim().length < 2) errors.name = 'Enter your full name'
    if (!EMAIL_RE.test(f.values.email)) errors.email = 'Enter a valid email address'
    if (f.values.password.length < 8) errors.password = 'Use at least 8 characters'
    f.setErrors(errors)
    if (Object.keys(errors).length) return
    f.setBusy(true)
    f.setFormError('')
    const { data, error } = await signUp(f.values.email.trim(), f.values.password, f.values.name.trim())
    f.setBusy(false)
    if (error) return f.setFormError(error.message)
    if (data.session) navigate('/account', { replace: true })
    else {
      toast('Account created! Check your email to confirm it.')
      navigate('/login')
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Save your details, track orders and check out in seconds."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-crimson hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {f.formError && <ErrorBox message={f.formError} />}
        <Field label="Full name" error={f.errors.name}>
          <input autoComplete="name" className="input" {...f.bind('name')} />
        </Field>
        <Field label="Email" error={f.errors.email}>
          <input type="email" autoComplete="email" className="input" {...f.bind('email')} />
        </Field>
        <Field label="Password" error={f.errors.password}>
          <input type="password" autoComplete="new-password" className="input" {...f.bind('password')} />
        </Field>
        <button className="btn btn-primary w-full" disabled={f.busy}>{f.busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  )
}

export function ForgotPassword() {
  const { resetPassword } = useAuth()
  const f = useForm({ email: '' })
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!EMAIL_RE.test(f.values.email)) return f.setErrors({ email: 'Enter a valid email address' })
    f.setErrors({})
    f.setBusy(true)
    const { error } = await resetPassword(f.values.email.trim())
    f.setBusy(false)
    if (error) f.setFormError(error.message)
    else setSent(true)
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll email you a link to choose a new one."
      footer={<Link to="/login" className="font-semibold text-crimson hover:underline">Back to log in</Link>}
    >
      {sent ? (
        <p className="rounded-md bg-mist p-4 text-sm">If an account exists for <strong>{f.values.email}</strong>, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {f.formError && <ErrorBox message={f.formError} />}
          <Field label="Email" error={f.errors.email}>
            <input type="email" autoComplete="email" className="input" {...f.bind('email')} />
          </Field>
          <button className="btn btn-primary w-full" disabled={f.busy}>{f.busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const f = useForm({ password: '', confirm: '' })

  const submit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (f.values.password.length < 8) errors.password = 'Use at least 8 characters'
    if (f.values.confirm !== f.values.password) errors.confirm = 'Passwords do not match'
    f.setErrors(errors)
    if (Object.keys(errors).length) return
    f.setBusy(true)
    const { error } = await updatePassword(f.values.password)
    f.setBusy(false)
    if (error) f.setFormError(error.message)
    else {
      toast('Password updated')
      navigate('/account', { replace: true })
    }
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-5" noValidate>
        {f.formError && <ErrorBox message={f.formError} />}
        <Field label="New password" error={f.errors.password}>
          <input type="password" autoComplete="new-password" className="input" {...f.bind('password')} />
        </Field>
        <Field label="Confirm password" error={f.errors.confirm}>
          <input type="password" autoComplete="new-password" className="input" {...f.bind('confirm')} />
        </Field>
        <button className="btn btn-primary w-full" disabled={f.busy}>{f.busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </AuthShell>
  )
}
