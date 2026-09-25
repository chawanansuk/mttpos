/**
 * เลขเอกสารรัน (หัวข้อ 7.9)
 * ทุกฟังก์ชันรับ "ตัวนับถัดไป" แล้วคืนสตริงเลขเอกสาร
 * การกันเลขซ้ำต้องทำแบบ atomic ที่ชั้น DB (row lock / sequence)
 */

export type DocKind =
  | 'receipt'
  | 'taxInvoice'
  | 'receive'
  | 'issue'
  | 'adjustInc'
  | 'adjustDec'
  | 'count'
  | 'transferOut'
  | 'transferIn'
  | 'productReturn'

function pad(n: number, width: number): string {
  const v = Math.max(0, Math.trunc(n))
  return String(v).padStart(width, '0')
}

/** บิลขาย: PS + posNumber(3) + running(6) — เช่น PS002006889 */
export function receiptNo(posNumber: string, running: number): string {
  const pos = posNumber.replace(/\D/g, '').padStart(3, '0').slice(-3)
  return `PS${pos}${pad(running, 6)}`
}

/** ใบกำกับภาษีเต็มรูป: IV + YYMM + "-" + running(4) — เช่น IV2609-0001 */
export function taxInvoiceNo(date: Date, running: number): string {
  const yy = String(date.getFullYear() % 100).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `IV${yy}${mm}-${pad(running, 4)}`
}

export const DOC_PREFIXES: Record<Exclude<DocKind, 'receipt' | 'taxInvoice'>, string> = {
  receive: 'RCV',
  issue: 'ISS',
  adjustInc: 'ADJI',
  adjustDec: 'ADJD',
  count: 'CNT',
  transferOut: 'TO',
  transferIn: 'TI',
  productReturn: 'RT',
}

/** เอกสารคลัง: PREFIX + running(7) — เช่น RCV0000756, ADJI0000066, TO0000001 */
export function stockDocNo(
  kind: Exclude<DocKind, 'receipt' | 'taxInvoice'>,
  running: number,
): string {
  return `${DOC_PREFIXES[kind]}${pad(running, 7)}`
}

/**
 * คิวลูกค้า — รันรายวัน รีเซ็ตเมื่อข้ามวันขาย (หัวข้อ 7.9)
 * คืนคิวถัดไปพร้อมวันที่ที่ต้องบันทึกกลับ
 */
export function nextQueueNumber(
  currentQueue: number,
  currentQueueDate: string | null,
  businessDate: string,
): { queue: number; queueDate: string } {
  if (currentQueueDate !== businessDate) return { queue: 1, queueDate: businessDate }
  return { queue: Math.max(0, Math.trunc(currentQueue)) + 1, queueDate: businessDate }
}
