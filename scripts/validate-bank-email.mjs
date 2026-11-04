import '../server/env.js'
import fs from 'node:fs'
import { paymentConfig, verifyCredit } from '../server/services/upi-security.js'

// Offline format check only. The .eml must be exported directly from the real Gmail
// inbox. A local file cannot itself establish provenance; review it before enabling.
// Never uploads mail, connects to Gmail, or changes orders/database state.
try {
  const file = process.argv[2]
  if (!file) throw new Error('missing file')
  const result = await verifyCredit(fs.readFileSync(file), new Date(), paymentConfig())
  console.log(JSON.stringify({ recognizedCredit: Boolean(result), authenticationAndAccountChecks: Boolean(result),
    orderReferencePresent: Boolean(result?.ref), orderCanBeMarkedPaid: false }))
  if (!result) process.exitCode = 1
} catch {
  console.error('Email validation failed. Supply an exported raw .eml file; no credentials or message content are logged.')
  process.exitCode = 1
}
