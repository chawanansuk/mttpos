import { describe, expect, it } from 'vitest'
import { summarizeCashRound, totalCashMovements } from '../cashRound.js'
import { applyPoints, applyTotalSpent, averagePerBill, pointsEarned } from '../points.js'
import { nextQueueNumber, receiptNo, stockDocNo, taxInvoiceNo } from '../docNumbers.js'
import { businessDay, businessDayRange, formatDateBE, formatDateRangeLabel, formatDateTimeTH, zonedDateString } from '../businessDay.js'

describe('7.6 รอบการขาย', () => {
  it('รอบจริง 19/09/2026 ของเครื่อง 002 (หัวข้อ 6.6)', () => {
    // ยอดขายเงินสด 5,045 · เงินทอนเริ่มต้น 4,115 · เข้า 0 · ออก 200 · นับได้ 8,960
    const s = summarizeCashRound({
      openingCash: '4115.00', cashSales: '5045.00', cashIn: '0', cashOut: '200.00',
      countedCash: '8960.00',
    })
    expect(s.expectedCash).toBe('8960.00')
    expect(s.countedCash).toBe('8960.00')
    expect(s.difference).toBe('0.00')
  })

  it('รอบ 16/09 → 17/09 (เงินออก 115)', () => {
    const s = summarizeCashRound({
      openingCash: '4285.00', cashSales: '3189.00', cashIn: '0', cashOut: '115.00',
      countedCash: '7359.00',
    })
    expect(s.expectedCash).toBe('7359.00')
    expect(s.difference).toBe('0.00')
  })

  it('รอบที่ยังไม่ปิด → นับได้/ส่วนต่างเป็น null (รายงานแสดง "-")', () => {
    const s = summarizeCashRound({ openingCash: '4210.00', cashSales: '3260.00', cashIn: 0, cashOut: 0 })
    expect(s.expectedCash).toBe('7470.00')
    expect(s.countedCash).toBeNull()
    expect(s.difference).toBeNull()
  })

  it('เงินขาด/เกินแสดงเป็นส่วนต่าง', () => {
    const short = summarizeCashRound({ openingCash: '1000', cashSales: '500', cashIn: 0, cashOut: 0, countedCash: '1480' })
    expect(short.difference).toBe('-20.00')
    const over = summarizeCashRound({ openingCash: '1000', cashSales: '500', cashIn: 0, cashOut: 0, countedCash: '1505' })
    expect(over.difference).toBe('5.00')
  })

  it('รวมรายการนำเงินเข้า-ออกจริงของร้าน (หัวข้อ 6.6)', () => {
    const t = totalCashMovements([
      { type: 'OUT', amount: '190.00' }, // ยอดโอนเมื่อวันที่22\08
      { type: 'OUT', amount: '200.00' },
      { type: 'OUT', amount: '260.00' }, // ไทยช่วยไทยหลังปิดยอด
      { type: 'IN', amount: '500.00' },
    ])
    expect(t).toEqual({ cashIn: '500.00', cashOut: '650.00' })
  })
})

describe('7.8 สมาชิก / คะแนน', () => {
  it('คะแนนสะสม = floor(ยอดขาย ÷ บาทต่อคะแนน)', () => {
    expect(pointsEarned('680.00', 100)).toBe(6)
    expect(pointsEarned('99.99', 100)).toBe(0)
    expect(pointsEarned('1000.00', 100)).toBe(10)
  })

  it('ไม่ตั้งค่าบาทต่อคะแนน → ไม่สะสม', () => {
    expect(pointsEarned('680.00', 0)).toBe(0)
  })

  it('ยกเลิกบิล → หักคะแนนคืน และไม่ติดลบ', () => {
    expect(applyPoints(10, -6)).toBe(4)
    expect(applyPoints(3, -6)).toBe(0)
  })

  it('ยอดใช้จ่ายสะสมปรับตามบิลและการยกเลิก', () => {
    expect(applyTotalSpent('73804.00', '120.00')).toBe('73924.00') // vip p หลังบิล PS002006901
    expect(applyTotalSpent('100.00', '-500.00')).toBe('0.00')
  })

  it('เฉลี่ยต่อบิลของสมาชิก vip p (หัวข้อ 6.12)', () => {
    expect(averagePerBill('173918.87', 174)).toBe('999.53')
    expect(averagePerBill('0', 0)).toBe('0.00')
  })
})

describe('7.9 เลขเอกสารรัน', () => {
  it('บิลขาย PS + posNumber(3) + running(6)', () => {
    expect(receiptNo('002', 6889)).toBe('PS002006889')
    expect(receiptNo('002', 6906)).toBe('PS002006906')
    expect(receiptNo('001', 4608)).toBe('PS001004608')
    expect(receiptNo('1', 1)).toBe('PS001000001')
  })

  it('ใบกำกับภาษีเต็มรูป IV + YYMM + running(4)', () => {
    expect(taxInvoiceNo(new Date('2026-09-22T00:00:00Z'), 1)).toBe('IV2609-0001')
    expect(taxInvoiceNo(new Date('2026-12-01T00:00:00Z'), 123)).toBe('IV2612-0123')
  })

  it('เอกสารคลัง prefix + running(7)', () => {
    expect(stockDocNo('receive', 756)).toBe('RCV0000756')
    expect(stockDocNo('issue', 131)).toBe('ISS0000131')
    expect(stockDocNo('adjustInc', 66)).toBe('ADJI0000066')
    expect(stockDocNo('adjustDec', 38)).toBe('ADJD0000038')
    expect(stockDocNo('count', 1)).toBe('CNT0000001')
    expect(stockDocNo('transferOut', 1)).toBe('TO0000001')
    expect(stockDocNo('transferIn', 1)).toBe('TI0000001')
    expect(stockDocNo('productReturn', 1)).toBe('RT0000001')
  })

  it('คิวลูกค้ารันรายวันและรีเซ็ตเมื่อข้ามวัน', () => {
    expect(nextQueueNumber(23, '2026-09-22', '2026-09-22')).toEqual({ queue: 24, queueDate: '2026-09-22' })
    expect(nextQueueNumber(23, '2026-09-22', '2026-09-23')).toEqual({ queue: 1, queueDate: '2026-09-23' })
    expect(nextQueueNumber(0, null, '2026-09-23')).toEqual({ queue: 1, queueDate: '2026-09-23' })
  })
})

describe('7.6 วันขาย (business day)', () => {
  const shopeng = { openTime: '00:00', closeTime: '23:59', timeZone: 'Asia/Bangkok' }

  it('ร้านมีดีทวีคูณ (00:00–23:59) → วันขาย = วันปฏิทินไทย', () => {
    expect(businessDay(new Date('2026-09-22T02:36:14Z'), shopeng)).toBe('2026-09-22') // 09:36 เวลาไทย
    expect(businessDay(new Date('2026-09-21T17:30:00Z'), shopeng)).toBe('2026-09-22') // 00:30 เวลาไทย
  })

  it('ร้านที่ปิดหลังเที่ยงคืน (18:00–02:00) → บิลตี 1 นับเป็นวันก่อนหน้า', () => {
    const bar = { openTime: '18:00', closeTime: '02:00', timeZone: 'Asia/Bangkok' }
    // 18:00Z = 01:00 ของวันที่ 23 ตามเวลาไทย → ยังไม่ถึงเวลาเปิด 18:00 จึงเป็นวันขายที่ 22
    expect(businessDay(new Date('2026-09-22T18:00:00Z'), bar)).toBe('2026-09-22')
    // 13:00Z = 20:00 ของวันที่ 22 ตามเวลาไทย → หลังเวลาเปิด จึงเป็นวันขายที่ 22
    expect(businessDay(new Date('2026-09-22T13:00:00Z'), bar)).toBe('2026-09-22')
    // 06:00Z = 13:00 ของวันที่ 23 ตามเวลาไทย → ยังไม่ถึง 18:00 จึงยังเป็นวันขายที่ 22
    expect(businessDay(new Date('2026-09-23T06:00:00Z'), bar)).toBe('2026-09-22')
    // 12:00Z = 19:00 ของวันที่ 23 ตามเวลาไทย → เปิดรอบใหม่ เป็นวันขายที่ 23
    expect(businessDay(new Date('2026-09-23T12:00:00Z'), bar)).toBe('2026-09-23')
  })

  it('zonedDateString ใช้เวลาโซนร้าน ไม่ใช่ UTC', () => {
    expect(zonedDateString(new Date('2026-09-21T17:30:00Z'))).toBe('2026-09-22')
  })

  it('businessDayRange ครอบคลุมทั้งวันตามเวลาไทย', () => {
    const r = businessDayRange('2026-09-22', '2026-09-22', shopeng)
    expect(r.start.toISOString()).toBe('2026-09-21T17:00:00.000Z')
    expect(r.end.toISOString()).toBe('2026-09-22T17:00:00.000Z')
  })

  it('รูปแบบวันที่', () => {
    const d = new Date('2026-09-22T08:01:00Z') // 15:01 เวลาไทย
    expect(formatDateTimeTH(d)).toBe('22/09/2026 15:01:00')
    expect(formatDateBE(d)).toBe('22/09/2569') // ใบเสร็จใช้ พ.ศ.
  })

  it('บรรทัดช่วงวันที่บนหัวการ์ด', () => {
    expect(formatDateRangeLabel('2026-09-22', '2026-09-22')).toBe('วันที่ 22 กันยายน 2026')
    expect(formatDateRangeLabel('2026-08-23', '2026-09-22')).toBe(
      'วันที่ 23 สิงหาคม 2026 ถึง 22 กันยายน 2026',
    )
  })
})
