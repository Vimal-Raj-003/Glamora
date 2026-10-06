import { PrismaClient, Prisma } from '@prisma/client'

// Send money columns to the browser as plain numbers instead of strings.
Prisma.Decimal.prototype.toJSON = function toJSON() {
  return this.toNumber()
}

export const prisma = new PrismaClient()
