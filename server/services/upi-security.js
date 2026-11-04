import crypto from 'node:crypto'
import upiPackage from 'codemode-upi-pay'
import { simpleParser } from 'mailparser'

export const paise = (value) => Math.round(Number(value) * 100)

export function paymentConfig(env = process.env) {
  const senders = (env.UPI_ALERT_SENDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const account = (env.UPI_RECEIVING_ACCOUNT_LAST4 || '').trim()
  const ready = Boolean(env.UPI_ID && env.UPI_NAME && env.GMAIL_ADDRESS && env.GMAIL_APP_PASSWORD &&
    env.UPI_API_KEY && senders.length && senders.every((s) => /^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(s)) && /^\d{4}$/.test(account))
  return { vpa: env.UPI_ID, name: env.UPI_NAME, senders, account, ready }
}

// Only raw messages fetched over the authenticated Gmail connection enter here.
// Never accept browser-uploaded emails or Authentication-Results from HTTP requests.
export async function verifyCredit(raw, receivedAt, config) {
  if (!config.ready) return null
  const sender = upiPackage.verifySender(raw, config.senders, 'mx.google.com')
  if (!sender.ok) return null
  const mail = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true })
  const text = `${mail.subject || ''}\n${mail.text || String(mail.html || '').replace(/<[^>]*>/g, ' ')}`
  // Require the configured account suffix directly after explicit account wording.
  // Do not accept a matching four-digit fragment anywhere in the email.
  const accounts = [...text.matchAll(/\b(?:a\/?c|account)(?:\s+(?:no\.?|number|ending\s+in))?\s*[:#-]?\s*([*xX\d]{4,30})\b/gi)]
  if (!accounts.some((m) => m[1].endsWith(config.account))) return null
  // HDFC's observed template inserts "successfully" before "credited".
  // Normalize that exact wording without weakening sender/account checks or
  // removing debit indicators. The upstream parser otherwise misses the amount.
  const body = (mail.text || text).replace(/\bhas\s+been\s+successfully\s+credited\b/gi, 'has been credited')
  const info = upiPackage.parseAlert(mail.subject, body, {
    ownVpa: config.vpa, refRe: /\b(GLM[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})\b/i,
  })
  if (!info || !/\bUPI\b/i.test(text)) return null
  const at = new Date(receivedAt).getTime()
  if (!Number.isFinite(at) || at > Date.now() + 60_000) return null
  return { ...info, bank: sender.domain, receivedAt: new Date(at).toISOString(), verified: true,
    evidenceHash: crypto.createHash('sha256').update(raw).digest('hex'), sender: sender.address,
    accountLast4: config.account }
}

export function classifyCredit(payment, credit) {
  if (!credit?.verified || !credit.evidenceHash || credit.ref !== payment.ref || !/^\d{12}$/.test(credit.utr)) return null
  const at = Date.parse(credit.receivedAt)
  const start = Date.parse(payment.createdAt), end = Date.parse(payment.expiresAt)
  if (![at, start, end, Number(credit.amount), Number(payment.payAmount)].every(Number.isFinite) ||
    Number(credit.amount) <= 0 || Number(payment.payAmount) < 1 ||
    // IMAP INTERNALDATE has one-second precision; accommodate truncation only.
    at < start - 1000 || at > end + 30 * 60_000) return null
  if (paise(credit.amount) < paise(payment.payAmount)) return 'underpaid'
  if (paise(credit.amount) > paise(payment.payAmount)) return 'overpaid'
  return 'paid'
}
