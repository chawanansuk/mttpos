'use client'

import { api, ApiError, session } from '@/lib/api'
import {
  clearLocal, db, getValue, setValue,
  type LocalCashier, type LocalCategory, type LocalMember, type LocalOption,
  type LocalOptionGroup, type LocalProduct, type LocalUnit, type PendingReceipt,
} from './db'

const LAST_SYNC = 'lastSyncAt'
const BRANCH_SETTINGS = 'branchSettings'

export interface BranchSettings {
  id: string
  branchName: string
  businessType: number
  vatRate: string
  isVatIncluded: boolean
  enabledServiceCharge: boolean
  serviceChargeRate: string
  serviceChargeVatable: boolean
  roundingType: 'none' | 'up' | 'down' | 'nearest'
  roundingAmount: string
  isAvgCost: boolean
  fastInput: string
  cashManagement: boolean
  isMultiplePayment: boolean
  editableItem: boolean
  isSoldByWeight: boolean
  bahtPerPoint: string
  paymentPromptpay: boolean
  promptpayId: string | null
  promptpayAccName: string | null
  openTime: string
  closeTime: string
  timezone: string
  shop: { name: string }
}

interface SyncResponse {
  serverTime: string
  branch: BranchSettings
  categories: LocalCategory[]
  units: LocalUnit[]
  options: LocalOption[]
  optionGroups: LocalOptionGroup[]
  products: LocalProduct[]
  members: LocalMember[]
  cashiers: LocalCashier[]
  paymentConfigs: { methodKey: string; label: string; enabled: boolean; config: Record<string, unknown> | null }[]
}

/**
 * ดึง master data ลงเครื่อง
 * ครั้งแรกดึงทั้งหมด ครั้งถัดไปดึงเฉพาะที่เปลี่ยนหลัง lastSyncAt
 */
export async function pullMaster(force = false): Promise<{ products: number; since: string | null }> {
  const since = force ? null : ((await getValue<string>(LAST_SYNC)) ?? null)
  const data = await api<SyncResponse>('/sync/master', { query: { since: since ?? undefined } })
  const d = db()

  await d.transaction('rw', [d.products, d.categories, d.units, d.options, d.optionGroups, d.members, d.cashiers, d.kv], async () => {
    if (force) await Promise.all([d.products.clear(), d.categories.clear(), d.members.clear()])
    if (data.categories.length) await d.categories.bulkPut(data.categories)
    if (data.units.length) await d.units.bulkPut(data.units)
    if (data.options.length) await d.options.bulkPut(data.options)
    if (data.optionGroups.length) await d.optionGroups.bulkPut(data.optionGroups)
    if (data.products.length) await d.products.bulkPut(data.products)
    if (data.members.length) await d.members.bulkPut(data.members)
    if (data.cashiers.length) await d.cashiers.bulkPut(data.cashiers)
    await d.kv.put({ key: BRANCH_SETTINGS, value: data.branch })
    await d.kv.put({ key: 'paymentConfigs', value: data.paymentConfigs })
    await d.kv.put({ key: LAST_SYNC, value: data.serverTime })
  })

  return { products: data.products.length, since }
}

export async function getBranchSettings(): Promise<BranchSettings | undefined> {
  return getValue<BranchSettings>(BRANCH_SETTINGS)
}

export async function getPaymentConfigs() {
  return (await getValue<{ methodKey: string; label: string; enabled: boolean; config: Record<string, unknown> | null }[]>('paymentConfigs')) ?? []
}

export async function lastSyncAt(): Promise<string | null> {
  return (await getValue<string>(LAST_SYNC)) ?? null
}

/** เพิ่มบิลเข้าคิวรอส่ง (ใช้เมื่อออฟไลน์ หรือส่งขึ้น server ไม่สำเร็จ) */
export async function queueReceipt(item: Omit<PendingReceipt, 'createdAt' | 'attempts' | 'lastError'>) {
  await db().pending.put({ ...item, createdAt: Date.now(), attempts: 0, lastError: null })
}

export async function pendingCount(): Promise<number> {
  return db().pending.count()
}

export async function pendingList(): Promise<PendingReceipt[]> {
  return db().pending.orderBy('createdAt').toArray()
}

/**
 * ส่งบิลที่ค้างอยู่ขึ้น server
 * clientId เป็น idempotency key — ส่งซ้ำจะไม่สร้างบิลซ้ำ
 */
export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  const items = await pendingList()
  if (items.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  try {
    const res = await api<{ results: { clientId?: string; ok: boolean; error?: string }[] }>('/sync/push', {
      method: 'POST',
      body: { receipts: items.map((i) => i.payload) },
    })
    for (const result of res.results) {
      const item = items.find((i) => i.clientId === result.clientId)
      if (!item) continue
      if (result.ok) {
        await db().pending.delete(item.clientId)
        sent += 1
      } else {
        failed += 1
        await db().pending.update(item.clientId, {
          attempts: item.attempts + 1,
          lastError: result.error ?? 'ไม่ทราบสาเหตุ',
        })
      }
    }
  } catch (error) {
    // ส่งไม่ได้ทั้งชุด (เช่น เน็ตหลุด) — เก็บไว้ลองใหม่รอบหน้า
    const message = error instanceof ApiError ? error.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'
    for (const item of items) {
      await db().pending.update(item.clientId, { attempts: item.attempts + 1, lastError: message })
    }
    return { sent: 0, failed: items.length }
  }
  return { sent, failed }
}

/** ปลดเครื่องออกจากสาขา — ล้างข้อมูลในเครื่องทั้งหมด */
export async function unbindDevice() {
  await clearLocal()
  await db().pending.clear()
  session.clear()
}

export { setValue, getValue }
