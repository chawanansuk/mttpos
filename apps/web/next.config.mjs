/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // packages/domain เป็น TypeScript ดิบ ต้องให้ Next คอมไพล์ให้
  transpilePackages: ['@medee/domain'],
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // @medee/domain เขียน import แบบ ESM ลงท้าย .js แต่ไฟล์จริงเป็น .ts
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4000'}/api/v1/:path*`,
      },
    ]
  },
}
export default nextConfig
