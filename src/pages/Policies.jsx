import { Link } from 'react-router-dom'
import { STORE } from '../config/store'
import { PageHeader } from '../components/ui'

// NOTE: These are standard e-commerce policy templates for an Indian online store.
// Review them (ideally with a lawyer) and edit the details in src/config/store.js before going live.

function PolicyPage({ title, children }) {
  return (
    <>
      <PageHeader eyebrow="Legal" title={title} subtitle={`Last updated: ${STORE.lastUpdated}`} />
      <div className="container-x max-w-3xl py-12">
        <div className="space-y-5 text-[15px] leading-relaxed text-graphite [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5 [&_a]:text-crimson [&_a]:underline">
          {children}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          Questions? Contact us at <a className="text-crimson underline" href={`mailto:${STORE.supportEmail}`}>{STORE.supportEmail}</a> or {STORE.supportPhone}.
        </p>
      </div>
    </>
  )
}

export function Privacy() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        {STORE.name} (“we”, “us”, “our”) respects your privacy. This policy explains what personal information we collect when you use
        {' '}{STORE.website}, how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, email address and password (handled securely by our authentication provider).</li>
        <li><strong>Order details:</strong> shipping address, phone number, items purchased and order history.</li>
        <li><strong>Payment details:</strong> payments are processed by Razorpay. We never see or store your card, UPI or bank details; we only receive a payment confirmation and reference ID.</li>
        <li><strong>Usage data:</strong> basic technical information such as browser type and pages visited, to keep the site working and secure.</li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To create and manage your account and process and deliver your orders.</li>
        <li>To send order confirmations, shipping updates and respond to support requests.</li>
        <li>To prevent fraud, keep our site secure and comply with legal obligations.</li>
      </ul>

      <h2>Sharing your information</h2>
      <p>We do not sell your personal information. We share it only with service providers who help us run the store — for example payment processing (Razorpay), authentication (Clerk), database hosting (Neon) and delivery partners — and only as needed to provide their service, or when required by law.</p>

      <h2>Cookies</h2>
      <p>We use essential cookies and local storage to keep you signed in and to remember the items in your cart. We do not use them to track you across other websites.</p>

      <h2>Data retention and security</h2>
      <p>We keep your information for as long as your account is active or as needed to meet legal, tax and accounting requirements. We use industry-standard safeguards, but no method of transmission over the internet is completely secure.</p>

      <h2>Your rights</h2>
      <p>You may view and update your details from <Link to="/account">My account</Link>. You can also ask us to correct or delete your personal data by emailing us, subject to any records we are legally required to keep.</p>

      <h2>Children</h2>
      <p>Our store is not directed at children under 18, and we do not knowingly collect their personal information.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy from time to time. The “last updated” date above shows when it last changed.</p>

      <h2>Contact</h2>
      <p>{STORE.legalName}, {STORE.address}.</p>
    </PolicyPage>
  )
}

export function Terms() {
  return (
    <PolicyPage title="Terms & Conditions">
      <p>
        These terms govern your use of {STORE.website} and your purchases from {STORE.name}. By using the site or placing an order you agree to them.
      </p>

      <h2>Accounts</h2>
      <p>You must provide accurate information and keep your login details confidential. You are responsible for all activity under your account.</p>

      <h2>Products and pricing</h2>
      <ul>
        <li>We try to display colours and descriptions accurately, but shades may vary slightly depending on your screen.</li>
        <li>All prices are in Indian Rupees (INR) and inclusive of applicable taxes unless stated otherwise.</li>
        <li>We may change prices or discontinue products at any time. The price you pay is the price shown when you place your order.</li>
        <li>If a product is listed at an obviously incorrect price or is out of stock, we may cancel the order and refund any amount paid.</li>
      </ul>

      <h2>Orders and payment</h2>
      <p>An order is confirmed only after successful payment. Payments are processed securely by Razorpay. We reserve the right to refuse or cancel an order, for example where stock is unavailable or fraud is suspected.</p>

      <h2>Shipping, returns and refunds</h2>
      <p>Please read our <Link to="/shipping-policy">Shipping Policy</Link> and <Link to="/return-refund-policy">Return &amp; Refund Policy</Link>, which form part of these terms.</p>

      <h2>Acceptable use</h2>
      <p>You agree not to misuse the site — including attempting to gain unauthorised access, interfering with its operation, or using it for any unlawful purpose.</p>

      <h2>Intellectual property</h2>
      <p>All content on this site, including the {STORE.name} name, logo, text and graphics, belongs to us or our licensors and may not be copied or reused without permission.</p>

      <h2>Limitation of liability</h2>
      <p>To the extent permitted by law, {STORE.name} is not liable for indirect or consequential losses arising from your use of the site or products. Our total liability for any claim is limited to the amount you paid for the order concerned.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India. Courts at the location of our registered office have jurisdiction over any dispute.</p>

      <h2>Contact</h2>
      <p>{STORE.legalName}, {STORE.address}.</p>
    </PolicyPage>
  )
}

export function Shipping() {
  return (
    <PolicyPage title="Shipping Policy">
      <h2>Where we deliver</h2>
      <p>We currently ship to addresses across India. Please make sure your address, PIN code and phone number are correct so our delivery partner can reach you.</p>

      <h2>Shipping charges</h2>
      <ul>
        <li>Orders of <strong>₹999 or more</strong> ship free.</li>
        <li>Orders below ₹999 have a flat shipping charge of <strong>₹80</strong>.</li>
      </ul>
      <p>The exact shipping charge is shown at checkout before you pay.</p>

      <h2>Processing and delivery time</h2>
      <ul>
        <li>Orders are processed within 1–2 business days after payment is confirmed.</li>
        <li>Estimated delivery is 3–7 business days after dispatch, depending on your location. Remote areas may take longer.</li>
      </ul>
      <p>These are estimates, not guarantees. Delays can occur due to weather, strikes, public holidays or courier issues.</p>

      <h2>Order tracking</h2>
      <p>You can follow your order status from <Link to="/account">My account → Orders</Link>. We will share tracking details by email or phone once your order ships.</p>

      <h2>Failed or missed deliveries</h2>
      <p>If delivery fails because of an incorrect address or because you were unreachable, the courier may return the parcel to us. We will contact you to arrange re-delivery, which may involve an additional shipping charge.</p>

      <h2>Damaged or wrong parcels</h2>
      <p>Please check your parcel on arrival. If it looks tampered with or damaged, tell us within 48 hours (see our <Link to="/return-refund-policy">Return &amp; Refund Policy</Link>).</p>
    </PolicyPage>
  )
}

export function Returns() {
  return (
    <PolicyPage title="Return & Refund Policy">
      <p>We want you to love your Glamora purchase. Because makeup is a personal-care product, returns are limited for hygiene and safety reasons.</p>

      <h2>What can be returned</h2>
      <p>You may request a return or replacement within <strong>7 days of delivery</strong> if:</p>
      <ul>
        <li>The product arrived damaged, leaking or defective.</li>
        <li>You received the wrong product or shade.</li>
        <li>An item or part of your order is missing.</li>
      </ul>

      <h2>What cannot be returned</h2>
      <ul>
        <li>Products that have been opened, used or swatched, unless they arrived damaged or defective.</li>
        <li>Products without their original packaging, seals or labels.</li>
        <li>Returns requested after 7 days of delivery.</li>
      </ul>

      <h2>How to request a return</h2>
      <ol className="ml-5 list-decimal space-y-1.5 pl-1">
        <li>Email <a href={`mailto:${STORE.supportEmail}`}>{STORE.supportEmail}</a> within 7 days of delivery with your order number and clear photos or a short video of the issue (including the parcel and label).</li>
        <li>We will review your request within 2 business days and confirm if it is approved.</li>
        <li>If approved, we will arrange a pickup or give you return instructions.</li>
      </ol>

      <h2>Refunds</h2>
      <ul>
        <li>Once we receive and inspect the returned item, we will approve or reject the refund and let you know by email.</li>
        <li>Approved refunds are issued to your original payment method (via Razorpay) within <strong>5–7 business days</strong>. Your bank may take additional time to show the credit.</li>
        <li>Shipping charges are refunded only if the return is due to our error (damaged, defective or wrong item).</li>
        <li>At our discretion we may offer a replacement instead of a refund, where stock allows.</li>
      </ul>

      <h2>Order cancellation</h2>
      <p>You can ask us to cancel an order before it is shipped by emailing us as soon as possible. Orders that have already been dispatched cannot be cancelled, but may be returned under the conditions above. Prepaid cancellations are refunded within 5–7 business days.</p>
    </PolicyPage>
  )
}
