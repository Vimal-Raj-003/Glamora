// Loads environment variables. Imported first so everything else sees them.
// .env.local takes priority over .env (same convention as Vite). Real environment variables win over both.
import dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })
