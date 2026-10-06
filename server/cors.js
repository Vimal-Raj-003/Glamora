import cors from 'cors'

// Websites that are allowed to call this API from a browser.
// Add more (for example a Vercel preview URL) with the CORS_ORIGINS environment variable, comma-separated.
const DEFAULT_ORIGINS = [
  'https://glamora.vimsenterprise.com',
  'https://glamora-zeta.vercel.app',
  'http://localhost:5173', // local development
  'http://127.0.0.1:5173',
]

const clean = (o) => o.trim().replace(/\/+$/, '')

export const allowedOrigins = () =>
  new Set([...DEFAULT_ORIGINS, ...(process.env.CORS_ORIGINS || '').split(',').map(clean).filter(Boolean)])

export function corsMiddleware() {
  const allowed = allowedOrigins()
  return cors({
    // Requests with no Origin header (server-to-server calls such as the Razorpay webhook, health checks) are allowed.
    // A browser on any other website gets no CORS headers, so the browser blocks it.
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // browsers may cache the preflight answer for a day
  })
}
