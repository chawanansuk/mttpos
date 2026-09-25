/**
 * PromptPay QR (EMVCo) — ใช้บนหน้าชำระเงินและท้ายใบเสร็จ (หัวข้อ 2.1 / 8.1)
 * สร้าง payload string ให้ฝั่ง UI นำไป render เป็น QR
 */
import { dec, round2, type MoneyInput } from './money.js'

const PAYLOAD_FORMAT = '00'
const POINT_OF_INITIATION = '01'
const MERCHANT_INFO_PROMPTPAY = '29'
const CURRENCY = '53'
const AMOUNT = '54'
const COUNTRY = '58'
const MERCHANT_NAME = '59'
const MERCHANT_CITY = '60'
const CRC = '63'

const AID_PROMPTPAY = 'A000000677010111'

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) ตามมาตรฐาน EMVCo */
export function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export type PromptPayIdType = 'mobile' | 'nationalId' | 'ewallet'

/** เดาประเภทของเลขพร้อมเพย์จากจำนวนหลัก */
export function detectPromptPayIdType(id: string): PromptPayIdType | null {
  const digits = id.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 9) return 'mobile'
  if (digits.length === 13) return digits.startsWith('0066') ? 'mobile' : 'nationalId'
  if (digits.length === 15) return 'ewallet'
  return null
}

/** จัดรูปเลขพร้อมเพย์ให้ตรงมาตรฐาน (เบอร์มือถือ → 0066XXXXXXXXX) */
export function formatPromptPayId(id: string, type?: PromptPayIdType): { tag: string; value: string } {
  const digits = id.replace(/\D/g, '')
  const kind = type ?? detectPromptPayIdType(digits)
  if (kind === 'mobile') {
    const local = digits.startsWith('0066') ? digits.slice(4) : digits.replace(/^0/, '')
    return { tag: '01', value: `0066${local.padStart(9, '0')}` }
  }
  if (kind === 'ewallet') return { tag: '03', value: digits.padStart(15, '0') }
  return { tag: '02', value: digits.padStart(13, '0') }
}

export interface PromptPayPayloadOptions {
  /** เลขพร้อมเพย์ของร้าน (เบอร์มือถือ / เลขบัตรประชาชน / เลขผู้เสียภาษี / e-wallet) */
  promptPayId: string
  idType?: PromptPayIdType
  /** ยอดเงิน — ไม่ใส่ = QR แบบคงที่ (ลูกค้ากรอกเอง) */
  amount?: MoneyInput | null
  merchantName?: string
  merchantCity?: string
}

/**
 * สร้าง EMVCo payload สำหรับ PromptPay
 * มียอดเงิน → Point of Initiation = 12 (dynamic, ใช้ครั้งเดียว)
 * ไม่มียอดเงิน → 11 (static)
 */
export function promptPayPayload(options: PromptPayPayloadOptions): string {
  const { tag, value } = formatPromptPayId(options.promptPayId, options.idType)
  const hasAmount =
    options.amount !== null && options.amount !== undefined && dec(options.amount).greaterThan(0)

  const merchantInfo = tlv('00', AID_PROMPTPAY) + tlv(tag, value)

  let payload =
    tlv(PAYLOAD_FORMAT, '01') +
    tlv(POINT_OF_INITIATION, hasAmount ? '12' : '11') +
    tlv(MERCHANT_INFO_PROMPTPAY, merchantInfo) +
    tlv(CURRENCY, '764')

  if (hasAmount) payload += tlv(AMOUNT, round2(options.amount!).toFixed(2))
  payload += tlv(COUNTRY, 'TH')

  // ชื่อ/เมืองร้าน รองรับเฉพาะอักขระ ASCII ตามมาตรฐาน
  const name = (options.merchantName ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 25)
  if (name) payload += tlv(MERCHANT_NAME, name)
  const city = (options.merchantCity ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 15)
  if (city) payload += tlv(MERCHANT_CITY, city)

  const withCrcTag = `${payload}${CRC}04`
  return `${withCrcTag}${crc16(withCrcTag)}`
}

/** ตรวจว่า payload ที่ได้รับมี CRC ถูกต้อง */
export function verifyPromptPayPayload(payload: string): boolean {
  if (payload.length < 8) return false
  const body = payload.slice(0, -4)
  const expected = payload.slice(-4).toUpperCase()
  if (!body.endsWith(`${CRC}04`)) return false
  return crc16(body) === expected
}
