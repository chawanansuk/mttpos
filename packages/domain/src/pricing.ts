import { Decimal, dec, money, round2, type MoneyInput } from './money.js'
import type { PriceChannel } from './types.js'

/** ขั้นราคาเพิ่มเติม (หัวข้อ 6.9.2 "ราคาขายเพิ่มเติม") */
export interface StepPrice {
  /** จำนวนขั้นต่ำที่จะได้ราคานี้ */
  minQty: number | string
  /** ราคาขายของ "ทั้งชุด" ที่จำนวน minQty */
  price: MoneyInput
}

/**
 * เลือกราคาต่อหน่วยตาม step price (หัวข้อ 7.4)
 * เมื่อ qty ≥ min_qty ของขั้นสูงสุดที่ถึง → unit_price = step.price ÷ step.min_qty
 * ถ้ายังไม่ถึงขั้นใด → ใช้ราคาปกติ
 */
export function resolveStepUnitPrice(
  basePrice: MoneyInput,
  qty: MoneyInput,
  steps: StepPrice[] | undefined | null,
): string {
  const q = dec(qty)
  if (!steps?.length || q.lessThanOrEqualTo(0)) return money(basePrice)

  const applicable = steps
    .map((s) => ({ minQty: dec(s.minQty), price: dec(s.price) }))
    .filter((s) => s.minQty.greaterThan(0) && q.greaterThanOrEqualTo(s.minQty))
    .sort((a, b) => b.minQty.comparedTo(a.minQty))

  const best = applicable[0]
  if (!best) return money(basePrice)
  return money(best.price.dividedBy(best.minQty))
}

/** ราคาต่อหน่วยที่คำนวณอัตโนมัติในตาราง "ราคาขายเพิ่มเติม" */
export function stepUnitPrice(price: MoneyInput, minQty: MoneyInput): string {
  const q = dec(minQty)
  if (q.lessThanOrEqualTo(0)) return money(0)
  return money(dec(price).dividedBy(q))
}

export interface ChannelPrice {
  channel: PriceChannel
  enabled: boolean
  price: MoneyInput
}

/**
 * เลือกราคาตามช่องทาง (หัวข้อ 7.4)
 * ลำดับ: ช่องทางที่ระบุ (ถ้าเปิดและมีราคา) → ราคาขายปกติหน้าร้าน
 * หมายเหตุ: ราคาช่องทางไม่ใช่ส่วนลด — ใช้แทน unit_price ไปเลย (หัวข้อ 7.2)
 */
export function resolveChannelPrice(
  retailPrice: MoneyInput,
  channel: PriceChannel | undefined | null,
  channelPrices: ChannelPrice[] | undefined | null,
): string {
  if (!channel || channel === 'retail') return money(retailPrice)
  const hit = channelPrices?.find((c) => c.channel === channel && c.enabled)
  if (!hit) return money(retailPrice)
  const p = dec(hit.price)
  return p.greaterThan(0) ? money(p) : money(retailPrice)
}

/** ส่วนต่างราคาช่องทางเทียบราคาปกติ (แสดงบนการ์ด "ช่องทางการขาย") */
export function channelPriceDiff(retailPrice: MoneyInput, channelPrice: MoneyInput): string {
  return money(dec(channelPrice).minus(dec(retailPrice)))
}

/**
 * คำนวณยอดตามช่องทางเดลิเวอรี่สำหรับรายงาน "ยอดขายตามช่องทางการขาย" (หัวข้อ 7.4)
 * ค่า GP = ก่อนหัก GP × gp% / 100 ; ยอดขาย = ก่อนหัก GP − ค่า GP
 */
export function applyGp(grossAmount: MoneyInput, gpPercent: MoneyInput) {
  const gross = round2(grossAmount)
  const gp = round2(gross.times(dec(gpPercent)).dividedBy(100))
  return { gross: money(gross), gpAmount: money(gp), net: money(gross.minus(gp)) }
}

/** ต้นทุนรวมของสินค้าประกอบ (BOM) = Σ(ต้นทุนส่วนประกอบ × จำนวนต่อหน่วย) */
export function bomCost(components: { cost: MoneyInput; qtyPerUnit: MoneyInput }[]): string {
  return money(
    components.reduce((a, c) => a.plus(dec(c.cost).times(dec(c.qtyPerUnit))), new Decimal(0)),
  )
}
