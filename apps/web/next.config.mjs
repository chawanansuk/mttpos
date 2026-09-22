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
