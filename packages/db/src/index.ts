import { PrismaClient, Prisma } from '@prisma/client'

export * from '@prisma/client'
export { Prisma }

/**
 * Prisma client เดี่ยวต่อโปรเซส — ป้องกัน connection pool บานตอน hot reload
 */
const globalForPrisma = globalThis as unknown as { medeePrisma?: PrismaClient }

export const prisma =
  globalForPrisma.medeePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.medeePrisma = prisma

/** แปลง Prisma.Decimal เป็นสตริง "0.00" สำหรับส่งออก API */
export function decimalToString(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return '0.00'
  return new Prisma.Decimal(value).toFixed(2)
}

/** แปลงจำนวนสินค้าเป็นสตริงแบบตัดศูนย์ท้าย */
export function qtyToString(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return '0'
  const s = new Prisma.Decimal(value).toFixed(3)
  return s.replace(/\.?0+$/, '') || '0'
}
