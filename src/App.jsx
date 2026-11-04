import { Routes, Route, useSearchParams } from 'react-router-dom'
import Layout from './components/Layout'
import { RequireAuth, RequireAdmin } from './components/Guards'
import Home from './pages/Home'
import Listing from './pages/Listing'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import UpiCheckout from './pages/Checkout'
import UpiPreview from './pages/UpiPreview'
import RazorpayCheckout from './pages/RazorpayCheckout'
const Checkout = import.meta.env.VITE_PAYMENT_PROVIDER === 'razorpay' ? RazorpayCheckout : UpiCheckout
import OrderConfirmation from './pages/OrderConfirmation'
import { Login, Signup } from './pages/AuthPages'
import Account from './pages/Account'
import Wishlist from './pages/Wishlist'
import Admin from './pages/Admin'
import { Privacy, Terms, Shipping, Returns } from './pages/Policies'
import NotFound from './pages/NotFound'

function CheckoutRoute() {
  const [params] = useSearchParams()
  if (params.get('preview') === '1') {
    return import.meta.env.DEV ? <UpiPreview local /> : <RequireAdmin><UpiPreview /></RequireAdmin>
  }
  return <RequireAuth><Checkout /></RequireAuth>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Listing mode="all" />} />
        <Route path="category/:slug" element={<Listing mode="category" />} />
        <Route path="search" element={<Listing mode="search" />} />
        <Route path="product/:slug" element={<ProductDetail />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<CheckoutRoute />} />
        <Route path="order/:id" element={<RequireAuth><OrderConfirmation /></RequireAuth>} />
        <Route path="wishlist" element={<RequireAuth><Wishlist /></RequireAuth>} />
        <Route path="login/*" element={<Login />} />
        <Route path="signup/*" element={<Signup />} />
        <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="privacy-policy" element={<Privacy />} />
        <Route path="terms-and-conditions" element={<Terms />} />
        <Route path="shipping-policy" element={<Shipping />} />
        <Route path="return-refund-policy" element={<Returns />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
