import { Decimal, dec, money, qtyString, round2, roundQty, type MoneyInput } from './money.js'

/** ประเภทความเคลื่อนไหวสินค้า (หัวข้อ 4.5 / 6.10.1) */
export type MovementType =
  | 'SALE'
  | 'VOID'
  | 'RECEIVE'
  | 'ISSUE'
  | 'ADJUST_INC'
  | 'ADJUST_DEC'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'RETURN'
  | 'COUNT'

/** ป้ายชื่อภาษาไทยของประเภทความเคลื่อนไหว (คอลัมน์ "ประเภท" ในหน้าความเคลื่อนไหวสินค้า) */
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  SALE: 'ขายออก',
  VOID: 'ยกเลิกการขาย',
  RECEIVE: 'รับสินค้าเข้า',
  ISSUE: 'จ่ายสินค้าออก',
  ADJUST_INC: 'ปรับปรุงเพิ่ม',
  ADJUST_DEC: 'ปรับปรุงลด',
  TRANSFER_OUT: 'โอนออก',
  TRANSFER_IN: 'รับโอน',
  RETURN: 'ตีกลับ',
  COUNT: 'ตรวจนับ',
}

/** ทิศทางของแต่ละประเภท: +1 เพิ่มสต็อก, −1 ลดสต็อก, 0 ไม่กระทบ */
export function movementSign(type: MovementType): number {
  switch (type) {
    case 'RECEIVE':
    case 'VOID':
    case 'ADJUST_INC':
    case 'TRANSFER_IN':
    case 'RETURN':
      return 1
    case 'SALE':
    case 'ISSUE':
    case 'ADJUST_DEC':
    case 'TRANSFER_OUT':
      return -1
    case 'COUNT':
      return 0
  }
}

/** จำนวนหน่วยฐานที่ต้องตัด/เพิ่ม = qty ของ PLU × ratio (หัวข้อ 7.5) */
export function baseQty(qty: MoneyInput, ratio: MoneyInput = 1): string {
  return qtyString(roundQty(dec(qty).times(dec(ratio))))
}

/** ยอดคงเหลือใหม่หลังความเคลื่อนไหว (อนุญาตติดลบ ตามหัวข้อ 7.5) */
export function applyMovement(
  balance: MoneyInput,
  type: MovementType,
  qtyInBaseUnits: MoneyInput,
): string {
  const sign = movementSign(type)
  return qtyString(roundQty(dec(balance).plus(dec(qtyInBaseUnits).times(sign))))
}

/**
 * ต้นทุนเฉลี่ยถ่วงน้ำหนักเมื่อรับสินค้าเข้าและติ๊ก "คำนวนต้นทุนเฉลี่ย" (หัวข้อ 7.5)
 * avg = (มูลค่าคงเหลือเดิม + มูลค่ารับเข้า) ÷ (จำนวนเดิม + จำนวนรับเข้า)
 * ถ้าจำนวนรวมเป็น 0 หรือติดลบ → คงต้นทุนเดิมไว้ (กันหารศูนย์/ค่าเพี้ยน)
 */
export function weightedAverageCost(
  currentQty: MoneyInput,
  currentAvgCost: MoneyInput,
  receivedQty: MoneyInput,
  receivedUnitCost: MoneyInput,
): string {
  const q0 = dec(currentQty)
  const c0 = dec(currentAvgCost)
  const q1 = dec(receivedQty)
  const c1 = dec(receivedUnitCost)
  const totalQty = q0.plus(q1)
  if (totalQty.lessThanOrEqualTo(0)) return money(c1.greaterThan(0) ? c1 : c0)
  const totalValue = Decimal.max(q0, 0).times(c0).plus(q1.times(c1))
  return money(totalValue.dividedBy(totalQty))
}

/** สถานะสต็อกที่ใช้แสดงป้ายบนหน้าจอ/รายงาน (หัวข้อ 7.5) */
export type StockStatus = 'never_moved' | 'out_of_stock' | 'low_stock' | 'ok'

export function stockStatus(
  balance: MoneyInput,
  lowStockThreshold: MoneyInput | null | undefined,
  hasMovement: boolean,
): StockStatus {
  if (!hasMovement) return 'never_moved'
  const b = dec(balance)
  if (b.lessThanOrEqualTo(0)) return 'out_of_stock'
  const t = dec(lowStockThreshold ?? 0)
  if (t.greaterThan(0) && b.lessThanOrEqualTo(t)) return 'low_stock'
  return 'ok'
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  never_moved: 'ยังไม่มีการเคลื่อนไหว',
  out_of_stock: 'สินค้าหมด',
  low_stock: 'สินค้าเหลือน้อย',
  ok: 'ปกติ',
}

/**
 * มูลค่าสต็อกรวมสำหรับการ์ดหน้ารายงานสรุป (หัวข้อ 7.5)
 * นับเฉพาะสินค้าที่คงเหลือ > 0
 */
export function stockValuation(
  rows: { balance: MoneyInput; cost: MoneyInput; price: MoneyInput }[],
) {
  let qty = new Decimal(0)
  let costValue = new Decimal(0)
  let saleValue = new Decimal(0)
  for (const r of rows) {
    const b = dec(r.balance)
    if (b.lessThanOrEqualTo(0)) continue
    qty = qty.plus(b)
    costValue = costValue.plus(b.times(dec(r.cost)))
    saleValue = saleValue.plus(b.times(dec(r.price)))
  }
  return {
    totalQty: qtyString(qty),
    totalCost: money(round2(costValue)),
    totalSaleValue: money(round2(saleValue)),
  }
}

/** ผลต่างจากเอกสารตรวจนับ → ใช้สร้างเอกสารปรับปรุงเพิ่ม/ลด (หัวข้อ 6.10.4) */
export function countDiff(systemQty: MoneyInput, countedQty: MoneyInput) {
  const diff = roundQty(dec(countedQty).minus(dec(systemQty)))
  return {
    diff: qtyString(diff),
    movementType: (diff.greaterThan(0) ? 'ADJUST_INC' : 'ADJUST_DEC') as MovementType,
    isZero: diff.isZero(),
  }
}
