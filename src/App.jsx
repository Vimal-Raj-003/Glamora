import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { RequireAuth, RequireAdmin } from './components/Guards'
import Home from './pages/Home'
import Listing from './pages/Listing'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/Auth'
import Account from './pages/Account'
import Admin from './pages/Admin'
import NotFound from './pages/NotFound'

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
        <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="order/:id" element={<RequireAuth><OrderConfirmation /></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
