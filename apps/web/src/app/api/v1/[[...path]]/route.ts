/**
 * ยก Fastify API ทั้งชุดมาให้บริการจาก Next.js
 *
 * ตอนรันแบบ Docker/VPS เว็บกับ API เป็นคนละโปรเซส และ next.config จะ rewrite
 * /api/v1/* ไปที่ API_URL แทนไฟล์นี้ แต่บน Vercel ไม่มีโปรเซสที่อยู่ค้าง
 * จึงเรียก app.inject() ของ Fastify ตรง ๆ — เป็นการยิง request เข้า router
 * โดยไม่ต้องเปิด socket จริง ทำให้ใช้ได้ในฟังก์ชัน serverless
 */
import { buildApp } from '@medee/api/app'
import type { FastifyInstance, InjectOptions } from 'fastify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** สร้าง Fastify ครั้งเดียวต่อ instance แล้วใช้ซ้ำข้าม request (warm start) */
let cached: Promise<FastifyInstance> | null = null

function getApp(): Promise<FastifyInstance> {
  if (!cached) {
    cached = buildApp({ realtime: false, rateLimit: false }).then(async (app) => {
      await app.ready()
      return app
    })
    // ถ้าสร้างไม่สำเร็จ อย่า cache ความล้มเหลวไว้ตลอด — ให้ request ถัดไปลองใหม่
    cached.catch(() => { cached = null })
  }
  return cached
}

/** header ที่ผู้รับปลายทางต้องคำนวณเอง ส่งต่อไปแล้วจะทำให้ response เพี้ยน */
const SKIP_REQUEST_HEADERS = new Set(['connection', 'content-length', 'transfer-encoding', 'host'])
const SKIP_RESPONSE_HEADERS = new Set(['connection', 'content-length', 'transfer-encoding'])

async function handle(request: Request): Promise<Response> {
  const app = await getApp()
  const url = new URL(request.url)

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) headers[key] = value
  })

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const payload = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined

  const injected = await app.inject({
    method: request.method as InjectOptions['method'],
    url: url.pathname + url.search,
    headers,
    ...(payload && payload.length > 0 ? { payload } : {}),
    remoteAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
  })

  const responseHeaders = new Headers()
  for (const [key, value] of Object.entries(injected.headers)) {
    if (value === undefined || SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) continue
    if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, String(item))
    else responseHeaders.set(key, String(value))
  }

  // 204/304 ต้องไม่มี body มิฉะนั้น Response จะโยน error
  const bodyless = injected.statusCode === 204 || injected.statusCode === 304
  // คัดลอกออกจาก Buffer ของ Node ซึ่งมาจาก pool ที่อาจถูกนำกลับไปใช้ซ้ำ
  // และ Response ก็รับเฉพาะ BodyInit (Buffer ไม่นับ) — Uint8Array ตอบโจทย์ทั้งสองข้อ
  const body = bodyless ? null : new Uint8Array(injected.rawPayload)
  return new Response(body, {
    status: injected.statusCode,
    headers: responseHeaders,
  })
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
}
