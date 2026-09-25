'use client'

import { create } from 'zustand'
import {
  calculateBill, calculateChange, resolveStepUnitPrice,
  type BillItemOption, type BillTotals, type DiscountType, type VatType,
} from '@medee/domain'
import type { BranchSettings } from './sync'
import type { LocalProduct } from './db'

export interface CartLine {
  /** key เฉพาะของบรรทัด (สินค้าเดียวกันแต่ตัวเลือกต่างกัน = คนละบรรทัด) */
  key: string
  productId: string | null
  pluId: string | null
  barcode: string | null
  name: string
  unitName: string
  ratio: string
  qty: number
  unitPrice: string
  /** ราคาปกติก่อนใช้ step price — ใช้คำนวณใหม่เมื่อจำนวนเปลี่ยน */
  basePrice: string
  cost: string
  vatType: VatType
  serviceCharge: boolean
  itemDiscount: string
  itemDiscountType: DiscountType
  options: BillItemOption[]
  note: string
  serialNo: string | null
  stepPrices: { minQty: string; price: string }[]
  useStepPrice: boolean
  color: string
}

export interface CartMember {
  id: string
  name: string
  pointsBalance: number
  priceChannel: string | null
}

interface CartState {
  lines: CartLine[]
  billDiscount: { type: DiscountType; value: string } | null
  member: CartMember | null
  orderType: string
  salesChannel: string
  note: string
  guests: number | null
  tableId: string | null
  /** id ของบิลที่พักไว้ ถ้ากำลังแก้บิลที่เรียกกลับมา */
  openBillId: string | null

  addLine: (line: Omit<CartLine, 'key'> & { key?: string }) => void
  updateLine: (key: string, patch: Partial<CartLine>) => void
  changeQty: (key: string, delta: number) => void
  setQty: (key: string, qty: number) => void
  removeLine: (key: string) => void
  setBillDiscount: (discount: CartState['billDiscount']) => void
  setMember: (member: CartMember | null) => void
  setField: <K extends keyof CartState>(key: K, value: CartState[K]) => void
  clear: () => void
  loadLines: (lines: CartLine[]) => void
}

/** สร้าง key ของบรรทัด — สินค้าเดียวกันที่ตัวเลือก/ราคา/หมายเหตุต่างกันต้องแยกบรรทัด */
function lineKey(line: Pick<CartLine, 'pluId' | 'productId' | 'unitPrice' | 'options' | 'note' | 'serialNo'>): string {
  const options = line.options.map((o) => `${o.optionId ?? o.name}x${o.qty ?? 1}`).sort().join('|')
  return [line.pluId ?? line.productId ?? 'adhoc', line.unitPrice, options, line.note, line.serialNo ?? ''].join('::')
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  billDiscount: null,
  member: null,
  orderType: 'ทานที่ร้าน',
  salesChannel: 'ขายหน้าร้าน',
  note: '',
  guests: null,
  tableId: null,
  openBillId: null,

  addLine: (input) =>
    set((state) => {
      const key = input.key ?? lineKey(input)
      const existing = state.lines.find((l) => l.key === key)
      // ยิงบาร์โค้ดซ้ำ = เพิ่มจำนวน (หัวข้อ 5.3)
      const lines = existing
        ? state.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + input.qty } : l))
        : [...state.lines, { ...input, key }]
      return { lines: lines.map(applyStepPrice) }
    }),

  updateLine: (key, patch) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? applyStepPrice({ ...l, ...patch }) : l)),
    })),

  changeQty: (key, delta) =>
    set((state) => ({
      lines: state.lines
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0)
        .map(applyStepPrice),
    })),

  setQty: (key, qty) =>
    set((state) => ({
      lines: state.lines
        .map((l) => (l.key === key ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0)
        .map(applyStepPrice),
    })),

  removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
  setBillDiscount: (billDiscount) => set({ billDiscount }),
  setMember: (member) => set({ member }),
  setField: (key, value) => set({ [key]: value } as never),
  loadLines: (lines) => set({ lines }),
  clear: () =>
    set({
      lines: [], billDiscount: null, member: null, note: '', guests: null,
      tableId: null, openBillId: null, orderType: 'ทานที่ร้าน', salesChannel: 'ขายหน้าร้าน',
    }),
}))

/** ปรับราคาต่อหน่วยตาม step price เมื่อจำนวนเปลี่ยน (หัวข้อ 7.4) */
function applyStepPrice(line: CartLine): CartLine {
  if (!line.useStepPrice || !line.stepPrices.length) return line
  return { ...line, unitPrice: resolveStepUnitPrice(line.basePrice, line.qty, line.stepPrices) }
}

/** คำนวณยอดบิลจากตะกร้าปัจจุบัน — ใช้เครื่องคำนวณตัวเดียวกับ API */
export function computeTotals(
  lines: CartLine[],
  branch: BranchSettings | undefined,
  billDiscount: CartState['billDiscount'],
): BillTotals {
  return calculateBill({
    items: lines.map((l) => ({
      key: l.key,
      qty: l.qty,
      ratio: l.ratio,
      unitPrice: l.unitPrice,
      cost: l.cost,
      itemDiscount: l.itemDiscount || 0,
      itemDiscountType: l.itemDiscountType,
      vatType: l.vatType,
      serviceCharge: l.serviceCharge,
      options: l.options,
    })),
    config: branch
      ? {
          vatRate: branch.vatRate,
          isVatIncluded: branch.isVatIncluded,
          enabledServiceCharge: branch.enabledServiceCharge,
          serviceChargeRate: branch.serviceChargeRate,
          serviceChargeVatable: branch.serviceChargeVatable,
          roundingType: branch.roundingType,
          roundingAmount: branch.roundingAmount,
        }
      : undefined,
    billDiscount,
  })
}

/** แปลงสินค้าในเครื่องเป็นบรรทัดตะกร้า */
export function productToLine(
  product: LocalProduct,
  options: {
    pluId?: string
    unitName?: string
    qty?: number
    unitPrice?: string
    cartOptions?: BillItemOption[]
    priceChannel?: string | null
    useAvgCost?: boolean
  } = {},
): Omit<CartLine, 'key'> {
  const plu = product.plus.find((p) => p.id === options.pluId) ?? product.plus.find((p) => p.isDefault) ?? product.plus[0]

  // ราคาช่องทาง (เช่น ราคาขายส่งสมาชิก) ใช้แทนราคาปกติ ไม่ใช่ส่วนลด
  let basePrice = plu?.price ?? product.price
  if (options.priceChannel && options.priceChannel !== 'retail') {
    const hit = product.channelPrices.find((c) => c.channel === options.priceChannel && c.enabled)
    if (hit && Number(hit.price) > 0) basePrice = hit.price
  }
  const qty = options.qty ?? 1
  const useStepPrice = plu ? plu.useStepPrice || plu.isDefault : true
  const unitPrice = options.unitPrice
    ?? (useStepPrice ? resolveStepUnitPrice(basePrice, qty, product.stepPrices) : basePrice)

  return {
    productId: product.id,
    pluId: plu?.id ?? null,
    barcode: plu?.pluCode ?? product.barcode,
    name: plu?.name ?? product.name,
    unitName: options.unitName ?? '',
    ratio: plu?.skuRatio ?? '1',
    qty,
    unitPrice,
    basePrice,
    cost: options.useAvgCost ? product.avgCost : product.stdCost,
    vatType: product.vatType,
    serviceCharge: product.serviceCharge,
    itemDiscount: '0',
    itemDiscountType: 'amount',
    options: options.cartOptions ?? [],
    note: '',
    serialNo: null,
    stepPrices: product.stepPrices,
    useStepPrice,
    color: product.color,
  }
}

export { calculateChange }
