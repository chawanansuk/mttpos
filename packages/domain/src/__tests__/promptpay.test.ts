import { describe, expect, it } from 'vitest'
import { crc16, detectPromptPayIdType, formatPromptPayId, promptPayPayload, verifyPromptPayPayload } from '../promptpay.js'

describe('PromptPay QR (EMVCo)', () => {
  it('CRC-16/CCITT-FALSE ตรงกับค่าอ้างอิง', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('จัดรูปเบอร์มือถือเป็น 0066XXXXXXXXX', () => {
    expect(formatPromptPayId('0616629659')).toEqual({ tag: '01', value: '0066616629659' })
    expect(formatPromptPayId('061-662-9659')).toEqual({ tag: '01', value: '0066616629659' })
  })

  it('เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก', () => {
    expect(formatPromptPayId('1234567890123')).toEqual({ tag: '02', value: '1234567890123' })
  })

  it('e-wallet 15 หลัก', () => {
    expect(formatPromptPayId('012345678901234')).toEqual({ tag: '03', value: '012345678901234' })
  })

  it('เดาประเภทจากจำนวนหลัก', () => {
    expect(detectPromptPayIdType('0616629659')).toBe('mobile')
    expect(detectPromptPayIdType('1234567890123')).toBe('nationalId')
    expect(detectPromptPayIdType('012345678901234')).toBe('ewallet')
    expect(detectPromptPayIdType('123')).toBeNull()
  })

  it('QR แบบมียอดเงิน → Point of Initiation = 12 และ CRC ถูกต้อง', () => {
    const payload = promptPayPayload({ promptPayId: '0616629659', amount: '680.00' })
    expect(payload.startsWith('000201010212')).toBe(true)
    expect(payload).toContain('29370016A000000677010111') // merchant account info
    expect(payload).toContain('5303764')                  // สกุลเงิน THB
    expect(payload).toContain('5406680.00')               // ยอดเงิน
    expect(payload).toContain('5802TH')
    expect(verifyPromptPayPayload(payload)).toBe(true)
  })

  it('QR แบบคงที่ (ไม่ระบุยอด) → Point of Initiation = 11 และไม่มี tag 54', () => {
    const payload = promptPayPayload({ promptPayId: '0616629659' })
    expect(payload.startsWith('000201010211')).toBe(true)
    expect(payload).not.toContain('5406')
    expect(verifyPromptPayPayload(payload)).toBe(true)
  })

  it('ชื่อร้านภาษาไทยถูกตัดออก (มาตรฐานรองรับเฉพาะ ASCII)', () => {
    const payload = promptPayPayload({
      promptPayId: '0616629659', amount: '100', merchantName: 'มีดีทวีคูณ', merchantCity: 'Bangkok',
    })
    expect(payload).toContain('6007Bangkok')
    expect(verifyPromptPayPayload(payload)).toBe(true)
  })

  it('payload ที่ถูกแก้ไข → ตรวจ CRC ไม่ผ่าน', () => {
    const payload = promptPayPayload({ promptPayId: '0616629659', amount: '680.00' })
    expect(verifyPromptPayPayload(payload.replace('680.00', '999.00'))).toBe(false)
  })
})
