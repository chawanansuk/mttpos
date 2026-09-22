import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')

/** @type {import('next').NextConfig} */

// ตั้ง API_URL เมื่อรัน API เป็นคนละโปรเซส (dev แบบสองพอร์ต, Docker, VPS)
// ถ้าไม่ตั้ง เว็บจะให้บริการ /api/v1/* เองผ่าน route handler — ใช้ตอน deploy บน Vercel
const externalApiUrl = process.env.API_URL

const nextConfig = {
  reactStrictMode: true,
  // แพ็กเกจในเวิร์กสเปซเป็น TypeScript ดิบ ต้องให้ Next คอมไพล์ให้
  transpilePackages: ['@medee/domain', '@medee/db', '@medee/api'],
  // แพ็กเกจฝั่งเซิร์ฟเวอร์ที่ต้องโหลดจาก node_modules ตอนรัน ไม่ใช่ให้ bundler รวมเข้าไป
  // (Prisma มี query engine เป็นไบนารี ส่วน Fastify โหลดปลั๊กอินแบบไดนามิก)
  serverExternalPackages: [
    '@prisma/client',
    '.prisma/client',
    'prisma',
    'fastify',
    'light-my-request',
    'exceljs',
    'pino',
    'pino-pretty',
  ],
  eslint: { ignoreDuringBuilds: true },
  // เราอยู่ใน workspace ต้องบอก Next ว่ารากของ monorepo อยู่ตรงไหน
  // ไม่งั้นจะ trace ไฟล์นอก apps/web ไม่เจอ
  outputFileTracingRoot: repoRoot,
  // Prisma โหลด query engine เป็นไฟล์ .node ตอนรัน ซึ่ง bundler มองไม่เห็น
  // และ pnpm ยังวางไว้ใต้ .pnpm/ ที่ trace ตามลิงก์ไม่ถึง จึงต้องสั่งให้รวมเข้าไปเอง
  // ไม่งั้นจะได้ error "could not locate the Query Engine for runtime rhel-openssl-3.0.x"
  outputFileTracingIncludes: {
    '/api/v1/**': [
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*.node',
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/schema.prisma',
    ],
  },
  webpack: (config) => {
    // แพ็กเกจในเวิร์กสเปซเขียน import แบบ ESM ลงท้าย .js แต่ไฟล์จริงเป็น .ts
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
  async rewrites() {
    if (!externalApiUrl) return []
    return [
      {
        source: '/api/v1/:path*',
        destination: `${externalApiUrl}/api/v1/:path*`,
      },
    ]
  },
}
export default nextConfig
