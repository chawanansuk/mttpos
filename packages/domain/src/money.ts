import Decimal from 'decimal.js'

// เงินทุกจำนวนในระบบเก็บเป็น NUMERIC(14,2) — คำนวณด้วย Decimal เพื่อไม่ให้เพี้ยนจาก float
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type Money = Decimal
/** ค่าที่รับได้ทุกที่ที่คาดหวัง "จำนวนเงิน" */
export type MoneyInput = string | number | Decimal | null | undefined

export const ZERO = new Decimal(0)

/** แปลงค่าใด ๆ เป็น Decimal (null/undefined/"" → 0) */
export function dec(v: MoneyInput): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0)
  if (v instanceof Decimal) return v
  const d = new Decimal(v)
  if (!d.isFinite()) throw new TypeError(`ค่าตัวเลขไม่ถูกต้อง: ${String(v)}`)
  return d
}

/** ปัดเป็นทศนิยม 2 ตำแหน่ง (half-up) — ใช้กับ "เงิน" ทุกจุดที่สเปกบอกว่าปัดทศนิยม 2 */
export function round2(v: MoneyInput): Decimal {
  return dec(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

/** ปัดจำนวนสินค้าเป็นทศนิยม 3 ตำแหน่ง (รองรับขายตามน้ำหนัก) */
export function roundQty(v: MoneyInput): Decimal {
  return dec(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

/** รูปแบบสตริงที่ใช้ส่งผ่าน API / เก็บใน DB: "1234.50" */
export function money(v: MoneyInput): string {
  return round2(v).toFixed(2)
}

/** รูปแบบจำนวนสินค้า: ตัดศูนย์ท้ายทิ้ง ("6", "1.5", "0.125") */
export function qtyString(v: MoneyInput): string {
  return roundQty(v).toFixed(3).replace(/\.?0+$/, '') || '0'
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0))
}

/** ไม่ให้ต่ำกว่า 0 — ใช้กับส่วนลดที่ห้ามทำให้ยอดติดลบ */
export function clampMin(v: MoneyInput, min: MoneyInput = 0): Decimal {
  const d = dec(v)
  const m = dec(min)
  return d.lessThan(m) ? m : d
}

/** แสดงผลแบบไทย: 1,234.50 */
export function formatTHB(v: MoneyInput, withSymbol = false): string {
  const s = round2(v)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return withSymbol ? `฿ ${s}` : s
}

export { Decimal }
