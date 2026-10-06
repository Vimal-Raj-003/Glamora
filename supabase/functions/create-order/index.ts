// Creates a pending order from the user's cart (prices read from the DB, never from the client)
// and a matching Razorpay order. Deploy with: supabase functions deploy create-order

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const FREE_SHIPPING_THRESHOLD = 999
const SHIPPING_FEE = 80

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Identify the caller from their JWT
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Please log in to place an order.' }, 401)
    const user = userData.user

    const { items, address } = await req.json()
    if (!Array.isArray(items) || items.length === 0) return json({ error: 'Your cart is empty.' }, 400)
    if (!address?.full_name || !address?.phone || !address?.line1 || !address?.city || !address?.state || !address?.postal_code) {
      return json({ error: 'Please provide a complete shipping address.' }, 400)
    }

    // Merge duplicate lines and validate quantities
    const wanted = new Map<string, number>()
    for (const i of items) {
      const qty = Math.floor(Number(i.quantity))
      if (!i.product_id || !Number.isFinite(qty) || qty < 1 || qty > 50) return json({ error: 'Invalid cart item.' }, 400)
      wanted.set(i.product_id, (wanted.get(i.product_id) || 0) + qty)
    }

    const { data: products, error: prodErr } = await admin
      .from('products')
      .select('id, name, price, stock, image_url, is_active')
      .in('id', [...wanted.keys()])
    if (prodErr) throw prodErr

    let subtotal = 0
    const orderItems = []
    for (const [id, quantity] of wanted) {
      const p = products?.find((x) => x.id === id)
      if (!p || !p.is_active) return json({ error: 'A product in your cart is no longer available.' }, 400)
      if (p.stock < quantity) return json({ error: `Only ${p.stock} of “${p.name}” left in stock.` }, 400)
      subtotal += Number(p.price) * quantity
      orderItems.push({ product_id: p.id, name: p.name, price: p.price, quantity, image_url: p.image_url })
    }

    const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE
    const total = subtotal + shippingFee

    const shippingAddress = {
      full_name: String(address.full_name).slice(0, 120),
      phone: String(address.phone).slice(0, 20),
      line1: String(address.line1).slice(0, 200),
      line2: address.line2 ? String(address.line2).slice(0, 200) : null,
      city: String(address.city).slice(0, 80),
      state: String(address.state).slice(0, 80),
      postal_code: String(address.postal_code).slice(0, 10),
      country: 'India',
    }

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({ user_id: user.id, subtotal, shipping_fee: shippingFee, total, shipping_address: shippingAddress })
      .select('id')
      .single()
    if (orderErr) throw orderErr

    const { error: itemsErr } = await admin.from('order_items').insert(orderItems.map((i) => ({ ...i, order_id: order.id })))
    if (itemsErr) throw itemsErr

    // Create the Razorpay order (amount in paise)
    const keyId = Deno.env.get('RAZORPAY_KEY_ID')!
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!
    const amount = Math.round(total * 100)
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${keyId}:${keySecret}`) },
      body: JSON.stringify({ amount, currency: 'INR', receipt: order.id.slice(0, 40), notes: { order_id: order.id } }),
    })
    const rzp = await rzpRes.json()
    if (!rzpRes.ok) {
      await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      console.error('Razorpay error', rzp)
      return json({ error: rzp?.error?.description || 'Could not start payment. Please try again.' }, 502)
    }

    await admin.from('orders').update({ razorpay_order_id: rzp.id }).eq('id', order.id)

    return json({ order_id: order.id, razorpay_order_id: rzp.id, amount, key_id: keyId })
  } catch (err) {
    console.error(err)
    return json({ error: 'Something went wrong while creating your order.' }, 500)
  }
})
