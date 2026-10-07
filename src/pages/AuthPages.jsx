import { SignIn, SignUp } from '@clerk/clerk-react'
import { Link } from 'react-router-dom'
import { authEnabled } from '../context/AuthContext'
import { Empty } from '../components/ui'

const Unavailable = () => (
  <Empty
    title="Sign-in isn’t set up yet"
    text="Add your Clerk keys to .env.local (see .env.example) and restart the app to enable accounts."
    actionTo="/shop"
    actionLabel="Continue shopping"
  />
)

// Phone-friendly Clerk form: full-width card, 44px+ touch targets, 16px text (stops iOS zooming into fields).
const touch = { minHeight: '2.75rem' }
const appearance = {
  elements: {
    rootBox: { width: '100%', maxWidth: '26rem' },
    card: { width: '100%', maxWidth: '100%', boxSizing: 'border-box' },
    formFieldInput: { ...touch, fontSize: '16px' },
    formFieldInputShowPasswordButton: { minWidth: '2.75rem', minHeight: '2.75rem' },
    formButtonPrimary: { ...touch, fontSize: '15px' },
    socialButtonsBlockButton: touch,
    footerActionLink: { display: 'inline-block', padding: '0.6rem 0.25rem' },
    formResendCodeLink: { padding: '0.6rem 0.25rem' },
    identityPreviewEditButton: { padding: '0.6rem 0.25rem' },
  },
}

function Shell({ children, note }) {
  return (
    <div className="container-x flex flex-col items-center py-6 sm:py-12">
      {children}
      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-muted">{note}</p>
    </div>
  )
}

export function Login() {
  if (!authEnabled) return <Unavailable />
  return (
    <Shell
      note={
        <>
          Sign in with your email and password. Forgot your password? Type your email and tap <strong>“Forgot password?”</strong> next to
          the password box and we’ll email you a code. New here? <Link to="/signup" className="font-semibold text-crimson underline">Create an account</Link>.
        </>
      }
    >
      <SignIn appearance={appearance} routing="path" path="/login" signUpUrl="/signup" fallbackRedirectUrl="/shop" />
    </Shell>
  )
}

export function Signup() {
  if (!authEnabled) return <Unavailable />
  return (
    <Shell
      note={
        <>
          Create your account with any email address and a password — we’ll email you a code to confirm it. Google sign-in is optional.
          Already registered? <Link to="/login" className="font-semibold text-crimson underline">Sign in</Link>.
        </>
      }
    >
      <SignUp appearance={appearance} routing="path" path="/signup" signInUrl="/login" fallbackRedirectUrl="/shop" />
    </Shell>
  )
}
