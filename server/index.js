import './env.js'
import { createApp } from './app.js'
import { createClerkProvider } from './auth.js'
import { prisma } from './db.js'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.')
  process.exit(1)
}

const app = createApp({ prisma, authProvider: createClerkProvider() })
const port = Number(process.env.PORT) || 4000

app.listen(port, () => console.log(`Glamora API listening on http://localhost:${port}`))

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}
