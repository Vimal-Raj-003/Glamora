import { useAsync } from '../hooks/useAsync'
import { getWishlist } from '../lib/api'
import { useWishlist } from '../context/WishlistContext'
import ProductGrid from '../components/ProductGrid'
import { PageHeader, Spinner, ErrorBox, Empty } from '../components/ui'

export default function Wishlist() {
  const { data, loading, error } = useAsync(getWishlist, [])
  const { ids } = useWishlist()

  // Hide items the moment they are un-hearted, without waiting for a refetch.
  const products = (data || []).filter((p) => ids.has(p.id))

  return (
    <>
      <PageHeader eyebrow="My account" title="Wishlist" subtitle="Products you’ve saved for later." />
      <div className="container-x py-10">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox message={error} />
        ) : products.length === 0 ? (
          <Empty title="Your wishlist is empty" text="Tap the heart on any product to save it here." actionTo="/shop" actionLabel="Browse products" />
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </>
  )
}
