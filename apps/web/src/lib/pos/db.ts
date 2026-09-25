'use client'

import Dexie, { type Table } from 'dexie'

/**
 * ฐานข้อมูลในเครื่อง (IndexedDB) สำหรับแอป POS — ต้องขายได้แม้ไม่มีเน็ต (หัวข้อ 5, 7.10)
 * เก็บ master data ที่ดึงมาจาก /sync/master และคิวบิลที่รอส่งขึ้น server
 */

export interface LocalPlu {
  id: string
  pluCode: string
  name: string
  skuRatio: string
  price: string
  cost: string
  stockQty: string
  isDefault: boolean
  useStepPrice: boolean
  unitId: string | null
}

export interface LocalProduct {
  id: string
  name: string
  barcode: string | null
  skuCode: string | null
  price: string
  stdCost: string
  avgCost: string
  skuType: 'P' | 'BOM' | 'SN' | 'SV'
  vatType: 'V' | 'N'
  categoryId: string | null
  unitId: string | null
  color: string
  favorite: boolean
  favoriteIndex: number
  isOnScreen: boolean
  itemSequence: number
  negotiatePrice: boolean
  isSoldByWeight: boolean
  serviceCharge: boolean
  enabled: boolean
  keyword: string | null
  plus: LocalPlu[]
  stepPrices: { minQty: string; price: string }[]
  channelPrices: { channel: string; enabled: boolean; price: string }[]
  optionGroups: { optionGroupId: string; orderIndex: number }[]
}

export interface LocalCategory {
  id: string
  name: string
  bgColor: string
  enabled: boolean
  orderIndex: number
}

export interface LocalUnit { id: string; name: string; enabled: boolean }

export interface LocalOption { id: string; name: string; price: string; cost: string; enabled: boolean }

export interface LocalOptionGroup {
  id: string
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  items: { optionId: string; option: LocalOption }[]
}

export interface LocalMember {
  id: string
  name: string
  phone: string | null
  pointsBalance: number
  totalSpent: string
  memberGroup: { name: string; priceChannel: string | null } | null
}

export interface LocalCashier {
  id: string
  name: string
  orderIndex: number
  enabled: boolean
  permissions: Record<string, unknown>
}

/** ค่าที่เก็บเป็นคู่ key/value เช่น ตั้งค่าสาขา, เวลาซิงค์ล่าสุด */
export interface KeyValue { key: string; value: unknown }

/** บิลที่รอส่งขึ้น server (offline queue) */
export interface PendingReceipt {
  clientId: string
  payload: Record<string, unknown>
  /** ยอดรวมไว้แสดงในรายการบิลตอนออฟไลน์ */
  summary: { receiptNo: string; grandTotal: string; soldAt: string; itemCount: number }
  createdAt: number
  attempts: number
  lastError: string | null
}

class MedeePosDb extends Dexie {
  products!: Table<LocalProduct, string>
  categories!: Table<LocalCategory, string>
  units!: Table<LocalUnit, string>
  options!: Table<LocalOption, string>
  optionGroups!: Table<LocalOptionGroup, string>
  members!: Table<LocalMember, string>
  cashiers!: Table<LocalCashier, string>
  kv!: Table<KeyValue, string>
  pending!: Table<PendingReceipt, string>

  constructor() {
    super('medee-pos')
    this.version(1).stores({
      products: 'id, barcode, categoryId, favoriteIndex, itemSequence, keyword',
      categories: 'id, orderIndex',
      units: 'id',
      options: 'id',
      optionGroups: 'id',
      members: 'id, phone, name',
      cashiers: 'id, orderIndex',
      kv: 'key',
      pending: 'clientId, createdAt',
    })
  }
}

let instance: MedeePosDb | null = null

export function db(): MedeePosDb {
  if (!instance) instance = new MedeePosDb()
  return instance
}

export async function getValue<T>(key: string): Promise<T | undefined> {
  const row = await db().kv.get(key)
  return row?.value as T | undefined
}

export async function setValue(key: string, value: unknown): Promise<void> {
  await db().kv.put({ key, value })
}

/** ล้างข้อมูลทั้งหมดในเครื่อง (ใช้ตอนปลดเครื่อง) */
export async function clearLocal(): Promise<void> {
  const d = db()
  await Promise.all([
    d.products.clear(), d.categories.clear(), d.units.clear(), d.options.clear(),
    d.optionGroups.clear(), d.members.clear(), d.cashiers.clear(), d.kv.clear(),
  ])
}
