// Authentication glue. The app talks to an "auth provider" with three methods, so the
// real Clerk provider can be swapped for a fake one in tests:
//   middleware(req, res, next)  - verifies the session token
//   getClerkId(req)             - returns the signed-in Clerk user id or null
//   fetchIdentity(clerkId)      - returns { email, emailVerified, name }
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express'
import { adminEmails, ah, HttpError } from './lib.js'

export const clerkConfigured = () => Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY)

export function createClerkProvider() {
  if (!clerkConfigured()) {
    console.warn('[auth] CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY not set - sign-in is disabled, public pages still work.')
    return { middleware: (req, res, next) => next(), getClerkId: () => null, fetchIdentity: async () => null }
  }
  return {
    middleware: clerkMiddleware(),
    getClerkId: (req) => getAuth(req).userId || null,
    async fetchIdentity(clerkId) {
      const u = await clerkClient.users.getUser(clerkId)
      const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) || u.emailAddresses[0]
      if (!primary) return null
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || ''
      return { email: primary.emailAddress.toLowerCase(), emailVerified: primary.verification?.status === 'verified', name }
    },
  }
}

export function createAuthMiddleware(provider, prisma) {
  // Loads (or creates) the database user for the signed-in Clerk user and keeps the
  // Super Admin role in sync with SUPER_ADMIN_EMAILS.
  const requireUser = ah(async (req, res, next) => {
    const clerkId = provider.getClerkId(req)
    if (!clerkId) throw new HttpError(401, 'Please log in to continue.')

    const admins = adminEmails()
    let user = await prisma.user.findUnique({ where: { clerkId } })

    if (!user) {
      const ident = await provider.fetchIdentity(clerkId)
      if (!ident) throw new HttpError(400, 'Your account has no email address.')
      const makeAdmin = ident.emailVerified && admins.has(ident.email)
      const existing = await prisma.user.findUnique({ where: { email: ident.email } })
      user = existing
        ? await prisma.user.update({ where: { id: existing.id }, data: { clerkId } })
        : await prisma.user.create({
            data: { clerkId, email: ident.email, fullName: ident.name, role: makeAdmin ? 'super_admin' : 'customer' },
          })
    }

    const listed = admins.has(user.email.toLowerCase())
    if (user.role === 'super_admin' && !listed) {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: 'customer' } })
    } else if (user.role !== 'super_admin' && listed) {
      const ident = await provider.fetchIdentity(clerkId)
      if (ident?.emailVerified && ident.email === user.email.toLowerCase()) {
        user = await prisma.user.update({ where: { id: user.id }, data: { role: 'super_admin' } })
      }
    }

    req.user = user
    next()
  })

  const requireAdmin = [
    requireUser,
    (req, res, next) => (req.user.role === 'super_admin' ? next() : next(new HttpError(403, 'Admins only.'))),
  ]

  return { requireUser, requireAdmin }
}
