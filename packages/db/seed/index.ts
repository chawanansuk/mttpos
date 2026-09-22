/**
 * Seed ข้อมูลจริงของร้านมีดีทวีคูณ สาขาสำเพ็ง (หัวข้อ 10)
 * รันด้วย `pnpm db:seed` — เปิดระบบมาแล้วต้องขายได้ทันทีและทุกรายงานมีข้อมูล
 */
import argon2 from '../src/password.js'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  allCashierPermissions, buildPermissionSet, DEFAULT_DELIVERY_PROVIDERS, ownerPermissionSet,
  receiptNo as makeReceiptNo, stockDocNo, summarizeCashRound,
} from '@medee/domain'
import {
  DAY_2026_09_22, FIXTURE_PRODUCT_BY_KEY, type FixtureBill,
} from '@medee/domain/fixtures'
import { BRANCH, CATEGORIES, OPTIONS, POS_DEVICES, SALES_CHANNEL_CONFIGS, SHOP, UNITS } from './data/branch.js'
import { PRODUCTS } from './data/products.js'
import { bkk, createSeedReceipt, moveStock, type ProductRef } from './lib.js'
import {
  DAY_22_BILLS, DAY_22_DISCOUNT, DAY_22_SALES, DAY_22_VOID_VALUE, generateHistory,
  MONTH_DISCOUNT_BILLS, MONTH_DISCOUNT_TOTAL, MONTH_TOTAL_BILLS, MONTH_TOTAL_SALES,
  MONTH_VOID_COUNT, MONTH_VOID_VALUE, planDailyTargets, workingDays,
} from './history.js'

const prisma = new PrismaClient()

const OWNER_EMAIL = 'medeetaweekoon.official@gmail.com'
const MANAGER_EMAIL = 'medeesystem1@gmail.com'
const DEFAULT_PASSWORD = 'Medee@2026'

async function main() {
  console.log('🧹 ล้างข้อมูลเดิม...')
  await resetDatabase()

  console.log('👤 สร้างบัญชีผู้ใช้...')
  const passwordHash = await argon2.hash(DEFAULT_PASSWORD)
  const owner = await prisma.account.create({
    data: { email: OWNER_EMAIL, passwordHash, displayName: 'มีดีทวีคูณ', isOwner: true },
  })
  const manager = await prisma.account.create({
    data: { email: MANAGER_EMAIL, passwordHash, displayName: 'medeesystem1', isOwner: false },
  })

  console.log('🏪 สร้างร้านและสาขา...')
  const shop = await prisma.shop.create({ data: { name: SHOP.name, ownerAccountId: owner.id } })
  const branch = await prisma.branch.create({ data: { shopId: shop.id, ...BRANCH } })

  // สิทธิ์: owner เห็นทุกอย่าง · medeesystem1 เห็นเฉพาะที่ระบุในหัวข้อ 3.3
  await prisma.branchUser.create({
    data: { branchId: branch.id, accountId: owner.id, role: 'owner', permissions: ownerPermissionSet() as object },
  })
  await prisma.branchUser.create({
    data: {
      branchId: branch.id, accountId: manager.id, role: 'Manager',
      permissions: managerPermissions() as object,
    },
  })

  console.log('📱 สร้างเครื่อง POS...')
  const devices = await Promise.all(
    POS_DEVICES.map((d) => prisma.posDevice.create({ data: { branchId: branch.id, ...d } })),
  )
  const pos002 = devices.find((d) => d.posNumber === '002')!

  console.log('🧑‍💼 สร้างพนักงานหน้าร้าน...')
  const adminPin = await argon2.hash('0000')
  const cashierPin = await argon2.hash('1111')
  const admin = await prisma.cashier.create({
    data: {
      branchId: branch.id, name: 'Admin', pinHash: adminPin, orderIndex: 1,
      permissions: allCashierPermissions() as object,
    },
  })
  const cashier1 = await prisma.cashier.create({
    data: {
      branchId: branch.id, name: 'cashier1', pinHash: cashierPin, orderIndex: 2,
      permissions: {
        sell: true, discount: true, voidBill: true, openDrawer: true,
        cashManagement: true, stockIn: true, stockOut: true, viewReport: true,
        editProduct: false, setting: false, maxDiscountPercent: 30,
      },
    },
  })
  void admin

  console.log('🗂  สร้างกลุ่มสินค้า หน่วยบรรจุ ตัวเลือก...')
  const categories = new Map<string, string>()
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.category.create({
      data: {
        branchId: branch.id, name: c.name, bgColor: c.bgColor, enabled: c.enabled,
        kitchenPriority: 'MEDIUM', orderIndex: i, isSystem: c.isSystem ?? false,
      },
    })
    categories.set(c.name, row.id)
  }
  const units = new Map<string, string>()
  for (const name of UNITS) {
    const row = await prisma.unit.create({ data: { branchId: branch.id, name } })
    units.set(name, row.id)
  }
  for (const [i, o] of OPTIONS.entries()) {
    await prisma.productOption.create({
      data: { branchId: branch.id, name: o.name, price: o.price, cost: o.cost, orderIndex: i },
    })
  }
  for (const [i, c] of SALES_CHANNEL_CONFIGS.entries()) {
    await prisma.salesChannelConfig.create({ data: { branchId: branch.id, ...c, orderIndex: i } })
  }
  for (const name of DEFAULT_DELIVERY_PROVIDERS) {
    await prisma.deliveryProvider.create({ data: { branchId: branch.id, name, isSystem: true } })
  }
  await seedPaymentConfigs(branch.id)

  console.log('📦 สร้างสินค้า...')
  const refs = await seedProducts(branch.id, categories, units)

  console.log('👥 สร้างสมาชิก...')
  const { vipMember } = await seedMembers(branch.id)

  console.log('📊 สร้างประวัติการขายย้อนหลัง...')
  const days = workingDays('2026-08-23', '2026-09-21')
  const targets = planDailyTargets(days, MONTH_TOTAL_SALES - DAY_22_SALES)
  const fillers = buildFillerMap(refs)
  const history = generateHistory({
    days, targets, catalog: [...refs.values()], fillers,
    // หักส่วนของวันที่ 22/09 ที่ seed จาก fixture จริงไปแล้ว
    billCount: MONTH_TOTAL_BILLS - DAY_22_BILLS,
    discountBudget: MONTH_DISCOUNT_TOTAL - DAY_22_DISCOUNT,
    discountBills: MONTH_DISCOUNT_BILLS - 2,
    voidCount: MONTH_VOID_COUNT - 1,
    voidValue: MONTH_VOID_VALUE - DAY_22_VOID_VALUE,
  })

  const historyRounds = await seedHistoryRounds(branch.id, pos002.id, cashier1.id, days)
  let runNumber = 5000
  for (const bill of history) {
    runNumber += 1
    await createSeedReceipt(prisma, {
      branchId: branch.id,
      posDeviceId: pos002.id,
      cashRoundId: historyRounds.get(bill.businessDay) ?? null,
      cashierId: cashier1.id,
      receiptNo: makeReceiptNo('002', runNumber),
      soldAt: bill.soldAt,
      businessDay: bill.businessDay,
      status: bill.status,
      voidedAt: bill.voidedAt ?? null,
      voidedBy: bill.status === 'ยกเลิก' ? 'cashier1' : null,
      voidReason: bill.status === 'ยกเลิก' ? 'ลูกค้าเปลี่ยนใจ' : null,
      lines: bill.lines.map((l) => ({ ref: l.ref, qty: l.qty, discount: l.discount })),
    })
  }
  await closeHistoryRounds([...historyRounds.values()])
  console.log(`   • ${history.length} บิล ใน ${days.length} วันทำการ`)

  console.log('💰 เปิดรอบการขายของวันที่ 22/09/2026...')
  const round = await prisma.cashRound.create({
    data: {
      branchId: branch.id, posDeviceId: pos002.id, roundNo: 2, businessDay: '2026-09-21',
      openedAt: bkk('2026-09-21T15:44:00'), openedById: cashier1.id,
      openingCash: '4210.00', status: 'open',
    },
  })

  console.log('🧾 บันทึกบิลของวันที่ 22/09/2026 (ข้อมูลจริง)...')
  await seedFixtureDay(branch.id, pos002.id, round.id, cashier1.id, refs, vipMember.id)

  console.log('📥 สร้างเอกสารรับสินค้าเข้า RCV0000756...')
  await seedReceiveDoc(branch.id, refs, cashier1.id)

  console.log('🔁 ปรับยอดคงเหลือให้ตรงกับระบบจริง ณ 22/09/2026...')
  await reconcileStock(branch.id, refs)

  console.log('🧮 คำนวณยอดคงเหลือสะสมในบัตรสินค้าใหม่ตามลำดับเวลา...')
  await recomputeStockCardBalances(branch.id)

  console.log('📣 สร้างประกาศระบบ...')
  await prisma.announcement.create({
    data: {
      title: 'ยินดีต้อนรับสู่ Medee POS',
      body: 'ระบบขายหน้าร้านและหลังบ้านของร้านมีดีทวีคูณ — เข้าหน้าขายที่ /pos และหลังบ้านที่ /admin',
      enabled: true,
    },
  })

  await printSummary(branch.id)
  console.log('\n✅ seed เสร็จสิ้น')
  console.log(`   owner   : ${OWNER_EMAIL} / ${DEFAULT_PASSWORD}`)
  console.log(`   manager : ${MANAGER_EMAIL} / ${DEFAULT_PASSWORD}`)
  console.log('   PIN     : Admin = 0000 · cashier1 = 1111  (เปลี่ยนก่อนใช้งานจริง)')
}

/** ล้างทุกตารางตามลำดับ foreign key */
async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      stock_movements, stock_document_items, stock_documents,
      receipt_payments, receipt_items, receipts, open_bills,
      cash_in_outs, cash_rounds,
      member_point_transactions, member_notes, members, member_groups,
      product_option_groups, option_group_items, option_groups, options,
      product_bom_items, product_serials, product_channel_prices, product_step_prices,
      product_plus, products, categories, units,
      sales_hour_slots, sales_hours, sales_channel_configs,
      payment_configs, delivery_providers, printers, suppliers,
      promotion_usages, promotions, tables, table_zones,
      timesheets, cashiers, branch_users, pos_devices, branches, shops,
      refresh_tokens, accounts, announcements, audit_logs
    RESTART IDENTITY CASCADE
  `)
}

/** สิทธิ์ของ medeesystem1 ตามหัวข้อ 3.3 */
function managerPermissions() {
  const p = buildPermissionSet()
  for (const key of ['dashboard', 'transaction', 'currentBill', 'inventory'] as const) {
    p[key]!.enable = true
  }
  p.dashboard!.menu[0]!.read = true
  p.transaction!.menu[0]!.read = true
  p.currentBill!.menu[0]!.read = true
  for (const path of ['/inventory/stock-in', '/inventory/stock-out']) {
    const m = p.inventory!.menu.find((x) => x.path === path)
    if (m) { m.read = true; m.edit = true }
  }
  return p
}

async function seedPaymentConfigs(branchId: string) {
  const methods = [
    { methodKey: 'cash', label: 'เงินสด', enabled: true },
    { methodKey: 'promptpay', label: 'โอน(พร้อมเพย์)', enabled: true,
      config: { id: BRANCH.promptpayId, accountName: BRANCH.promptpayAccName, showOnReceipt: true } },
    { methodKey: 'credit', label: 'บัตรเครดิต', enabled: false },
    { methodKey: 'edc', label: 'EDC', enabled: false, config: { wifiIp: '' } },
    { methodKey: 'coupon', label: 'คูปอง', enabled: false },
    { methodKey: 'deposit', label: 'มัดจำ', enabled: false },
    { methodKey: 'linepay', label: 'Line Pay', enabled: false, config: { channelId: '', channelSecret: '' } },
    { methodKey: 'thaidotcom', label: 'Thai Dot Com Payment', enabled: false, config: { merchantId: '' } },
    { methodKey: 'alipay', label: 'Alipay', enabled: false },
    { methodKey: 'delivery', label: 'Delivery', enabled: false },
  ]
  for (const [i, m] of methods.entries()) {
    await prisma.paymentConfig.create({ data: { branchId, orderIndex: i, ...m } })
  }
}

/** สร้างสินค้าพร้อม PLU หลัก, PLU ย่อย, ราคาช่องทาง และ step price */
async function seedProducts(
  branchId: string,
  categories: Map<string, string>,
  units: Map<string, string>,
): Promise<Map<string, ProductRef>> {
  const refs = new Map<string, ProductRef>()
  const seenBarcodes = new Set<string>()

  for (const p of PRODUCTS) {
    // ต้นฉบับมีสินค้าชื่อ "15" ซ้ำบาร์โค้ดคนละตัว — กันซ้ำที่ระดับสาขา
    let barcode = p.barcode
    if (seenBarcodes.has(barcode)) barcode = `${barcode}-2`
    seenBarcodes.add(barcode)

    const product = await prisma.product.create({
      data: {
        branchId,
        skuCode: p.skuCode ?? null,
        name: p.name,
        price: p.price,
        stdCost: p.cost || '0',
        avgCost: p.cost || '0',
        barcode,
        skuType: 'P',
        vatType: p.vatType ?? 'N',
        categoryId: categories.get(p.category) ?? categories.get('Uncategory')!,
        unitId: units.get(p.unit) ?? units.get('ชิ้น')!,
        favorite: p.favoriteIndex !== undefined,
        favoriteIndex: p.favoriteIndex ?? 999,
        isOnScreen: true,
        itemSequence: p.favoriteIndex ?? 999,
        negotiatePrice: p.negotiatePrice ?? false,
        color: colorForCategory(p.category),
        keyword: `${p.name} ${barcode}`.toLowerCase(),
        source: 'web import',
        trackStock: true,
      },
    })

    // PLU หลัก (ratio 1) — ยอดคงเหลือทั้งหมดเก็บที่นี่
    const mainPlu = await prisma.productPlu.create({
      data: {
        productId: product.id,
        pluCode: barcode,
        name: p.name,
        unitId: units.get(p.unit) ?? units.get('ชิ้น')!,
        skuRatio: '1',
        price: p.price,
        cost: p.cost || '0',
        stockQty: '0',
        isDefault: true,
      },
    })

    for (const plu of p.plus ?? []) {
      await prisma.productPlu.create({
        data: {
          productId: product.id,
          pluCode: plu.pluCode,
          name: plu.name,
          unitId: units.get(plu.unit) ?? units.get('ชิ้น')!,
          skuRatio: String(plu.ratio),
          price: plu.price,
          cost: plu.cost ?? '0',
          stockQty: '0',
          isDefault: false,
        },
      })
    }

    // ราคาช่องทาง: retail เสมอ + ราคาขายส่งสมาชิกเมื่อมี
    await prisma.productChannelPrice.create({
      data: { productId: product.id, channel: 'retail', enabled: true, price: p.price },
    })
    if (p.memberWholesalePrice) {
      await prisma.productChannelPrice.create({
        data: {
          productId: product.id, channel: 'member_wholesale', enabled: true,
          price: p.memberWholesalePrice,
          diff: new Prisma.Decimal(p.memberWholesalePrice).minus(p.price).toFixed(2),
        },
      })
    }
    for (const s of p.stepPrices ?? []) {
      await prisma.productStepPrice.create({
        data: {
          productId: product.id, minQty: String(s.minQty), price: s.price,
          unitPrice: new Prisma.Decimal(s.price).dividedBy(s.minQty).toFixed(4),
          cost: new Prisma.Decimal(p.cost || 0).times(s.minQty).toFixed(2),
        },
      })
    }

    refs.set(barcode, {
      id: product.id,
      pluId: mainPlu.id,
      barcode,
      name: p.name,
      unitName: p.unit,
      categoryName: p.category,
      price: p.price,
      cost: p.cost || '0',
      vatType: p.vatType ?? 'N',
    })
  }

  return refs
}

function colorForCategory(name: string): string {
  const hit = CATEGORIES.find((c) => c.name === name)
  const hex = hit?.bgColor ?? '#9E9E9E'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 1)`
}

async function seedMembers(branchId: string) {
  const wholesale = await prisma.memberGroup.create({
    data: { branchId, name: 'ขายส่ง', priceChannel: 'member_wholesale' },
  })
  await prisma.member.create({
    data: {
      branchId, name: 'หน้าร้าน หน้าร้าน', gender: 'ไม่ระบุ', channel: 'หน้าร้าน',
      firstVisitAt: bkk('2025-01-23T15:59:00'), lastVisitAt: bkk('2026-04-06T12:55:00'),
      totalSpent: '2880.00', pointsBalance: 0,
    },
  })
  const vipMember = await prisma.member.create({
    data: {
      branchId, name: 'vip p', gender: 'ไม่ระบุ', channel: 'หน้าร้าน',
      memberGroupId: wholesale.id,
      firstVisitAt: bkk('2025-01-23T16:00:00'), lastVisitAt: bkk('2026-09-22T12:44:00'),
      totalSpent: '73804.00', pointsBalance: 0,
    },
  })
  await prisma.memberNote.create({
    data: {
      memberId: vipMember.id, title: 'ลูกค้าขายส่งประจำ',
      detail: 'รับสินค้าเป็นลัง ใช้ราคาขายส่งสมาชิก ติดต่อล่วงหน้าก่อนมารับ',
      status: 'ปิดเคส', tags: ['VIP', 'สำคัญ'], createdBy: 'Admin',
    },
  })
  return { vipMember }
}

/** แผนที่ ราคา → สินค้าปุ่มราคาสำเร็จรูป สำหรับเติมเศษยอดวัน */
function buildFillerMap(refs: Map<string, ProductRef>): Map<number, ProductRef> {
  const out = new Map<number, ProductRef>()
  for (const ref of refs.values()) {
    if (!/^\d+$/.test(ref.name)) continue
    const price = Number(ref.price)
    if (Number(ref.name) !== price) continue
    if (!out.has(price)) out.set(price, ref)
  }
  return out
}

/** รอบการขายย้อนหลัง — ร้านเปิดรอบ ~15:00 แล้วปิดรอบเช้าวันถัดไป (หัวข้อ 5.6) */
async function seedHistoryRounds(
  branchId: string, posDeviceId: string, cashierId: string, days: string[],
) {
  const map = new Map<string, string>()
  for (const [i, day] of days.entries()) {
    const openedAt = bkk(`${day}T07:30:00`)
    // ร้านเปิดรอบเช้าแล้วปิดบ่ายวันเดียวกัน ยกเว้นรอบของวันที่ 22/09 ที่ seed แยกไว้และยังเปิดอยู่
    const closedAt = bkk(`${day}T15:45:00`)
    const openingCash = 4000 + ((i * 55) % 300)
    const round = await prisma.cashRound.create({
      data: {
        branchId, posDeviceId, roundNo: 1, businessDay: day,
        openedAt, openedById: cashierId,
        openingCash: openingCash.toFixed(2),
        closedAt, closedById: cashierId,
        status: 'closed',
      },
    })
    map.set(day, round.id)
  }

  // รายการนำเงินเข้า-ออกจริงของร้าน (หัวข้อ 6.6)
  const movements: { day: string; at: string; type: 'IN' | 'OUT'; category: string; detail: string; amount: string }[] = [
    { day: '2026-08-24', at: '07:46:31', type: 'OUT', category: 'อื่นๆ', detail: 'ยอดโอนเมื่อวันที่22\\08', amount: '190.00' },
    { day: '2026-08-24', at: '08:40:14', type: 'OUT', category: 'อื่นๆ', detail: '-', amount: '200.00' },
    { day: '2026-08-25', at: '15:22:16', type: 'OUT', category: 'อื่นๆ', detail: 'ไทยช่วยไทยหลังปิดยอด', amount: '260.00' },
    { day: '2026-08-26', at: '16:14:22', type: 'OUT', category: 'อื่นๆ', detail: 'เอากลับเพิ่ม', amount: '500.00' },
    { day: '2026-08-26', at: '16:36:06', type: 'OUT', category: 'อื่นๆ', detail: 'เอากลับเพิ่ม', amount: '1000.00' },
    { day: '2026-08-28', at: '16:02:10', type: 'OUT', category: 'อื่นๆ', detail: 'เอากลับเพิ่ม', amount: '600.00' },
    { day: '2026-08-29', at: '16:20:45', type: 'OUT', category: 'อื่นๆ', detail: 'โอนหลังปิดยอด', amount: '250.00' },
    { day: '2026-08-31', at: '08:01:20', type: 'OUT', category: 'ค่าใช้จ่ายร้าน', detail: 'ค่าของใช้', amount: '47.00' },
    { day: '2026-08-31', at: '08:33:20', type: 'OUT', category: 'ค่าใช้จ่ายร้าน', detail: 'ค่าน้ำสั่งโลตัส', amount: '133.00' },
    { day: '2026-08-31', at: '10:20:55', type: 'OUT', category: 'ค่าตกแต่ง', detail: 'พี่ยุท', amount: '200.00' },
    { day: '2026-08-31', at: '16:00:34', type: 'OUT', category: 'อื่นๆ', detail: 'ไทยช่วยไทยหลังปิดยอด', amount: '110.00' },
    { day: '2026-08-31', at: '16:11:55', type: 'OUT', category: 'อื่นๆ', detail: 'โอนหลังปิดยอด', amount: '170.00' },
  ]
  for (const m of movements) {
    const roundId = map.get(m.day)
    if (!roundId) continue
    await prisma.cashInOut.create({
      data: {
        cashRoundId: roundId, type: m.type, category: m.category, detail: m.detail,
        amount: m.amount, occurredAt: bkk(`${m.day}T${m.at}`), cashierId,
      },
    })
  }

  return map
}

/**
 * ปิดยอดรอบย้อนหลังหลังจากบันทึกบิลครบแล้ว
 * ร้านนับเงินได้ตรงกับที่ควรมีทุกรอบ (ส่วนต่าง 0.00) เหมือนข้อมูลจริงในหัวข้อ 6.6
 */
async function closeHistoryRounds(roundIds: string[]) {
  for (const roundId of roundIds) {
    const round = await prisma.cashRound.findUniqueOrThrow({ where: { id: roundId } })
    if (round.status !== 'closed') continue

    const agg = await prisma.receipt.aggregate({
      where: { cashRoundId: roundId, status: 'ปกติ' },
      _sum: { grandTotal: true },
    })
    const io = await prisma.cashInOut.findMany({ where: { cashRoundId: roundId } })
    const cashIn = io.filter((r) => r.type === 'IN').reduce((a, r) => a.plus(r.amount), new Prisma.Decimal(0))
    const cashOut = io.filter((r) => r.type === 'OUT').reduce((a, r) => a.plus(r.amount), new Prisma.Decimal(0))

    const s = summarizeCashRound({
      openingCash: round.openingCash.toFixed(2),
      cashSales: (agg._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      cashIn: cashIn.toFixed(2),
      cashOut: cashOut.toFixed(2),
      countedCash: null,
    })
    await prisma.cashRound.update({
      where: { id: roundId },
      data: {
        cashSales: s.cashSales, cashInTotal: s.cashIn, cashOutTotal: s.cashOut,
        expectedCash: s.expectedCash, countedCash: s.expectedCash, diff: '0.00',
      },
    })
  }
}

/** บันทึกบิลของวันที่ 22/09/2026 ตาม fixture จริง (หัวข้อ 10.10) */
async function seedFixtureDay(
  branchId: string, posDeviceId: string, cashRoundId: string, cashierId: string,
  refs: Map<string, ProductRef>, vipMemberId: string,
) {
  for (const bill of DAY_2026_09_22 as FixtureBill[]) {
    const lines = bill.lines.map((line) => {
      const p = FIXTURE_PRODUCT_BY_KEY.get(line.product)
      if (!p) throw new Error(`fixture อ้างถึงสินค้าที่ไม่มีใน seed: ${line.product}`)
      const ref = refs.get(p.barcode)
      if (!ref) throw new Error(`ไม่พบสินค้าใน seed สำหรับบาร์โค้ด ${p.barcode} (${p.name})`)
      // fixture ถือเป็นแหล่งอ้างอิงของราคาและต้นทุน ณ วันนั้น
      return {
        ref: { ...ref, price: p.price, cost: p.cost },
        qty: line.qty,
        unitPrice: line.unitPrice,
        discount: line.discount,
      }
    })

    await createSeedReceipt(prisma, {
      branchId, posDeviceId, cashRoundId, cashierId,
      receiptNo: bill.receiptNo,
      soldAt: new Date(bill.soldAt),
      businessDay: '2026-09-22',
      status: bill.status,
      memberId: bill.memberKey ? vipMemberId : null,
      voidedAt: bill.voidedAt ? new Date(bill.voidedAt) : null,
      voidedBy: bill.voidedAt ? 'cashier1' : null,
      voidReason: bill.voidReason ?? null,
      lines,
    })
  }

  // ตัวนับเลขบิลของเครื่อง 002 ต้องชี้ไปที่บิลถัดไป (PS002006905)
  await prisma.posDevice.update({
    where: { id: posDeviceId },
    data: { invoiceRunNumber: 6904, lastUsedAt: bkk('2026-09-22T14:48:34') },
  })

  // อัปเดตยอดรวมของรอบการขายที่ยังเปิดอยู่
  const agg = await prisma.receipt.aggregate({
    where: { cashRoundId, status: 'ปกติ' },
    _sum: { grandTotal: true },
  })
  await prisma.cashRound.update({
    where: { id: cashRoundId },
    data: { cashSales: (agg._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2) },
  })

  // สมาชิก vip p ซื้อบิล PS002006901
  await prisma.member.update({
    where: { id: vipMemberId },
    data: { totalSpent: '73924.00', lastVisitAt: bkk('2026-09-22T12:44:41') },
  })
}

/** เอกสารรับสินค้าเข้า RCV0000756 (หัวข้อ 10.10) */
async function seedReceiveDoc(branchId: string, refs: Map<string, ProductRef>, cashierId: string) {
  void cashierId
  const woodBrush = refs.get('6852513281179')!
  const plasticBrush = refs.get('8536276012951')!
  const docNo = stockDocNo('receive', 756)

  const doc = await prisma.stockDocument.create({
    data: {
      branchId, docType: 'RECEIVE', docNo, status: 'ใช้งาน',
      docDate: bkk('2026-09-22T00:00:00'),
      subtotal: '0.00', discount: '0.00', vatAmount: '0.00', total: '0.00',
      createdBy: 'cashier1',
      createdAt: bkk('2026-09-22T09:19:33'),
      items: {
        create: [
          { productId: plasticBrush.id, pluId: plasticBrush.pluId, barcode: plasticBrush.barcode,
            name: plasticBrush.name, unitName: 'ชิ้น', ratio: '1', qty: '12', unitPrice: '0.00',
            discount: '0.00', lineTotal: '0.00', orderIndex: 0 },
          { productId: woodBrush.id, pluId: woodBrush.pluId, barcode: woodBrush.barcode,
            name: woodBrush.name, unitName: 'ชิ้น', ratio: '1', qty: '12', unitPrice: '0.00',
            discount: '0.00', lineTotal: '0.00', orderIndex: 1 },
        ],
      },
    },
  })

  for (const ref of [plasticBrush, woodBrush]) {
    await moveStock(prisma, {
      branchId, productId: ref.id, pluId: ref.pluId,
      docType: 'RECEIVE', docNo, documentId: doc.id,
      qty: 12, unitCost: ref.cost,
      occurredAt: bkk('2026-09-22T09:19:33'), actorName: 'cashier1',
    })
  }
}

/**
 * ปรับยอดคงเหลือให้ตรงกับที่ระบบเดิมแสดง ณ 22/09/2026
 * seed สร้างธุรกรรมย้อนหลังไว้แล้ว จึงบันทึก "ยอดยกมา" เป็นเอกสารปรับปรุงลงวันที่ก่อนช่วงข้อมูล
 */
async function reconcileStock(branchId: string, refs: Map<string, ProductRef>) {
  const openingAt = bkk('2026-08-22T23:59:00')
  const plus = await prisma.productPlu.findMany({
    where: { product: { branchId }, isDefault: true },
    select: { id: true, productId: true, pluCode: true, stockQty: true },
  })
  const targetByBarcode = new Map(PRODUCTS.map((p) => [p.barcode, p]))

  for (const plu of plus) {
    const spec = targetByBarcode.get(plu.pluCode) ?? targetByBarcode.get(plu.pluCode.replace(/-2$/, ''))
    if (!spec) continue
    if (spec.neverMoved) continue // สินค้าที่ยังไม่มีการเคลื่อนไหว — ไม่สร้าง movement ใด ๆ

    const delta = new Prisma.Decimal(spec.stock).minus(plu.stockQty)
    if (delta.isZero()) continue

    const ref = refs.get(plu.pluCode)
    await moveStock(prisma, {
      branchId,
      productId: plu.productId,
      pluId: plu.id,
      docType: delta.greaterThan(0) ? 'ADJUST_INC' : 'ADJUST_DEC',
      docNo: stockDocNo(delta.greaterThan(0) ? 'adjustInc' : 'adjustDec', 1),
      qty: delta.toFixed(3),
      unitCost: ref?.cost ?? '0',
      occurredAt: openingAt,
      actorName: 'Admin',
      note: 'ยอดยกมา ณ 22/08/2026',
    })
  }
}

/**
 * seed สร้างความเคลื่อนไหวไม่เรียงตามเวลา (บันทึกยอดยกมาทีหลัง)
 * จึงต้องเดินยอดใหม่ตามลำดับ occurredAt เพื่อให้คอลัมน์ "คงเหลือหลังรายการ" ถูกต้อง
 */
async function recomputeStockCardBalances(branchId: string) {
  const movements = await prisma.stockMovement.findMany({
    where: { branchId },
    orderBy: [{ pluId: 'asc' }, { occurredAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, pluId: true, qty: true },
  })

  let currentPlu: string | null = null
  let balance = new Prisma.Decimal(0)
  const updates: { id: string; balanceAfter: string }[] = []
  for (const m of movements) {
    if (m.pluId !== currentPlu) {
      currentPlu = m.pluId
      balance = new Prisma.Decimal(0)
    }
    balance = balance.plus(m.qty)
    updates.push({ id: m.id, balanceAfter: balance.toFixed(3) })
  }

  // อัปเดตเป็นชุดด้วย CASE เพื่อไม่ให้ยิง query ทีละแถวหลายพันครั้ง
  const CHUNK = 500
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK)
    const cases = chunk
      .map((u) => `WHEN '${u.id}'::uuid THEN ${u.balanceAfter}::numeric`)
      .join(' ')
    const ids = chunk.map((u) => `'${u.id}'::uuid`).join(',')
    await prisma.$executeRawUnsafe(
      `UPDATE stock_movements SET "balanceAfter" = CASE id ${cases} END WHERE id IN (${ids})`,
    )
  }
}

async function printSummary(branchId: string) {
  const [products, receipts, voided, sales, movements] = await Promise.all([
    prisma.product.count({ where: { branchId } }),
    prisma.receipt.count({ where: { branchId, status: 'ปกติ' } }),
    prisma.receipt.count({ where: { branchId, status: 'ยกเลิก' } }),
    prisma.receipt.aggregate({ where: { branchId, status: 'ปกติ' }, _sum: { grandTotal: true, profit: true, discountTotal: true } }),
    prisma.stockMovement.count({ where: { branchId } }),
  ])
  const day22 = await prisma.receipt.aggregate({
    where: { branchId, businessDay: '2026-09-22', status: 'ปกติ' },
    _sum: { grandTotal: true, profit: true, discountTotal: true },
    _count: true,
  })

  console.log('\n📋 สรุปข้อมูลที่ seed')
  console.log(`   สินค้า            : ${products} รายการ`)
  console.log(`   บิลขาย            : ${receipts} บิล (ยกเลิก ${voided} บิล)`)
  console.log(`   ยอดขายรวม         : ${(sales._sum.grandTotal ?? 0).toString()} บาท`)
  console.log(`   ส่วนลดรวม         : ${(sales._sum.discountTotal ?? 0).toString()} บาท`)
  console.log(`   ความเคลื่อนไหวสต็อก : ${movements} รายการ`)
  console.log(`   วันที่ 22/09/2026   : ${day22._count} บิล · ยอดขาย ${(day22._sum.grandTotal ?? 0).toString()} · กำไร ${(day22._sum.profit ?? 0).toString()} · ส่วนลด ${(day22._sum.discountTotal ?? 0).toString()}`)
}

main()
  .catch((e) => {
    console.error('❌ seed ไม่สำเร็จ:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
