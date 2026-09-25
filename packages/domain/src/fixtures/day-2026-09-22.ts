/**
 * Fixture วันขาย 22/09/2026 ของร้านมีดีทวีคูณ สาขาสำเพ็ง (หัวข้อ 10.10)
 * เครื่อง 002 · cashier1 · ชำระเงินสดทุกบิล · รอบขายเปิด 21/09 15:44 เงินทอนเริ่มต้น 4,210
 *
 * ตัวเลขที่ต้องได้ (หัวข้อ 12 ข้อ 13, วัดจาก 21 บิลแรก PS002006881–PS002006901):
 *   ยอดขาย 4,755.00 · กำไร 1,625.02 · ส่วนลด 305.00 · 20 บิล · เฉลี่ย/บิล 237.75
 *   รวมก่อนลด 5,060.00 · ยกเลิก 1 บิล มูลค่า 195.00
 * ทั้งวัน (รวม PS002006902–6904) ยอดขาย 5,155.00 · รวมก่อนลด 5,460.00 (หัวข้อ 6.6)
 */
import { FIXTURE_PRODUCT_BY_KEY } from './products.js'

export interface FixtureLine {
  /** key ของสินค้าใน FIXTURE_PRODUCTS */
  product: string
  qty: number
  /** ส่วนลดรายการ (จำนวนเงิน) */
  discount?: string
  /** ราคาขายจริงของบิลนี้ เมื่อไม่ใช่ราคาปกติ (เช่น ขายส่ง) */
  unitPrice?: string
}

export interface FixtureBill {
  receiptNo: string
  /** เวลาท้องถิ่น Asia/Bangkok */
  soldAt: string
  lines: FixtureLine[]
  status: 'ปกติ' | 'ยกเลิก'
  voidedAt?: string
  voidReason?: string
  memberKey?: string
  /** true = อยู่นอกช่วง "21 บิลแรก" ที่ใช้เทียบตัวเลขรายงานสรุป */
  afterSnapshot?: boolean
}

export const CASH_ROUND_OPENING = '4210.00'
export const CASH_ROUND_OPENED_AT = '2026-09-21T15:44:00+07:00'

export const DAY_2026_09_22: FixtureBill[] = [
  { receiptNo: 'PS002006881', soldAt: '2026-09-22T08:21:20+07:00', status: 'ปกติ',
    lines: [{ product: '5CR13', qty: 1 }, { product: 'KIWI512', qty: 1 }, { product: 'judgas', qty: 2 }] },
  { receiptNo: 'PS002006882', soldAt: '2026-09-22T08:29:56+07:00', status: 'ปกติ',
    lines: [{ product: 'KIWI21', qty: 1 }, { product: 'judgas', qty: 2 }, { product: 'w860', qty: 1 }] },
  { receiptNo: 'PS002006883', soldAt: '2026-09-22T08:53:39+07:00', status: 'ปกติ',
    lines: [{ product: 'KIWI21', qty: 1 }] },
  { receiptNo: 'PS002006884', soldAt: '2026-09-22T09:09:30+07:00', status: 'ปกติ',
    lines: [{ product: 'judgas', qty: 2 }, { product: 'poysian', qty: 1 }, { product: 'w860', qty: 1 }] },
  // บิลที่ถูกยกเลิกเวลา 09:20:02 โดย cashier1 (หัวข้อ 6.6 "ยกเลิกการขาย")
  { receiptNo: 'PS002006885', soldAt: '2026-09-22T09:11:26+07:00', status: 'ยกเลิก',
    voidedAt: '2026-09-22T09:20:02+07:00', voidReason: 'ลูกค้าเปลี่ยนใจ',
    lines: [{ product: 'p60', qty: 3 }, { product: 'p5', qty: 3 }] },
  { receiptNo: 'PS002006886', soldAt: '2026-09-22T09:20:33+07:00', status: 'ปกติ',
    lines: [{ product: 'KIWI511', qty: 4 }, { product: 'KIWI477', qty: 1, discount: '15.00' }, { product: 'maxpeeler', qty: 1 }] },
  { receiptNo: 'PS002006887', soldAt: '2026-09-22T09:32:05+07:00', status: 'ปกติ',
    lines: [{ product: 'w860', qty: 1 }] },
  { receiptNo: 'PS002006888', soldAt: '2026-09-22T09:33:42+07:00', status: 'ปกติ',
    lines: [{ product: 'KIWI195', qty: 2 }, { product: 'KIWI512', qty: 1 }] },
  // บิลตัวอย่างในหัวข้อ 6.3 — ขายส่งให้ลูกค้าประจำ ลดราคารายชิ้น
  { receiptNo: 'PS002006889', soldAt: '2026-09-22T09:36:14+07:00', status: 'ปกติ',
    lines: [
      { product: 'KIWI512', qty: 6, discount: '60.00' },
      { product: 'KIWI502', qty: 6, discount: '80.00' },
      { product: 'KIWI001', qty: 5, discount: '50.00' },
      { product: 'KIWI850P', qty: 2, discount: '100.00' },
    ] },
  { receiptNo: 'PS002006890', soldAt: '2026-09-22T10:08:25+07:00', status: 'ปกติ',
    lines: [{ product: 'KIWI477', qty: 2 }, { product: 'sciss', qty: 1 }] },
  { receiptNo: 'PS002006891', soldAt: '2026-09-22T10:20:48+07:00', status: 'ปกติ',
    lines: [{ product: 'poysian', qty: 1 }] },
  { receiptNo: 'PS002006892', soldAt: '2026-09-22T10:24:54+07:00', status: 'ปกติ',
    lines: [
      { product: '5CR13', qty: 1 }, { product: 'KIWI21', qty: 1 }, { product: 'KIWI195', qty: 1 },
      { product: 'KIWI474', qty: 1 }, { product: 'AntChalk', qty: 3 }, { product: 'buga', qty: 1 },
      { product: 'judgas', qty: 2 }, { product: 'p10', qty: 2 }, { product: 'poysian', qty: 2 },
    ] },
  { receiptNo: 'PS002006893', soldAt: '2026-09-22T10:40:09+07:00', status: 'ปกติ',
    lines: [{ product: 'w0617', qty: 1 }] },
  { receiptNo: 'PS002006894', soldAt: '2026-09-22T10:52:23+07:00', status: 'ปกติ',
    lines: [{ product: 'brushwood', qty: 1 }, { product: 'buga', qty: 1 }, { product: 'poysian', qty: 2 }, { product: 'AntChalk', qty: 1 }] },
  { receiptNo: 'PS002006895', soldAt: '2026-09-22T10:53:06+07:00', status: 'ปกติ',
    lines: [{ product: 'elephant', qty: 4 }, { product: 'firelighter', qty: 4 }, { product: 'poysian', qty: 1 }, { product: 'w0617', qty: 1 }] },
  { receiptNo: 'PS002006896', soldAt: '2026-09-22T10:57:31+07:00', status: 'ปกติ',
    lines: [{ product: 'KIWI172', qty: 2 }, { product: 'hook', qty: 2 }, { product: 'judgas', qty: 2 }, { product: 'p30', qty: 1 }, { product: 'poysian', qty: 6 }] },
  { receiptNo: 'PS002006897', soldAt: '2026-09-22T11:35:26+07:00', status: 'ปกติ',
    lines: [{ product: 'brushwood', qty: 2 }, { product: 'buga', qty: 1 }] },
  { receiptNo: 'PS002006898', soldAt: '2026-09-22T11:45:31+07:00', status: 'ปกติ',
    lines: [{ product: 'judgas', qty: 2 }, { product: 'poysian', qty: 2 }] },
  { receiptNo: 'PS002006899', soldAt: '2026-09-22T11:48:00+07:00', status: 'ปกติ',
    lines: [{ product: 'poysian', qty: 1 }] },
  // ขายส่ง hongthai3cc 12 ชิ้น ราคาส่ง 25 (หัวข้อ 6.6)
  { receiptNo: 'PS002006900', soldAt: '2026-09-22T12:16:11+07:00', status: 'ปกติ',
    lines: [{ product: 'hongthai3cc', qty: 12, unitPrice: '25.00' }, { product: 'Hanuman5g', qty: 3 }, { product: 'packHanuman', qty: 1 }, { product: 'ExtendableMttGas', qty: 2 }] },
  { receiptNo: 'PS002006901', soldAt: '2026-09-22T12:44:41+07:00', status: 'ปกติ', memberKey: 'vip p',
    lines: [{ product: 'solder', qty: 2 }] },

  // ---- หลังช่วง snapshot 21 บิลแรก ----
  { receiptNo: 'PS002006902', soldAt: '2026-09-22T13:30:24+07:00', status: 'ปกติ', afterSnapshot: true,
    lines: [{ product: 'hongthai10g', qty: 2 }] },
  { receiptNo: 'PS002006903', soldAt: '2026-09-22T14:44:08+07:00', status: 'ปกติ', afterSnapshot: true,
    lines: [{ product: 'bidetset', qty: 1 }, { product: 'bidetsl', qty: 1 }] },
  { receiptNo: 'PS002006904', soldAt: '2026-09-22T14:48:34+07:00', status: 'ปกติ', afterSnapshot: true,
    lines: [{ product: 'scifB5022', qty: 1 }] },
]

/** แปลง fixture line เป็น input ของ calculateBill */
export function fixtureLineToItem(line: FixtureLine) {
  const p = FIXTURE_PRODUCT_BY_KEY.get(line.product)
  if (!p) throw new Error(`ไม่พบสินค้าใน fixture: ${line.product}`)
  return {
    key: `${line.product}`,
    barcode: p.barcode,
    name: p.name,
    unitName: p.unit,
    ratio: 1,
    qty: line.qty,
    unitPrice: line.unitPrice ?? p.price,
    cost: p.cost,
    itemDiscount: line.discount ?? '0',
    itemDiscountType: 'amount' as const,
    vatType: p.vatType,
  }
}

/** บิลทั้งหมดของวัน (รวมบิลยกเลิก) */
export const DAY_BILLS_ALL = DAY_2026_09_22
/** เฉพาะ 21 บิลแรก — ใช้เทียบตัวเลขรายงานสรุปในสเปก */
export const DAY_BILLS_SNAPSHOT = DAY_2026_09_22.filter((b) => !b.afterSnapshot)
