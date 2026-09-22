import { Decimal, dec, round2, type MoneyInput } from './money.js'
import type { RoundingType } from './types.js'

/**
 * ปัดเศษยอดท้ายบิลตามตั้งค่าสาขา (หัวข้อ 7.1)
 *   none    → ไม่ปัด
 *   up      → ปัดขึ้นเป็นหน่วยที่กำหนด
 *   down    → ปัดลง
 *   nearest → ปัดเข้าหาหน่วยที่ใกล้ที่สุด (ครึ่งหนึ่งปัดขึ้น)
 */
export function applyRounding(
  total: MoneyInput,
  type: RoundingType = 'none',
  unit: MoneyInput = 1,
): Decimal {
  const t = round2(total)
  const u = dec(unit)
  if (type === 'none' || u.lessThanOrEqualTo(0)) return t

  const steps = t.dividedBy(u)
  switch (type) {
    case 'up':
      return round2(steps.toDecimalPlaces(0, Decimal.ROUND_CEIL).times(u))
    case 'down':
      return round2(steps.toDecimalPlaces(0, Decimal.ROUND_FLOOR).times(u))
    case 'nearest':
      return round2(steps.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(u))
    default:
      return t
  }
}

/** ส่วนต่างจากการปัดเศษ (คอลัมน์ "ปัดเศษ") = ยอดหลังปัด − ยอดก่อนปัด */
export function roundingDiff(
  total: MoneyInput,
  type: RoundingType = 'none',
  unit: MoneyInput = 1,
): Decimal {
  return round2(applyRounding(total, type, unit).minus(round2(total)))
}
