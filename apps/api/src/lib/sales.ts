import { Prisma, prisma } from '@medee/db'
import {
  calculateBill, pointsEarned, resolveChannelPrice, resolveStepUnitPrice,
  type BillItemInput, type BillItemOption, type DiscountType, type PriceChannel, type VatType,
} from '@medee/domain'
import { z } from 'zod'
import { billConfigOf, branchBusinessDay, getBranch } from './branch.js'
import { nextReceiptNo } from './docNumbers.js'
import { applyProductMovement } from './stock.js'
import { badRequest, conflict, notFound } from './errors.js'

export const optionSchema = z.object({
  optionId: z.string().uuid().optional(),
  name: z.string(),
  price: z.string().or(z.number()),
  qty: z.string().or(z.number()).optional(),
  cost: z.string().or(z.number()).optional(),
  groupName: z.string().optional(),
})

export const receiptItemSchema = z.object({
  productId: z.string().uuid().optional(),
  pluId: z.string().uuid().optional(),
  barcode: z.string().optional(),
  /** ระบุชื่อ/ราคาเองได้เมื่อขายสินค้าที่เปิดราคา หรือขายจากเครื่องที่ offline */
  name: z.string().optional(),
  unitName: z.string().optional(),
  ratio: z.union([z.string(), z.number()]).optional(),
  qty: z.union([z.string(), z.number()]),
  unitPrice: z.union([z.string(), z.number()]).optional(),
  cost: z.union([z.string(), z.number()]).optional(),
  itemDiscount: z.union([z.string(), z.number()]).optional(),
  itemDiscountType: z.enum(['amount', 'percent']).optional(),
  vatType: z.enum(['V', 'N']).optional(),
  options: z.array(optionSchema).optional(),
  note: z.string().optional(),
  serialNo: z.string().optional(),
})

export const paymentSchema = z.object({
  method: z.string(),
  amount: z.union([z.string(), z.number()]),
  received: z.union([z.string(), z.number()]).optional(),
  refNo: z.string().optional(),
  customMethodName: z.string().optional(),
})

export const createReceiptSchema = z.object({
  /** idempotency key จากเครื่อง POS — ส่งซ้ำต้องไม่สร้างบิลซ้ำ (หัวข้อ 7.10) */
  clientId: z.string().min(1).optional(),
  posDeviceId: z.string().uuid().optional(),
  cashRoundId: z.string().uuid().nullable().optional(),
  cashierId: z.string().uuid().optional(),
  soldAt: z.string().datetime({ offset: true }).optional(),
  orderType: z.string().default('ทานที่ร้าน'),
  salesChannel: z.string().default('ขายหน้าร้าน'),
  tableId: z.string().uuid().nullable().optional(),
  guests: z.number().int().positive().nullable().optional(),
  memberId: z.string().uuid().nullable().optional(),
  note: z.string().optional(),
  items: z.array(receiptItemSchema).min(1),
  billDiscount: z.object({
    type: z.enum(['amount', 'percent']),
    value: z.union([z.string(), z.number()]),
  }).nullable().optional(),
  promotionDiscount: z.union([z.string(), z.number()]).optional(),
  serviceChargeOverride: z.union([z.string(), z.number()]).nullable().optional(),
  deliveryFee: z.union([z.string(), z.number()]).optional(),
  payments: z.array(paymentSchema).default([]),
  /** ปิดบิลที่พักไว้ (จะถูกลบออกจากรายการบิลที่เปิดอยู่) */
  openBillId: z.string().uuid().nullable().optional(),
})
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>

interface ResolvedLine {
  input: z.infer<typeof receiptItemSchema>
  productId: string | null
  pluId: string | null
  barcode: string | null
  name: string
  unitName: string | null
  categoryName: string | null
  ratio: string
  unitPrice: string
  cost: string
  vatType: VatType
  skuType: string
  serviceCharge: boolean
  options: BillItemOption[]
}

/**
 * แปลงรายการที่ส่งมาให้สมบูรณ์จากฐานข้อมูล
 * ราคาที่ใช้: ราคาที่ส่งมา > step price > ราคาช่องทาง (สมาชิกขายส่ง) > ราคา PLU > ราคา SKU
 */
async function resolveLines(
  branchId: string,
  items: z.infer<typeof receiptItemSchema>[],
  priceChannel: PriceChannel,
): Promise<ResolvedLine[]> {
  const out: ResolvedLine[] = []

  for (const item of items) {
    const where: Prisma.ProductWhereInput = { branchId, deletedAt: null }
    if (item.productId) where.id = item.productId
    else if (item.barcode) {
      where.OR = [{ barcode: item.barcode }, { plus: { some: { pluCode: item.barcode } } }]
    }

    const product =
      item.productId || item.barcode
        ? await prisma.product.findFirst({
            where,
            include: {
              plus: true,
              stepPrices: true,
              channelPrices: true,
              category: { select: { name: true } },
              unit: { select: { name: true } },
            },
          })
        : null

    // สินค้าที่ไม่พบ (เช่น สินค้าถูกลบไปแล้ว หรือขายแบบเปิดราคาจากเครื่อง offline)
    // ยังต้องบันทึกบิลได้ โดยใช้ snapshot ที่เครื่องส่งมา (หัวข้อ 7.10)
    if (!product) {
      if (!item.name || item.unitPrice === undefined) {
        throw badRequest('ไม่พบสินค้าในระบบ และไม่ได้ส่งชื่อ/ราคามาด้วย', { item })
      }
      out.push({
        input: item,
        productId: null,
        pluId: null,
        barcode: item.barcode ?? null,
        name: item.name,
        unitName: item.unitName ?? null,
        categoryName: null,
        ratio: String(item.ratio ?? 1),
        unitPrice: String(item.unitPrice),
        cost: String(item.cost ?? 0),
        vatType: (item.vatType ?? 'N') as VatType,
        skuType: 'SV',
        serviceCharge: false,
        options: (item.options ?? []) as BillItemOption[],
      })
      continue
    }

    const plu =
      product.plus.find((p) => p.id === item.pluId) ??
      product.plus.find((p) => p.pluCode === item.barcode) ??
      product.plus.find((p) => p.isDefault) ??
      product.plus[0]

    const basePrice = plu ? plu.price.toString() : product.price.toString()
    const ratio = plu ? plu.skuRatio.toString() : '1'

    let unitPrice: string
    if (item.unitPrice !== undefined) {
      unitPrice = String(item.unitPrice)
    } else {
      // ราคาช่องทาง (เช่น ราคาขายส่งสมาชิก) ใช้แทนราคาปกติ ไม่ใช่ส่วนลด (หัวข้อ 7.2)
      const channelPrice = resolveChannelPrice(
        basePrice,
        priceChannel,
        product.channelPrices.map((c) => ({
          channel: c.channel as PriceChannel,
          enabled: c.enabled,
          price: c.price.toString(),
        })),
      )
      // ราคาขายเพิ่มเติมตามจำนวน (step price) — ใช้เมื่อ PLU เปิดใช้ หรือเป็น PLU หลัก
      const useStep = plu ? plu.useStepPrice || plu.isDefault : true
      unitPrice = useStep
        ? resolveStepUnitPrice(
            channelPrice,
            item.qty,
            product.stepPrices.map((s) => ({ minQty: s.minQty.toString(), price: s.price.toString() })),
          )
        : channelPrice
    }

    // ต้นทุน: ใช้ avgCost เมื่อสาขาตั้งค่าไว้ มิฉะนั้นใช้ stdCost
    const branch = await getBranch(branchId)
    const cost =
      item.cost !== undefined
        ? String(item.cost)
        : branch.isAvgCost
          ? product.avgCost.toString()
          : product.stdCost.toString()

    out.push({
      input: item,
      productId: product.id,
      pluId: plu?.id ?? null,
      barcode: plu?.pluCode ?? product.barcode ?? null,
      name: item.name ?? plu?.name ?? product.name,
      unitName: item.unitName ?? product.unit?.name ?? null,
      categoryName: product.category?.name ?? null,
      ratio,
      unitPrice,
      cost,
      vatType: (item.vatType ?? product.vatType) as VatType,
      skuType: product.skuType,
      serviceCharge: product.serviceCharge,
      options: (item.options ?? []) as BillItemOption[],
    })
  }

  return out
}

/**
 * สร้างบิลขาย — ใช้ร่วมกันทั้ง POS (POST /receipts) และการปิดบิลจากโต๊ะ
 * ทุกอย่างอยู่ใน transaction เดียว: ออกเลขบิล → บันทึกบิล → ตัดสต็อก → สะสมคะแนน
 */
export async function createReceipt(
  branchId: string,
  input: CreateReceiptInput,
  actor: { cashierId?: string | null; cashierName?: string | null; posDeviceId?: string | null },
) {
  // idempotency: ส่งซ้ำ (เช่น sync ซ้ำหลังเน็ตหลุด) ต้องคืนบิลเดิม ไม่สร้างใหม่
  if (input.clientId) {
    const existing = await prisma.receipt.findUnique({
      where: { clientId: input.clientId },
      include: { items: true, payments: true },
    })
    if (existing) return { receipt: existing, duplicated: true }
  }

  const branch = await getBranch(branchId)
  const posDeviceId = input.posDeviceId ?? actor.posDeviceId
  if (!posDeviceId) throw badRequest('ต้องระบุเครื่อง POS ที่ออกบิล')

  const cashierId = input.cashierId ?? actor.cashierId ?? null
  const soldAt = input.soldAt ? new Date(input.soldAt) : new Date()
  const businessDay = branchBusinessDay(branch, soldAt)

  // สมาชิกที่อยู่ในกลุ่มราคาส่ง → ใช้ราคาช่องทางของกลุ่มนั้น
  let priceChannel: PriceChannel = 'retail'
  let member = null
  if (input.memberId) {
    member = await prisma.member.findFirst({
      where: { id: input.memberId, branchId, deletedAt: null },
      include: { memberGroup: true },
    })
    if (member?.memberGroup?.priceChannel) {
      priceChannel = member.memberGroup.priceChannel as PriceChannel
    }
  }

  const lines = await resolveLines(branchId, input.items, priceChannel)

  const billItems: BillItemInput[] = lines.map((l, i) => ({
    key: String(i),
    qty: l.input.qty,
    ratio: l.ratio,
    unitPrice: l.unitPrice,
    cost: l.cost,
    itemDiscount: l.input.itemDiscount ?? 0,
    itemDiscountType: (l.input.itemDiscountType ?? 'amount') as DiscountType,
    vatType: l.vatType,
    serviceCharge: l.serviceCharge,
    options: l.options,
  }))

  const totals = calculateBill({
    items: billItems,
    config: billConfigOf(branch),
    billDiscount: input.billDiscount ?? null,
    promotionDiscount: input.promotionDiscount ?? 0,
    serviceChargeOverride: input.serviceChargeOverride ?? null,
    deliveryFee: input.deliveryFee ?? 0,
  })

  const earned = member
    ? pointsEarned(totals.grandTotal, branch.bahtPerPoint.toString())
    : 0

  const receipt = await prisma.$transaction(async (tx) => {
    const receiptNo = await nextReceiptNo(tx, posDeviceId)

    const created = await tx.receipt.create({
      data: {
        branchId,
        posDeviceId,
        cashRoundId: input.cashRoundId ?? null,
        receiptNo,
        status: 'ปกติ',
        clientId: input.clientId ?? null,
        orderType: input.orderType,
        salesChannel: input.salesChannel,
        tableId: input.tableId ?? null,
        guests: input.guests ?? null,
        memberId: input.memberId ?? null,
        cashierId,
        soldAt,
        businessDay,
        subtotal: totals.subtotal,
        itemDiscountTotal: totals.itemDiscountTotal,
        billDiscount: totals.billDiscount,
        billDiscountType: input.billDiscount?.type ?? null,
        billDiscountValue: input.billDiscount ? String(input.billDiscount.value) : null,
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
        pointsEarned: earned,
        note: input.note,
        sourceDevice: actor.posDeviceId ?? null,
        items: {
          create: lines.map((l, i) => {
            const t = totals.items[i]!
            return {
              productId: l.productId,
              pluId: l.pluId,
              barcode: l.barcode,
              name: l.name,
              unitName: l.unitName,
              categoryName: l.categoryName,
              ratio: l.ratio,
              qty: t.qty,
              unitPrice: t.unitPrice,
              itemDiscount: t.itemDiscount,
              itemDiscountType: l.input.itemDiscountType ?? 'amount',
              subtotal: t.lineSubtotal,
              optionTotal: t.optionTotal,
              net: t.lineNet,
              netAfterBillDiscount: t.netAfterBillDiscount,
              allocatedBillDiscount: t.allocatedBillDiscount,
              cost: t.cost,
              vatType: t.vatType,
              options: l.options.length ? (l.options as object) : undefined,
              optionGroupNames: l.options.map((o) => o.groupName).filter(Boolean).join(', ') || null,
              note: l.input.note,
              serialNo: l.input.serialNo,
              channelPriceUsed: priceChannel === 'retail' ? null : priceChannel,
              orderIndex: i,
            }
          }),
        },
        payments: {
          create: input.payments.map((p) => ({
            method: p.method,
            amount: String(p.amount),
            received: String(p.received ?? p.amount),
            change: '0.00',
            refNo: p.refNo,
            customMethodName: p.customMethodName,
          })),
        },
      },
      include: { items: true, payments: true },
    })

    // ตัดสต็อก
    for (const l of lines) {
      if (!l.productId) continue
      await applyProductMovement(tx, {
        branchId,
        productId: l.productId,
        pluId: l.pluId,
        docType: 'SALE',
        docNo: receiptNo,
        receiptId: created.id,
        qty: l.input.qty,
        ratio: l.ratio,
        unitCost: l.cost,
        occurredAt: soldAt,
        actorName: actor.cashierName ?? undefined,
        skuType: l.skuType,
        serialNo: l.input.serialNo ?? null,
      })
    }

    // สมาชิก: สะสมคะแนน + ยอดใช้จ่ายสะสม + วันที่เยี่ยมชม
    if (member) {
      await tx.member.update({
        where: { id: member.id },
        data: {
          totalSpent: { increment: new Prisma.Decimal(totals.grandTotal) },
          pointsBalance: { increment: earned },
          lastVisitAt: soldAt,
          firstVisitAt: member.firstVisitAt ?? soldAt,
        },
      })
      if (earned > 0) {
        await tx.memberPointTransaction.create({
          data: { memberId: member.id, receiptId: created.id, points: earned, type: 'earn' },
        })
      }
    }

    // ยอดขายเงินสดของรอบ ใช้คำนวณ "ควรมีในลิ้นชัก"
    if (input.cashRoundId) {
      const cash = input.payments
        .filter((p) => p.method === 'เงินสด')
        .reduce((a, p) => a.plus(new Prisma.Decimal(String(p.amount))), new Prisma.Decimal(0))
      if (cash.greaterThan(0)) {
        await tx.cashRound.update({
          where: { id: input.cashRoundId },
          data: { cashSales: { increment: cash } },
        })
      }
    }

    if (input.openBillId) {
      await tx.openBill.deleteMany({ where: { id: input.openBillId, branchId } })
    }
    if (input.tableId) {
      await tx.shopTable.update({
        where: { id: input.tableId },
        data: { status: 'free', openedAt: null, guests: null },
      })
    }

    return created
  })

  return { receipt, duplicated: false }
}

/**
 * ยกเลิกบิล (หัวข้อ 7.7)
 * บิลปิดแล้วแก้ไขไม่ได้ ต้องยกเลิกแล้วออกบิลใหม่
 * ยกเลิก → คืนสต็อก คืนคะแนน บันทึกผู้ยกเลิกและเหตุผล เลขบิลเดิมห้ามนำกลับมาใช้
 */
export async function voidReceipt(
  branchId: string,
  receiptId: string,
  reason: string,
  actorName: string,
) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, branchId },
    include: { items: true, payments: true },
  })
  if (!receipt) throw notFound('ไม่พบบิลที่ต้องการยกเลิก')
  if (receipt.status === 'ยกเลิก') throw conflict('บิลนี้ถูกยกเลิกไปแล้ว')

  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const updated = await tx.receipt.update({
      where: { id: receiptId },
      data: { status: 'ยกเลิก', voidedAt: now, voidedBy: actorName, voidReason: reason },
      include: { items: true, payments: true },
    })

    for (const item of receipt.items) {
      if (!item.productId) continue
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { skuType: true },
      })
      await applyProductMovement(tx, {
        branchId,
        productId: item.productId,
        pluId: item.pluId,
        docType: 'VOID',
        docNo: receipt.receiptNo,
        receiptId: receipt.id,
        qty: item.qty,
        ratio: item.ratio,
        unitCost: item.cost.toString(),
        occurredAt: now,
        actorName,
        note: reason,
        skuType: product?.skuType ?? 'P',
        serialNo: item.serialNo,
      })
    }

    if (receipt.memberId) {
      await tx.member.update({
        where: { id: receipt.memberId },
        data: {
          totalSpent: { decrement: receipt.grandTotal },
          pointsBalance: { decrement: receipt.pointsEarned },
        },
      })
      if (receipt.pointsEarned > 0) {
        await tx.memberPointTransaction.create({
          data: {
            memberId: receipt.memberId, receiptId: receipt.id,
            points: -receipt.pointsEarned, type: 'redeem', note: `ยกเลิกบิล ${receipt.receiptNo}`,
          },
        })
      }
      // กันคะแนน/ยอดสะสมติดลบ
      await tx.member.updateMany({
        where: { id: receipt.memberId, pointsBalance: { lt: 0 } }, data: { pointsBalance: 0 },
      })
      await tx.member.updateMany({
        where: { id: receipt.memberId, totalSpent: { lt: 0 } }, data: { totalSpent: '0' },
      })
    }

    if (receipt.cashRoundId) {
      const cash = receipt.payments
        .filter((p) => p.method === 'เงินสด')
        .reduce((a, p) => a.plus(p.amount), new Prisma.Decimal(0))
      if (cash.greaterThan(0)) {
        await tx.cashRound.update({
          where: { id: receipt.cashRoundId },
          data: { cashSales: { decrement: cash } },
        })
      }
    }

    return updated
  })
}
