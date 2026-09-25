import argon2 from '@medee/db/password'
import crypto from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@medee/db'
import { ownerPermissionSet, type CashierPermissions } from '@medee/domain'
import { z } from 'zod'
import { env } from '../env.js'
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors.js'
import type { AccessTokenPayload } from '../plugins/auth.js'

const loginSchema = z.object({
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

const pinSchema = z.object({
  cashierId: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/, 'PIN ต้องเป็นตัวเลข 4 หลัก'),
})

const MAX_PIN_ATTEMPTS = 5
const PIN_LOCK_MS = 60_000

const routes: FastifyPluginAsync = async (app) => {
  /** เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน */
  app.post('/auth/login', async (req) => {
    const body = loginSchema.parse(req.body)
    const account = await prisma.account.findFirst({
      where: { email: body.email.toLowerCase().trim(), deletedAt: null, enabled: true },
    })
    if (!account) throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง')

    const ok = await argon2.verify(account.passwordHash, body.password).catch(() => false)
    if (!ok) throw unauthorized('อีเมลหรือรหัสผ่านไม่ถูกต้อง')

    const branches = await listBranchesFor(account.id)
    const accessToken = app.jwt.sign(
      { sub: account.id, email: account.email, isOwner: account.isOwner, kind: 'web' } satisfies AccessTokenPayload,
      { expiresIn: env.accessTokenTtl },
    )
    const refreshToken = await issueRefreshToken(account.id)

    return {
      accessToken,
      refreshToken,
      account: { id: account.id, email: account.email, displayName: account.displayName, isOwner: account.isOwner },
      branches,
    }
  })

  /** ต่ออายุ access token */
  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(req.body)
    const tokenHash = hashToken(refreshToken)
    const row = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    })
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw unauthorized('โทเค็นของคุณหมดอายุ — กรุณาเข้าสู่ระบบอีกครั้ง')
    }
    // rotate: โทเค็นเดิมใช้ไม่ได้อีก
    await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } })
    const next = await issueRefreshToken(row.accountId)
    const accessToken = app.jwt.sign(
      { sub: row.accountId, email: row.account.email, isOwner: row.account.isOwner, kind: 'web' } satisfies AccessTokenPayload,
      { expiresIn: env.accessTokenTtl },
    )
    return { accessToken, refreshToken: next }
  })

  app.post('/auth/logout', async (req) => {
    const body = z.object({ refreshToken: z.string().optional() }).parse(req.body ?? {})
    if (body.refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(body.refreshToken) },
        data: { revokedAt: new Date() },
      })
    }
    return { ok: true }
  })

  /**
   * ผูกเครื่องขาย (หัวข้อ 5.1)
   * เลือกหมายเลขเครื่องที่ว่าง → บันทึก device uuid → คืนโทเค็นของเครื่อง
   */
  app.post('/auth/device/register', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({
      branchId: z.string().uuid(),
      posNumber: z.string().min(1),
      deviceUuid: z.string().min(8),
      deviceName: z.string().optional(),
      deviceType: z.enum(['iOS', 'Android', 'Web']).default('Web'),
      appVersion: z.string().optional(),
    }).parse(req.body)

    await assertBranchAccess(req.account.id, body.branchId)

    const device = await prisma.posDevice.findFirst({
      where: { branchId: body.branchId, posNumber: body.posNumber, deletedAt: null },
    })
    if (!device) throw notFound('ไม่พบหมายเลขเครื่อง POS นี้ในสาขา')
    if (device.uuid && device.uuid !== body.deviceUuid && device.status === 'กำลังถูกใช้งาน') {
      throw forbidden('หมายเลขเครื่องนี้ถูกใช้งานโดยอุปกรณ์อื่นอยู่ — กรุณาปลดการใช้งานก่อน')
    }

    const updated = await prisma.posDevice.update({
      where: { id: device.id },
      data: {
        uuid: body.deviceUuid,
        deviceName: body.deviceName ?? device.deviceName,
        deviceType: body.deviceType,
        appVersion: body.appVersion ?? device.appVersion,
        status: 'กำลังถูกใช้งาน',
        lastUsedAt: new Date(),
      },
    })

    const deviceToken = app.jwt.sign(
      {
        sub: req.account.id, email: req.account.email, isOwner: req.account.isOwner,
        kind: 'device', deviceId: updated.id, branchId: body.branchId,
      } satisfies AccessTokenPayload,
      { expiresIn: '30d' },
    )
    return { deviceToken, device: updated }
  })

  /** เลือกพนักงานแล้วใส่ PIN 4 หลัก (หัวข้อ 5.1) */
  app.post('/auth/pin', { preHandler: app.authenticate }, async (req) => {
    const body = pinSchema.parse(req.body)
    const cashier = await prisma.cashier.findFirst({
      where: { id: body.cashierId, deletedAt: null, enabled: true },
    })
    if (!cashier) throw notFound('ไม่พบพนักงานคนนี้')

    if (cashier.pinLockedUntil && cashier.pinLockedUntil > new Date()) {
      throw forbidden('ใส่ PIN ผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่')
    }

    const ok = await argon2.verify(cashier.pinHash, body.pin).catch(() => false)
    if (!ok) {
      const fails = cashier.pinFailCount + 1
      await prisma.cashier.update({
        where: { id: cashier.id },
        data: {
          pinFailCount: fails,
          pinLockedUntil: fails >= MAX_PIN_ATTEMPTS ? new Date(Date.now() + PIN_LOCK_MS) : null,
        },
      })
      throw unauthorized('PIN ไม่ถูกต้อง')
    }

    await prisma.cashier.update({
      where: { id: cashier.id },
      data: { pinFailCount: 0, pinLockedUntil: null },
    })

    const token = app.jwt.sign(
      {
        sub: req.account.id, email: req.account.email, isOwner: req.account.isOwner,
        kind: 'device', deviceId: req.posDeviceId ?? undefined,
        branchId: cashier.branchId, cashierId: cashier.id,
      } satisfies AccessTokenPayload,
      { expiresIn: '16h' },
    )
    return {
      accessToken: token,
      cashier: {
        id: cashier.id,
        name: cashier.name,
        permissions: cashier.permissions as CashierPermissions,
      },
    }
  })

  /**
   * ตรวจ PIN ของผู้มีสิทธิ์ (ยกเลิกบิล / ปิดรอบ / ลบรายการบนโต๊ะ — หัวข้อ 3.4)
   * ไม่ออกโทเค็นใหม่ แค่ยืนยันว่าอนุมัติได้
   */
  app.post('/auth/pin/verify', { preHandler: app.withBranch }, async (req) => {
    const body = z.object({
      pin: z.string().regex(/^\d{4}$/),
      permission: z.string().optional(),
    }).parse(req.body)

    const cashiers = await prisma.cashier.findMany({
      where: { branchId: req.branchId, deletedAt: null, enabled: true },
    })
    for (const c of cashiers) {
      const ok = await argon2.verify(c.pinHash, body.pin).catch(() => false)
      if (!ok) continue
      const perms = (c.permissions ?? {}) as Record<string, unknown>
      if (body.permission && !perms[body.permission]) continue
      return { ok: true, cashier: { id: c.id, name: c.name } }
    }
    throw unauthorized('PIN ไม่ถูกต้อง หรือพนักงานคนนี้ไม่มีสิทธิ์อนุมัติรายการนี้')
  })

  /** สาขาที่บัญชีนี้เข้าถึงได้ (การ์ด "เลือกสาขา") */
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: req.account.id },
      select: { id: true, email: true, displayName: true, isOwner: true },
    })
    return { account, branches: await listBranchesFor(account.id) }
  })

  app.get('/me/branches', { preHandler: app.authenticate }, async (req) =>
    listBranchesFor(req.account.id),
  )

  /** สิทธิ์ของผู้ใช้ในสาขาที่ระบุ — ใช้ซ่อน/แสดงเมนูฝั่ง UI */
  app.get('/branches/:branchId/permissions', { preHandler: app.withBranch }, async (req) => {
    const isOwner = req.account.isOwner
    return {
      isOwner,
      permissions: isOwner ? ownerPermissionSet() : req.permissions,
    }
  })
}

async function listBranchesFor(accountId: string) {
  const owned = await prisma.branch.findMany({
    where: { deletedAt: null, shop: { ownerAccountId: accountId } },
    include: { shop: { select: { name: true } } },
    orderBy: { branchName: 'asc' },
  })
  const memberOf = await prisma.branch.findMany({
    where: {
      deletedAt: null,
      branchUsers: { some: { accountId, deletedAt: null } },
      shop: { ownerAccountId: { not: accountId } },
    },
    include: { shop: { select: { name: true } } },
    orderBy: { branchName: 'asc' },
  })
  return [...owned, ...memberOf].map((b) => ({
    id: b.id,
    shopName: b.shop.name,
    branchName: b.branchName,
    /** ป้ายในกล่องเลือกสาขา: "ร้านมีดีทวีคูณ - สำเพ็ง" */
    label: `${b.shop.name} - ${b.branchName}`,
    businessType: b.businessType,
    plan: b.plan,
    expireAt: b.expireAt,
    timezone: b.timezone,
    currency: b.currency,
  }))
}

async function assertBranchAccess(accountId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, deletedAt: null },
    select: { shop: { select: { ownerAccountId: true } } },
  })
  if (!branch) throw notFound('ไม่พบสาขาที่ระบุ')
  if (branch.shop.ownerAccountId === accountId) return
  const member = await prisma.branchUser.findFirst({
    where: { branchId, accountId, deletedAt: null },
  })
  if (!member) throw forbidden('คุณไม่มีสิทธิ์เข้าถึงสาขานี้')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function issueRefreshToken(accountId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString('base64url')
  await prisma.refreshToken.create({
    data: {
      accountId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 86_400_000),
    },
  })
  return token
}

export function requireBody(value: unknown) {
  if (!value) throw badRequest('ไม่พบข้อมูลที่ส่งมา')
  return value
}

export default routes
