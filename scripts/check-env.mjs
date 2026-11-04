import '../server/env.js'
import { paymentConfig } from '../server/services/upi-security.js'

// Presence checks only: no secret output and no real provider/Gmail requests.
let missing = 0
for (const key of ['DATABASE_URL', 'DIRECT_URL', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'VITE_CLERK_PUBLISHABLE_KEY',
  'SUPER_ADMIN_EMAILS', 'UPI_ID', 'UPI_NAME', 'GMAIL_ADDRESS', 'GMAIL_APP_PASSWORD', 'UPI_API_KEY', 'UPI_ALERT_SENDERS', 'UPI_RECEIVING_ACCOUNT_LAST4']) {
  const ok = Boolean(process.env[key]) && !/x{4,}/i.test(process.env[key])
  console.log(`${key}: ${ok ? 'set' : 'missing'}`)
  if (!ok) missing++
}
console.log(`Strict bank settings valid: ${paymentConfig().ready ? 'yes' : 'no'}`)
console.log(`Live UPI verification: ${process.env.UPI_VERIFICATION_ENABLED === '1' ? 'enabled' : 'disabled pending bank-email validation'}`)
console.log(`Scheduled recovery secret: ${process.env.CRON_SECRET || process.env.UPI_API_KEY ? 'set' : 'missing'}`)
process.exitCode = missing ? 1 : 0
