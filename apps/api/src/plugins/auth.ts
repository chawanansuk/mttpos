import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { prisma } from '@medee/db'
import {
  checkPermission, type CashierPermissionKey, type CashierPermissions, cashierCan,
  type PermissionAction, type PermissionSet,
} from '@medee/domain'
import { env } from '../env.js'
import { forbidden, featureLocked, notFound, unauthorized } from '../lib/errors.js'

/** ข้อมูลที่อยู่ใน access token */
export interface AccessTokenPayload {
  sub: string
  email: string
  isOwner: boolean
  /** โทเค็นของเครื่อง POS จะผูก device และ cashier ไว้ด้วย */
  deviceId?: string
  branchId?: string
  cashierId?: string
  kind: 'web' | 'device'
}

declare module 'fastify' {
  interface FastifyRequest {
    /** บัญชีผู้ใช้ที่ล็อกอิน */
    account: { id: string; email: string; isOwner: boolean }
    /** สาขาที่กำลังทำงานอยู่ (จาก X-Branch-Id) */
    branchId: string
    /** สิทธิ์ของผู้ใช้ในสาขานี้ */
    permissions: PermissionSet | null
    /** พนักงานหน้าร้านที่ยืนยัน PIN แล้ว (เฉพาะโทเค็นของเครื่อง POS) */
    cashier: { id: string; name: string; permissions: CashierPermissions } | null
    posDeviceId: string | null
    tokenKind: 'web' | 'device'
  }

  interface FastifyInstance {
    /** ต้องล็อกอิน */
    authenticate: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
    /** ต้องล็อกอิน + ระบุสาขา + โหลดสิทธิ์ */
    withBranch: (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
    /** ตรวจสิทธิ์ตาม path ในตารางสิทธิ์ (หัวข้อ 3.3) */
    requirePermission: (
      path: string,
      action?: PermissionAction,
    ) => (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
    /** ตรวจสิทธิ์ของพนักงานหน้าร้าน (หัวข้อ 3.4) */
    requireCashier: (
      key: CashierPermissionKey,
    ) => (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
  }
}

export default fp(async (app) => {
  await app.register(jwt, { secret: env.jwtSecret })

  app.decorateRequest('account', null as never)
  app.decorateRequest('branchId', null as never)
  app.decorateRequest('permissions', null as never)
  app.decorateRequest('cashier', null as never)
  app.decorateRequest('posDeviceId', null as never)
  app.decorateRequest('tokenKind', null as never)

  app.decorate('authenticate', async (req: import('fastify').FastifyRequest) => {
    let payload: AccessTokenPayload
    try {
      payload = await req.jwtVerify<AccessTokenPayload>()
    } catch {
      throw unauthorized('โทเค็นของคุณหมดอายุ — กรุณาเข้าสู่ระบบอีกครั้ง')
    }

    const account = await prisma.account.findFirst({
      where: { id: payload.sub, deletedAt: null, enabled: true },
      select: { id: true, email: true, isOwner: true },
    })
    if (!account) throw unauthorized()

    req.account = account
    req.tokenKind = payload.kind ?? 'web'
    req.posDeviceId = payload.deviceId ?? null
    req.cashier = null

    if (payload.cashierId) {
      const cashier = await prisma.cashier.findFirst({
        where: { id: payload.cashierId, deletedAt: null, enabled: true },
        select: { id: true, name: true, permissions: true },
      })
      if (cashier) {
        req.cashier = {
          id: cashier.id,
          name: cashier.name,
          permissions: (cashier.permissions ?? {}) as CashierPermissions,
        }
      }
    }
    // โทเค็นของเครื่องผูกสาขาไว้แล้ว ไม่ต้องอ่านจาก header
    if (payload.branchId) req.branchId = payload.branchId
  })

  app.decorate('withBranch', async (req: import('fastify').FastifyRequest) => {
    await app.authenticate(req, undefined as never)

    const headerBranch = req.headers['x-branch-id']
    const branchId =
      req.branchId ?? (typeof headerBranch === 'string' ? headerBranch : undefined)
    if (!branchId) throw forbidden('กรุณาเลือกสาขาก่อนใช้งาน')

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, shop: { select: { ownerAccountId: true } } },
    })
    if (!branch) throw notFound('ไม่พบสาขาที่ระบุ')

    const isOwnerOfShop = branch.shop.ownerAccountId === req.account.id
    const membership = await prisma.branchUser.findFirst({
      where: { branchId, accountId: req.account.id, deletedAt: null },
      select: { permissions: true, role: true },
    })
    if (!isOwnerOfShop && !membership) throw forbidden('คุณไม่มีสิทธิ์เข้าถึงสาขานี้')

    req.branchId = branchId
    req.account.isOwner = req.account.isOwner && isOwnerOfShop ? true : membership?.role === 'owner' || isOwnerOfShop
    req.permissions = (membership?.permissions ?? null) as PermissionSet | null
  })

  /**
   * ตรวจสิทธิ์ที่ฝั่ง API ทุก endpoint (ไม่ใช่แค่ซ่อนเมนูบน UI)
   * เทียบ path ด้วย normalizePath จึงไม่เจอบั๊ก trailing slash แบบต้นฉบับ (หัวข้อ 2.3)
   */
  app.decorate('requirePermission', (path: string, action: PermissionAction = 'read') => {
    return async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
      await app.withBranch(req, reply)
      // เครื่อง POS ใช้สิทธิ์ของพนักงานหน้าร้าน ไม่ใช่ตารางสิทธิ์หลังบ้าน
      if (req.tokenKind === 'device') return
      const result = checkPermission(req.permissions, path, action, { isOwner: req.account.isOwner })
      if (result.allowed) return
      throw result.locked ? featureLocked() : forbidden()
    }
  })

  app.decorate('requireCashier', (key: CashierPermissionKey) => {
    return async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
      await app.withBranch(req, reply)
      if (req.account.isOwner) return
      if (req.tokenKind !== 'device') return
      if (!cashierCan(req.cashier?.permissions, key)) {
        throw forbidden('พนักงานคนนี้ไม่มีสิทธิ์ทำรายการนี้')
      }
    }
  })
})
