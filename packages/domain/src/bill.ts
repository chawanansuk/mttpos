import { Decimal, clampMin, dec, money, qtyString, round2, roundQty } from './money.js'
import { roundingDiff } from './rounding.js'
import type {
  BillConfig,
  BillItemInput,
  BillItemOption,
  BillItemResult,
  BillTotals,
  CalculateBillInput,
  DiscountType,
} from './types.js'

/** มูลค่าตัวเลือกต่อ 1 หน่วยสินค้า = Σ(ราคาตัวเลือก × จำนวนตัวเลือก) */
export function optionUnitValue(options: BillItemOption[] | undefined): Decimal {
  if (!options?.length) return new Decimal(0)
  return options.reduce(
    (acc, o) => acc.plus(dec(o.price).times(dec(o.qty ?? 1))),
    new Decimal(0),
  )
}

/**
 * คำนวณส่วนลด (จำนวนเงิน หรือ %) — ปัดทศนิยม 2
 * @param base ฐานที่ใช้คิด % (หัวข้อ 7.1: ส่วนลดรายการคิดจาก line_subtotal ไม่รวมมูลค่าตัวเลือก)
 * @param cap  เพดานสูงสุด เพื่อไม่ให้ยอดสุทธิติดลบ (หัวข้อ 7.2) — default = base
 */
export function resolveDiscount(
  base: Decimal,
  value: unknown,
  type: DiscountType = 'amount',
  cap?: Decimal,
): Decimal {
  const v = dec(value as never)
  if (v.lessThanOrEqualTo(0)) return new Decimal(0)
  const raw = type === 'percent' ? base.times(v).dividedBy(100) : v
  const ceiling = cap ?? base
  // ส่วนลดต้องไม่ทำให้ยอดติดลบ (หัวข้อ 7.2)
  return clampMin(Decimal.min(round2(raw), ceiling), 0)
}

/**
 * กระจายส่วนลดท้ายบิล (+โปรโมชัน) ลงแต่ละรายการตามสัดส่วน line_net
 * ปัดทศนิยม 2 แล้วยกเศษที่เหลือไปไว้แถวสุดท้ายที่มียอด (หัวข้อ 7.1)
 */
export function allocateProportionally(weights: Decimal[], amount: Decimal): Decimal[] {
  const out = weights.map(() => new Decimal(0))
  const target = round2(amount)
  if (target.isZero() || weights.length === 0) return out

  const totalWeight = weights.reduce((a, w) => a.plus(w), new Decimal(0))
  if (totalWeight.lessThanOrEqualTo(0)) {
    // ไม่มียอดให้กระจาย → ลงแถวสุดท้ายทั้งก้อน
    out[out.length - 1] = target
    return out
  }

  let running = new Decimal(0)
  let lastNonZero = -1
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!
    if (w.greaterThan(0)) lastNonZero = i
  }
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!
    if (w.lessThanOrEqualTo(0) || i === lastNonZero) continue
    const share = round2(target.times(w).dividedBy(totalWeight))
    out[i] = share
    running = running.plus(share)
  }
  if (lastNonZero >= 0) out[lastNonZero] = round2(target.minus(running))
  return out
}

/** ค่า default ของ config เมื่อไม่ได้ส่งมา */
function normalizeConfig(config: BillConfig | undefined) {
  const vatRate = dec(config?.vatRate ?? 0)
  return {
    vatRate,
    isVatIncluded: config?.isVatIncluded ?? false,
    enabledServiceCharge: config?.enabledServiceCharge ?? false,
    serviceChargeRate: dec(config?.serviceChargeRate ?? 0),
    serviceChargeVatable: config?.serviceChargeVatable ?? true,
    roundingType: config?.roundingType ?? 'none',
    roundingAmount: dec(config?.roundingAmount ?? 1),
  }
}

/**
 * คำนวณยอดทั้งบิลตามหัวข้อ 7.1 ของสเปก
 * ผลลัพธ์ทุกตัวเป็นสตริงทศนิยม 2 ตำแหน่ง พร้อมเก็บลง NUMERIC(14,2)
 */
export function calculateBill(input: CalculateBillInput): BillTotals {
  const cfg = normalizeConfig(input.config)
  const items = input.items ?? []

  // ---- ระดับรายการ ----
  const lines = items.map((item: BillItemInput, index: number) => {
    const qty = roundQty(item.qty)
    const ratio = dec(item.ratio ?? 1)
    const unitPrice = round2(item.unitPrice)
    const lineSubtotal = round2(unitPrice.times(qty))
    const optionTotal = round2(optionUnitValue(item.options).times(qty))
    // ส่วนลด % คิดจาก "รวมก่อนลด" ของรายการ (ไม่รวมมูลค่าตัวเลือก) แต่หักได้ไม่เกินยอดรวมทั้งบรรทัด
    const itemDiscount = resolveDiscount(
      lineSubtotal,
      item.itemDiscount,
      item.itemDiscountType ?? 'amount',
      lineSubtotal.plus(optionTotal),
    )
    const lineNet = clampMin(lineSubtotal.plus(optionTotal).minus(itemDiscount), 0)
    const baseQty = roundQty(qty.times(ratio))
    const cost = round2(dec(item.cost ?? 0).times(qty).times(ratio))
    return {
      key: item.key ?? String(index),
      index,
      qty,
      ratio,
      unitPrice,
      lineSubtotal,
      optionTotal,
      itemDiscount,
      lineNet,
      baseQty,
      cost,
      vatType: item.vatType ?? 'N',
      serviceCharge: item.serviceCharge ?? false,
    }
  })

  const subtotal = round2(
    lines.reduce((a, l) => a.plus(l.lineSubtotal).plus(l.optionTotal), new Decimal(0)),
  )
  const optionTotalAll = round2(lines.reduce((a, l) => a.plus(l.optionTotal), new Decimal(0)))
  const itemDiscountTotal = round2(
    lines.reduce((a, l) => a.plus(l.itemDiscount), new Decimal(0)),
  )
  const afterItem = clampMin(subtotal.minus(itemDiscountTotal), 0)

  // ---- ส่วนลดท้ายบิล + โปรโมชัน ----
  const billDiscount = input.billDiscount
    ? resolveDiscount(afterItem, input.billDiscount.value, input.billDiscount.type)
    : new Decimal(0)
  const promotionDiscount = Decimal.min(
    round2(input.promotionDiscount ?? 0),
    clampMin(afterItem.minus(billDiscount), 0),
  )
  const discountTotal = round2(itemDiscountTotal.plus(billDiscount).plus(promotionDiscount))
  const afterDiscount = clampMin(subtotal.minus(discountTotal), 0)

  // กระจายส่วนลดท้ายบิลลงรายการ เพื่อคิด VAT/ค่าบริการ/รายงานต่อสินค้าให้ถูก
  const allocated = allocateProportionally(
    lines.map((l) => l.lineNet),
    billDiscount.plus(promotionDiscount),
  )
  const netAfter = lines.map((l, i) => clampMin(l.lineNet.minus(allocated[i] ?? new Decimal(0)), 0))

  // ---- ค่าบริการ ----
  let serviceCharge = new Decimal(0)
  if (input.serviceChargeOverride !== null && input.serviceChargeOverride !== undefined) {
    serviceCharge = round2(input.serviceChargeOverride)
  } else if (cfg.enabledServiceCharge && cfg.serviceChargeRate.greaterThan(0)) {
    const scBase = lines.reduce(
      (a, l, i) => (l.serviceCharge ? a.plus(netAfter[i] ?? new Decimal(0)) : a),
      new Decimal(0),
    )
    serviceCharge = round2(scBase.times(cfg.serviceChargeRate).dividedBy(100))
  }

  // ---- VAT ----
  const vatableLines = lines.reduce(
    (a, l, i) => (l.vatType === 'V' ? a.plus(netAfter[i] ?? new Decimal(0)) : a),
    new Decimal(0),
  )
  const nonVatableAmount = round2(
    lines.reduce(
      (a, l, i) => (l.vatType === 'N' ? a.plus(netAfter[i] ?? new Decimal(0)) : a),
      new Decimal(0),
    ),
  )
  const vatableBase = round2(
    cfg.serviceChargeVatable ? vatableLines.plus(serviceCharge) : vatableLines,
  )

  let vatAmount = new Decimal(0)
  let amountBeforeVat = new Decimal(0)
  let totalBeforeRound: Decimal
  if (cfg.vatRate.greaterThan(0) && vatableBase.greaterThan(0)) {
    if (cfg.isVatIncluded) {
      vatAmount = round2(vatableBase.times(cfg.vatRate).dividedBy(cfg.vatRate.plus(100)))
      amountBeforeVat = round2(vatableBase.minus(vatAmount))
      totalBeforeRound = round2(afterDiscount.plus(serviceCharge))
    } else {
      vatAmount = round2(vatableBase.times(cfg.vatRate).dividedBy(100))
      amountBeforeVat = vatableBase
      totalBeforeRound = round2(afterDiscount.plus(serviceCharge).plus(vatAmount))
    }
  } else {
    amountBeforeVat = vatableBase
    totalBeforeRound = round2(afterDiscount.plus(serviceCharge))
  }

  // ---- ปัดเศษ / ค่าจัดส่ง / ยอดสุทธิ ----
  const rounding = roundingDiff(totalBeforeRound, cfg.roundingType, cfg.roundingAmount)
  const deliveryFee = round2(input.deliveryFee ?? 0)
  const grandTotal = round2(totalBeforeRound.plus(rounding).plus(deliveryFee))

  const costTotal = round2(lines.reduce((a, l) => a.plus(l.cost), new Decimal(0)))
  const profit = round2(grandTotal.minus(vatAmount).minus(costTotal))
  const totalQty = roundQty(lines.reduce((a, l) => a.plus(l.qty), new Decimal(0)))

  const itemResults: BillItemResult[] = lines.map((l, i) => ({
    key: l.key,
    index: l.index,
    qty: qtyString(l.qty),
    ratio: qtyString(l.ratio),
    unitPrice: money(l.unitPrice),
    lineSubtotal: money(l.lineSubtotal),
    optionTotal: money(l.optionTotal),
    itemDiscount: money(l.itemDiscount),
    lineNet: money(l.lineNet),
    allocatedBillDiscount: money(allocated[i] ?? 0),
    netAfterBillDiscount: money(netAfter[i] ?? 0),
    cost: money(l.cost),
    vatType: l.vatType,
    baseQty: qtyString(l.baseQty),
  }))

  return {
    items: itemResults,
    subtotal: money(subtotal),
    optionTotal: money(optionTotalAll),
    itemDiscountTotal: money(itemDiscountTotal),
    billDiscount: money(billDiscount),
    promotionDiscount: money(promotionDiscount),
    discountTotal: money(discountTotal),
    afterDiscount: money(afterDiscount),
    serviceCharge: money(serviceCharge),
    vatableAmount: money(vatableLines),
    nonVatableAmount: money(nonVatableAmount),
    amountBeforeVat: money(amountBeforeVat),
    vatAmount: money(vatAmount),
    rounding: money(rounding),
    deliveryFee: money(deliveryFee),
    grandTotal: money(grandTotal),
    costTotal: money(costTotal),
    profit: money(profit),
    totalQty: qtyString(totalQty),
  }
}

/** เงินทอน = รับมา − ยอดที่ต้องจ่าย (ไม่ติดลบ) */
export function calculateChange(received: unknown, due: unknown): string {
  return money(clampMin(round2(received as never).minus(round2(due as never)), 0))
}

/** ยอดค้างชำระของบิล (ใช้กับชำระหลายช่องทาง) */
export function outstandingAmount(grandTotal: unknown, payments: { amount: unknown }[]): string {
  const paid = payments.reduce((a, p) => a.plus(round2(p.amount as never)), new Decimal(0))
  return money(clampMin(round2(grandTotal as never).minus(paid), 0))
}
