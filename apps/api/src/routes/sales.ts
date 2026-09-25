import type { FastifyPluginAsync } from 'fastify'
import { Prisma, prisma } from '@medee/db'
import { calculateChange, promptPayPayload, summarizeCashRound } from '@medee/domain'
import { z } from 'zod'
import { branchBusinessDay, branchDayRange, branchToday, getBranch } from '../lib/branch.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { listQuerySchema, paged, skipTake } from '../lib/pagination.js'
import { sendExport } from '../lib/export.js'
import { createReceipt, createReceiptSchema, voidReceipt } from '../lib/sales.js'

const routes: FastifyPluginAsync = async (app) => {
  // ───────── บิลขาย ─────────
  app.post('/receipts', { preHandler: app.requireCashier('sell') }, async (req, reply) => {
    const body = createReceiptSchema.parse(req.body)
    const { receipt, duplicated } = await createReceipt(req.branchId, body, {
      cashierId: req.cashier?.id,
      cashierName: req.cashier?.name,
      posDeviceId: req.posDeviceId,
    })
    if (!duplicated) {
      app.broadcast(req.branchId, 'receipt.created', {
        id: receipt.id, receiptNo: receipt.receiptNo, grandTotal: receipt.grandTotal.toFixed(2),
      })
    }
    // เงินทอนคำนวณจากยอดที่รับมา
    const received = body.payments.reduce(
      (a, p) => a.plus(new Prisma.Decimal(String(p.received ?? p.amount))), new Prisma.Decimal(0),
    )
    return reply.status(duplicated ? 200 : 201).send({
      ...receipt,
      change: calculateChange(received.toFixed(2), receipt.grandTotal.toFixed(2)),
      duplicated,
    })
  })

  /** ประวัติการขาย (/report/transaction) */
  app.get('/receipts', { preHandler: app.requirePermission('/report/transaction') }, async (req, reply) => {
    const query = listQuerySchema.parse(req.query)
    const filters = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.enum(['ปกติ', 'ยกเลิก']).optional(),
      cashierId: z.string().uuid().optional(),
      memberId: z.string().uuid().optional(),
      paymentMethod: z.string().optional(),
    }).parse(req.query)

    const branch = await getBranch(req.branchId)
    const today = branchToday(branch)
    const from = filters.from ?? today
    const to = filters.to ?? today

    const where: Prisma.ReceiptWhereInput = {
      branchId: req.branchId,
      businessDay: { gte: from, lte: to },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.cashierId ? { cashierId: filters.cashierId } : {}),
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.paymentMethod ? { payments: { some: { method: filters.paymentMethod } } } : {}),
      ...(query.search ? { receiptNo: { contains: query.search, mode: 'insensitive' } } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        orderBy: { soldAt: 'asc' },
        ...(query.export ? {} : skipTake(query)),
        include: {
          member: { select: { id: true, name: true } },
          cashier: { select: { id: true, name: true } },
          payments: true,
        },
      }),
      prisma.receipt.count({ where }),
    ])

    if (query.export) {
      return sendExport(reply, query.export, 'ประวัติการขาย', [
        { key: 'soldAt', header: 'วันที่' },
        { key: 'receiptNo', header: 'เลขที่บิล' },
        { key: 'subtotal', header: 'รวมก่อนลด' },
        { key: 'discountTotal', header: 'ส่วนลด' },
        { key: 'promotionDiscount', header: 'ส่วนลดโปรโมชัน' },
        { key: 'grandTotal', header: 'ยอดขาย' },
        { key: 'vatableAmount', header: 'สินค้ามีภาษี' },
        { key: 'nonVatableAmount', header: 'สินค้าไม่มีภาษี' },
        { key: 'amountBeforeVat', header: 'มูลค่าก่อน VAT' },
        { key: 'vatAmount', header: 'คิดเป็นมูลค่าภาษี' },
        { key: 'optionTotal', header: 'มูลค่าตัวเลือก' },
        { key: 'serviceCharge', header: 'ค่าบริการ' },
        { key: 'rounding', header: 'ปัดเศษ' },
        { key: 'deliveryFee', header: 'ค่าจัดส่ง' },
        { key: 'status', header: 'สถานะ' },
      ], rows.map((r) => ({
        soldAt: r.soldAt.toISOString(),
        receiptNo: r.receiptNo,
        subtotal: r.subtotal.toFixed(2),
        discountTotal: r.discountTotal.toFixed(2),
        promotionDiscount: r.promotionDiscount.toFixed(2),
        grandTotal: r.grandTotal.toFixed(2),
        vatableAmount: r.vatableAmount.toFixed(2),
        nonVatableAmount: r.nonVatableAmount.toFixed(2),
        amountBeforeVat: r.amountBeforeVat.toFixed(2),
        vatAmount: r.vatAmount.toFixed(2),
        optionTotal: r.optionTotal.toFixed(2),
        serviceCharge: r.serviceCharge.toFixed(2),
        rounding: r.rounding.toFixed(2),
        deliveryFee: r.deliveryFee.toFixed(2),
        status: r.status,
      })), { title: 'ประวัติการขาย', subtitle: `วันที่ ${from} ถึง ${to}` })
    }

    // การ์ดสรุปบนหัวตาราง
    const summary = await prisma.receipt.aggregate({
      where: { ...where, status: 'ปกติ' },
      _sum: { grandTotal: true, discountTotal: true, subtotal: true, profit: true },
      _count: true,
    })
    return { ...paged(rows, total, query), summary, range: { from, to } }
  })

  app.get('/receipts/:id', { preHandler: app.requirePermission('/report/transaction') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const receipt = await prisma.receipt.findFirst({
      where: { id, branchId: req.branchId },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        payments: true,
        member: { select: { id: true, name: true, pointsBalance: true } },
        cashier: { select: { id: true, name: true } },
        posDevice: { select: { posNumber: true } },
      },
    })
    if (!receipt) throw notFound('ไม่พบบิลนี้')
    return receipt
  })

  /** ยกเลิกบิล — ต้องมีเหตุผล และผู้มีสิทธิ์ยืนยัน (หัวข้อ 7.7) */
  app.post('/receipts/:id/void', { preHandler: app.requireCashier('voidBill') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      reason: z.string().min(1, 'กรุณาระบุเหตุผลในการยกเลิก'),
      approvedBy: z.string().optional(),
    }).parse(req.body)

    // ฝั่งหลังบ้านต้องมีสิทธิ์ "ลบ" ของหน้าประวัติการขาย
    if (req.tokenKind === 'web' && !req.account.isOwner) {
      const { checkPermission } = await import('@medee/domain')
      if (!checkPermission(req.permissions, '/report/transaction', 'remove').allowed) {
        throw forbidden('คุณไม่มีสิทธิ์ยกเลิกบิล')
      }
    }

    const actorName = body.approvedBy ?? req.cashier?.name ?? req.account.email
    const updated = await voidReceipt(req.branchId, id, body.reason, actorName)
    app.broadcast(req.branchId, 'receipt.voided', { id, receiptNo: updated.receiptNo })
    return updated
  })

  /** ออกใบกำกับภาษีเต็มรูป (ส่วนเพิ่มจากต้นฉบับ) */
  app.post('/receipts/:id/tax-invoice', { preHandler: app.requirePermission('/report/newPayment', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      customerName: z.string().min(1, 'กรุณากรอกชื่อผู้ซื้อ'),
      customerTaxId: z.string().min(1, 'กรุณากรอกเลขประจำตัวผู้เสียภาษี'),
      customerBranch: z.string().optional(),
      customerAddress: z.string().optional(),
    }).parse(req.body)

    const receipt = await prisma.receipt.findFirst({ where: { id, branchId: req.branchId } })
    if (!receipt) throw notFound('ไม่พบบิลนี้')
    if (receipt.status === 'ยกเลิก') throw badRequest('บิลที่ถูกยกเลิกออกใบกำกับภาษีไม่ได้')
    if (receipt.taxInvoiceNo) throw conflict(`บิลนี้ออกใบกำกับภาษีแล้ว (${receipt.taxInvoiceNo})`)

    const { nextTaxInvoiceNo } = await import('../lib/docNumbers.js')
    return prisma.$transaction(async (tx) => {
      const taxInvoiceNo = await nextTaxInvoiceNo(tx, req.branchId, receipt.soldAt)
      return tx.receipt.update({
        where: { id },
        data: { taxInvoiceNo, taxInvoiceAt: new Date(), customerTaxInfo: body as object },
      })
    })
  })

  // ───────── บิลที่เปิดอยู่ / พักบิล ─────────
  app.get('/open-bills', { preHandler: app.requirePermission('/report/currentbill') }, async (req) => {
    const rows = await prisma.openBill.findMany({
      where: { branchId: req.branchId },
      orderBy: { openedAt: 'desc' },
      include: { table: { select: { tableNo: true } } },
    })
    return { data: rows, total: rows.length }
  })

  app.post('/open-bills', { preHandler: app.requireCashier('sell') }, async (req) => {
    const body = z.object({
      refNo: z.string().optional(),
      tableId: z.string().uuid().nullable().optional(),
      memberId: z.string().uuid().nullable().optional(),
      orderType: z.string().default('ทานที่ร้าน'),
      salesChannel: z.string().default('ขายหน้าร้าน'),
      guests: z.number().int().positive().nullable().optional(),
      note: z.string().nullable().optional(),
      items: z.array(z.record(z.unknown())),
      totals: z.record(z.unknown()),
    }).parse(req.body)

    const refNo = body.refNo ?? `HOLD${Date.now().toString().slice(-8)}`
    const created = await prisma.openBill.create({
      data: {
        branchId: req.branchId,
        posDeviceId: req.posDeviceId,
        cashierId: req.cashier?.id ?? null,
        refNo,
        tableId: body.tableId ?? null,
        memberId: body.memberId ?? null,
        orderType: body.orderType,
        salesChannel: body.salesChannel,
        guests: body.guests ?? null,
        note: body.note ?? null,
        items: body.items as object,
        totals: body.totals as object,
        openedAt: new Date(),
      },
    })
    if (body.tableId) {
      await prisma.shopTable.update({
        where: { id: body.tableId },
        data: { status: 'occupied', openedAt: new Date(), guests: body.guests ?? null },
      })
    }
    app.broadcast(req.branchId, 'open_bill.updated', { id: created.id, action: 'created' })
    return created
  })

  app.put('/open-bills/:id', { preHandler: app.requireCashier('sell') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      items: z.array(z.record(z.unknown())).optional(),
      totals: z.record(z.unknown()).optional(),
      memberId: z.string().uuid().nullable().optional(),
      note: z.string().nullable().optional(),
    }).parse(req.body)
    const row = await prisma.openBill.findFirst({ where: { id, branchId: req.branchId } })
    if (!row) throw notFound('ไม่พบบิลที่เปิดอยู่')
    const updated = await prisma.openBill.update({
      where: { id },
      data: {
        items: body.items as object | undefined,
        totals: body.totals as object | undefined,
        memberId: body.memberId,
        note: body.note,
      },
    })
    app.broadcast(req.branchId, 'open_bill.updated', { id, action: 'updated' })
    return updated
  })

  /** ลบบิลที่พักไว้ — ต้องมีเหตุผล (และ PIN ผู้มีสิทธิ์จากฝั่ง UI) */
  app.delete('/open-bills/:id', { preHandler: app.requireCashier('voidBill') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { reason } = z.object({ reason: z.string().min(1, 'กรุณาระบุเหตุผล') }).parse(req.body ?? {})
    const row = await prisma.openBill.findFirst({ where: { id, branchId: req.branchId } })
    if (!row) throw notFound('ไม่พบบิลที่เปิดอยู่')
    await prisma.$transaction(async (tx) => {
      await tx.openBill.delete({ where: { id } })
      if (row.tableId) {
        await tx.shopTable.update({ where: { id: row.tableId }, data: { status: 'free', openedAt: null } })
      }
      await tx.auditLog.create({
        data: {
          branchId: req.branchId, actorType: req.tokenKind === 'device' ? 'cashier' : 'account',
          actorId: req.cashier?.id ?? req.account.id,
          actorName: req.cashier?.name ?? req.account.email,
          action: 'open_bill.deleted', entity: 'OpenBill', entityId: id,
          before: { refNo: row.refNo, totals: row.totals } as object,
          after: { reason } as object,
        },
      })
    })
    app.broadcast(req.branchId, 'open_bill.updated', { id, action: 'deleted' })
    return { ok: true }
  })

  // ───────── รอบการขาย (จัดการเงินสด) ─────────
  app.get('/cash-rounds', { preHandler: app.requirePermission('/report/closesell') }, async (req, reply) => {
    const query = listQuerySchema.parse(req.query)
    const filters = z.object({ from: z.string().optional(), to: z.string().optional(), status: z.enum(['open', 'closed']).optional() })
      .parse(req.query)
    const branch = await getBranch(req.branchId)
    const from = filters.from ?? branchToday(branch)
    const to = filters.to ?? branchToday(branch)

    const where: Prisma.CashRoundWhereInput = {
      branchId: req.branchId,
      businessDay: { gte: from, lte: to },
      ...(filters.status ? { status: filters.status } : {}),
    }
    const [rows, total] = await Promise.all([
      prisma.cashRound.findMany({
        where, orderBy: { openedAt: 'desc' },
        ...(query.export ? {} : skipTake(query)),
        include: {
          posDevice: { select: { posNumber: true } },
          openedBy: { select: { name: true } },
          cashInOuts: true,
        },
      }),
      prisma.cashRound.count({ where }),
    ])

    const mapped = rows.map((r) => {
      const s = summarizeCashRound({
        openingCash: r.openingCash.toFixed(2),
        cashSales: r.cashSales.toFixed(2),
        cashIn: r.cashInTotal.toFixed(2),
        cashOut: r.cashOutTotal.toFixed(2),
        countedCash: r.countedCash?.toFixed(2) ?? null,
      })
      return {
        id: r.id,
        openedAt: r.openedAt,
        posNumber: r.posDevice.posNumber,
        roundNo: r.roundNo,
        closedAt: r.closedAt,
        closedBy: r.closedById,
        openedByName: r.openedBy?.name ?? null,
        ...s,
        status: r.status,
      }
    })

    if (query.export) {
      return sendExport(reply, query.export, 'ปิดรอบการขาย', [
        { key: 'openedAt', header: 'วันที่' },
        { key: 'posNumber', header: 'เครื่อง Order' },
        { key: 'roundNo', header: 'รอบการขายที่' },
        { key: 'closedAt', header: 'เวลาปิดรอบการขาย' },
        { key: 'openedByName', header: 'ปิดรอบขายโดย' },
        { key: 'cashSales', header: 'ยอดขายด้วยเงินสด' },
        { key: 'openingCash', header: 'เงินทอนเริ่มต้น' },
        { key: 'cashIn', header: 'เงินเข้า' },
        { key: 'cashOut', header: 'เงินออก' },
        { key: 'countedCash', header: 'จำนวนเงินที่นับได้ในลิ้นชัก' },
        { key: 'expectedCash', header: 'จำนวนเงินที่ควรมีในลิ้นชัก' },
        { key: 'difference', header: 'ส่วนต่าง' },
      ], mapped.map((r) => ({
        ...r,
        openedAt: r.openedAt.toISOString(),
        closedAt: r.closedAt?.toISOString() ?? '-',
        countedCash: r.countedCash ?? '-',
        difference: r.difference ?? '-',
      })))
    }
    return paged(mapped, total, query)
  })

  /** รอบที่เปิดอยู่ของเครื่องนี้ */
  app.get('/cash-rounds/current', { preHandler: app.withBranch }, async (req) => {
    const posDeviceId = req.posDeviceId ?? z.object({ posDeviceId: z.string().uuid().optional() }).parse(req.query).posDeviceId
    if (!posDeviceId) return null
    const round = await prisma.cashRound.findFirst({
      where: { branchId: req.branchId, posDeviceId, status: 'open' },
      orderBy: { openedAt: 'desc' },
      include: { cashInOuts: { orderBy: { occurredAt: 'desc' } } },
    })
    if (!round) return null
    return {
      ...round,
      summary: summarizeCashRound({
        openingCash: round.openingCash.toFixed(2),
        cashSales: round.cashSales.toFixed(2),
        cashIn: round.cashInTotal.toFixed(2),
        cashOut: round.cashOutTotal.toFixed(2),
        countedCash: null,
      }),
    }
  })

  /** เปิดรอบการขาย — ใส่เงินทอนเริ่มต้น (หัวข้อ 5.6) */
  app.post('/cash-rounds', { preHandler: app.requireCashier('cashManagement') }, async (req) => {
    const body = z.object({
      posDeviceId: z.string().uuid().optional(),
      openingCash: z.union([z.string(), z.number()]),
    }).parse(req.body)

    const posDeviceId = body.posDeviceId ?? req.posDeviceId
    if (!posDeviceId) throw badRequest('ต้องระบุเครื่อง POS')

    const open = await prisma.cashRound.findFirst({
      where: { branchId: req.branchId, posDeviceId, status: 'open' },
    })
    if (open) throw conflict('เครื่องนี้มีรอบการขายที่เปิดอยู่แล้ว กรุณาปิดรอบก่อน')

    const branch = await getBranch(req.branchId)
    const businessDay = branchToday(branch)
    const sameDay = await prisma.cashRound.count({ where: { branchId: req.branchId, posDeviceId, businessDay } })

    const created = await prisma.cashRound.create({
      data: {
        branchId: req.branchId,
        posDeviceId,
        roundNo: sameDay + 1,
        businessDay,
        openedAt: new Date(),
        openedById: req.cashier?.id ?? null,
        openingCash: String(body.openingCash),
        status: 'open',
      },
    })
    app.broadcast(req.branchId, 'cash_round.opened', { id: created.id, roundNo: created.roundNo })
    return created
  })

  /** ปิดรอบการขาย — ใส่จำนวนเงินที่นับได้ แล้วระบบคำนวณส่วนต่าง */
  app.post('/cash-rounds/:id/close', { preHandler: app.requireCashier('cashManagement') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      countedCash: z.union([z.string(), z.number()]),
      note: z.string().optional(),
    }).parse(req.body)

    const round = await prisma.cashRound.findFirst({ where: { id, branchId: req.branchId } })
    if (!round) throw notFound('ไม่พบรอบการขายนี้')
    if (round.status === 'closed') throw conflict('รอบการขายนี้ถูกปิดไปแล้ว')

    const s = summarizeCashRound({
      openingCash: round.openingCash.toFixed(2),
      cashSales: round.cashSales.toFixed(2),
      cashIn: round.cashInTotal.toFixed(2),
      cashOut: round.cashOutTotal.toFixed(2),
      countedCash: String(body.countedCash),
    })

    const updated = await prisma.cashRound.update({
      where: { id },
      data: {
        closedAt: new Date(),
        closedById: req.cashier?.id ?? null,
        expectedCash: s.expectedCash,
        countedCash: s.countedCash!,
        diff: s.difference!,
        status: 'closed',
      },
      include: { posDevice: { select: { posNumber: true } }, openedBy: { select: { name: true } } },
    })
    app.broadcast(req.branchId, 'cash_round.closed', { id, difference: s.difference })
    return { ...updated, summary: s }
  })

  /** นำเงินเข้า-ออกจากลิ้นชัก */
  app.post('/cash-rounds/:id/cash-movement', { preHandler: app.requireCashier('cashManagement') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      type: z.enum(['IN', 'OUT']),
      category: z.string().default('อื่นๆ'),
      detail: z.string().nullable().optional(),
      amount: z.union([z.string(), z.number()]),
    }).parse(req.body)

    const round = await prisma.cashRound.findFirst({ where: { id, branchId: req.branchId } })
    if (!round) throw notFound('ไม่พบรอบการขายนี้')
    if (round.status === 'closed') throw conflict('รอบการขายนี้ถูกปิดแล้ว')
    const amount = new Prisma.Decimal(String(body.amount))
    if (amount.lessThanOrEqualTo(0)) throw badRequest('จำนวนเงินต้องมากกว่า 0')

    return prisma.$transaction(async (tx) => {
      const row = await tx.cashInOut.create({
        data: {
          cashRoundId: id, type: body.type, category: body.category,
          detail: body.detail ?? null, amount, occurredAt: new Date(),
          cashierId: req.cashier?.id ?? null,
        },
      })
      await tx.cashRound.update({
        where: { id },
        data: body.type === 'IN'
          ? { cashInTotal: { increment: amount } }
          : { cashOutTotal: { increment: amount } },
      })
      return row
    })
  })

  // ───────── โต๊ะ (โหมดร้านอาหาร) ─────────
  app.get('/tables', { preHandler: app.withBranch }, async (req) =>
    prisma.shopTable.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: [{ zone: { orderIndex: 'asc' } }, { tableNo: 'asc' }],
      include: { zone: true, openBills: { select: { id: true, refNo: true, totals: true } } },
    }),
  )

  app.post('/tables', { preHandler: app.requirePermission('/setting/shop', 'edit') }, async (req) => {
    const body = z.object({
      tableNo: z.string().min(1),
      zoneId: z.string().uuid().nullable().optional(),
      size: z.enum(['none', 'small', 'large']).default('none'),
      x: z.number().int().default(0),
      y: z.number().int().default(0),
      w: z.number().int().default(80),
      h: z.number().int().default(80),
      shape: z.string().default('rect'),
      timeLimitMinutes: z.number().int().nullable().optional(),
    }).parse(req.body)
    return prisma.shopTable.create({ data: { branchId: req.branchId, ...body } })
  })

  app.post('/tables/:id/clear', { preHandler: app.requireCashier('sell') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const table = await prisma.shopTable.findFirst({ where: { id, branchId: req.branchId } })
    if (!table) throw notFound('ไม่พบโต๊ะนี้')
    await prisma.$transaction([
      prisma.openBill.deleteMany({ where: { tableId: id } }),
      prisma.shopTable.update({ where: { id }, data: { status: 'free', openedAt: null, guests: null } }),
    ])
    app.broadcast(req.branchId, 'open_bill.updated', { tableId: id, action: 'cleared' })
    return { ok: true }
  })

  /** ย้ายโต๊ะ — ย้ายบิลที่เปิดอยู่ไปโต๊ะปลายทาง */
  app.post('/tables/:id/move', { preHandler: app.requireCashier('sell') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { toTableId } = z.object({ toTableId: z.string().uuid() }).parse(req.body)
    const [from, to] = await Promise.all([
      prisma.shopTable.findFirst({ where: { id, branchId: req.branchId } }),
      prisma.shopTable.findFirst({ where: { id: toTableId, branchId: req.branchId } }),
    ])
    if (!from || !to) throw notFound('ไม่พบโต๊ะต้นทางหรือปลายทาง')
    if (to.status !== 'free') throw conflict('โต๊ะปลายทางไม่ว่าง')

    await prisma.$transaction([
      prisma.openBill.updateMany({ where: { tableId: id }, data: { tableId: toTableId, tableNo: to.tableNo } }),
      prisma.shopTable.update({ where: { id }, data: { status: 'free', openedAt: null, guests: null } }),
      prisma.shopTable.update({ where: { id: toTableId }, data: { status: 'occupied', openedAt: from.openedAt, guests: from.guests } }),
    ])
    app.broadcast(req.branchId, 'open_bill.updated', { action: 'moved', from: id, to: toTableId })
    return { ok: true }
  })

  /** PromptPay QR สำหรับหน้าชำระเงินและท้ายใบเสร็จ */
  app.get('/payments/promptpay-qr', { preHandler: app.withBranch }, async (req) => {
    const { amount } = z.object({ amount: z.string().optional() }).parse(req.query)
    const branch = await getBranch(req.branchId)
    if (!branch.paymentPromptpay || !branch.promptpayId) {
      throw badRequest('ร้านยังไม่ได้เปิดใช้งานการชำระเงินด้วยพร้อมเพย์')
    }
    return {
      payload: promptPayPayload({
        promptPayId: branch.promptpayId,
        amount: amount ?? null,
        merchantName: branch.promptpayAccName ?? undefined,
      }),
      accountName: branch.promptpayAccName,
    }
  })

  /** ข้อมูลสำหรับพิมพ์ใบเสร็จ (ESC/POS หรือ HTML) */
  app.get('/receipts/:id/print', { preHandler: app.withBranch }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const receipt = await prisma.receipt.findFirst({
      where: { id, branchId: req.branchId },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        payments: true,
        member: { select: { name: true, pointsBalance: true } },
        cashier: { select: { name: true } },
        posDevice: { select: { posNumber: true } },
      },
    })
    if (!receipt) throw notFound('ไม่พบบิลนี้')
    const branch = await getBranch(req.branchId)
    const shop = await prisma.shop.findUniqueOrThrow({
      where: { id: branch.shopId }, select: { name: true },
    })

    return {
      receipt,
      shop: {
        name: shop.name,
        branchName: branch.branchName,
        address1: branch.address1,
        address2: branch.address2,
        tel: branch.tel,
        taxId: branch.taxId,
        logoImage: branch.logoImage,
      },
      settings: {
        receiptHeader: branch.receiptHeader,
        headerShowOnReceipt: branch.headerShowOnReceipt,
        footer1: branch.footer1,
        footer2: branch.footer2,
        footerImage1: branch.footerImage1,
        footerImage2: branch.footerImage2,
        showDetailOnReceipt: branch.showDetailOnReceipt,
        showNoteOnReceipt: branch.showNoteOnReceipt,
        showQueueOnReceipt: branch.showQueueOnReceipt,
        showBarcodeOnReceipt: branch.showBarcodeOnReceipt,
        showVatOnReceipt: branch.showVatOnReceipt,
        showOptionGroupOnReceipt: branch.showOptionGroupOnReceipt,
        wordingToReplace: branch.wordingToReplace,
        receiptFormat: branch.receiptFormat,
        useBuddhistYear: branch.receiptUseBuddhistYear,
        vatRate: branch.vatRate.toFixed(2),
        promptpayShowOnReceipt: branch.promptpayShowOnReceipt,
        promptpayPayload:
          branch.promptpayShowOnReceipt && branch.promptpayId
            ? promptPayPayload({
                promptPayId: branch.promptpayId,
                amount: receipt.grandTotal.toFixed(2),
                merchantName: branch.promptpayAccName ?? undefined,
              })
            : null,
      },
    }
  })

  /** วันขายปัจจุบันของสาขา — UI ใช้ตั้งค่าเริ่มต้นของตัวเลือกช่วงวันที่ */
  app.get('/business-day', { preHandler: app.withBranch }, async (req) => {
    const branch = await getBranch(req.branchId)
    const today = branchToday(branch)
    return {
      today,
      now: new Date().toISOString(),
      businessDayOfNow: branchBusinessDay(branch, new Date()),
      range: branchDayRange(branch, today, today),
      timezone: branch.timezone,
    }
  })
}

export default routes
