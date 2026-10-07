import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { STORE } from '../config/store'
import { formatPrice, formatDate } from '../lib/format'
import { STATUS_LABELS, STATUS_STYLES } from '../lib/status'
import { TOPICS, detectIntent, answer } from '../lib/chatbot'

const OPEN_EVENT = 'glamora:open-chat'
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches

// Anywhere in the app: openChat() opens the assistant.
export const openChat = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT))

// Small inline "Need help?" button used on pages where the floating button is hidden (cart, checkout).
export function ChatHelpButton({ className = '' }) {
  return (
    <button type="button" onClick={openChat} className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold text-crimson hover:underline ${className}`}>
      <ChatIcon className="h-4 w-4" /> Need help? Chat with us
    </button>
  )
}

function ChatIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1121 12z" />
    </svg>
  )
}

// The "Talk to Customer Support" fallback. The call only happens when the customer taps the call link.
function SupportCard() {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(STORE.supportPhone.replace(/\s/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="rounded-xl border border-crimson/30 bg-crimson-soft/60 p-3.5">
      <p className="text-sm font-semibold text-ink">Still need help?</p>
      <p className="mt-0.5 text-xs text-graphite">Our customer support team can sort it out with you on a call.</p>
      <p className="mt-2 text-sm">Support number: <strong className="whitespace-nowrap">{STORE.supportPhone}</strong></p>
      {!shown ? (
        <button type="button" onClick={() => setShown(true)} className="btn btn-primary mt-3 min-h-11 w-full">Talk to Customer Support</button>
      ) : (
        <div className="mt-3 space-y-2">
          <a href={`tel:${STORE.supportPhoneTel}`} className="btn btn-primary min-h-11 w-full" data-testid="call-support">
            📞 Call Customer Support
          </a>
          <button type="button" onClick={copy} className="btn btn-outline min-h-11 w-full">{copied ? 'Number copied' : 'Copy number'}</button>
          <p className="text-[11px] leading-snug text-muted">Tap “Call Customer Support” to open your phone’s dialer. Nothing is dialled until you press call.</p>
        </div>
      )}
    </div>
  )
}

function Bubble({ from, children }) {
  const mine = from === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm bg-mist text-ink'}`}>{children}</div>
    </div>
  )
}

export default function ChatWidget() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [misses, setMisses] = useState(0)
  const [messages, setMessages] = useState([
    { id: 0, from: 'bot', text: 'Hi! 👋 I’m Glamora’s virtual assistant. I can help with products, orders, payments, delivery and returns. What do you need?', topics: true },
  ])
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const idRef = useRef(1)

  // Cart and checkout keep the floating button out of the way of the Pay / Checkout buttons.
  const hideLauncher = pathname === '/checkout' || pathname === '/cart'

  const close = useCallback(() => setOpen(false), [])
  const closeOnPhone = () => {
    if (isPhone()) setOpen(false)
  }

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    // On phones the chat is a bottom sheet: stop the page behind it from scrolling.
    const lock = isPhone()
    if (lock) document.body.style.overflow = 'hidden'
    if (!lock) inputRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      if (lock) document.body.style.overflow = ''
    }
  }, [open, close])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy, open])

  const push = (m) => setMessages((prev) => [...prev, { id: idRef.current++, ...m }])

  const respond = async (intent, text) => {
    setBusy(true)
    const [res] = await Promise.all([answer(intent, text, { user }), new Promise((r) => setTimeout(r, 450))]).catch(() => [
      { text: 'Sorry, something went wrong on my side. Please try again, or talk to our support team.', support: true },
    ])
    setBusy(false)

    if (res.text === null) {
      const next = misses + 1
      setMisses(next)
      push({
        from: 'bot',
        text: 'I’m not sure I understood that. You can ask about products, prices, orders, payments, delivery or returns.',
        topics: true,
        support: next >= 2,
      })
      return
    }
    setMisses(0)
    push({ from: 'bot', ...res })
  }

  const send = (raw) => {
    const text = raw.trim()
    if (!text || busy) return
    push({ from: 'user', text })
    setInput('')
    respond(detectIntent(text), text)
  }

  const pickTopic = (t) => {
    if (busy) return
    push({ from: 'user', text: t.label })
    respond(t.id, t.id === 'product' || t.id === 'availability' ? '' : t.label)
  }

  const feedback = (yes) => {
    if (busy) return
    push({ from: 'user', text: yes ? 'Yes, thanks' : 'Not really' })
    push(
      yes
        ? { from: 'bot', text: 'Glad I could help! Anything else?', topics: true }
        : { from: 'bot', text: 'Sorry about that. Let’s get you to a real person.', support: true },
    )
  }

  const lastBotId = [...messages].reverse().find((m) => m.from === 'bot')?.id

  return (
    <>
      {!open && !hideLauncher && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open customer support chat"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          className="fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-crimson text-white shadow-lg transition hover:bg-crimson-dark sm:right-5 sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-3.5"
        >
          <ChatIcon />
          <span className="hidden text-sm font-semibold sm:inline">Help</span>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[44] bg-black/40 sm:hidden" onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Glamora customer support chat"
            className="fixed inset-x-0 bottom-0 z-[45] flex h-[85dvh] max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(600px,calc(100dvh-2.5rem))] sm:max-h-none sm:w-[380px] sm:rounded-2xl"
          >
            <header className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crimson font-serif text-lg font-bold">G</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Glamora Support</p>
                <p className="truncate text-xs text-white/70">Ask about orders, payments, delivery…</p>
              </div>
              <button type="button" onClick={close} aria-label="Close chat" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none hover:bg-white/10">×</button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" role="log" aria-live="polite" aria-label="Chat messages">
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  {m.text && <Bubble from={m.from}>{m.text}</Bubble>}

                  {m.products?.map((p) => (
                    <Link key={p.id} to={`/product/${p.slug}`} onClick={closeOnPhone} className="flex items-center gap-3 rounded-xl border border-line p-2.5 hover:border-crimson">
                      <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded bg-mist object-contain p-1 mix-blend-multiply" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted">
                          <strong className="text-ink">{formatPrice(p.price)}</strong>
                          {p.compareAtPrice > p.price && <s className="ml-1.5">{formatPrice(p.compareAtPrice)}</s>} · {p.stock <= 0 ? 'Out of stock' : p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}
                        </span>
                      </span>
                    </Link>
                  ))}

                  {m.orders?.map((o) => (
                    <Link key={o.id} to={`/order/${o.id}`} onClick={closeOnPhone} className="block rounded-xl border border-line p-3 hover:border-crimson">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">#{o.id.slice(0, 8).toUpperCase()}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">{formatDate(o.createdAt)} · {formatPrice(o.total)} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</span>
                      {o.status === 'pending' && <span className="mt-1 block text-xs font-semibold text-crimson">Payment not received — tap to complete</span>}
                    </Link>
                  ))}

                  {m.links && (
                    <div className="flex flex-wrap gap-2">
                      {m.links.map((l) => (
                        <Link key={l.to} to={l.to} onClick={closeOnPhone} className="inline-flex min-h-10 items-center rounded-full border border-crimson px-3.5 text-xs font-semibold text-crimson hover:bg-crimson hover:text-white">
                          {l.label}
                        </Link>
                      ))}
                    </div>
                  )}

                  {m.topics && m.id === lastBotId && (
                    <div className="flex flex-wrap gap-2">
                      {TOPICS.map((t) => (
                        <button key={t.id} type="button" onClick={() => pickTopic(t)} className="min-h-10 rounded-full border border-line bg-white px-3.5 text-xs font-medium hover:border-crimson hover:text-crimson">
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {m.support && <SupportCard />}

                  {m.helpful && m.id === lastBotId && !busy && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">Did that help?</span>
                      <button type="button" onClick={() => feedback(true)} className="min-h-10 rounded-full border border-line px-3.5 text-xs font-medium hover:border-crimson">Yes</button>
                      <button type="button" onClick={() => feedback(false)} className="min-h-10 rounded-full border border-line px-3.5 text-xs font-medium hover:border-crimson">No, I need more help</button>
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="flex justify-start" aria-label="Assistant is typing">
                  <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-mist px-4 py-3">
                    {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />)}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-line bg-white px-3 pb-3 pt-2" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  send(input)
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your question…"
                  aria-label="Type your question"
                  maxLength={300}
                  className="min-h-11 min-w-0 flex-1 rounded-full border border-line px-4 text-base outline-none focus:border-crimson focus:ring-2 focus:ring-crimson/20 sm:text-sm"
                />
                <button type="submit" disabled={busy || !input.trim()} aria-label="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-crimson text-white hover:bg-crimson-dark disabled:opacity-40">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </form>
              <button
                type="button"
                onClick={() => push({ from: 'bot', text: 'No problem — here’s how to reach our team.', support: true })}
                className="mt-1.5 flex min-h-10 w-full items-center justify-center text-xs font-semibold text-crimson hover:underline"
              >
                Talk to Customer Support · {STORE.supportPhone}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
