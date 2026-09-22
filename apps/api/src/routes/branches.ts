import argon2 from '@medee/db/password'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@medee/db'
import { allCashierPermissions, buildPermissionSet, MODULE_DEFS } from '@medee/domain'
import { z } from 'zod'
import { invalidateBranch } from '../lib/branch.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'

/** ฟิลด์ที่แก้ได้จากหน้า "ร้านค้า" (/setting/shop) และการตั้งค่าอื่น ๆ */
const branchSettingsSchema = z.object({
  branchName: z.string().min(1).optional(),
  businessType: z.number().int().min(0).max(2).optional(),
  address1: z.string().nullable().optional(),
  address2: z.string().nullable().optional(),
  tel: z.string().nullable().optional(),
  taxId: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  currency: z.string().optional(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  vatRate: z.union([z.string(), z.number()]).optional(),
  isVatIncluded: z.boolean().optional(),
  enabledServiceCharge: z.boolean().optional(),
  serviceChargeRate: z.union([z.string(), z.number()]).optional(),
  serviceChargeVatable: z.boolean().optional(),
  roundingType: z.enum(['none', 'up', 'down', 'nearest']).optional(),
  roundingAmount: z.union([z.string(), z.number()]).optional(),
  isAvgCost: z.boolean().optional(),
  fastInput: z.string().optional(),
  isSoldByWeight: z.boolean().optional(),
  isMultiplePayment: z.boolean().optional(),
  editableItem: z.boolean().optional(),
  enabledAutoAddProduct: z.boolean().optional(),
  enabledCustomPayment: z.boolean().optional(),
  enabledDelivery: z.boolean().optional(),
  cashManagement: z.boolean().optional(),
  isCustomerDisplayEnable: z.boolean().optional(),
  bahtPerPoint: z.union([z.string(), z.number()]).optional(),
  logoImage: z.string().nullable().optional(),
})

/** หน้า "ใบเสร็จรับเงิน" (/setting/receipt) — หัวข้อ 6.13 */
const receiptSettingsSchema = z.object({
  receiptHeader: z.string().optional(),
  headerShowOnReceipt: z.boolean().optional(),
  footer1: z.string().nullable().optional(),
  footer2: z.string().nullable().optional(),
  footerImage1: z.string().nullable().optional(),
  footerImage2: z.string().nullable().optional(),
  showDetailOnReceipt: z.boolean().optional(),
  showNoteOnReceipt: z.boolean().optional(),
  showQueueOnReceipt: z.boolean().optional(),
  showBarcodeOnReceipt: z.boolean().optional(),
  showVatOnReceipt: z.boolean().optional(),
  showOptionGroupOnReceipt: z.boolean().optional(),
  wordingToReplace: z.string().optional(),
  receiptFormat: z.enum(['abb', 'receipt', 'custom']).optional(),
  receiptUseBuddhistYear: z.boolean().optional(),
  taxInvoiceSignerName: z.string().nullable().optional(),
  taxInvoiceSignatureImage: z.string().nullable().optional(),
})

const routes: FastifyPluginAsync = async (app) => {
  // ───────── ตั้งค่าสาขา ─────────
  app.get('/branches/:id', { preHandler: app.withBranch }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    if (id !== req.branchId) throw forbidden()
    const branch = await prisma.branch.findUniqueOrThrow({
      where: { id },
      include: { shop: { select: { id: true, name: true, logoImage: true } } },
    })
    // ห้ามส่งข้อมูลที่อ่อนไหวไปให้ client ที่ไม่มีสิทธิ์ (หัวข้อ 11)
    const canSeePayment = req.account.isOwner || req.tokenKind === 'device'
    return {
      ...branch,
      promptpayId: canSeePayment ? branch.promptpayId : null,
    }
  })

  app.put('/branches/:id', { preHandler: app.requirePermission('/setting/shop', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    if (id !== req.branchId) throw forbidden()
    const body = branchSettingsSchema.parse(req.body)
    const updated = await prisma.branch.update({ where: { id }, data: body })
    invalidateBranch(id)
    app.broadcast(id, 'notification', { type: 'branch.updated' })
    return updated
  })

  app.get('/branches/:id/receipt-settings', { preHandler: app.withBranch }, async (req) => {
    const branch = await prisma.branch.findUniqueOrThrow({
      where: { id: req.branchId },
      select: {
        receiptHeader: true, headerShowOnReceipt: true, footer1: true, footer2: true,
        logoImage: true, footerImage1: true, footerImage2: true,
        showDetailOnReceipt: true, showNoteOnReceipt: true, showQueueOnReceipt: true,
        showBarcodeOnReceipt: true, showVatOnReceipt: true, showOptionGroupOnReceipt: true,
        wordingToReplace: true, receiptFormat: true, receiptUseBuddhistYear: true,
        taxInvoiceSignerName: true, taxInvoiceSignatureImage: true,
        promptpayShowOnReceipt: true, promptpayAccName: true,
      },
    })
    return branch
  })

  app.put('/branches/:id/receipt-settings', { preHandler: app.requirePermission('/setting/receipt', 'edit') }, async (req) => {
    const body = receiptSettingsSchema.parse(req.body)
    const updated = await prisma.branch.update({ where: { id: req.branchId }, data: body })
    invalidateBranch(req.branchId)
    return updated
  })

  // ───────── การชำระเงิน (/setting/payment) ─────────
  app.get('/branches/:id/payment-config', { preHandler: app.withBranch }, async (req) => {
    const configs = await prisma.paymentConfig.findMany({
      where: { branchId: req.branchId },
      orderBy: { orderIndex: 'asc' },
    })
    const canSeeSecrets = req.account.isOwner || req.tokenKind === 'device'
    return configs.map((c) => ({
      ...c,
      config: canSeeSecrets ? c.config : null,
    }))
  })

  app.put('/branches/:id/payment-config', { preHandler: app.requirePermission('/setting/payment', 'edit') }, async (req) => {
    const body = z.object({
      methods: z.array(z.object({
        methodKey: z.string(),
        label: z.string().optional(),
        enabled: z.boolean(),
        config: z.record(z.unknown()).nullable().optional(),
        imagePath: z.string().nullable().optional(),
        isCustom: z.boolean().optional(),
      })),
    }).parse(req.body)

    for (const m of body.methods) {
      await prisma.paymentConfig.upsert({
        where: { branchId_methodKey: { branchId: req.branchId, methodKey: m.methodKey } },
        create: {
          branchId: req.branchId, methodKey: m.methodKey, label: m.label ?? m.methodKey,
          enabled: m.enabled, config: (m.config ?? undefined) as object | undefined,
          imagePath: m.imagePath, isCustom: m.isCustom ?? false,
        },
        update: {
          enabled: m.enabled,
          label: m.label,
          config: (m.config ?? undefined) as object | undefined,
          imagePath: m.imagePath,
        },
      })
    }

    // ซิงค์ flag บนตารางสาขาที่หน้าขายใช้
    const promptpay = body.methods.find((m) => m.methodKey === 'promptpay')
    if (promptpay) {
      const cfg = (promptpay.config ?? {}) as { id?: string; accountName?: string; showOnReceipt?: boolean }
      await prisma.branch.update({
        where: { id: req.branchId },
        data: {
          paymentPromptpay: promptpay.enabled,
          promptpayId: cfg.id ?? undefined,
          promptpayAccName: cfg.accountName ?? undefined,
          promptpayShowOnReceipt: cfg.showOnReceipt ?? undefined,
        },
      })
    }
    invalidateBranch(req.branchId)
    return { ok: true }
  })

  // ───────── เครื่อง POS (/setting/tools) ─────────
  app.get('/branches/:id/pos-devices', { preHandler: app.withBranch }, async (req) => {
    return prisma.posDevice.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { posNumber: 'asc' },
    })
  })

  app.post('/branches/:id/pos-devices', { preHandler: app.requirePermission('/setting/tools', 'edit') }, async (req) => {
    const body = z.object({
      posNumber: z.string().min(1),
      posType: z.enum(['POS', 'ORDER', 'KIOSK']).default('POS'),
      deviceName: z.string().optional(),
    }).parse(req.body)
    const exists = await prisma.posDevice.findFirst({
      where: { branchId: req.branchId, posNumber: body.posNumber, deletedAt: null },
    })
    if (exists) throw conflict('หมายเลขเครื่อง POS นี้มีอยู่แล้ว')
    return prisma.posDevice.create({ data: { branchId: req.branchId, ...body } })
  })

  app.patch('/pos-devices/:id', { preHandler: app.requirePermission('/setting/tools', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      deviceName: z.string().optional(),
      printerIp: z.string().nullable().optional(),
      printReceipt: z.boolean().optional(),
      isPrintShopLogo: z.boolean().optional(),
      printAfterFinish: z.boolean().optional(),
      isPrintOrderAfterFinish: z.boolean().optional(),
      receiptType: z.number().int().min(1).max(3).optional(),
      itemSize: z.enum(['SMALL', 'LARGE']).optional(),
      editableItem: z.boolean().optional(),
      autoLogin: z.boolean().optional(),
      scan: z.boolean().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body)
    await assertDeviceInBranch(id, req.branchId)
    return prisma.posDevice.update({ where: { id }, data: body })
  })

  /** ปลดการใช้งานเครื่อง POS → เครื่องอื่นมาผูกหมายเลขนี้ได้ */
  app.post('/pos-devices/:id/release', { preHandler: app.requirePermission('/setting/tools', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertDeviceInBranch(id, req.branchId)
    return prisma.posDevice.update({
      where: { id },
      data: { uuid: null, status: 'ปลดแล้ว' },
    })
  })

  // ───────── ผู้ใช้หลังบ้าน (/setting/permission) ─────────
  app.get('/branches/:id/users', { preHandler: app.requirePermission('/setting/permission') }, async (req) => {
    const shop = await prisma.branch.findUniqueOrThrow({
      where: { id: req.branchId },
      select: { shop: { select: { ownerAccountId: true } } },
    })
    const users = await prisma.branchUser.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      include: { account: { select: { id: true, email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return users.map((u) => ({
      id: u.id,
      accountId: u.accountId,
      email: u.account.email,
      name: u.account.displayName,
      role: u.role,
      /** owner แก้สิทธิ์ไม่ได้ และเข้าถึงได้ทุกอย่าง */
      isOwner: u.accountId === shop.shop.ownerAccountId,
      updatedAt: u.updatedAt,
      permissions: u.permissions,
    }))
  })

  /** ปุ่ม "ตรวจสอบ" ในโมดัลเพิ่มผู้ใช้ — เช็คว่าอีเมลนี้มีบัญชีในระบบหรือยัง */
  app.post('/users/check-email', { preHandler: app.requirePermission('/setting/permission', 'edit') }, async (req) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const account = await prisma.account.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      select: { id: true, email: true, displayName: true },
    })
    return { exists: Boolean(account), account }
  })

  app.post('/branches/:id/users', { preHandler: app.requirePermission('/setting/permission', 'edit') }, async (req) => {
    const body = z.object({
      email: z.string().email(),
      role: z.enum(['Manager', 'Franchise']),
    }).parse(req.body)
    const account = await prisma.account.findFirst({
      where: { email: body.email.toLowerCase().trim(), deletedAt: null },
    })
    if (!account) throw notFound('ไม่พบบัญชีผู้ใช้ของอีเมลนี้ — กรุณาให้ผู้ใช้สมัครก่อน')
    const exists = await prisma.branchUser.findFirst({
      where: { branchId: req.branchId, accountId: account.id, deletedAt: null },
    })
    if (exists) throw conflict('ผู้ใช้นี้มีสิทธิ์ในสาขานี้อยู่แล้ว')
    return prisma.branchUser.create({
      data: {
        branchId: req.branchId, accountId: account.id, role: body.role,
        permissions: buildPermissionSet() as object,
      },
    })
  })

  app.put('/branches/:id/users/:userId/permissions', { preHandler: app.requirePermission('/setting/permission', 'edit') }, async (req) => {
    const { userId } = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).parse(req.params)
    const body = z.object({ permissions: z.record(z.unknown()) }).parse(req.body)
    const row = await prisma.branchUser.findFirst({ where: { id: userId, branchId: req.branchId } })
    if (!row) throw notFound('ไม่พบผู้ใช้ในสาขานี้')
    if (row.role === 'owner') throw badRequest('ไม่สามารถแก้ไขสิทธิ์ของเจ้าของร้านได้')
    return prisma.branchUser.update({
      where: { id: userId },
      data: { permissions: body.permissions as object },
    })
  })

  app.delete('/branches/:id/users/:userId', { preHandler: app.requirePermission('/setting/permission', 'remove') }, async (req) => {
    const { userId } = z.object({ id: z.string().uuid(), userId: z.string().uuid() }).parse(req.params)
    const row = await prisma.branchUser.findFirst({ where: { id: userId, branchId: req.branchId } })
    if (!row) throw notFound('ไม่พบผู้ใช้ในสาขานี้')
    if (row.role === 'owner') throw badRequest('ไม่สามารถลบเจ้าของร้านได้')
    await prisma.branchUser.update({ where: { id: userId }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  /** โครงตารางสิทธิ์มาตรฐาน — UI ใช้ render แท็บและแถวย่อย */
  app.get('/permission-schema', { preHandler: app.authenticate }, async () => MODULE_DEFS)

  // ───────── พนักงานหน้าร้าน (/setting/cashier) ─────────
  app.get('/branches/:id/cashiers', { preHandler: app.withBranch }, async (req) => {
    const rows = await prisma.cashier.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true, name: true, orderIndex: true, enabled: true,
        permissions: true, webUsername: true, updatedAt: true,
      },
    })
    return rows
  })

  app.post('/branches/:id/cashiers', { preHandler: app.requirePermission('/setting/cashier', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1),
      pin: z.string().regex(/^\d{4}$/, 'PIN ต้องเป็นตัวเลข 4 หลัก'),
      permissions: z.record(z.unknown()).optional(),
      orderIndex: z.number().int().optional(),
    }).parse(req.body)
    return prisma.cashier.create({
      data: {
        branchId: req.branchId,
        name: body.name,
        pinHash: await argon2.hash(body.pin),
        permissions: (body.permissions ?? allCashierPermissions()) as object,
        orderIndex: body.orderIndex ?? 99,
      },
      select: { id: true, name: true, orderIndex: true, enabled: true, permissions: true },
    })
  })

  app.put('/cashiers/:id', { preHandler: app.requirePermission('/setting/cashier', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      name: z.string().min(1).optional(),
      permissions: z.record(z.unknown()).optional(),
      orderIndex: z.number().int().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body)
    await assertCashierInBranch(id, req.branchId)
    return prisma.cashier.update({
      where: { id },
      data: { ...body, permissions: body.permissions as object | undefined },
      select: { id: true, name: true, orderIndex: true, enabled: true, permissions: true },
    })
  })

  app.put('/cashiers/:id/pin', { preHandler: app.requirePermission('/setting/cashier', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(req.body)
    await assertCashierInBranch(id, req.branchId)
    await prisma.cashier.update({
      where: { id },
      data: { pinHash: await argon2.hash(pin), pinFailCount: 0, pinLockedUntil: null },
    })
    return { ok: true }
  })

  /** ชื่อผู้ใช้/รหัสผ่านสำหรับเว็บเช็คสต็อกบนมือถือ (หัวข้อ 6.13) */
  app.put('/cashiers/:id/web-login', { preHandler: app.requirePermission('/setting/cashier', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      username: z.string().min(3),
      password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
    }).parse(req.body)
    await assertCashierInBranch(id, req.branchId)
    await prisma.cashier.update({
      where: { id },
      data: { webUsername: body.username, webPasswordHash: await argon2.hash(body.password) },
    })
    return { ok: true }
  })

  app.delete('/cashiers/:id', { preHandler: app.requirePermission('/setting/cashier', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertCashierInBranch(id, req.branchId)
    await prisma.cashier.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } })
    return { ok: true }
  })

  /** บันทึกเวลาเข้า-ออกงาน (timesheet) */
  app.post('/timesheets/clock', { preHandler: app.withBranch }, async (req) => {
    const body = z.object({ cashierId: z.string().uuid() }).parse(req.body)
    await assertCashierInBranch(body.cashierId, req.branchId)
    const open = await prisma.timesheet.findFirst({
      where: { cashierId: body.cashierId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    })
    if (open) {
      const now = new Date()
      const hours = (now.getTime() - open.clockInAt.getTime()) / 3_600_000
      return prisma.timesheet.update({
        where: { id: open.id },
        data: { clockOutAt: now, hours: hours.toFixed(2) },
      })
    }
    return prisma.timesheet.create({
      data: {
        branchId: req.branchId, cashierId: body.cashierId, clockInAt: new Date(),
        posDeviceId: req.posDeviceId,
      },
    })
  })

  /** ประกาศจากระบบ (popup ตอนเข้า dashboard) */
  app.get('/announcements', { preHandler: app.authenticate }, async () => {
    const now = new Date()
    return prisma.announcement.findMany({
      where: {
        enabled: true,
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ activeTo: null }, { activeTo: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
  })
}

async function assertDeviceInBranch(id: string, branchId: string) {
  const row = await prisma.posDevice.findFirst({ where: { id, branchId, deletedAt: null } })
  if (!row) throw notFound('ไม่พบเครื่อง POS ในสาขานี้')
}

async function assertCashierInBranch(id: string, branchId: string) {
  const row = await prisma.cashier.findFirst({ where: { id, branchId, deletedAt: null } })
  if (!row) throw notFound('ไม่พบพนักงานในสาขานี้')
}

export default routes
