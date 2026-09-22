import { Prisma, prisma } from '@medee/db'
import { receiptNo, stockDocNo, taxInvoiceNo } from '@medee/domain'

/**
 * ออกเลขเอกสารแบบ atomic (หัวข้อ 7.9)
 * ใช้ UPDATE ... RETURNING เพื่อกันเลขซ้ำเมื่อมีหลายเครื่องออกบิลพร้อมกัน
 * เลขที่ถูกใช้แล้วห้ามนำกลับมาใช้ซ้ำ แม้บิลจะถูกยกเลิก
 */

type BranchCounter =
  | 'stockInRunNumber'
  | 'stockOutRunNumber'
  | 'adjIncRunNumber'
  | 'adjDecRunNumber'
  | 'checkStockRunNumber'
  | 'transferOutRunNumber'
  | 'transferInRunNumber'
  | 'returnRunNumber'
  | 'taxInvoiceRunNumber'

async function bumpBranchCounter(
  tx: Prisma.TransactionClient,
  branchId: string,
  column: BranchCounter,
): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ value: number }[]>(
    `UPDATE branches SET "${column}" = "${column}" + 1 WHERE id = $1::uuid RETURNING "${column}" AS value`,
    branchId,
  )
  const value = rows[0]?.value
  if (value === undefined) throw new Error('ไม่พบสาขาสำหรับออกเลขเอกสาร')
  return Number(value)
}

/** เลขบิลขาย — ผูกกับเครื่อง POS เพื่อให้เครื่องที่ offline ออกเลขเองได้ */
export async function nextReceiptNo(
  tx: Prisma.TransactionClient,
  posDeviceId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number; posnumber: string }[]>`
    UPDATE pos_devices
    SET "invoiceRunNumber" = "invoiceRunNumber" + 1
    WHERE id = ${posDeviceId}::uuid
    RETURNING "invoiceRunNumber" AS value, "posNumber" AS posnumber
  `
  const row = rows[0]
  if (!row) throw new Error('ไม่พบเครื่อง POS สำหรับออกเลขบิล')
  return receiptNo(row.posnumber, Number(row.value))
}

const STOCK_COUNTER: Record<string, BranchCounter> = {
  receive: 'stockInRunNumber',
  issue: 'stockOutRunNumber',
  adjustInc: 'adjIncRunNumber',
  adjustDec: 'adjDecRunNumber',
  count: 'checkStockRunNumber',
  transferOut: 'transferOutRunNumber',
  transferIn: 'transferInRunNumber',
  productReturn: 'returnRunNumber',
}

export async function nextStockDocNo(
  tx: Prisma.TransactionClient,
  branchId: string,
  kind: keyof typeof STOCK_COUNTER,
): Promise<string> {
  const column = STOCK_COUNTER[kind]
  if (!column) throw new Error(`ไม่รู้จักประเภทเอกสาร: ${kind}`)
  const value = await bumpBranchCounter(tx, branchId, column)
  return stockDocNo(kind as Parameters<typeof stockDocNo>[0], value)
}

export async function nextTaxInvoiceNo(
  tx: Prisma.TransactionClient,
  branchId: string,
  date = new Date(),
): Promise<string> {
  const value = await bumpBranchCounter(tx, branchId, 'taxInvoiceRunNumber')
  return taxInvoiceNo(date, value)
}

/** คิวลูกค้า — รันรายวันและรีเซ็ตเมื่อข้ามวันขาย */
export async function nextQueueNo(branchId: string, businessDay: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ queue: number }[]>`
    UPDATE branches
    SET "runningQueue" = CASE WHEN "runningQueueDate" = ${businessDay} THEN "runningQueue" + 1 ELSE 1 END,
        "runningQueueDate" = ${businessDay}
    WHERE id = ${branchId}::uuid
    RETURNING "runningQueue" AS queue
  `
  return Number(rows[0]?.queue ?? 1)
}
