import '../server/env.js'
import fs from 'node:fs'
import pg from 'pg'

// Explicit migration only; no automatic writes during application startup.
const client = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL })
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(71492022)')
  const collision = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN ('glamora_upi_attempts','glamora_upi_credits','glamora_upi_inbox')`)
  const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Payment'
    AND column_name IN ('provider','upiPaymentId','utr','payableAmount')`)
  if (collision.rows.length || columns.rows.length) throw new Error('Existing UPI objects detected; review schema before applying. No changes made.')
  await client.query(fs.readFileSync(new URL('../prisma/upi-migration.sql', import.meta.url), 'utf8'))
  await client.query('COMMIT')
  console.log('Additive UPI migration applied. Existing orders and payments preserved.')
} catch {
  await client.query('ROLLBACK').catch(() => {})
  console.error('UPI migration was not applied. Check connectivity, permissions, and existing schema; no credentials are logged.')
  process.exitCode = 1
} finally { await client.end() }
