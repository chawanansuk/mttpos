import { describe, expect, it } from 'vitest'
import { applyGp, bomCost, channelPriceDiff, resolveChannelPrice, resolveStepUnitPrice, stepUnitPrice } from '../pricing.js'

describe('7.4 Step price (ราคาขายเพิ่มเติม)', () => {
  // ตัวอย่างหัวข้อ 6.9.2: แถวแรก 1 ชิ้น 180 (ราคาปกติ) — เพิ่มขั้น 2 ชิ้น 340, 10 ชิ้น 1,500
  const steps = [
    { minQty: 1, price: '180.00' },
    { minQty: 2, price: '340.00' },
    { minQty: 10, price: '1500.00' },
  ]

  it('ยังไม่ถึงขั้น → ราคาปกติ', () => {
    expect(resolveStepUnitPrice('180.00', 1, steps)).toBe('180.00')
  })

  it('ถึงขั้น 2 → 170.00 ต่อหน่วย', () => {
    expect(resolveStepUnitPrice('180.00', 2, steps)).toBe('170.00')
    expect(resolveStepUnitPrice('180.00', 5, steps)).toBe('170.00')
  })

  it('ถึงขั้น 10 → 150.00 ต่อหน่วย', () => {
    expect(resolveStepUnitPrice('180.00', 10, steps)).toBe('150.00')
    expect(resolveStepUnitPrice('180.00', 25, steps)).toBe('150.00')
  })

  it('ไม่มีตาราง step → ราคาปกติ', () => {
    expect(resolveStepUnitPrice('180.00', 99, null)).toBe('180.00')
    expect(resolveStepUnitPrice('180.00', 99, [])).toBe('180.00')
  })

  it('ข้อยอมรับ 12.6: step price 2 ชิ้น 49 บาท', () => {
    const s = [{ minQty: 1, price: '25.00' }, { minQty: 2, price: '49.00' }]
    expect(resolveStepUnitPrice('25.00', 2, s)).toBe('24.50')
  })

  it('ราคาขาย/หน่วย คำนวณอัตโนมัติในตาราง', () => {
    expect(stepUnitPrice('340.00', 2)).toBe('170.00')
    expect(stepUnitPrice('100.00', 3)).toBe('33.33')
    expect(stepUnitPrice('100.00', 0)).toBe('0.00')
  })
})

describe('7.4 ราคาตามช่องทาง', () => {
  // 0169a ถอดกรอง: ราคาปกติ 180 → ราคาส่งสมาชิก 140 (หัวข้อ 6.9.2)
  const channels = [
    { channel: 'member_wholesale' as const, enabled: true, price: '140.00' },
    { channel: 'promotion' as const, enabled: false, price: '160.00' },
    { channel: 'grab' as const, enabled: true, price: '250.00' },
  ]

  it('สมาชิกกลุ่มขายส่งได้ราคา 140 แทน 180', () => {
    expect(resolveChannelPrice('180.00', 'member_wholesale', channels)).toBe('140.00')
  })

  it('ช่องทางที่ปิดอยู่ → กลับไปใช้ราคาปกติ', () => {
    expect(resolveChannelPrice('180.00', 'promotion', channels)).toBe('180.00')
  })

  it('retail หรือไม่ระบุ → ราคาปกติ', () => {
    expect(resolveChannelPrice('180.00', 'retail', channels)).toBe('180.00')
    expect(resolveChannelPrice('180.00', null, channels)).toBe('180.00')
  })

  it('ส่วนต่างแสดงบนการ์ดช่องทางการขาย', () => {
    expect(channelPriceDiff('180.00', '140.00')).toBe('-40.00')
    expect(channelPriceDiff('180.00', '250.00')).toBe('70.00')
  })
})

describe('7.4 GP ของช่องทางเดลิเวอรี่', () => {
  it('Grab GP 30% — ก่อนหัก GP / ค่า GP / ยอดขาย', () => {
    expect(applyGp('1000.00', 30)).toEqual({ gross: '1000.00', gpAmount: '300.00', net: '700.00' })
  })

  it('Foodpanda GP 32%', () => {
    expect(applyGp('250.00', 32)).toEqual({ gross: '250.00', gpAmount: '80.00', net: '170.00' })
  })

  it('ขายหน้าร้าน ไม่มี GP', () => {
    expect(applyGp('122999.00', 0)).toEqual({
      gross: '122999.00', gpAmount: '0.00', net: '122999.00',
    })
  })
})

describe('ต้นทุนสินค้าประกอบ (BOM)', () => {
  it('รวมต้นทุนส่วนประกอบตามสูตร', () => {
    expect(bomCost([
      { cost: '20.00', qtyPerUnit: 2 },
      { cost: '5.50', qtyPerUnit: 4 },
    ])).toBe('62.00')
  })

  it('ไม่มีส่วนประกอบ → 0', () => {
    expect(bomCost([])).toBe('0.00')
  })
})
