import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getCategories, getProducts } from '../lib/api'
import ProductGrid from '../components/ProductGrid'
import { Spinner, ErrorBox } from '../components/ui'

const PERKS = [
  { title: 'Free shipping', text: 'On all orders above ₹999' },
  { title: 'Authentic products', text: '100% genuine, quality assured' },
  { title: 'Secure payments', text: 'Powered by Razorpay' },
  { title: 'Easy support', text: 'We’re here when you need us' },
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
        <div className="container-x relative grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="eyebrow">New season · Bold colour</p>
            <h1 className="mt-4 font-serif text-5xl font-semibold leading-[1.05] sm:text-6xl">
              Beauty that <span className="text-crimson">makes</span> an entrance.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
              Discover face, eye and lip essentials crafted for a flawless finish — from everyday glow to full glam.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/shop" className="btn btn-primary">Shop now</Link>
              <Link to="/category/lips" className="btn border border-white/40 text-white hover:bg-white hover:text-ink">Explore lips</Link>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-sm">
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
            <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">Complete your kit & ship free</h2>
            <p className="mt-3 text-sm text-white/70">Spend ₹999 or more and we’ll deliver your order to your door at no extra cost.</p>
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
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="bg-white p-6 text-center">
              <h3 className="font-serif text-lg font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

    </>
  )
}
