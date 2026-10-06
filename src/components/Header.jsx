import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useAsync } from '../hooks/useAsync'
import { getCategories } from '../lib/api'
import { SEED_CATEGORIES } from '../data/seed'

const Icon = ({ d, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={d} />
  </svg>
)

export default function Header() {
  const { user, isAdmin, signOut, enabled } = useAuth()
  const { count, setOpen } = useCart()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [q, setQ] = useState('')
  const { data } = useAsync(getCategories, [])
  const categories = data || SEED_CATEGORIES

  const submit = (e) => {
    e.preventDefault()
    if (!q.trim()) return
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
    setMenu(false)
  }

  const linkCls = ({ isActive }) =>
    `text-sm font-medium tracking-wide transition hover:text-crimson ${isActive ? 'text-crimson' : 'text-white/90'}`

  return (
    <header className="sticky top-0 z-40 bg-ink text-white">
      <div className="bg-crimson py-1.5 text-center text-xs font-medium tracking-wide">
        Free shipping on orders above ₹999
      </div>
      <div className="container-x flex h-16 items-center gap-4">
        <button className="lg:hidden" onClick={() => setMenu(!menu)} aria-label="Toggle menu" aria-expanded={menu}>
          <Icon d={menu ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} className="h-6 w-6" />
        </button>

        <Link to="/" className="font-serif text-2xl font-bold tracking-[0.18em]">
          GLAM<span className="text-crimson">ORA</span>
        </Link>

        <nav className="ml-8 hidden items-center gap-7 lg:flex" aria-label="Main">
          <NavLink to="/shop" end className={linkCls}>Shop All</NavLink>
          {categories.map((c) => (
            <NavLink key={c.id} to={`/category/${c.slug}`} className={linkCls}>
              {c.name}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submit} className="ml-auto hidden md:block" role="search">
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="w-56 rounded-full border border-white/20 bg-white/10 py-2 pl-4 pr-10 text-sm text-white outline-none placeholder:text-white/50 focus:border-crimson"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white" aria-label="Search">
              <Icon d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" className="h-4 w-4" />
            </button>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {enabled &&
            (user ? (
              <div className="group relative">
                <Link to="/account" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10" aria-label="My account">
                  <Icon d="M20 21a8 8 0 10-16 0M12 13a4 4 0 100-8 4 4 0 000 8z" />
                </Link>
                <div className="invisible absolute right-0 top-full w-44 rounded-md bg-white py-2 text-sm text-ink opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <Link to="/account" className="block px-4 py-2 hover:bg-mist">My account</Link>
                  {isAdmin && <Link to="/admin" className="block px-4 py-2 hover:bg-mist">Admin</Link>}
                  <button onClick={signOut} className="block w-full px-4 py-2 text-left hover:bg-mist">Log out</button>
                </div>
              </div>
            ) : (
              <Link to="/login" className="rounded-full px-3 py-2 text-sm font-medium hover:bg-white/10">Log in</Link>
            ))}
          <button onClick={() => setOpen(true)} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10" aria-label={`Open cart, ${count} items`}>
            <Icon d="M6 7h12l-1 12H7L6 7zM9 7a3 3 0 016 0" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-crimson px-1 text-[11px] font-bold">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {menu && (
        <div className="border-t border-white/10 bg-charcoal lg:hidden">
          <div className="container-x space-y-1 py-4">
            <form onSubmit={submit} className="mb-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="w-full rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm outline-none placeholder:text-white/50"
              />
            </form>
            {[{ id: 'all', slug: null, name: 'Shop All' }, ...categories].map((c) => (
              <NavLink
                key={c.id}
                to={c.slug ? `/category/${c.slug}` : '/shop'}
                onClick={() => setMenu(false)}
                className="block rounded px-2 py-2.5 text-sm font-medium hover:bg-white/10"
              >
                {c.name}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
