import { Decimal, dec, money, type MoneyInput } from './money.js'

/**
 * คะแนนสะสมจากบิล (หัวข้อ 7.8)
 * points = floor(ยอดขาย ÷ บาทต่อ 1 คะแนน)
 * bahtPerPoint ≤ 0 → ไม่สะสมคะแนน
 */
export function pointsEarned(grandTotal: MoneyInput, bahtPerPoint: MoneyInput): number {
  const per = dec(bahtPerPoint)
  if (per.lessThanOrEqualTo(0)) return 0
  const total = dec(grandTotal)
  if (total.lessThanOrEqualTo(0)) return 0
  return total.dividedBy(per).floor().toNumber()
}

/** ยอดคะแนนหลังบวก/หักคืน (ยกเลิกบิล → ส่ง points ติดลบ) — ไม่ต่ำกว่า 0 */
export function applyPoints(balance: number, delta: number): number {
  return Math.max(0, Math.trunc(balance) + Math.trunc(delta))
}

/** ยอดใช้จ่ายสะสมของสมาชิกหลังบิลใหม่ / หลังยกเลิกบิล */
export function applyTotalSpent(current: MoneyInput, delta: MoneyInput): string {
  const next = dec(current).plus(dec(delta))
  return money(next.lessThan(0) ? new Decimal(0) : next)
}

/** ยอดเฉลี่ยต่อบิลของสมาชิก (หน้าสรุปสมาชิก) */
export function averagePerBill(total: MoneyInput, billCount: number): string {
  if (billCount <= 0) return money(0)
  return money(dec(total).dividedBy(billCount))
}
