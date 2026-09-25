import { z } from 'zod'

export const DEFAULT_LIMIT = 50

/** พารามิเตอร์ร่วมของทุกหน้าตาราง/รายงาน (แบบเดียวกับต้นฉบับ) */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(DEFAULT_LIMIT),
  search: z.string().trim().optional(),
  /** ขอบเขตการค้นหา: all | name | code | category | type */
  searchBy: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  /** ส่งออกไฟล์แทนการคืน JSON */
  export: z.enum(['xlsx', 'csv']).optional(),
})
export type ListQuery = z.infer<typeof listQuerySchema>

/** ช่วงวันที่ของรายงาน — รูปแบบ YYYY-MM-DD ตามวันขายของสาขา */
export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export interface Paged<T> {
  data: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export function paged<T>(data: T[], total: number, query: { page: number; limit: number }): Paged<T> {
  return {
    data,
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  }
}

export function skipTake(query: { page: number; limit: number }) {
  return { skip: (query.page - 1) * query.limit, take: query.limit }
}

/** ช่วงวันที่เริ่มต้น: วันนี้ (ตามเวลาสาขา) */
export function defaultRange(timeZone = 'Asia/Bangkok') {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return { from: today, to: today }
}
