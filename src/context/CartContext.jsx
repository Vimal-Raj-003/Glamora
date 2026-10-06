import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { getProductsByIds, fetchRemoteCart, replaceRemoteCart } from '../lib/api'
import { shippingFor } from '../lib/format'

const CartContext = createContext(null)
export const useCart = () => useContext(CartContext)

const STORAGE_KEY = 'glamora-cart'

const readLocal = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const { user, enabled } = useAuth()
  const [items, setItems] = useState(readLocal) // [{ productId, quantity }]
  const [products, setProducts] = useState({}) // id -> product
  const [open, setOpen] = useState(false)
  const syncedFor = useRef(null) // user id the cart has been merged for
  const requested = useRef(new Set()) // product ids already requested, so a missing product is never re-fetched in a loop

  // Persist locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* storage unavailable */
    }
  }, [items])

  // Merge with the remote cart on login, then mirror changes
  useEffect(() => {
    if (!enabled) return
    if (!user) {
      syncedFor.current = null
      return
    }
    if (syncedFor.current === user.id) return
    let cancelled = false
    ;(async () => {
      try {
        const remote = await fetchRemoteCart()
        if (cancelled) return
        setItems((local) => {
          const map = new Map(remote.map((r) => [r.productId, r.quantity]))
          for (const l of local) map.set(l.productId, Math.max(map.get(l.productId) || 0, l.quantity))
          return [...map].map(([productId, quantity]) => ({ productId, quantity }))
        })
      } catch {
        /* keep local cart */
      } finally {
        if (!cancelled) syncedFor.current = user.id
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, enabled])

  useEffect(() => {
    if (!enabled || !user || syncedFor.current !== user.id) return
    const t = setTimeout(() => replaceRemoteCart(items).catch(() => {}), 600)
    return () => clearTimeout(t)
  }, [items, user, enabled])

  // Load product details for cart lines
  useEffect(() => {
    const missing = items.map((i) => i.productId).filter((id) => !products[id] && !requested.current.has(id))
    if (!missing.length) return
    missing.forEach((id) => requested.current.add(id))
    getProductsByIds(missing)
      .then((list) => {
        setProducts((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.id, p])) }))
        // Drop cart lines whose product no longer exists (deleted or hidden)
        const found = new Set(list.map((p) => p.id))
        const gone = new Set(missing.filter((id) => !found.has(id)))
        if (gone.size) setItems((prev) => prev.filter((i) => !gone.has(i.productId)))
      })
      .catch(() => missing.forEach((id) => requested.current.delete(id)))
  }, [items, products])

  const lines = useMemo(
    () =>
      items
        .map((i) => ({ ...i, product: products[i.productId] }))
        .filter((l) => l.product && l.product.isActive !== false),
    [items, products],
  )

  const add = useCallback((product, quantity = 1) => {
    setProducts((prev) => ({ ...prev, [product.id]: product }))
    setItems((prev) => {
      const max = Math.max(product.stock ?? 99, 0)
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: Math.min(i.quantity + quantity, max) } : i))
      }
      return [...prev, { productId: product.id, quantity: Math.min(quantity, max) }]
    })
    setOpen(true)
  }, [])

  const setQuantity = useCallback((productId, quantity) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    )
  }, [])

  const remove = useCallback((productId) => setItems((prev) => prev.filter((i) => i.productId !== productId)), [])
  const clear = useCallback(() => setItems([]), [])

  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const subtotal = lines.reduce((n, l) => n + l.quantity * Number(l.product.price), 0)
  const shipping = shippingFor(subtotal)

  const value = { lines, count, subtotal, shipping, total: subtotal + shipping, add, setQuantity, remove, clear, open, setOpen }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
