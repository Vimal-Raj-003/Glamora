import { SignIn, SignUp } from '@clerk/clerk-react'
import { authEnabled } from '../context/AuthContext'
import { Empty } from '../components/ui'

const Unavailable = () => (
  <Empty
    title="Sign-in isn’t set up yet"
    text="Add your Clerk keys to .env (see .env.example) and restart the app to enable accounts."
    actionTo="/shop"
    actionLabel="Continue shopping"
  />
)

export function Login() {
  if (!authEnabled) return <Unavailable />
  return (
    <div className="container-x flex justify-center py-14">
      <SignIn routing="path" path="/login" signUpUrl="/signup" fallbackRedirectUrl="/account" />
    </div>
  )
}

export function Signup() {
  if (!authEnabled) return <Unavailable />
  return (
    <div className="container-x flex justify-center py-14">
      <SignUp routing="path" path="/signup" signInUrl="/login" fallbackRedirectUrl="/account" />
    </div>
  )
}
