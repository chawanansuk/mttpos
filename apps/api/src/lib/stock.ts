import { Prisma } from '@medee/db'
import { movementSign, weightedAverageCost, type MovementType } from '@medee/domain'

export interface MovementInput {
  branchId: string
  productId: string
  pluId: string | null
  docType: MovementType
  docNo: string
  documentId?: string | null
  receiptId?: string | null
  /** จำนวนของ PLU ที่ทำรายการ (จะถูกคูณ ratio เป็นหน่วยฐานให้อัตโนมัติ) */
  qty: Prisma.Decimal | string | number
  ratio?: Prisma.Decimal | string | number
  unitCost?: string
  occurredAt: Date
  actorName?: string
  note?: string
}

/**
 * บันทึกความเคลื่อนไหวสินค้า 1 รายการ แล้วปรับยอดคงเหลือ (หัวข้อ 7.5)
 * ยอดคงเหลือเก็บที่ PLU หลัก (ratio = 1) เสมอ เป็น "หน่วยฐาน"
 * อนุญาตให้ติดลบได้ตามพฤติกรรมของร้าน
 */
export async function recordMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const sign = movementSign(input.docType)
  if (sign === 0) return null // เอกสารตรวจนับไม่กระทบสต็อก

  const ratio = new Prisma.Decimal(input.ratio ?? 1)
  const baseQty = new Prisma.Decimal(input.qty).times(ratio).times(sign)

  const mainPlu = await tx.productPlu.findFirst({
    where: { productId: input.productId, isDefault: true },
    select: { id: true },
  })
  if (!mainPlu) return null

  const updated = await tx.productPlu.update({
    where: { id: mainPlu.id },
    data: { stockQty: { increment: baseQty } },
    select: { stockQty: true },
  })

  return tx.stockMovement.create({
    data: {
      branchId: input.branchId,
      productId: input.productId,
      pluId: input.pluId ?? mainPlu.id,
      docType: input.docType,
      docNo: input.docNo,
      documentId: input.documentId ?? null,
      receiptId: input.receiptId ?? null,
      qty: baseQty,
      unitCost: input.unitCost ?? '0',
      balanceAfter: updated.stockQty,
      occurredAt: input.occurredAt,
      actorName: input.actorName,
      note: input.note,
    },
  })
}

/**
 * ตัดสต็อกตามชนิดสินค้า:
 *   P  → ตัดตัวเอง
 *   SV → ไม่ตัด (สินค้าบริการ)
 *   BOM → ตัดส่วนประกอบตามสูตร
 *   SN  → ตัดตัวเอง และเปลี่ยนสถานะ serial เป็นขายแล้ว
 */
export async function applyProductMovement(
  tx: Prisma.TransactionClient,
  input: MovementInput & { skuType?: string; serialNo?: string | null },
) {
  const skuType = input.skuType ?? 'P'
  if (skuType === 'SV') return

  if (skuType === 'BOM') {
    const components = await tx.productBomItem.findMany({
      where: { productId: input.productId },
      select: { componentProductId: true, qtyPerUnit: true },
    })
    for (const c of components) {
      await recordMovement(tx, {
        ...input,
        productId: c.componentProductId,
        pluId: null,
        qty: new Prisma.Decimal(input.qty).times(c.qtyPerUnit),
        ratio: 1,
        note: `${input.note ?? ''} (ส่วนประกอบของสินค้าประกอบ)`.trim(),
      })
    }
    return
  }

  await recordMovement(tx, input)

  if (skuType === 'SN' && input.serialNo) {
    const sign = movementSign(input.docType)
    await tx.productSerial.updateMany({
      where: { productId: input.productId, serialNo: input.serialNo },
      data: { status: sign < 0 ? 'sold' : 'available' },
    })
  }
}

/** อัปเดตต้นทุนเฉลี่ยตอนรับสินค้าเข้า เมื่อติ๊ก "คำนวนต้นทุนเฉลี่ย" (หัวข้อ 7.5) */
export async function updateAverageCost(
  tx: Prisma.TransactionClient,
  productId: string,
  receivedQty: Prisma.Decimal | string | number,
  receivedUnitCost: string,
) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { avgCost: true, plus: { where: { isDefault: true }, select: { stockQty: true } } },
  })
  if (!product) return
  const currentQty = product.plus[0]?.stockQty ?? new Prisma.Decimal(0)
  const next = weightedAverageCost(
    currentQty.toString(),
    product.avgCost.toString(),
    String(receivedQty),
    receivedUnitCost,
  )
  await tx.product.update({ where: { id: productId }, data: { avgCost: next } })
}
