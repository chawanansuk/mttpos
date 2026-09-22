import { prisma, type Branch } from '@medee/db'
import { businessDay, businessDayRange, type BillConfig, type RoundingType } from '@medee/domain'
import { notFound } from './errors.js'

const cache = new Map<string, { at: number; branch: Branch }>()
const TTL_MS = 5_000

/** โหลดตั้งค่าสาขา (cache สั้น ๆ เพราะทุก request ต้องใช้) */
export async function getBranch(branchId: string): Promise<Branch> {
  const hit = cache.get(branchId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.branch
  const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } })
  if (!branch) throw notFound('ไม่พบสาขาที่ระบุ')
  cache.set(branchId, { at: Date.now(), branch })
  return branch
}

export function invalidateBranch(branchId: string) {
  cache.delete(branchId)
}

/** แปลงตั้งค่าสาขาเป็น config ของเครื่องคำนวณบิล (หัวข้อ 7.1) */
export function billConfigOf(branch: Branch): BillConfig {
  return {
    vatRate: branch.vatRate.toString(),
    isVatIncluded: branch.isVatIncluded,
    enabledServiceCharge: branch.enabledServiceCharge,
    serviceChargeRate: branch.serviceChargeRate.toString(),
    serviceChargeVatable: branch.serviceChargeVatable,
    roundingType: branch.roundingType as RoundingType,
    roundingAmount: branch.roundingAmount.toString(),
  }
}

/** วันขายของเวลาที่กำหนด ตามเวลาเปิด-ปิดของสาขา (หัวข้อ 7.6) */
export function branchBusinessDay(branch: Branch, at: Date): string {
  return businessDay(at, {
    openTime: branch.openTime,
    closeTime: branch.closeTime,
    timeZone: branch.timezone,
  })
}

export function branchDayRange(branch: Branch, from: string, to: string) {
  return businessDayRange(from, to, {
    openTime: branch.openTime,
    closeTime: branch.closeTime,
    timeZone: branch.timezone,
  })
}

/** วันนี้ตามเวลาสาขา (YYYY-MM-DD) */
export function branchToday(branch: Branch): string {
  return branchBusinessDay(branch, new Date())
}
