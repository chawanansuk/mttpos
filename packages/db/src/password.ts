import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

/**
 * แฮชรหัสผ่าน/PIN ด้วย scrypt ของ node:crypto
 *
 * เดิมใช้ argon2 ซึ่งเป็น native addon จึงแพ็กลง serverless ไม่ได้
 * scrypt เป็น memory-hard KDF ที่ติดมากับ Node อยู่แล้ว ไม่ต้องคอมไพล์อะไรเพิ่ม
 * พารามิเตอร์ N=16384, r=8, p=1 ใช้หน่วยความจำ 16 MB ต่อการแฮชหนึ่งครั้ง
 * (อยู่ใต้ maxmem ค่าเริ่มต้น 32 MB ของ Node)
 */
const PARAMS = { N: 16_384, r: 8, p: 1 } as const
const KEY_LENGTH = 32
const SALT_LENGTH = 16

/** รูปแบบที่เก็บลงฐานข้อมูล: scrypt$N$r$p$saltBase64$hashBase64 */
export async function hash(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(plain.normalize('NFKC'), salt, KEY_LENGTH, PARAMS)
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/** ตรวจรหัสผ่าน — เทียบแบบ timing-safe และคืน false เสมอเมื่อรูปแบบผิด */
export async function verify(stored: string, plain: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, n, r, p, saltB64, hashB64] = parts
  const options = { N: Number(n), r: Number(r), p: Number(p) }
  if (!Number.isFinite(options.N) || !Number.isFinite(options.r) || !Number.isFinite(options.p)) {
    return false
  }

  const expected = Buffer.from(hashB64, 'base64')
  if (expected.length === 0) return false

  const derived = await scrypt(
    plain.normalize('NFKC'),
    Buffer.from(saltB64, 'base64'),
    expected.length,
    options,
  ).catch(() => null)

  return derived ? timingSafeEqual(derived, expected) : false
}

export default { hash, verify }
