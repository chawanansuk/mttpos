/**
 * สิทธิ์การเข้าถึง (หัวข้อ 3.3) และการแก้บั๊กการเทียบ path (หัวข้อ 2.3)
 *
 * ต้นฉบับมีบั๊ก: เปิด URL ที่มี "/" ต่อท้าย (เช่น /product/) แล้วหาไม่เจอในตารางสิทธิ์
 * ของเราต้อง normalize path (ตัด trailing slash, ตัด query/hash, lower-case)
 * ก่อนเทียบทุกครั้ง และต้องตรวจสิทธิ์ที่ API ด้วย ไม่ใช่แค่ฝั่ง UI
 */

export type PermissionAction = 'read' | 'edit' | 'remove' | 'export'
export const PERMISSION_ACTIONS: PermissionAction[] = ['read', 'edit', 'remove', 'export']

/** ป้ายหัวคอลัมน์ในตารางสิทธิ์ */
export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'แสดง',
  edit: 'เพิ่ม/แก้ไข',
  remove: 'ลบ',
  export: 'ส่งออกไฟล์',
}

export interface PermissionMenu {
  path: string
  label: string
  /** ล็อกตามแพ็กเกจ — ฟีเจอร์ยังไม่เปิดให้ร้านนี้ */
  lock: boolean
  orderIndex: number
  read: boolean
  edit: boolean
  remove: boolean
  export: boolean
}

export interface PermissionModule {
  path: string
  label: string
  /** master toggle "เปิดใช้งาน/ปิดใช้งาน" ของแท็บ */
  enable: boolean
  lock: boolean
  menu: PermissionMenu[]
}

/** โครง JSON สิทธิ์ (รูปแบบเดียวกับต้นฉบับ) */
export type PermissionSet = Record<string, PermissionModule>

export interface ModuleDef {
  key: string
  label: string
  /** ฟีเจอร์ที่ล็อกไว้ตามแพ็กเกจโดย default */
  lockedByDefault?: boolean
  menu: { path: string; label: string; lockedByDefault?: boolean }[]
}

/** ตารางสิทธิ์เต็ม 11 แท็บ ตามหัวข้อ 3.3 + แผนผังเมนูหัวข้อ 6.1 */
export const MODULE_DEFS: ModuleDef[] = [
  { key: 'dashboard', label: 'รายงานสรุป', menu: [{ path: '/dashboard', label: 'รายงานสรุป' }] },
  {
    key: 'transaction',
    label: 'ประวัติการขาย',
    menu: [{ path: '/report/transaction', label: 'ประวัติการขาย' }],
  },
  {
    key: 'currentBill',
    label: 'บิลที่เปิดอยู่',
    menu: [{ path: '/report/currentbill', label: 'บิลที่เปิดอยู่' }],
  },
  {
    key: 'promotionDashboard',
    label: 'รายงานโปรโมชั่น',
    lockedByDefault: true,
    menu: [{ path: '/promotiondashboard', label: 'รายงานโปรโมชั่น' }],
  },
  {
    key: 'grabDashboard',
    label: 'รายงาน Grab',
    lockedByDefault: true,
    menu: [{ path: '/grabdashboard', label: 'รายงาน Grab' }],
  },
  {
    key: 'report',
    label: 'รายงาน',
    menu: [
      { path: '/report/daily', label: 'ยอดขายสินค้าตามวัน' },
      { path: '/report/sell', label: 'ยอดขายตามรายละเอียดบิล' },
      { path: '/report/sku', label: 'ยอดขายตามสินค้า' },
      { path: '/report/plu', label: 'ยอดขายสินค้าตามขนาดบรรจุ' },
      { path: '/report/unsell', label: 'สินค้าที่ไม่มีการขาย' },
      { path: '/report/cashier', label: 'ยอดขายแยกตามพนักงาน' },
      { path: '/report/category', label: 'การขายแยกตามกลุ่มสินค้า' },
      { path: '/report/payment', label: 'การชำระเงิน' },
      { path: '/report/tax', label: 'สรุปภาษีขาย' },
      { path: '/report/closesell', label: 'ปิดรอบการขาย' },
      { path: '/report/voidbill', label: 'ยกเลิกการขาย' },
      { path: '/report/timesheet', label: 'ชั่วโมงการทำงาน' },
      { path: '/report/stockin', label: 'รับสินค้าเข้าแสดงรายการ' },
      { path: '/report/stockout', label: 'จ่ายสินค้าออกแสดงรายการ' },
      { path: '/report/nonadjust', label: 'สินค้าที่ยังไม่ปรับปรุงสต๊อก' },
      { path: '/report/export-product', label: 'ส่งออกรายการสินค้า' },
      { path: '/report/optional', label: 'ยอดขายตามตัวเลือก' },
      { path: '/report/newPayment', label: 'บิลที่ออกใบกำกับภาษี' },
      { path: '/report/cashIn-Out', label: 'นำเงินเข้า-นำเงินออก' },
      { path: '/report/salesChannels', label: 'ยอดขายตามช่องทางการขาย' },
      { path: '/report/table', label: 'สถิติการใช้โต๊ะ' },
      { path: '/inventory/transfer/transferReport', label: 'การโอนและรับสินค้า' },
      { path: '/report/optionSalesByDate', label: 'การสั่งกลุ่มตัวเลือกตามวัน' },
      { path: '/report/optionSalesByCost', label: 'ต้นทุนตามตัวเลือก' },
      { path: '/report/taxBillSales', label: 'สรุปการขายเฉพาะสินค้ามีภาษี' },
      { path: '/report/phone', label: 'ยอดใช้จ่ายตามลูกค้า' },
      { path: '/promotion', label: 'โปรโมชัน' },
      { path: '/report/stockOutbyType', label: 'สินค้าจ่ายออกตามประเภท' },
    ],
  },
  {
    key: 'orderDevice',
    label: 'เครื่อง Order',
    lockedByDefault: true,
    menu: [
      { path: '/report/dailyOrder', label: 'ยอดขายสินค้า' },
      { path: '/report/sellOrder', label: 'สินค้าขายได้' },
      { path: '/report/voidBillOrder', label: 'ยกเลิกการขายสินค้า' },
    ],
  },
  {
    key: 'inventory',
    label: 'งานคลังสินค้า',
    menu: [
      { path: '/inventory/sku', label: 'สินค้าคงเหลือตาม SKU' },
      { path: '/inventory/plu', label: 'สินค้าคงเหลือตามขนาดบรรจุ' },
      { path: '/inventory/serial', label: 'สินค้ามี Serial No.' },
      { path: '/inventory/stockcard', label: 'ความเคลื่อนไหวสินค้า' },
      { path: '/inventory/stock-in', label: 'รับสินค้าเข้า' },
      { path: '/inventory/stock-out', label: 'จ่ายสินค้าออก' },
      { path: '/inventory/adjust-stock', label: 'ปรับปรุงสต๊อก' },
      { path: '/inventory/check-stock', label: 'ตรวจนับสินค้า' },
      { path: '/inventory/lessStock', label: 'สินค้าเหลือน้อย' },
      { path: '/inventory/outOfStock', label: 'สินค้าหมด' },
      { path: '/inventory/transferOut', label: 'โอนสินค้าระหว่างสาขา' },
      { path: '/inventory/transferIn', label: 'รับสินค้าระหว่างสาขา' },
      { path: '/inventory/productReturn', label: 'ตีกลับสินค้า' },
    ],
  },
  {
    key: 'product',
    label: 'สินค้า',
    menu: [
      { path: '/product', label: 'สินค้า' },
      { path: '/product/category', label: 'กลุ่มสินค้า' },
      { path: '/product/unit', label: 'หน่วยบรรจุ' },
      { path: '/product/option', label: 'ตัวเลือกเสริม' },
      { path: '/product/optiongroup', label: 'กลุ่มตัวเลือก' },
      { path: '/product/importProduct', label: 'นำเข้ารายการสินค้า' },
      { path: '/product/deliverymanage', label: 'จัดการเมนูเดลิเวอร์รี่', lockedByDefault: true },
      { path: '/product/saleschannels', label: 'ช่องทางการขาย' },
      { path: '/product/mangesaleshours', label: 'ช่วงเวลาการขาย' },
      { path: '/product/managemenuranking', label: 'จัดการเมนูขายหน้าร้าน' },
      { path: '/product/translate', label: 'จัดการแปลภาษา' },
    ],
  },
  {
    key: 'member',
    label: 'สมาชิก',
    menu: [
      { path: '/member/data', label: 'สมาชิก' },
      { path: '/member/ImportMember', label: 'นำเข้ารายชื่อสมาชิก' },
    ],
  },
  {
    key: 'setting',
    label: 'การตั้งค่า',
    menu: [
      { path: '/setting/shop', label: 'ร้านค้า' },
      { path: '/shop', label: 'ร้านค้าและสาขา' },
      { path: '/setting/language', label: 'ภาษาและโซนเวลา' },
      { path: '/setting/payment', label: 'การชำระเงิน' },
      { path: '/setting/receipt', label: 'ใบเสร็จรับเงิน' },
      { path: '/setting/cashier', label: 'พนักงาน' },
      { path: '/setting/permission', label: 'สิทธิการเข้าถึง' },
      { path: '/setting/delivery', label: 'รายชื่อผู้ให้บริการเดลิเวอรี่' },
      { path: '/setting/tools', label: 'เครื่องมือสำหรับผู้ดูแลระบบ' },
      { path: '/setting/alert', label: 'การแจ้งเตือน' },
      { path: '/user', label: 'บัญชีร้านค้า' },
      { path: '/setting/smart-menu', label: 'ตั้งค่า E-Menu (CRM)', lockedByDefault: true },
      { path: '/setting/self-service', label: 'ตั้งค่าแสดงเมนูสินค้า', lockedByDefault: true },
      { path: '/setting/self-service/qr-order', label: 'สั่งอาหารด้วยตัวเอง', lockedByDefault: true },
      { path: '/setting/queue-display', label: 'จอแสดงคิว (Queue Display)', lockedByDefault: true },
      { path: '/setting/deliveryonoff', label: 'เปิด/ปิด เดลิเวอรี่', lockedByDefault: true },
      { path: '/setting/grabintegration', label: 'เชื่อมต่อ Grab', lockedByDefault: true },
    ],
  },
]

/**
 * normalize path ก่อนเทียบสิทธิ์ (แก้บั๊กหัวข้อ 2.3)
 * - ตัด query string และ hash
 * - ตัด trailing slash (แต่คง "/" เดี่ยวไว้)
 * - บังคับ leading slash
 * - lower-case (route ต้นฉบับมีทั้ง /report/cashIn-Out และ /report/newPayment)
 */
export function normalizePath(path: string): string {
  if (!path) return '/'
  let p = String(path).split('?')[0]!.split('#')[0]!.trim()
  if (!p.startsWith('/')) p = `/${p}`
  p = p.replace(/\/+/g, '/')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p.toLowerCase()
}

/** สร้างชุดสิทธิ์จากตารางมาตรฐาน โดยกำหนดค่าเริ่มต้นให้ทุกช่อง */
export function buildPermissionSet(options: { grantAll?: boolean } = {}): PermissionSet {
  const grant = options.grantAll ?? false
  const set: PermissionSet = {}
  for (const mod of MODULE_DEFS) {
    set[mod.key] = {
      path: '#',
      label: mod.label,
      enable: grant ? true : false,
      lock: mod.lockedByDefault ?? false,
      menu: mod.menu.map((m, i) => ({
        path: m.path,
        label: m.label,
        lock: m.lockedByDefault ?? false,
        orderIndex: i,
        read: grant,
        edit: grant,
        remove: grant,
        export: grant,
      })),
    }
  }
  return set
}

/** owner เข้าถึงได้ทุกอย่างและแก้สิทธิ์ไม่ได้ */
export function ownerPermissionSet(): PermissionSet {
  const set = buildPermissionSet({ grantAll: true })
  for (const mod of Object.values(set)) {
    mod.lock = false
    for (const m of mod.menu) m.lock = false
  }
  return set
}

export interface PermissionCheck {
  allowed: boolean
  /** true = ถูกล็อกเพราะแพ็กเกจ (แสดงหน้าโปรโมท ไม่ใช่หน้า "ไม่มีสิทธิ์") */
  locked: boolean
  reason?: 'owner' | 'granted' | 'module_disabled' | 'no_permission' | 'unknown_path' | 'locked'
}

/**
 * ตรวจสิทธิ์ของ path ที่ร้องขอ — ใช้ทั้งฝั่ง UI (ซ่อนเมนู) และฝั่ง API (กันเรียกตรง)
 * เทียบด้วย normalizePath เสมอ เพื่อไม่ให้ "/product/" หลุดเป็น 403 อย่างต้นฉบับ
 */
export function checkPermission(
  permissions: PermissionSet | null | undefined,
  path: string,
  action: PermissionAction = 'read',
  options: { isOwner?: boolean } = {},
): PermissionCheck {
  if (options.isOwner) return { allowed: true, locked: false, reason: 'owner' }
  if (!permissions) return { allowed: false, locked: false, reason: 'no_permission' }

  const target = normalizePath(path)
  for (const mod of Object.values(permissions)) {
    for (const menu of mod.menu ?? []) {
      if (normalizePath(menu.path) !== target) continue
      if (menu.lock || mod.lock) return { allowed: false, locked: true, reason: 'locked' }
      if (!mod.enable) return { allowed: false, locked: false, reason: 'module_disabled' }
      return menu[action]
        ? { allowed: true, locked: false, reason: 'granted' }
        : { allowed: false, locked: false, reason: 'no_permission' }
    }
  }
  return { allowed: false, locked: false, reason: 'unknown_path' }
}

/** ค้นหาโมดูลที่เป็นเจ้าของ path (ใช้ตอน render breadcrumb / help panel) */
export function findModuleForPath(
  permissions: PermissionSet,
  path: string,
): { moduleKey: string; menu: PermissionMenu } | null {
  const target = normalizePath(path)
  for (const [key, mod] of Object.entries(permissions)) {
    for (const menu of mod.menu ?? []) {
      if (normalizePath(menu.path) === target) return { moduleKey: key, menu }
    }
  }
  return null
}

/** รายการเมนูที่ผู้ใช้เห็นได้ — ซ่อนรายการที่ enable=false หรือ read=false (หัวข้อ 3.3) */
export function visibleMenus(
  permissions: PermissionSet | null | undefined,
  options: { isOwner?: boolean } = {},
): Set<string> {
  const out = new Set<string>()
  if (options.isOwner) {
    for (const mod of MODULE_DEFS) for (const m of mod.menu) out.add(normalizePath(m.path))
    return out
  }
  if (!permissions) return out
  for (const mod of Object.values(permissions)) {
    if (!mod.enable) continue
    for (const menu of mod.menu ?? []) {
      if (menu.read && !menu.lock && !mod.lock) out.add(normalizePath(menu.path))
    }
  }
  return out
}

/** ---------- สิทธิ์ของพนักงานหน้าร้าน (แอป POS, หัวข้อ 3.4) ---------- */

export const CASHIER_PERMISSION_KEYS = [
  'sell',
  'discount',
  'voidBill',
  'openDrawer',
  'editProduct',
  'viewReport',
  'cashManagement',
  'stockIn',
  'stockOut',
  'setting',
] as const
export type CashierPermissionKey = (typeof CASHIER_PERMISSION_KEYS)[number]

export const CASHIER_PERMISSION_LABELS: Record<CashierPermissionKey, string> = {
  sell: 'ขายสินค้า',
  discount: 'ให้ส่วนลด',
  voidBill: 'ยกเลิกบิล',
  openDrawer: 'เปิดลิ้นชัก',
  editProduct: 'แก้ไขสินค้า',
  viewReport: 'ดูรายงาน',
  cashManagement: 'จัดการเงินสด',
  stockIn: 'รับสินค้าเข้า',
  stockOut: 'จ่ายสินค้าออก',
  setting: 'ตั้งค่า',
}

export interface CashierPermissions extends Partial<Record<CashierPermissionKey, boolean>> {
  /** เพดานส่วนลดสูงสุดที่พนักงานคนนี้ให้ได้ (%) — null = ไม่จำกัด */
  maxDiscountPercent?: number | null
}

export function cashierCan(
  permissions: CashierPermissions | null | undefined,
  key: CashierPermissionKey,
): boolean {
  return Boolean(permissions?.[key])
}

/** ตรวจเพดานส่วนลดของพนักงาน (หัวข้อ 7.2) */
export function canGiveDiscount(
  permissions: CashierPermissions | null | undefined,
  percent: number,
): boolean {
  if (!cashierCan(permissions, 'discount')) return false
  const cap = permissions?.maxDiscountPercent
  if (cap === null || cap === undefined) return true
  return percent <= cap
}

export function allCashierPermissions(): CashierPermissions {
  const out: CashierPermissions = { maxDiscountPercent: null }
  for (const k of CASHIER_PERMISSION_KEYS) out[k] = true
  return out
}
