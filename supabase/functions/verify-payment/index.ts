// Verifies the Razorpay payment signature server-side, then marks the order paid.
// Deploy with: supabase functions deploy verify-payment

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Please log in.' }, 401)

    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json()
    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Missing payment details.' }, 400)
    }

    // The order must belong to the caller and match the Razorpay order it was created with
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, user_id, status, razorpay_order_id')
      .eq('id', order_id)
      .maybeSingle()
    if (orderErr) throw orderErr
    if (!order || order.user_id !== userData.user.id) return json({ error: 'Order not found.' }, 404)
    if (order.razorpay_order_id !== razorpay_order_id) return json({ error: 'Order mismatch.' }, 400)

    const expected = await hmacSha256Hex(Deno.env.get('RAZORPAY_KEY_SECRET')!, `${razorpay_order_id}|${razorpay_payment_id}`)
    if (!safeEqual(expected, razorpay_signature)) return json({ error: 'Payment signature verification failed.' }, 400)

    const { error: finErr } = await admin.rpc('finalize_paid_order', {
      p_order_id: order_id,
      p_razorpay_order_id: razorpay_order_id,
      p_razorpay_payment_id: razorpay_payment_id,
      p_razorpay_signature: razorpay_signature,
    })
    if (finErr) throw finErr

    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ error: 'Could not verify the payment.' }, 500)
  }
})
