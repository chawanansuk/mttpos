import { describe, expect, it } from 'vitest'
import {
  allCashierPermissions, buildPermissionSet, canGiveDiscount, cashierCan, checkPermission,
  findModuleForPath, MODULE_DEFS, normalizePath, ownerPermissionSet, visibleMenus,
} from '../permissions.js'

describe('2.3 normalizePath — แก้บั๊กสิทธิ์ของต้นฉบับ', () => {
  it('ตัด trailing slash', () => {
    expect(normalizePath('/product/')).toBe('/product')
    expect(normalizePath('/product')).toBe('/product')
  })
  it('ตัด query string และ hash', () => {
    expect(normalizePath('/product/?sort=SKUName&page=1')).toBe('/product')
    expect(normalizePath('/product#tab')).toBe('/product')
  })
  it('lower-case เพื่อให้ route ที่มีตัวใหญ่ match ได้', () => {
    expect(normalizePath('/report/cashIn-Out')).toBe('/report/cashin-out')
    expect(normalizePath('/member/ImportMember')).toBe('/member/importmember')
  })
  it('เติม leading slash และยุบ slash ซ้ำ', () => {
    expect(normalizePath('product')).toBe('/product')
    expect(normalizePath('//report//sku//')).toBe('/report/sku')
  })
  it('root path คงไว้', () => {
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })
})

describe('3.3 ตารางสิทธิ์', () => {
  it('มีครบ 11 แท็บตามสเปก', () => {
    expect(MODULE_DEFS.map((m) => m.key)).toEqual([
      'dashboard', 'transaction', 'currentBill', 'promotionDashboard', 'grabDashboard',
      'report', 'orderDevice', 'inventory', 'product', 'member', 'setting',
    ])
  })

  it('owner เข้าถึงได้ทุก path แม้ไม่มี permission object', () => {
    const r = checkPermission(null, '/setting/permission', 'remove', { isOwner: true })
    expect(r).toEqual({ allowed: true, locked: false, reason: 'owner' })
  })

  it('เปิด URL ที่มี "/" ต่อท้ายต้องไม่ถูกล็อกผิด (บั๊กต้นฉบับ)', () => {
    const perms = ownerPermissionSet()
    expect(checkPermission(perms, '/product/', 'read').allowed).toBe(true)
    expect(checkPermission(perms, '/product/?view=grid', 'read').allowed).toBe(true)
  })

  it('module ที่ปิด master toggle → เข้าไม่ได้แม้แถวย่อยเปิด', () => {
    const perms = buildPermissionSet({ grantAll: true })
    perms.product!.enable = false
    const r = checkPermission(perms, '/product', 'read')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('module_disabled')
  })

  it('แยกสิทธิ์ 4 คอลัมน์ แสดง/เพิ่มแก้ไข/ลบ/ส่งออกไฟล์', () => {
    const perms = buildPermissionSet()
    perms.product!.enable = true
    const menu = perms.product!.menu.find((m) => m.path === '/product')!
    menu.read = true
    expect(checkPermission(perms, '/product', 'read').allowed).toBe(true)
    expect(checkPermission(perms, '/product', 'edit').allowed).toBe(false)
    expect(checkPermission(perms, '/product', 'remove').allowed).toBe(false)
    expect(checkPermission(perms, '/product', 'export').allowed).toBe(false)
  })

  it('ฟีเจอร์ที่ถูกล็อกตามแพ็กเกจ → locked (แสดงหน้าโปรโมท ไม่ใช่ 403)', () => {
    const perms = ownerPermissionSet()
    perms.grabDashboard!.lock = true
    const r = checkPermission(perms, '/grabdashboard', 'read')
    expect(r.allowed).toBe(false)
    expect(r.locked).toBe(true)
  })

  it('path ที่ไม่อยู่ในตาราง → ไม่อนุญาต', () => {
    expect(checkPermission(ownerPermissionSet(), '/unknown/page').reason).toBe('unknown_path')
  })

  it('สิทธิ์จริงของ medeesystem1 (หัวข้อ 3.3)', () => {
    // เปิดเฉพาะ: รายงานสรุป(แสดง), ประวัติการขาย(แสดง), บิลที่เปิดอยู่(แสดง),
    // งานคลังสินค้า → รับสินค้าเข้า(เพิ่ม/แก้ไข), จ่ายสินค้าออก(เพิ่ม/แก้ไข)
    const p = buildPermissionSet()
    for (const key of ['dashboard', 'transaction', 'currentBill', 'inventory'] as const) {
      p[key]!.enable = true
    }
    p.dashboard!.menu[0]!.read = true
    p.transaction!.menu[0]!.read = true
    p.currentBill!.menu[0]!.read = true
    for (const path of ['/inventory/stock-in', '/inventory/stock-out']) {
      const m = p.inventory!.menu.find((x) => x.path === path)!
      m.read = true
      m.edit = true
    }

    expect(checkPermission(p, '/dashboard', 'read').allowed).toBe(true)
    expect(checkPermission(p, '/report/transaction', 'read').allowed).toBe(true)
    expect(checkPermission(p, '/inventory/stock-in', 'edit').allowed).toBe(true)
    expect(checkPermission(p, '/inventory/stock-in', 'remove').allowed).toBe(false)
    expect(checkPermission(p, '/product', 'read').allowed).toBe(false)
    expect(checkPermission(p, '/setting/permission', 'read').allowed).toBe(false)

    const visible = visibleMenus(p)
    expect(visible.has('/dashboard')).toBe(true)
    expect(visible.has('/inventory/stock-in')).toBe(true)
    expect(visible.has('/product')).toBe(false)
    expect(visible.has('/setting/shop')).toBe(false)
  })

  it('findModuleForPath คืนโมดูลเจ้าของ path', () => {
    const hit = findModuleForPath(ownerPermissionSet(), '/inventory/stock-in/')
    expect(hit?.moduleKey).toBe('inventory')
    expect(hit?.menu.label).toBe('รับสินค้าเข้า')
  })
})

describe('3.4 สิทธิ์พนักงานหน้าร้าน', () => {
  it('Admin มีทุกสิทธิ์', () => {
    const p = allCashierPermissions()
    expect(cashierCan(p, 'voidBill')).toBe(true)
    expect(cashierCan(p, 'setting')).toBe(true)
  })

  it('cashier1 มีสิทธิ์ตาม seed หัวข้อ 10.3', () => {
    const p = {
      sell: true, discount: true, voidBill: true, cashManagement: true,
      stockIn: true, stockOut: true, maxDiscountPercent: 30,
    }
    expect(cashierCan(p, 'sell')).toBe(true)
    expect(cashierCan(p, 'setting')).toBe(false)
    expect(cashierCan(p, 'editProduct')).toBe(false)
  })

  it('เพดานส่วนลดต่อพนักงาน', () => {
    expect(canGiveDiscount({ discount: true, maxDiscountPercent: 30 }, 25)).toBe(true)
    expect(canGiveDiscount({ discount: true, maxDiscountPercent: 30 }, 31)).toBe(false)
    expect(canGiveDiscount({ discount: true, maxDiscountPercent: null }, 90)).toBe(true)
    expect(canGiveDiscount({ discount: false }, 1)).toBe(false)
  })
})
