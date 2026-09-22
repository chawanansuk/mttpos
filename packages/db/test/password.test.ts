import { describe, expect, it } from 'vitest'
import { hash, verify } from '../src/password.js'

describe('แฮชรหัสผ่าน (scrypt)', () => {
  it('ตรวจรหัสผ่านที่ถูกต้องผ่าน', async () => {
    const stored = await hash('0000')
    expect(await verify(stored, '0000')).toBe(true)
  })

  it('ปฏิเสธรหัสผ่านที่ผิด', async () => {
    const stored = await hash('0000')
    expect(await verify(stored, '0001')).toBe(false)
    expect(await verify(stored, '')).toBe(false)
    expect(await verify(stored, '0000 ')).toBe(false)
  })

  it('ใช้ salt ใหม่ทุกครั้ง แฮชเดิมจึงไม่ซ้ำกัน', async () => {
    const a = await hash('1111')
    const b = await hash('1111')
    expect(a).not.toBe(b)
    expect(await verify(a, '1111')).toBe(true)
    expect(await verify(b, '1111')).toBe(true)
  })

  it('เก็บในรูปแบบ scrypt$N$r$p$salt$hash', async () => {
    const stored = await hash('0000')
    const parts = stored.split('$')
    expect(parts).toHaveLength(6)
    expect(parts[0]).toBe('scrypt')
    expect(Number(parts[1])).toBe(16_384)
    expect(Buffer.from(parts[5], 'base64')).toHaveLength(32)
  })

  it('คืน false แทนการโยน error เมื่อค่าที่เก็บไว้เสียรูป', async () => {
    for (const bad of ['', 'not-a-hash', 'scrypt$a$b$c$d$e', 'argon2$16384$8$1$x$y', 'scrypt$16384$8$1$$']) {
      expect(await verify(bad, '0000')).toBe(false)
    }
  })

  it('รองรับรหัสผ่านภาษาไทยและอีโมจิ', async () => {
    const stored = await hash('รหัสผ่านร้านมีดี🔐')
    expect(await verify(stored, 'รหัสผ่านร้านมีดี🔐')).toBe(true)
    expect(await verify(stored, 'รหัสผ่านร้านมีดี')).toBe(false)
  })
})
