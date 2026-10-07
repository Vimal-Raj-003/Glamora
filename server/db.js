import { PrismaClient, Prisma } from '@prisma/client'

// Send money columns to the browser as plain numbers instead of strings.
Prisma.Decimal.prototype.toJSON = function toJSON() {
  return this.toNumber()
}

// Hosting dashboards make it easy to paste the URL with surrounding quotes, spaces or a "psql '...'" wrapper.
// Pull out just the postgres:// address so such a paste still works.
const cleanUrl = (v) => (v || '').match(/postgres(?:ql)?:\/\/[^\s'"]+/i)?.[0]
const url = cleanUrl(process.env.DATABASE_URL)
if (url) process.env.DATABASE_URL = url
const directUrl = cleanUrl(process.env.DIRECT_URL)
if (directUrl) process.env.DIRECT_URL = directUrl

export const prisma = new PrismaClient()
