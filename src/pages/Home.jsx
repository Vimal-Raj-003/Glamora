import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getCategories, getProducts } from '../lib/api'
import ProductGrid from '../components/ProductGrid'
import { Spinner, ErrorBox } from '../components/ui'

const HERO_TRUST = [
  { label: 'Free shipping under ₹1,000', path: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z' },
  { label: 'Secure payments', path: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4' },
  { label: 'Authentic products', path: 'M12 3l2.4 2.2 3.2-.3.9 3.1 2.8 1.7-1.2 3 1.2 3-2.8 1.7-.9 3.1-3.2-.3L12 21l-2.4-2.2-3.2.3-.9-3.1L2.7 14.3l1.2-3-1.2-3 2.8-1.7.9-3.1 3.2.3zM9 12l2 2 4-4' },
]

const PERKS = [
  { title: 'Free shipping', short: 'Free shipping', text: 'On orders below ₹1,000', shortText: 'Below ₹1,000' },
  { title: 'Authentic products', short: 'Authentic', text: '100% genuine, quality assured', shortText: '100% genuine' },
  { title: 'Secure payments', short: 'Secure', text: 'Powered by Razorpay', shortText: 'Razorpay' },
  { title: 'Easy support', short: 'Support', text: 'We’re here when you need us', shortText: 'We’re here' },
]

export default function Home() {
  const cats = useAsync(getCategories, [])
  const featured = useAsync(() => getProducts({ featured: true, limit: 8 }), [])
  const newest = useAsync(() => getProducts({ sort: 'newest', limit: 4 }), [])

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-crimson/30 blur-3xl" aria-hidden="true" />
        <div className="container-x relative grid items-center gap-6 py-6 sm:py-8 md:grid-cols-2 md:py-8">
          <div>
            <p className="eyebrow">New season · Bold colour</p>
            <h1 className="mt-3 font-serif text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Beauty that <span className="text-crimson">makes</span> an entrance.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">
              Discover face, eye and lip essentials crafted for a flawless finish — from everyday glow to full glam.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/shop" className="btn btn-primary">Shop now</Link>
              <Link to="/category/lips" className="btn border border-white/40 text-white hover:bg-white hover:text-ink">Explore lips</Link>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-xs text-white/80 sm:text-sm">
              {HERO_TRUST.map((t) => (
                <li key={t.label} className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-crimson" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={t.path} />
                  </svg>
                  {t.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[15rem] sm:max-w-xs md:max-w-sm">
            <div className="absolute inset-0 rounded-full border border-crimson/60" />
            <div className="absolute inset-4 rounded-full bg-white" />
            <img src="/images/face/2.avif" alt="Glamora liquid foundation" className="relative h-full w-full rounded-full object-cover mix-blend-multiply" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container-x mt-16">
        <div className="text-center">
          <p className="eyebrow">Shop by category</p>
          <h2 className="section-title mt-2">Find your look</h2>
        </div>
        {cats.loading ? (
          <Spinner />
        ) : cats.error ? (
          <ErrorBox message={cats.error} />
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {cats.data.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`} className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-mist">
                <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain p-6 mix-blend-multiply transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-4 pt-12 text-white">
                  <h3 className="font-serif text-xl font-semibold">{c.name}</h3>
                  <span className="text-xs tracking-wider text-white/80 group-hover:text-crimson">Shop now →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured */}
      <section className="container-x mt-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="eyebrow">Bestsellers</p>
            <h2 className="section-title mt-2">Featured products</h2>
          </div>
          <Link to="/shop" className="inline-flex min-h-10 items-center text-sm font-semibold underline underline-offset-4 hover:text-crimson">View all</Link>
        </div>
        {featured.loading ? <Spinner /> : featured.error ? <ErrorBox message={featured.error} /> : <ProductGrid products={featured.data} />}
      </section>

      {/* Banner */}
      <section className="container-x mt-20">
        <div className="grid items-center gap-6 overflow-hidden rounded-xl bg-ink text-white md:grid-cols-2">
          <div className="p-8 sm:p-12">
            <p className="eyebrow">Free shipping</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">Complete your kit, ships free under ₹1,000</h2>
            <p className="mt-3 text-sm text-white/70">Orders below ₹1,000 ship free across India. Orders of ₹1,000 or more have a flat ₹80 shipping charge.</p>
            <Link to="/category/makeup-tools" className="btn btn-primary mt-6">Shop tools</Link>
          </div>
          <img src="/images/tools/1.avif" alt="" loading="lazy" className="h-64 w-full bg-white object-contain p-4 md:h-full" />
        </div>
      </section>

      {/* New arrivals */}
      <section className="container-x mt-20">
        <div className="mb-8">
          <p className="eyebrow">Just landed</p>
          <h2 className="section-title mt-2">New arrivals</h2>
        </div>
        {newest.loading ? <Spinner /> : newest.error ? <ErrorBox message={newest.error} /> : <ProductGrid products={newest.data} />}
      </section>

      {/* Perks */}
      <section className="container-x mt-20">
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="min-w-0 bg-white px-0.5 py-3 text-center sm:p-6">
              <h3 className="whitespace-nowrap font-serif text-[12px] font-semibold leading-tight tracking-tight sm:whitespace-normal sm:text-lg sm:tracking-normal">
                <span className="sm:hidden">{p.short}</span><span className="hidden sm:inline">{p.title}</span>
              </h3>
              <p className="mt-0.5 text-[11px] leading-tight text-muted sm:mt-1 sm:text-sm">
                <span className="sm:hidden">{p.shortText}</span><span className="hidden sm:inline">{p.text}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

    </>
  )
}
