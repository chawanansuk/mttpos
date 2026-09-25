import { Decimal, dec, money, round2, type MoneyInput } from './money.js'

/** หมวดหมู่นำเงินเข้า-ออก ที่ใช้จริงในร้าน (หัวข้อ 5.6) */
export const CASH_IN_OUT_CATEGORIES = [
  'อื่นๆ',
  'ค่าตกแต่ง',
  'ค่าวัตถุดิบ',
  'ค่าใช้จ่ายร้าน',
  'ค่าแรง',
  'เงินโอนเข้าบัญชี',
] as const
export type CashInOutCategory = (typeof CASH_IN_OUT_CATEGORIES)[number] | string

export interface CashRoundInput {
  /** เงินทอนเริ่มต้นตอนเปิดรอบ */
  openingCash: MoneyInput
  /** ยอดขายที่ชำระด้วยเงินสดในรอบนี้ (ไม่รวมบิลที่ยกเลิก) */
  cashSales: MoneyInput
  cashIn: MoneyInput
  cashOut: MoneyInput
  /** จำนวนเงินที่นับได้ในลิ้นชัก (null = ยังไม่ปิดรอบ) */
  countedCash?: MoneyInput | null
}

export interface CashRoundSummary {
  openingCash: string
  cashSales: string
  cashIn: string
  cashOut: string
  /** "จำนวนเงินที่ควรมีในลิ้นชัก" */
  expectedCash: string
  /** "จำนวนเงินที่นับได้ในลิ้นชัก" — "-" เมื่อยังไม่ปิดรอบ */
  countedCash: string | null
  /** "ส่วนต่าง" = นับได้ − ควรมี */
  difference: string | null
}

/**
 * สรุปรอบการขาย (หัวข้อ 7.6)
 * expected = เงินทอนเริ่มต้น + ยอดขายเงินสด + เงินเข้า − เงินออก
 */
export function summarizeCashRound(input: CashRoundInput): CashRoundSummary {
  const openingCash = round2(input.openingCash)
  const cashSales = round2(input.cashSales)
  const cashIn = round2(input.cashIn)
  const cashOut = round2(input.cashOut)
  const expected = round2(openingCash.plus(cashSales).plus(cashIn).minus(cashOut))

  const hasCount = input.countedCash !== null && input.countedCash !== undefined
  const counted = hasCount ? round2(input.countedCash as MoneyInput) : null

  return {
    openingCash: money(openingCash),
    cashSales: money(cashSales),
    cashIn: money(cashIn),
    cashOut: money(cashOut),
    expectedCash: money(expected),
    countedCash: counted ? money(counted) : null,
    difference: counted ? money(counted.minus(expected)) : null,
  }
}

/** รวมรายการนำเงินเข้า/ออกของรอบ */
export function totalCashMovements(rows: { type: 'IN' | 'OUT'; amount: MoneyInput }[]) {
  let cashIn = new Decimal(0)
  let cashOut = new Decimal(0)
  for (const r of rows) {
    if (r.type === 'IN') cashIn = cashIn.plus(dec(r.amount))
    else cashOut = cashOut.plus(dec(r.amount))
  }
  return { cashIn: money(cashIn), cashOut: money(cashOut) }
}
