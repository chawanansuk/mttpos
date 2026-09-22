import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { calculateBill, type BillItemInput, type BillTotals } from '@medee/domain'

export type Tx = Prisma.TransactionClient | PrismaClient

export interface ProductRef {
  id: string
  pluId: string
  barcode: string
  name: string
  unitName: string
  categoryName: string
  price: string
  cost: string
  vatType: 'V' | 'N'
}

export interface SeedReceiptInput {
  branchId: string
  posDeviceId: string
  cashRoundId: string | null
  cashierId: string
  receiptNo: string
  soldAt: Date
  businessDay: string
  status: 'ปกติ' | 'ยกเลิก'
  memberId?: string | null
  voidedAt?: Date | null
  voidedBy?: string | null
  voidReason?: string | null
  lines: { ref: ProductRef; qty: number; unitPrice?: string; discount?: string }[]
  paymentMethod?: string
  received?: string
}

const VAT_FREE = { vatRate: 0, roundingType: 'none' as const }

/**
 * สร้างบิลขายหนึ่งใบพร้อมรายการ การชำระเงิน และความเคลื่อนไหวสต็อก
 * ใช้ calculateBill ของ @medee/domain เป็นตัวคำนวณเดียวกับที่ API ใช้จริง
 */
export async function createSeedReceipt(tx: Tx, input: SeedReceiptInput) {
  const items: BillItemInput[] = input.lines.map((l, i) => ({
    key: String(i),
    productId: l.ref.id,
    pluId: l.ref.pluId,
    barcode: l.ref.barcode,
    name: l.ref.name,
    unitName: l.ref.unitName,
    ratio: 1,
    qty: l.qty,
    unitPrice: l.unitPrice ?? l.ref.price,
    cost: l.ref.cost,
    itemDiscount: l.discount ?? '0',
    itemDiscountType: 'amount',
    vatType: l.ref.vatType,
  }))
  const totals: BillTotals = calculateBill({ items, config: VAT_FREE })
  const isVoid = input.status === 'ยกเลิก'

  const receipt = await tx.receipt.create({
    data: {
      branchId: input.branchId,
      posDeviceId: input.posDeviceId,
      cashRoundId: input.cashRoundId,
      receiptNo: input.receiptNo,
      status: input.status,
      clientId: `seed-${input.receiptNo}`,
      orderType: 'ทานที่ร้าน',
      salesChannel: 'ขายหน้าร้าน',
      memberId: input.memberId ?? null,
      cashierId: input.cashierId,
      soldAt: input.soldAt,
      businessDay: input.businessDay,
      subtotal: totals.subtotal,
      itemDiscountTotal: totals.itemDiscountTotal,
      billDiscount: totals.billDiscount,
      promotionDiscount: totals.promotionDiscount,
      discountTotal: totals.discountTotal,
      optionTotal: totals.optionTotal,
      serviceCharge: totals.serviceCharge,
      vatableAmount: totals.vatableAmount,
      nonVatableAmount: totals.nonVatableAmount,
      amountBeforeVat: totals.amountBeforeVat,
      vatAmount: totals.vatAmount,
      rounding: totals.rounding,
      deliveryFee: totals.deliveryFee,
      grandTotal: totals.grandTotal,
      costTotal: totals.costTotal,
      profit: totals.profit,
      totalQty: totals.totalQty,
      voidedAt: input.voidedAt ?? null,
      voidedBy: input.voidedBy ?? null,
      voidReason: input.voidReason ?? null,
      items: {
        create: input.lines.map((l, i) => {
          const t = totals.items[i]!
          return {
            productId: l.ref.id,
            pluId: l.ref.pluId,
            barcode: l.ref.barcode,
            name: l.ref.name,
            unitName: l.ref.unitName,
            categoryName: l.ref.categoryName,
            ratio: '1',
            qty: t.qty,
            unitPrice: t.unitPrice,
            itemDiscount: t.itemDiscount,
            itemDiscountType: 'amount',
            subtotal: t.lineSubtotal,
            optionTotal: t.optionTotal,
            net: t.lineNet,
            netAfterBillDiscount: t.netAfterBillDiscount,
            allocatedBillDiscount: t.allocatedBillDiscount,
            cost: t.cost,
            vatType: t.vatType,
            orderIndex: i,
          }
        }),
      },
      payments: {
        create: [{
          method: input.paymentMethod ?? 'เงินสด',
          amount: totals.grandTotal,
          received: input.received ?? totals.grandTotal,
          change: '0.00',
        }],
      },
    },
  })

  // ความเคลื่อนไหวสต็อก: ขายออก และถ้าบิลถูกยกเลิกก็คืนสต็อกกลับ
  for (const [i, l] of input.lines.entries()) {
    await moveStock(tx, {
      branchId: input.branchId,
      productId: l.ref.id,
      pluId: l.ref.pluId,
      docType: 'SALE',
      docNo: input.receiptNo,
      receiptId: receipt.id,
      qty: -l.qty,
      unitCost: l.ref.cost,
      occurredAt: input.soldAt,
      actorName: 'cashier1',
    })
    if (isVoid) {
      await moveStock(tx, {
        branchId: input.branchId,
        productId: l.ref.id,
        pluId: l.ref.pluId,
        docType: 'VOID',
        docNo: input.receiptNo,
        receiptId: receipt.id,
        qty: l.qty,
        unitCost: l.ref.cost,
        occurredAt: input.voidedAt ?? input.soldAt,
        actorName: input.voidedBy ?? 'cashier1',
        note: input.voidReason ?? undefined,
      })
    }
    void i
  }

  return { receipt, totals }
}

export interface MoveStockInput {
  branchId: string
  productId: string
  pluId: string | null
  docType: string
  docNo: string
  documentId?: string | null
  receiptId?: string | null
  /** จำนวนหน่วยฐาน (+ เพิ่ม / − ลด) */
  qty: number | string
  unitCost?: string
  occurredAt: Date
  actorName?: string
  note?: string
}

/** ปรับยอดคงเหลือของ PLU หลัก แล้วบันทึกลง stock card */
export async function moveStock(tx: Tx, input: MoveStockInput) {
  if (!input.pluId) return
  const plu = await tx.productPlu.update({
    where: { id: input.pluId },
    data: { stockQty: { increment: new Prisma.Decimal(input.qty) } },
    select: { stockQty: true },
  })
  await tx.stockMovement.create({
    data: {
      branchId: input.branchId,
      productId: input.productId,
      pluId: input.pluId,
      docType: input.docType,
      docNo: input.docNo,
      documentId: input.documentId ?? null,
      receiptId: input.receiptId ?? null,
      qty: new Prisma.Decimal(input.qty),
      unitCost: input.unitCost ?? '0',
      balanceAfter: plu.stockQty,
      occurredAt: input.occurredAt,
      actorName: input.actorName,
      note: input.note,
    },
  })
}

/** วันที่แบบ YYYY-MM-DD ตามเวลากรุงเทพ */
export function bkkDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** สร้าง Date จากเวลาไทย */
export function bkk(iso: string): Date {
  return new Date(iso.includes('+') || iso.endsWith('Z') ? iso : `${iso}+07:00`)
}

/** แบ่งเป็นก้อนเพื่อไม่ให้ query ยาวเกินและไม่กินหน่วยความจำมาก */
function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * สร้างบิลย้อนหลังทีละหลายร้อยใบด้วย createMany
 *
 * createSeedReceipt() ยิง query ต่อบิลราว 1 + 2×(จำนวนรายการ) ครั้ง
 * พอ seed 762 บิลจึงกลายเป็นราว 5,000 รอบ ซึ่งใช้เวลาเป็นสิบ ๆ นาที
 * เมื่อฐานข้อมูลอยู่คนละทวีปกับเครื่องที่รัน (เช่นตอน build บน Vercel)
 *
 * ฟังก์ชันนี้ให้ผลลัพธ์เหมือนเดิมทุกแถว แต่เหลือไม่กี่สิบรอบ โดย
 * - รวมแถวทั้งหมดแล้วเขียนเป็นชุด (ต้องสร้าง id เองเพราะ createMany ซ้อนชั้นไม่ได้)
 * - ไม่ต้องอ่าน stockQty กลับมาทีละรายการ เพราะ balanceAfter ถูกคำนวณใหม่
 *   ทั้งหมดด้วย recomputeStockCardBalances() ตอนท้าย seed อยู่แล้ว
 * - ยอดคงเหลือของแต่ละ PLU รวมในหน่วยความจำแล้วบวกกลับครั้งเดียว
 *   (ผลรวมไม่ขึ้นกับลำดับ จึงได้ค่าเท่ากับการบวกทีละรายการ)
 */
export async function createSeedReceiptsBatch(prisma: PrismaClient, inputs: SeedReceiptInput[]) {
  const receipts: Prisma.ReceiptCreateManyInput[] = []
  const items: Prisma.ReceiptItemCreateManyInput[] = []
  const payments: Prisma.ReceiptPaymentCreateManyInput[] = []
  const movements: Prisma.StockMovementCreateManyInput[] = []
  const pluDelta = new Map<string, Prisma.Decimal>()

  const addDelta = (pluId: string, qty: number) => {
    pluDelta.set(pluId, (pluDelta.get(pluId) ?? new Prisma.Decimal(0)).plus(qty))
  }

  for (const input of inputs) {
    const billItems: BillItemInput[] = input.lines.map((l, i) => ({
      key: String(i),
      productId: l.ref.id,
      pluId: l.ref.pluId,
      barcode: l.ref.barcode,
      name: l.ref.name,
      unitName: l.ref.unitName,
      ratio: 1,
      qty: l.qty,
      unitPrice: l.unitPrice ?? l.ref.price,
      cost: l.ref.cost,
      itemDiscount: l.discount ?? '0',
      itemDiscountType: 'amount',
      vatType: l.ref.vatType,
    }))
    const totals: BillTotals = calculateBill({ items: billItems, config: VAT_FREE })
    const isVoid = input.status === 'ยกเลิก'
    const receiptId = randomUUID()

    receipts.push({
      id: receiptId,
      branchId: input.branchId,
      posDeviceId: input.posDeviceId,
      cashRoundId: input.cashRoundId,
      receiptNo: input.receiptNo,
      status: input.status,
      clientId: `seed-${input.receiptNo}`,
      orderType: 'ทานที่ร้าน',
      salesChannel: 'ขายหน้าร้าน',
      memberId: input.memberId ?? null,
      cashierId: input.cashierId,
      soldAt: input.soldAt,
      businessDay: input.businessDay,
      subtotal: totals.subtotal,
      itemDiscountTotal: totals.itemDiscountTotal,
      billDiscount: totals.billDiscount,
      promotionDiscount: totals.promotionDiscount,
      discountTotal: totals.discountTotal,
      optionTotal: totals.optionTotal,
      serviceCharge: totals.serviceCharge,
      vatableAmount: totals.vatableAmount,
      nonVatableAmount: totals.nonVatableAmount,
      amountBeforeVat: totals.amountBeforeVat,
      vatAmount: totals.vatAmount,
      rounding: totals.rounding,
      deliveryFee: totals.deliveryFee,
      grandTotal: totals.grandTotal,
      costTotal: totals.costTotal,
      profit: totals.profit,
      totalQty: totals.totalQty,
      voidedAt: input.voidedAt ?? null,
      voidedBy: input.voidedBy ?? null,
      voidReason: input.voidReason ?? null,
    })

    payments.push({
      receiptId,
      method: input.paymentMethod ?? 'เงินสด',
      amount: totals.grandTotal,
      received: input.received ?? totals.grandTotal,
      change: '0.00',
    })

    input.lines.forEach((l, i) => {
      const t = totals.items[i]!
      items.push({
        receiptId,
        productId: l.ref.id,
        pluId: l.ref.pluId,
        barcode: l.ref.barcode,
        name: l.ref.name,
        unitName: l.ref.unitName,
        categoryName: l.ref.categoryName,
        ratio: '1',
        qty: t.qty,
        unitPrice: t.unitPrice,
        itemDiscount: t.itemDiscount,
        itemDiscountType: 'amount',
        subtotal: t.lineSubtotal,
        optionTotal: t.optionTotal,
        net: t.lineNet,
        netAfterBillDiscount: t.netAfterBillDiscount,
        allocatedBillDiscount: t.allocatedBillDiscount,
        cost: t.cost,
        vatType: t.vatType,
        orderIndex: i,
      })

      if (!l.ref.pluId) return
      // balanceAfter ใส่ 0 ไว้ก่อน — recomputeStockCardBalances() เขียนทับทั้งหมดตอนท้าย
      movements.push({
        branchId: input.branchId,
        productId: l.ref.id,
        pluId: l.ref.pluId,
        docType: 'SALE',
        docNo: input.receiptNo,
        receiptId,
        qty: new Prisma.Decimal(-l.qty),
        unitCost: l.ref.cost,
        balanceAfter: '0',
        occurredAt: input.soldAt,
        actorName: 'cashier1',
      })
      addDelta(l.ref.pluId, -l.qty)

      if (isVoid) {
        movements.push({
          branchId: input.branchId,
          productId: l.ref.id,
          pluId: l.ref.pluId,
          docType: 'VOID',
          docNo: input.receiptNo,
          receiptId,
          qty: new Prisma.Decimal(l.qty),
          unitCost: l.ref.cost,
          balanceAfter: '0',
          occurredAt: input.voidedAt ?? input.soldAt,
          actorName: input.voidedBy ?? 'cashier1',
          note: input.voidReason ?? undefined,
        })
        addDelta(l.ref.pluId, l.qty)
      }
    })
  }

  for (const rows of chunk(receipts, 500)) await prisma.receipt.createMany({ data: rows })
  for (const rows of chunk(items, 1000)) await prisma.receiptItem.createMany({ data: rows })
  for (const rows of chunk(payments, 1000)) await prisma.receiptPayment.createMany({ data: rows })
  for (const rows of chunk(movements, 1000)) await prisma.stockMovement.createMany({ data: rows })

  // บวกยอดคงเหลือกลับครั้งเดียวต่อ PLU ด้วย UPDATE ... CASE
  const deltas = [...pluDelta.entries()]
  for (const rows of chunk(deltas, 500)) {
    const cases = rows.map(([id, d]) => `WHEN '${id}'::uuid THEN ${d.toFixed(3)}::numeric`).join(' ')
    const ids = rows.map(([id]) => `'${id}'::uuid`).join(',')
    await prisma.$executeRawUnsafe(
      `UPDATE product_plus SET "stockQty" = "stockQty" + CASE id ${cases} END WHERE id IN (${ids})`,
    )
  }

  return { receipts: receipts.length, items: items.length, movements: movements.length }
}
