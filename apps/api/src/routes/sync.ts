import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@medee/db'
import { z } from 'zod'
import { getBranch } from '../lib/branch.js'
import { createReceipt, createReceiptSchema } from '../lib/sales.js'

/**
 * ซิงค์ข้อมูลกับเครื่อง POS (หัวข้อ 7.10)
 * - GET  /sync/master?since=ISO   ดึง master data ที่เปลี่ยนหลังเวลาที่ระบุ
 * - POST /sync/push               ส่งบิล/เอกสารที่ค้างอยู่ขึ้น server แบบ idempotent
 */
const routes: FastifyPluginAsync = async (app) => {
  app.get('/sync/master', { preHandler: app.withBranch }, async (req) => {
    const { since } = z.object({ since: z.string().datetime().optional() }).parse(req.query)
    const after = since ? new Date(since) : null
    const changed = after ? { updatedAt: { gt: after } } : {}
    const branchId = req.branchId

    const [branch, categories, units, options, optionGroups, products, members, cashiers, devices, paymentConfigs] =
      await Promise.all([
        getBranch(branchId),
        prisma.category.findMany({ where: { branchId, ...changed }, orderBy: { orderIndex: 'asc' } }),
        prisma.unit.findMany({ where: { branchId, ...changed } }),
        prisma.productOption.findMany({ where: { branchId, ...changed } }),
        prisma.optionGroup.findMany({
          where: { branchId, ...changed },
          include: { items: { include: { option: true } } },
        }),
        prisma.product.findMany({
          where: { branchId, ...changed },
          include: {
            plus: true,
            stepPrices: true,
            channelPrices: true,
            optionGroups: { select: { optionGroupId: true, orderIndex: true } },
          },
        }),
        prisma.member.findMany({
          where: { branchId, ...changed },
          include: { memberGroup: true },
        }),
        prisma.cashier.findMany({
          where: { branchId, deletedAt: null, ...changed },
          select: { id: true, name: true, orderIndex: true, enabled: true, permissions: true },
          orderBy: { orderIndex: 'asc' },
        }),
        prisma.posDevice.findMany({ where: { branchId, deletedAt: null } }),
        prisma.paymentConfig.findMany({ where: { branchId }, orderBy: { orderIndex: 'asc' } }),
      ])

    return {
      serverTime: new Date().toISOString(),
      since,
      branch,
      categories,
      units,
      options,
      optionGroups,
      products,
      members,
      cashiers,
      devices,
      paymentConfigs,
      counts: {
        categories: categories.length,
        products: products.length,
        members: members.length,
      },
    }
  })

  /**
   * ส่งคิวที่ค้างขึ้น server
   * ทุกบิลมี clientId เป็น idempotency key — ส่งซ้ำจะได้บิลเดิมกลับ ไม่สร้างซ้ำ
   * ประมวลผลทีละรายการเพื่อให้รายการที่พังตัวเดียวไม่ทำให้ทั้งชุดล้มเหลว
   */
  app.post('/sync/push', { preHandler: app.requireCashier('sell') }, async (req) => {
    const body = z.object({
      receipts: z.array(createReceiptSchema).default([]),
      timesheets: z.array(z.object({
        cashierId: z.string().uuid(),
        clockInAt: z.string().datetime({ offset: true }),
        clockOutAt: z.string().datetime({ offset: true }).nullable().optional(),
      })).default([]),
    }).parse(req.body)

    const results: {
      clientId?: string
      ok: boolean
      receiptId?: string
      receiptNo?: string
      duplicated?: boolean
      error?: string
    }[] = []

    for (const input of body.receipts) {
      try {
        const { receipt, duplicated } = await createReceipt(req.branchId, input, {
          cashierId: req.cashier?.id,
          cashierName: req.cashier?.name,
          posDeviceId: req.posDeviceId,
        })
        results.push({
          clientId: input.clientId,
          ok: true,
          receiptId: receipt.id,
          receiptNo: receipt.receiptNo,
          duplicated,
        })
        if (!duplicated) {
          app.broadcast(req.branchId, 'receipt.created', {
            id: receipt.id, receiptNo: receipt.receiptNo,
            grandTotal: receipt.grandTotal.toFixed(2), synced: true,
          })
        }
      } catch (error) {
        results.push({
          clientId: input.clientId,
          ok: false,
          error: error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ',
        })
      }
    }

    for (const t of body.timesheets) {
      await prisma.timesheet.create({
        data: {
          branchId: req.branchId,
          cashierId: t.cashierId,
          clockInAt: new Date(t.clockInAt),
          clockOutAt: t.clockOutAt ? new Date(t.clockOutAt) : null,
          hours: t.clockOutAt
            ? ((new Date(t.clockOutAt).getTime() - new Date(t.clockInAt).getTime()) / 3_600_000).toFixed(2)
            : null,
          posDeviceId: req.posDeviceId,
        },
      })
    }

    if (req.posDeviceId) {
      await prisma.posDevice.update({
        where: { id: req.posDeviceId },
        data: { lastSyncProductAt: new Date(), lastUsedAt: new Date() },
      })
    }

    return {
      serverTime: new Date().toISOString(),
      accepted: results.filter((r) => r.ok).length,
      rejected: results.filter((r) => !r.ok).length,
      results,
    }
  })

  /** สถานะซิงค์ล่าสุดของแต่ละเครื่อง (หน้าเครื่องมือผู้ดูแลระบบ) */
  app.get('/sync/status', { preHandler: app.withBranch }, async (req) =>
    prisma.posDevice.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      select: {
        id: true, posNumber: true, deviceName: true, appVersion: true,
        status: true, lastUsedAt: true, lastSyncProductAt: true, invoiceRunNumber: true,
      },
      orderBy: { posNumber: 'asc' },
    }),
  )
}

export default routes
