import { describe, expect, it } from 'vitest'
import { resolveDatabaseUrl } from '../src/index.js'

describe('resolveDatabaseUrl', () => {
  it('เติม pgbouncer และ connection_limit เมื่อ host เป็น pooler ของ Neon', () => {
    const raw = 'postgresql://u:p@ep-abc-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
    expect(resolveDatabaseUrl(raw)).toBe(`${raw}&pgbouncer=true&connection_limit=1`)
  })

  it('เติมด้วย ? เมื่อ URL ยังไม่มี query string (pooler ของ Supabase)', () => {
    const raw = 'postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres'
    expect(resolveDatabaseUrl(raw)).toBe(`${raw}?pgbouncer=true&connection_limit=1`)
  })

  it('ไม่แตะ URL ที่ต่อตรง (localhost / Docker / URL แบบ unpooled)', () => {
    for (const raw of [
      'postgresql://medee:medee@localhost:5432/medeepos?schema=public',
      'postgresql://medee:medee@postgres:5432/medeepos',
      'postgresql://u:p@ep-abc.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    ]) expect(resolveDatabaseUrl(raw)).toBe(raw)
  })

  it('ไม่เติมซ้ำเมื่อมีพารามิเตอร์อยู่แล้ว', () => {
    const raw = 'postgresql://u:p@x.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1'
    expect(resolveDatabaseUrl(raw)).toBe(raw)
  })

  it('ไม่ทำให้รหัสผ่านที่มีอักขระพิเศษเพี้ยน', () => {
    const raw = 'postgresql://u:mM667788!!123@x-pooler.neon.tech/db'
    expect(resolveDatabaseUrl(raw)).toContain('mM667788!!123@')
  })

  it('คืน undefined เมื่อไม่ได้ตั้งค่า', () => {
    expect(resolveDatabaseUrl(undefined)).toBeUndefined()
  })
})
