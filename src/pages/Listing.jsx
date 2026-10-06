import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getCategories, getProducts } from '../lib/api'
import ProductGrid from '../components/ProductGrid'
import { PageHeader, Spinner, ErrorBox, Empty } from '../components/ui'

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

export default function Listing({ mode }) {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const [sort, setSort] = useState('popular')
  const [maxPrice, setMaxPrice] = useState('')
  const [inStock, setInStock] = useState(false)

  const cats = useAsync(getCategories, [])
  const { data, loading, error } = useAsync(
    () => getProducts({ categorySlug: mode === 'category' ? slug : undefined, search: mode === 'search' ? q : undefined, sort }),
    [mode, slug, q, sort],
  )

  const category = mode === 'category' ? cats.data?.find((c) => c.slug === slug) : null

  const products = useMemo(() => {
    let list = data || []
    if (maxPrice) list = list.filter((p) => Number(p.price) <= Number(maxPrice))
    if (inStock) list = list.filter((p) => p.stock > 0)
    return list
  }, [data, maxPrice, inStock])

  const title = mode === 'search' ? `Results for “${q}”` : mode === 'category' ? category?.name || 'Category' : 'Shop all'
  const subtitle = mode === 'category' ? category?.description : mode === 'all' ? 'Every Glamora essential in one place.' : undefined

  return (
    <>
      <PageHeader eyebrow={mode === 'search' ? 'Search' : 'Collection'} title={title} subtitle={subtitle} />
      <div className="container-x py-10">
        <div className="mb-8 grid grid-cols-2 items-end gap-3 border-b border-line pb-5 sm:flex sm:flex-wrap sm:gap-4">
          <p className="col-span-2 text-sm text-muted sm:mr-auto" aria-live="polite">
            {loading ? 'Loading…' : `${products.length} product${products.length === 1 ? '' : 's'}`}
          </p>
          <div className="order-1">
            <label className="label" htmlFor="maxPrice">Max price (₹)</label>
            <input id="maxPrice" type="number" min="0" inputMode="numeric" placeholder="Any" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="input w-full sm:w-32" />
          </div>
          <label className="order-3 col-span-2 flex min-h-10 items-center gap-2 text-sm sm:order-2 sm:col-span-1 sm:pb-1">
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-crimson" />
            In stock only
          </label>
          <div className="order-2 sm:order-3">
            <label className="label" htmlFor="sort">Sort by</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="input w-full sm:w-48">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : products.length === 0 ? (
          <Empty title="No products found" text="Try adjusting your filters or search." actionTo="/shop" actionLabel="Browse all products" />
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </>
  )
}
