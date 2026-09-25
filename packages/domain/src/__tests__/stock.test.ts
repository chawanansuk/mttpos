import { describe, expect, it } from 'vitest'
import {
  applyMovement, baseQty, countDiff, movementSign, stockStatus, stockValuation, weightedAverageCost,
} from '../stock.js'

describe('7.5 สต็อกและหน่วยบรรจุ', () => {
  it('PLU ratio 10 → ขาย 2 แพ็ค ตัดสต็อก 20 หน่วยฐาน', () => {
    expect(baseQty(2, 10)).toBe('20')
    expect(baseQty(1)).toBe('1')
    expect(baseQty('1.5', 1)).toBe('1.5') // ขายตามน้ำหนัก
  })

  it('ทิศทางของแต่ละประเภทเอกสาร', () => {
    expect(movementSign('SALE')).toBe(-1)
    expect(movementSign('VOID')).toBe(1)
    expect(movementSign('RECEIVE')).toBe(1)
    expect(movementSign('ISSUE')).toBe(-1)
    expect(movementSign('ADJUST_INC')).toBe(1)
    expect(movementSign('ADJUST_DEC')).toBe(-1)
    expect(movementSign('TRANSFER_OUT')).toBe(-1)
    expect(movementSign('TRANSFER_IN')).toBe(1)
    expect(movementSign('COUNT')).toBe(0) // เอกสารตรวจนับไม่กระทบสต็อก (หัวข้อ 6.10.5)
  })

  it('stock card ของ 0169a ถอดกรอง เดินยอดถูกต้อง (หัวข้อ 6.10.1)', () => {
    // 23/04/2025 รับเข้า 5 → 26/04/2025 รับเข้า 2 → ขาย 1 → ขาย 1 → 14/01/2026 รับเข้า 3 → ขาย 1
    let bal = '0'
    bal = applyMovement(bal, 'RECEIVE', 5)
    bal = applyMovement(bal, 'RECEIVE', 2)
    bal = applyMovement(bal, 'SALE', 1)
    bal = applyMovement(bal, 'SALE', 1)
    bal = applyMovement(bal, 'RECEIVE', 3)
    bal = applyMovement(bal, 'SALE', 1)
    expect(bal).toBe('7') // คงเหลือ 7 ตามหน้าสินค้าคงเหลือตาม SKU
  })

  it('อนุญาตสต็อกติดลบ (ร้านนี้สินค้า "10" คงเหลือ -1,665)', () => {
    expect(applyMovement('-1664', 'SALE', 1)).toBe('-1665')
  })

  it('ยกเลิกบิลคืนสต็อก', () => {
    expect(applyMovement('10', 'VOID', 3)).toBe('13')
  })
})

describe('7.5 ต้นทุนเฉลี่ย', () => {
  it('ถัวเฉลี่ยถ่วงน้ำหนักเมื่อรับเข้า', () => {
    // เดิม 10 ชิ้น @ 100 + รับเข้า 10 ชิ้น @ 120 → 110
    expect(weightedAverageCost(10, '100.00', 10, '120.00')).toBe('110.00')
  })

  it('สต็อกเดิมเป็น 0 → ใช้ต้นทุนที่รับเข้า', () => {
    expect(weightedAverageCost(0, '0.00', 5, '33.00')).toBe('33.00')
  })

  it('สต็อกเดิมติดลบ → ไม่ให้ค่าเพี้ยน (นับสต็อกเดิมเป็น 0)', () => {
    expect(weightedAverageCost(-100, '50.00', 10, '30.00')).toBe('30.00')
  })

  it('จำนวนรวมเป็น 0 → คงต้นทุนเดิม', () => {
    expect(weightedAverageCost(0, '45.00', 0, '0')).toBe('45.00')
  })
})

describe('7.5 สถานะสต็อก', () => {
  it('ยังไม่มีการเคลื่อนไหว', () => {
    expect(stockStatus(0, null, false)).toBe('never_moved')
  })
  it('สินค้าหมด เมื่อคงเหลือ ≤ 0', () => {
    expect(stockStatus(0, null, true)).toBe('out_of_stock')
    expect(stockStatus(-1665, null, true)).toBe('out_of_stock')
  })
  it('สินค้าเหลือน้อย เมื่อคงเหลือ ≤ เกณฑ์ที่ตั้งไว้', () => {
    expect(stockStatus(3, 5, true)).toBe('low_stock')
    expect(stockStatus(6, 5, true)).toBe('ok')
  })
  it('ไม่ตั้งเกณฑ์ (0) → ไม่แจ้งเหลือน้อย', () => {
    expect(stockStatus(1, 0, true)).toBe('ok')
  })
})

describe('7.5 มูลค่าสต็อกรวม (การ์ดหน้ารายงานสรุป)', () => {
  it('นับเฉพาะสินค้าที่คงเหลือ > 0', () => {
    const v = stockValuation([
      { balance: 10, cost: '5.00', price: '10.00' },
      { balance: -1665, cost: '5.00', price: '10.00' }, // ติดลบ ไม่นับ
      { balance: 2, cost: '2640.00', price: '3080.00' },
    ])
    expect(v.totalQty).toBe('12')
    expect(v.totalCost).toBe('5330.00')
    expect(v.totalSaleValue).toBe('6260.00')
  })
})

describe('6.10.4 ผลต่างจากเอกสารตรวจนับ', () => {
  it('นับได้มากกว่าระบบ → ปรับปรุงเพิ่ม', () => {
    expect(countDiff(10, 15)).toEqual({ diff: '5', movementType: 'ADJUST_INC', isZero: false })
  })
  it('นับได้น้อยกว่าระบบ → ปรับปรุงลด', () => {
    expect(countDiff(10, 4)).toEqual({ diff: '-6', movementType: 'ADJUST_DEC', isZero: false })
  })
  it('ตรงกัน → ไม่ต้องสร้าง movement', () => {
    expect(countDiff(10, 10).isZero).toBe(true)
  })
})
