// Vercel serverless entry point: every /api/* request is handled by the same Express app used in local development.
import '../server/env.js'
import { createApp } from '../server/app.js'
import { createClerkProvider } from '../server/auth.js'
import { prisma } from '../server/db.js'

// Created once per warm function instance and reused between requests (keeps one Prisma client, not one per request).
const app = createApp({ prisma, authProvider: createClerkProvider() })

export default app
