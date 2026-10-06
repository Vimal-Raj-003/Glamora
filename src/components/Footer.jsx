import { Link } from 'react-router-dom'
import { SEED_CATEGORIES } from '../data/seed'

export default function Footer() {
  return (
    <footer className="mt-24 bg-ink text-white">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-serif text-2xl font-bold tracking-[0.18em]">
            GLAM<span className="text-crimson">ORA</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Premium makeup for every face. Bold colour, flawless finish and formulas you can trust.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50">Shop</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {SEED_CATEGORIES.map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className="text-white/80 hover:text-crimson">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50">Account</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/account" className="text-white/80 hover:text-crimson">My orders</Link></li>
            <li><Link to="/cart" className="text-white/80 hover:text-crimson">Cart</Link></li>
            <li><Link to="/login" className="text-white/80 hover:text-crimson">Log in</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} Glamora. All rights reserved.
      </div>
    </footer>
  )
}
