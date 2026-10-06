// Verifies the environment WITHOUT printing any secret value.
// Usage: npm run check:env
import '../server/env.js'

const env = process.env
const PLACEHOLDER = /x{4,}/i
const results = []
const record = (ok, label, detail = '') => {
  results.push(ok)
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
}
const present = (name) => Boolean(env[name]) && !PLACEHOLDER.test(env[name])

console.log('\n[1] Required variables (presence only, values are never shown)')
for (const name of [
  'DATABASE_URL', 'CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY',
  'SUPER_ADMIN_EMAILS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
]) {
  record(present(name), name, present(name) ? 'set' : env[name] ? 'still a placeholder' : 'MISSING')
}
console.log(`  INFO  DIRECT_URL ${env.DIRECT_URL ? 'set' : 'not set (derived from DATABASE_URL automatically)'}`)
console.log(`  INFO  RAZORPAY_WEBHOOK_SECRET ${env.RAZORPAY_WEBHOOK_SECRET ? 'set' : 'not set (optional: webhook disabled)'}`)
console.log(`  INFO  PORT ${env.PORT || '4000 (default)'}`)

console.log('\n[2] Formats')
if (present('DATABASE_URL')) {
  try {
    const u = new URL(env.DATABASE_URL)
    record(u.protocol.startsWith('postgres'), 'DATABASE_URL is a PostgreSQL URL')
    record(/neon\.tech$/.test(u.hostname), 'DATABASE_URL points to Neon')
    record(u.searchParams.get('sslmode') === 'require' || env.DATABASE_URL.includes('sslmode=require'), 'DATABASE_URL uses sslmode=require')
    console.log(`  INFO  pooled connection: ${u.hostname.includes('-pooler') ? 'yes' : 'no (fine for a single dev server)'}`)
  } catch {
    record(false, 'DATABASE_URL parses as a URL', 'not a valid URL (check for stray spaces or quotes)')
  }
}
const pk = env.CLERK_PUBLISHABLE_KEY || ''
const sk = env.CLERK_SECRET_KEY || ''
const kind = (k) => (/^(pk|sk)_live_/.test(k) ? 'live' : /^(pk|sk)_test_/.test(k) ? 'test' : 'unknown')
record(pk === env.VITE_CLERK_PUBLISHABLE_KEY, 'CLERK_PUBLISHABLE_KEY matches VITE_CLERK_PUBLISHABLE_KEY')
record(kind(pk) !== 'unknown' && kind(pk) === kind(sk), 'Clerk publishable and secret keys are from the same environment', `${kind(pk)} / ${kind(sk)}`)
const admins = (env.SUPER_ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean)
record(admins.length > 0 && admins.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)), 'SUPER_ADMIN_EMAILS has valid email(s)', `${admins.length} listed`)
record(/^rzp_(live|test)_/.test(env.RAZORPAY_KEY_ID || ''), 'RAZORPAY_KEY_ID format', (env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'LIVE mode' : 'test mode')

console.log('\n[3] Live checks (read-only API calls)')
if (present('CLERK_SECRET_KEY')) {
  try {
    const r = await fetch('https://api.clerk.com/v1/users?limit=1', { headers: { Authorization: `Bearer ${sk}` } })
    record(r.ok, 'Clerk secret key accepted by Clerk API', `HTTP ${r.status}`)
    for (const email of admins) {
      const q = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${sk}` } })
      const users = q.ok ? await q.json() : []
      const verified = users.some((u) => u.email_addresses?.some((e) => e.email_address.toLowerCase() === email.toLowerCase() && e.verification?.status === 'verified'))
      const masked = email.replace(/^(.).*(@.*)$/, '$1***$2')
      console.log(`  INFO  Super Admin ${masked}: ${users.length ? (verified ? 'has a verified Clerk account' : 'Clerk account exists but email NOT verified') : 'no Clerk account yet - sign up with this email first'}`)
    }
  } catch (e) {
    record(false, 'Reach Clerk API', e.message)
  }
}
if (present('RAZORPAY_KEY_ID') && present('RAZORPAY_KEY_SECRET')) {
  try {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')
    const r = await fetch('https://api.razorpay.com/v1/orders?count=1', { headers: { Authorization: `Basic ${auth}` } })
    record(r.ok, 'Razorpay credentials accepted by Razorpay API', `HTTP ${r.status}`)
  } catch (e) {
    record(false, 'Reach Razorpay API', e.message)
  }
}

const failed = results.filter((x) => !x).length
console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}\n`)
process.exit(failed ? 1 : 0)
