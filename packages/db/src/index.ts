import { PrismaClient, Prisma } from '@prisma/client'

export * from '@prisma/client'
export { Prisma }

/**
 * URL สำหรับตอนรัน
 *
 * ถ้าต่อผ่าน connection pooler (host มีคำว่า "pooler" — ทั้ง Neon และ Supabase ตั้งชื่อแบบนี้)
 * ต้องบอก Prisma ว่าปลายทางเป็น PgBouncer และจำกัด 1 connection ต่ออินสแตนซ์ serverless
 * ค่าที่ integration ของ Vercel ตั้งให้แก้ไม่ได้ จึงเติมพารามิเตอร์ตรงนี้แทน
 * ต่อสตริงตรง ๆ ไม่ผ่าน new URL() เพื่อไม่ให้รหัสผ่านที่มีอักขระพิเศษถูก encode ใหม่
 * รับ URL เป็นพารามิเตอร์เสมอ ไม่อ่าน env เอง — ส่ง undefined มาต้องได้ undefined กลับ
 */
export function resolveDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw
  const hostPart = raw.split('@').pop()?.split('/')[0] ?? ''
  if (!/pooler/i.test(hostPart)) return raw
  const extras: string[] = []
  if (!/[?&]pgbouncer=/.test(raw)) extras.push('pgbouncer=true')
  if (!/[?&]connection_limit=/.test(raw)) extras.push('connection_limit=1')
  if (extras.length === 0) return raw
  return `${raw}${raw.includes('?') ? '&' : '?'}${extras.join('&')}`
}

/**
 * Prisma client เดี่ยวต่อโปรเซส — ป้องกัน connection pool บานตอน hot reload
 */
const globalForPrisma = globalThis as unknown as { medeePrisma?: PrismaClient }

export const prisma =
  globalForPrisma.medeePrisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL),
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
