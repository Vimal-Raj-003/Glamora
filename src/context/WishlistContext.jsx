import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { getWishlist, addToWishlist, removeFromWishlist } from '../lib/api'

const WishlistContext = createContext(null)
export const useWishlist = () => useContext(WishlistContext)

export function WishlistProvider({ children }) {
  const { user, enabled } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [ids, setIds] = useState(() => new Set())

  useEffect(() => {
    if (!user) {
      setIds(new Set())
      return
    }
    getWishlist()
      .then((list) => setIds(new Set(list.map((p) => p.id))))
      .catch(() => {})
  }, [user])

  const toggle = useCallback(
    async (product) => {
      if (!enabled) return toast('Sign-in is not configured yet.', 'error')
      if (!user) {
        toast('Log in to save items to your wishlist.')
        return navigate(`/login?redirect_url=${encodeURIComponent(pathname)}`)
      }
      const had = ids.has(product.id)
      setIds((prev) => {
        const next = new Set(prev)
        if (had) next.delete(product.id)
        else next.add(product.id)
        return next
      })
      try {
        if (had) await removeFromWishlist(product.id)
        else await addToWishlist(product.id)
        toast(had ? 'Removed from wishlist' : 'Added to wishlist')
      } catch (err) {
        setIds((prev) => {
          const next = new Set(prev)
          if (had) next.add(product.id)
          else next.delete(product.id)
          return next
        })
        toast(err.message, 'error')
      }
    },
    [enabled, user, ids, navigate, pathname, toast],
  )

  return <WishlistContext.Provider value={{ ids, count: ids.size, has: (id) => ids.has(id), toggle }}>{children}</WishlistContext.Provider>
}
