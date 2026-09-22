import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { ZodError } from 'zod'
import { Prisma } from '@medee/db'
import { env } from './env.js'
import { ApiError } from './lib/errors.js'
import authPlugin from './plugins/auth.js'
import realtimePlugin from './plugins/realtime.js'
import authRoutes from './routes/auth.js'
import branchRoutes from './routes/branches.js'
import catalogRoutes from './routes/catalog.js'
import productRoutes from './routes/products.js'
import stockRoutes from './routes/stock.js'
import salesRoutes from './routes/sales.js'
import memberRoutes from './routes/members.js'
import reportRoutes from './routes/reports.js'
import syncRoutes from './routes/sync.js'

const app = Fastify({
  logger: env.nodeEnv === 'development'
    ? { transport: undefined, level: 'info' }
    : { level: 'warn' },
  bodyLimit: 8 * 1024 * 1024,
  // ต้นฉบับมีบั๊ก: เปิด URL ที่มี "/" ต่อท้าย (เช่น /product/) แล้วถูกล็อก
  // ของเราให้ router มองว่าเป็น path เดียวกัน และชั้นตรวจสิทธิ์ก็ normalize path อยู่แล้ว (หัวข้อ 2.3)
  routerOptions: {
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
  },
})

await app.register(cors, { origin: env.corsOrigin, credentials: true })
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
await app.register(rateLimit, {
  max: 600,
  timeWindow: '1 minute',
  // จำกัดการใส่ PIN ผิด 5 ครั้ง/นาที ตาม non-functional requirement หัวข้อ 11
  keyGenerator: (req) => `${req.ip}:${req.routeOptions?.url ?? req.url}`,
})
await app.register(authPlugin)
await app.register(realtimePlugin)

app.setErrorHandler((error, req, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'กรอกข้อมูลไม่ถูกต้อง',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({
      error: error.message, code: error.code, details: error.details,
    })
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return reply.status(409).send({ error: 'ข้อมูลนี้มีอยู่แล้วในระบบ', code: 'DUPLICATE' })
    }
    if (error.code === 'P2025') {
      return reply.status(404).send({ error: 'ไม่พบข้อมูลที่ต้องการ', code: 'NOT_FOUND' })
    }
  }
  if ((error as { statusCode?: number }).statusCode === 429) {
    return reply.status(429).send({ error: 'ทำรายการถี่เกินไป กรุณารอสักครู่', code: 'RATE_LIMITED' })
  }
  req.log.error(error)
  return reply.status(500).send({ error: 'เกิดข้อผิดพลาดภายในระบบ', code: 'INTERNAL_ERROR' })
})

app.get('/health', async () => ({ status: 'ok', service: 'medee-pos-api', at: new Date().toISOString() }))

await app.register(
  async (api) => {
    await api.register(authRoutes)
    await api.register(branchRoutes)
    await api.register(catalogRoutes)
    await api.register(productRoutes)
    await api.register(stockRoutes)
    await api.register(salesRoutes)
    await api.register(memberRoutes)
    await api.register(reportRoutes)
    await api.register(syncRoutes)
  },
  { prefix: '/api/v1' },
)

try {
  await app.listen({ port: env.port, host: env.host })
  app.log.info(`Medee POS API พร้อมใช้งานที่ http://${env.host}:${env.port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
