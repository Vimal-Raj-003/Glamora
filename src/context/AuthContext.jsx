import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClerkProvider, useAuth as useClerkAuth, useUser, useClerk } from '@clerk/clerk-react'
import { getMe, setTokenGetter } from '../lib/api'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
// Auth is only enabled once a real Clerk publishable key is present in .env
export const authEnabled = Boolean(clerkKey && !/x{4,}/i.test(clerkKey))

const DISABLED = {
  user: null,
  profile: null,
  isAdmin: false,
  loading: false,
  enabled: false,
  signOut: async () => {},
  refreshProfile: async () => {},
}

function ClerkBridge({ children }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth()
  const { user: clerkUser } = useUser()
  const { signOut } = useClerk()
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    setTokenGetter(() => getToken())
  }, [getToken])

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getMe())
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    refreshProfile().finally(() => setProfileLoading(false))
  }, [isLoaded, isSignedIn, clerkUser?.id, refreshProfile])

  const value = {
    user: isSignedIn && clerkUser ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress || profile?.email || '' } : null,
    profile,
    isAdmin: profile?.role === 'super_admin',
    loading: !isLoaded || (isSignedIn && profileLoading),
    enabled: true,
    signOut: () => signOut({ redirectUrl: '/' }),
    refreshProfile,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  if (!authEnabled) return <AuthContext.Provider value={DISABLED}>{children}</AuthContext.Provider>

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/shop"
      signUpFallbackRedirectUrl="/shop"
      appearance={{
        // Email + password is the main way in; Google is an optional extra shown underneath.
        layout: { socialButtonsPlacement: 'bottom', socialButtonsVariant: 'blockButton' },
        variables: { colorPrimary: '#c8102e', colorText: '#0b0b0c', fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '0.375rem' },
      }}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}
