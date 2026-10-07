// Rule-based support assistant for Glamora. No external AI service: answers come from the store's own
// data (live products, the customer's own orders) and the same rules written in the policy pages.
import { getProducts, getMyOrders } from './api'
import { STORE, CATEGORY_LINKS } from '../config/store'
import { formatPrice } from './format'
import { STATUS_LABELS } from './status'

export const TOPICS = [
  { id: 'product', label: 'Product info & price' },
  { id: 'availability', label: 'Is it in stock?' },
  { id: 'order', label: 'Where is my order?' },
  { id: 'payment', label: 'Payment & Razorpay' },
  { id: 'delivery', label: 'Delivery & shipping' },
  { id: 'returns', label: 'Returns & refunds' },
  { id: 'account', label: 'Login & account' },
]

const STOP = new Set(
  ('the and for you your with have has are was were what whats how can could would should will does did not any all this that there their them they from about into over please tell show give need want like know get got see ' +
    'price cost much available availability stock stocks product products item items buy sell selling have having which when where who why hello thanks thank info information details detail').split(' '),
)

const rx = {
  support: /(talk|speak|connect|chat).{0,20}(human|agent|person|someone|executive|support|team)|customer (care|support|service)|call (me|you|us|support)|phone number|contact number|helpline|not satisfied|unsatisfied|not happy|unhappy|useless|worst|complain|angry|frustrat|escalat|cheat|fraud|scam|nobody (is )?help|no (one|body) (is )?help/i,
  greeting: /^\s*(hi+|hello+|hey+|hii+|namaste|good (morning|afternoon|evening)|help|start)\b[\s!.?]*$/i,
  thanks: /\b(thanks|thank you|thx|great|awesome|perfect|got it|that helps|helpful|resolved|solved)\b/i,
  returns: /return|refund|replace|exchange|damag|defect|broken|leak|wrong (item|product|shade)|missing|cancel|money back/i,
  order: /my order|order status|order id|track|tracking|where('?s| is) my|parcel|package|not received|yet to (arrive|receive)|order (placed|history|details)/i,
  payment: /payment|pay\b|paid|razorpay|upi|card|netbank|net banking|wallet|deduct|debit|transaction|checkout|declin|otp|amount|charged|double/i,
  delivery: /deliver|shipping|ship\b|courier|dispatch|pin ?code|how long|arrive|days|free shipping|shipping (fee|charge)|cod|cash on delivery/i,
  account: /log ?in|sign ?in|sign ?up|register|password|account|e-?mail|verify|verification|code|google|logout|log out|profile/i,
  availability: /in stock|out of stock|available|availability|stock|sold out|restock/i,
  product: /price|cost|how much|₹|\brs\b|buy|product|shade|ingredient|recommend|best|show me|do you (have|sell)/i,
}

export function detectIntent(text) {
  const t = text.trim()
  if (rx.support.test(t)) return 'support'
  if (rx.greeting.test(t)) return 'greeting'
  if (rx.returns.test(t)) return 'returns'
  if (rx.order.test(t)) return 'order'
  if (rx.payment.test(t)) return 'payment'
  if (rx.delivery.test(t)) return 'delivery'
  if (rx.account.test(t)) return 'account'
  if (rx.availability.test(t)) return 'availability'
  if (rx.thanks.test(t)) return 'thanks'
  if (rx.product.test(t)) return 'product'
  return 'other'
}

const words = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))

async function findProducts(text) {
  const ws = words(text)
  if (!ws.length) return []
  const variants = [...new Set(ws.flatMap((w) => (w.endsWith('s') ? [w, w.slice(0, -1)] : [w])))]
  const tries = [ws.join(' '), ...variants.sort((a, b) => b.length - a.length).slice(0, 4)]
  for (const q of tries) {
    const found = await getProducts({ search: q, limit: 3 }).catch(() => [])
    if (found.length) return found
  }
  return []
}

const categoryFor = (text) => {
  const t = text.toLowerCase()
  if (/\bface|foundation|concealer|blush\b/.test(t)) return CATEGORY_LINKS[0]
  if (/\beyes?\b|kajal|liner|mascara|eyeliner/.test(t)) return CATEGORY_LINKS[1]
  if (/\blips?\b|lipstick|gloss/.test(t)) return CATEGORY_LINKS[2]
  if (/tool|brush|sponge|curler/.test(t)) return CATEGORY_LINKS[3]
  return null
}

const categoryLinks = () => CATEGORY_LINKS.map((c) => ({ label: c.name, to: `/category/${c.slug}` }))

const stockLine = (p) => (p.stock <= 0 ? 'Out of stock' : p.stock <= 10 ? `Only ${p.stock} left` : 'In stock')

// Returns { text, products?, orders?, links?, support?, helpful? }
// helpful: ask "Did that help?" afterwards. support: show the call-support card straight away.
export async function answer(intent, text, ctx) {
  switch (intent) {
    case 'greeting':
      return { text: 'Hello! 👋 I’m Glamora’s virtual assistant. Pick a topic below or just type your question.', topics: true }

    case 'thanks':
      return { text: 'You’re welcome! Is there anything else I can help you with?', topics: true }

    case 'support':
      return { text: 'Of course — our support team is happy to help you directly.', support: true }

    case 'product':
    case 'availability': {
      const hasWords = words(text).length > 0
      const found = hasWords ? await findProducts(text) : []
      if (found.length) {
        return {
          text: intent === 'availability' ? 'Here’s the current availability:' : 'Here’s what I found:',
          products: found,
          helpful: true,
        }
      }
      const cat = categoryFor(text)
      if (cat) {
        return { text: `You can browse all our ${cat.name} products here:`, links: [{ label: `Shop ${cat.name}`, to: `/category/${cat.slug}` }], helpful: true }
      }
      return {
        text: 'Which product are you looking for? Type a name such as “lipstick”, “kajal” or “foundation”, or browse a category:',
        links: categoryLinks(),
      }
    }

    case 'order': {
      if (!ctx.user) {
        return {
          text: 'To check your order I need you to log in first. Once you’re signed in, ask me again or open My Orders.',
          links: [{ label: 'Log in', to: '/login?redirect_url=%2Faccount' }],
        }
      }
      const orders = await getMyOrders().catch(() => null)
      if (!orders) return { text: 'I couldn’t load your orders just now. Please try again, or open My Orders.', links: [{ label: 'My Orders', to: '/account' }] }
      if (orders.length === 0) return { text: 'You haven’t placed any orders yet.', links: [{ label: 'Start shopping', to: '/shop' }] }
      return {
        text: 'Here are your latest orders. Open one for full details and tracking updates.',
        orders: orders.slice(0, 3),
        links: [{ label: 'All my orders', to: '/account' }],
        helpful: true,
      }
    }

    case 'payment':
      return {
        text:
          'We take payments securely through Razorpay (UPI, cards, netbanking and wallets).\n\n' +
          '• Payment failed or you closed the window? Your order is saved. Open My Orders and tap “Complete payment”.\n' +
          '• Money deducted but the order says “Awaiting payment”? Please don’t pay again. Confirmation can take a few minutes — refresh My Orders. If it still isn’t confirmed, call our support team with your order number.\n' +
          '• Banks usually return a failed or double payment to your account within 5–7 working days.',
        links: [{ label: 'My Orders', to: '/account' }],
        helpful: true,
      }

    case 'delivery':
      return {
        text:
          '• Shipping is free on every order — no minimum order value and no delivery charge.\n' +
          '• Orders are packed within 1–2 business days of payment.\n' +
          '• Delivery usually takes 3–7 business days after dispatch, depending on your location.\n' +
          '• Track your order any time from My Orders.',
        links: [{ label: 'Shipping Policy', to: '/shipping-policy' }, { label: 'My Orders', to: '/account' }],
        helpful: true,
      }

    case 'returns':
      return {
        text:
          'You can request a return or replacement within 7 days of delivery if the product arrived damaged, leaking, defective, or you received the wrong or a missing item. Opened or used products can’t be returned.\n\n' +
          `To start, email ${STORE.supportEmail} with your order number and clear photos. Approved refunds go back to your original payment method within 5–7 business days.`,
        links: [{ label: 'Return & Refund Policy', to: '/return-refund-policy' }],
        helpful: true,
      }

    case 'account':
      return {
        text:
          '• Sign up or sign in with your email and password — Google sign-in is optional.\n' +
          '• Forgot your password? On the login page type your email, then tap “Forgot password?” next to the password box and we’ll email you a code.\n' +
          '• No verification email? Check your spam folder, then try again.\n' +
          '• After you sign in you’ll land straight on the shop.',
        links: [{ label: 'Log in', to: '/login' }, { label: 'Create account', to: '/signup' }, { label: 'My account', to: '/account' }],
        helpful: true,
      }

    default: {
      // Unknown question: maybe they just typed a product name.
      const found = await findProducts(text)
      if (found.length) return { text: 'Here’s what I found:', products: found, helpful: true }
      return { text: null }
    }
  }
}

export const statusText = (o) => `${STATUS_LABELS[o.status] || o.status}`
