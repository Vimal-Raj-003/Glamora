import { ImapFlow } from 'imapflow'
import { verifyCredit } from './upi-security.js'

// Bounded oldest-first batches. Advance only through messages actually processed.
export async function readVerifiedInbox(config, state, env = process.env, Client = ImapFlow) {
  const client = new Client({ host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: env.GMAIL_ADDRESS, pass: env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
    logger: false, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, disableAutoIdle: true })
  const timeout = setTimeout(() => client.close(), 15000)
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const validity = String(client.mailbox.uidValidity)
      const fresh = state.uidValidity !== validity
      const last = fresh ? 0 : state.lastUid
      const found = await client.search(last ? { uid: `${last + 1}:*` } : { since: new Date(Date.now() - 3 * 86400000) }, { uid: true })
      const uids = (found || []).map(Number).filter((n) => n > last).sort((a, b) => a - b).slice(0, 100)
      const alerts = []
      let cursor = last
      if (uids.length) {
        for await (const m of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
          if (!m.source || m.source.length > 512000) throw new Error('MESSAGE_REVIEW_REQUIRED')
          const alert = await verifyCredit(m.source, m.internalDate, config)
          if (alert) alerts.push(alert)
          cursor = Math.max(cursor, m.uid)
        }
        // Never checkpoint past an incomplete fetch.
        if (cursor !== uids.at(-1)) throw new Error('INCOMPLETE_INBOX_BATCH')
      }
      return { alerts, lastUid: cursor, uidValidity: validity }
    } finally { lock.release() }
  } finally {
    clearTimeout(timeout)
    client.close()
  }
}
