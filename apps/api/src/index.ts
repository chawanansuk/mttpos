/**
 * รัน Medee POS API เป็นเซิร์ฟเวอร์เดี่ยว (dev, Docker, VPS)
 * ตอน deploy บน Vercel จะไม่ผ่านไฟล์นี้ — apps/web จะ import buildApp() ไปใช้แทน
 */
import { buildApp } from './app.js'
import { env } from './env.js'

const app = await buildApp()

try {
  await app.listen({ port: env.port, host: env.host })
  app.log.info(`Medee POS API พร้อมใช้งานที่ http://${env.host}:${env.port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
