import { config } from 'node:process'

void config

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`ต้องตั้งค่า environment variable: ${name}`)
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  host: process.env.API_HOST ?? '0.0.0.0',
  jwtSecret: required('JWT_SECRET', 'medee-pos-dev-secret-change-in-production'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'medee-pos-dev-refresh-secret'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '2h',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
}
