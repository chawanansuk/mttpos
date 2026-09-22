import type { FastifyPluginAsync } from 'fastify'
import { Prisma, prisma } from '@medee/db'
import { MOVEMENT_LABELS, stockStatus, type MovementType } from '@medee/domain'
import { z } from 'zod'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { listQuerySchema, paged, skipTake } from '../lib/pagination.js'
import { sendExport } from '../lib/export.js'
import { nextStockDocNo } from '../lib/docNumbers.js'
import { recordMovement, updateAverageCost } from '../lib/stock.js'

const docItemSchema = z.object({
  productId: z.string().uuid(),
  pluId: z.string().uuid().nullable().optional(),
  qty: z.union([z.string(), z.number()]),
  unitPrice: z.union([z.string(), z.number()]).optional(),
  discount: z.union([z.string(), z.number()]).optional(),
  /** เอกสารตรวจนับ / ปรับปรุง */
  countedQty: z.union([z.string(), z.number()]).optional(),
})

const routes: FastifyPluginAsync = async (app) => {
  // ───────── สินค้าคงเหลือ (/inventory/sku, /inventory/plu) ─────────
  app.get('/stock/balance', { preHandler: app.requirePermission('/inventory/sku') }, async (req, reply) => {
    const query = listQuerySchema.parse(req.query)
    const extra = z.object({
      by: z.enum(['sku', 'plu']).default('sku'),
      /** ok | low | out | never | serial */
      filter: z.enum(['all', 'low', 'out', 'never', 'serial']).default('all'),
      categoryId: z.string().uuid().optional(),
    }).parse(req.query)

    const search = query.search?.trim()
    const where: Prisma.ProductWhereInput = {
      branchId: req.branchId,
      deletedAt: null,
      ...(extra.categoryId ? { categoryId: extra.categoryId } : {}),
      ...(extra.filter === 'serial' ? { skuType: 'SN' } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search } },
              { category: { name: { contains: search, mode: 'insensitive' } } },
              { plus: { some: { pluCode: { contains: search } } } },
            ],
          }
        : {}),
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        unit: { select: { name: true } },
        plus: { where: { deletedAt: null }, include: { unit: { select: { name: true } } } },
        _count: { select: { stockMovements: true } },
      },
      orderBy: sortStock(query.sort, query.order),
    })

    type Row = {
      productId: string; barcode: string; name: string; unitName: string
      categoryName: string; balance: string; status: string; ratio: string
    }
    const rows: Row[] = []
    for (const p of products) {
      const main = p.plus.find((x) => x.isDefault)
      const balance = main?.stockQty ?? new Prisma.Decimal(0)
      const hasMovement = p._count.stockMovements > 0
      const status = stockStatus(balance.toString(), p.lowStockThreshold?.toString() ?? null, hasMovement)

      if (extra.filter === 'low' && status !== 'low_stock') continue
      if (extra.filter === 'out' && status !== 'out_of_stock') continue
      if (extra.filter === 'never' && status !== 'never_moved') continue

      if (extra.by === 'plu') {
        for (const plu of p.plus) {
          rows.push({
            productId: p.id,
            barcode: plu.pluCode,
            name: plu.name,
            // หน้า "สินค้าคงเหลือตามขนาดบรรจุ" แสดงเป็น "แพ็ค / 10"
            unitName: `${plu.unit?.name ?? ''} / ${plu.skuRatio.toString()}`,
            categoryName: p.category?.name ?? '',
            balance: plu.isDefault ? balance.toString() : '0',
            status,
            ratio: plu.skuRatio.toString(),
          })
        }
      } else {
        rows.push({
          productId: p.id,
          barcode: p.barcode ?? '',
          name: p.name,
          unitName: p.unit?.name ?? '',
          categoryName: p.category?.name ?? '',
          balance: balance.toString(),
          status,
          ratio: '1',
        })
      }
    }

    if (query.export) {
      return sendExport(reply, query.export, 'สินค้าคงเหลือ', [
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'unitName', header: 'หน่วยบรรจุ' },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'balance', header: 'คงเหลือ' },
      ], rows)
    }

    const start = (query.page - 1) * query.limit
    return paged(rows.slice(start, start + query.limit), rows.length, query)
  })

  /** ความเคลื่อนไหวสินค้า (/inventory/stockcard/{branchId}/{productId}) */
  app.get('/stock/movements/:productId', { preHandler: app.requirePermission('/inventory/stockcard') }, async (req, reply) => {
    const { productId } = z.object({ productId: z.string().uuid() }).parse(req.params)
    const query = listQuerySchema.parse(req.query)

    const product = await prisma.product.findFirst({
      where: { id: productId, branchId: req.branchId },
      select: { id: true, name: true, barcode: true },
    })
    if (!product) throw notFound('ไม่พบสินค้านี้')

    const where = { branchId: req.branchId, productId }
    const [rows, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where, orderBy: { occurredAt: 'desc' }, ...(query.export ? {} : skipTake(query)),
      }),
      prisma.stockMovement.count({ where }),
    ])

    const mapped = rows.map((m) => ({
      id: m.id,
      occurredAt: m.occurredAt,
      docNo: m.docNo,
      docType: m.docType,
      docTypeLabel: MOVEMENT_LABELS[m.docType as MovementType] ?? m.docType,
      qty: m.qty.toString(),
      balanceAfter: m.balanceAfter.toString(),
      actorName: m.actorName,
      note: m.note,
    }))

    if (query.export) {
      return sendExport(reply, query.export, `ความเคลื่อนไหว-${product.name}`, [
        { key: 'occurredAt', header: 'วันที่' },
        { key: 'docNo', header: 'เลขที่เอกสาร' },
        { key: 'docTypeLabel', header: 'ประเภท' },
        { key: 'qty', header: 'จำนวน' },
        { key: 'balanceAfter', header: 'คงเหลือหลังรายการ' },
        { key: 'actorName', header: 'ปรับปรุงโดย' },
      ], mapped)
    }

    return { product, ...paged(mapped, total, query) }
  })

  // ───────── เอกสารคลัง ─────────
  const DOC_KINDS = {
    receive: { docType: 'RECEIVE', permission: '/inventory/stock-in', movement: 'RECEIVE' as MovementType, counter: 'receive' as const },
    issue: { docType: 'ISSUE', permission: '/inventory/stock-out', movement: 'ISSUE' as MovementType, counter: 'issue' as const },
    adjust: { docType: 'ADJUST', permission: '/inventory/adjust-stock', movement: 'ADJUST_INC' as MovementType, counter: 'adjustInc' as const },
    count: { docType: 'COUNT', permission: '/inventory/check-stock', movement: 'COUNT' as MovementType, counter: 'count' as const },
  }

  for (const [kind, meta] of Object.entries(DOC_KINDS)) {
    /** รายการเอกสาร */
    app.get(`/stock-docs/${kind}`, { preHandler: app.requirePermission(meta.permission) }, async (req, reply) => {
      const query = listQuerySchema.parse(req.query)
      const search = query.search?.trim()
      const where: Prisma.StockDocumentWhereInput = {
        branchId: req.branchId,
        docType: meta.docType,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { docNo: { contains: search, mode: 'insensitive' } },
                { supplierInvoiceNo: { contains: search, mode: 'insensitive' } },
                { supplierName: { contains: search, mode: 'insensitive' } },
                { countName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      }
      const [rows, total] = await Promise.all([
        prisma.stockDocument.findMany({
          where, orderBy: { createdAt: 'desc' },
          ...(query.export ? {} : skipTake(query)),
          include: { _count: { select: { items: true } } },
        }),
        prisma.stockDocument.count({ where }),
      ])

      if (query.export) {
        return sendExport(reply, query.export, `เอกสาร-${kind}`, [
          { key: 'createdAt', header: 'วันที่สร้าง' },
          { key: 'updatedAt', header: 'วันที่อัปเดต' },
          { key: 'docDate', header: 'วันที่ซื้อในบิล' },
          { key: 'docNo', header: 'เลขที่เอกสาร' },
          { key: 'supplierInvoiceNo', header: 'เลขที่ในบิลซื้อ' },
          { key: 'total', header: 'ยอดรวม' },
          { key: 'supplierName', header: 'ผู้จำหน่าย' },
          { key: 'createdBy', header: 'ชื่อผู้ใช้' },
          { key: 'status', header: 'สถานะ' },
        ], rows.map((r) => ({ ...r, total: r.total.toFixed(2) })))
      }
      return paged(rows, total, query)
    })

    /** สร้างเอกสาร */
    app.post(`/stock-docs/${kind}`, { preHandler: app.requirePermission(meta.permission, 'edit') }, async (req) => {
      const body = z.object({
        docDate: z.string().optional(),
        supplierName: z.string().nullable().optional(),
        supplierInvoiceNo: z.string().nullable().optional(),
        refDocNo: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        issueType: z.string().nullable().optional(),
        countName: z.string().nullable().optional(),
        discount: z.union([z.string(), z.number()]).optional(),
        pricesIncludeVat: z.boolean().default(false),
        computeAvgCost: z.boolean().default(false),
        items: z.array(docItemSchema).min(1, 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'),
      }).parse(req.body)

      const actorName = req.cashier?.name ?? req.account.email
      const now = new Date()

      return prisma.$transaction(async (tx) => {
        // เอกสารปรับปรุงแยกเลขรันเป็น ADJI / ADJD ตามทิศทางผลต่าง
        let counter: 'receive' | 'issue' | 'adjustInc' | 'adjustDec' | 'count' = meta.counter
        let adjustDirection: string | null = null
        if (kind === 'adjust') {
          const totalDiff = await computeAdjustDirection(tx, body.items)
          adjustDirection = totalDiff >= 0 ? 'INC' : 'DEC'
          counter = totalDiff >= 0 ? 'adjustInc' : 'adjustDec'
        }
        const docNo = await nextStockDocNo(tx, req.branchId, counter)

        const products = await tx.product.findMany({
          where: { id: { in: body.items.map((i) => i.productId) }, branchId: req.branchId },
          include: { unit: true, plus: { where: { deletedAt: null } } },
        })
        const byId = new Map(products.map((p) => [p.id, p]))

        let subtotal = new Prisma.Decimal(0)
        const itemsData = []
        for (const [index, item] of body.items.entries()) {
          const product = byId.get(item.productId)
          if (!product) throw notFound(`ไม่พบสินค้ารหัส ${item.productId}`)
          const plu = product.plus.find((p) => p.id === item.pluId) ?? product.plus.find((p) => p.isDefault)
          const mainStock = product.plus.find((p) => p.isDefault)?.stockQty ?? new Prisma.Decimal(0)

          const qty = new Prisma.Decimal(String(item.qty ?? 0))
          const unitPrice = new Prisma.Decimal(String(item.unitPrice ?? product.stdCost))
          const discount = new Prisma.Decimal(String(item.discount ?? 0))
          const lineTotal = qty.times(unitPrice).minus(discount)
          subtotal = subtotal.plus(lineTotal)

          const countedQty = item.countedQty === undefined ? null : new Prisma.Decimal(String(item.countedQty))
          const diffQty = countedQty ? countedQty.minus(mainStock) : null

          itemsData.push({
            productId: product.id,
            pluId: plu?.id ?? null,
            barcode: plu?.pluCode ?? product.barcode,
            name: plu?.name ?? product.name,
            unitName: product.unit?.name ?? null,
            ratio: plu?.skuRatio ?? new Prisma.Decimal(1),
            qty,
            unitPrice,
            discount,
            lineTotal,
            countedQty,
            systemQty: countedQty ? mainStock : null,
            diffQty,
            orderIndex: index,
          })
        }

        const discountTotal = new Prisma.Decimal(String(body.discount ?? 0))
        const doc = await tx.stockDocument.create({
          data: {
            branchId: req.branchId,
            docType: meta.docType,
            docNo,
            status: kind === 'count' ? 'สำเร็จ' : 'ใช้งาน',
            docDate: body.docDate ? new Date(body.docDate) : now,
            supplierName: body.supplierName ?? null,
            supplierInvoiceNo: body.supplierInvoiceNo ?? null,
            refDocNo: body.refDocNo ?? null,
            note: body.note ?? null,
            issueType: body.issueType ?? null,
            countName: body.countName ?? null,
            adjustDirection,
            subtotal: subtotal.toFixed(2),
            discount: discountTotal.toFixed(2),
            total: subtotal.minus(discountTotal).toFixed(2),
            pricesIncludeVat: body.pricesIncludeVat,
            computeAvgCost: body.computeAvgCost,
            createdBy: actorName,
            items: { create: itemsData },
          },
          include: { items: true },
        })

        // เอกสารตรวจนับไม่กระทบสต็อก จนกว่าจะถูกนำไปใช้ในเอกสารอื่น (หัวข้อ 6.10.5)
        if (kind !== 'count') {
          for (const item of doc.items) {
            if (kind === 'adjust') {
              const diff = item.diffQty ?? new Prisma.Decimal(0)
              if (diff.isZero()) continue
              await recordMovement(tx, {
                branchId: req.branchId,
                productId: item.productId,
                pluId: item.pluId,
                docType: diff.greaterThan(0) ? 'ADJUST_INC' : 'ADJUST_DEC',
                docNo,
                documentId: doc.id,
                qty: diff.abs(),
                ratio: 1,
                unitCost: item.unitPrice.toFixed(2),
                occurredAt: now,
                actorName,
                note: body.note ?? undefined,
              })
            } else {
              await recordMovement(tx, {
                branchId: req.branchId,
                productId: item.productId,
                pluId: item.pluId,
                docType: meta.movement,
                docNo,
                documentId: doc.id,
                qty: item.qty,
                ratio: item.ratio,
                unitCost: item.unitPrice.toFixed(2),
                occurredAt: now,
                actorName,
                note: body.note ?? undefined,
              })
              if (kind === 'receive' && body.computeAvgCost) {
                await updateAverageCost(
                  tx, item.productId,
                  item.qty.times(item.ratio), item.unitPrice.toFixed(2),
                )
              }
            }
          }
        }

        app.broadcast(req.branchId, 'stock.updated', { docNo, docType: meta.docType })
        return doc
      })
    })
  }

  /** รายละเอียดเอกสาร */
  app.get('/stock-docs/:id', { preHandler: app.withBranch }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const doc = await prisma.stockDocument.findFirst({
      where: { id, branchId: req.branchId },
      include: { items: { orderBy: { orderIndex: 'asc' } }, supplier: true },
    })
    if (!doc) throw notFound('ไม่พบเอกสารนี้')
    return doc
  })

  /** ยกเลิกเอกสาร — คืนสต็อกกลับ (ส่วนเพิ่มจากต้นฉบับ) */
  app.post('/stock-docs/:id/cancel', { preHandler: app.requirePermission('/inventory/stock-in', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { reason } = z.object({ reason: z.string().min(1, 'กรุณาระบุเหตุผล') }).parse(req.body)
    const doc = await prisma.stockDocument.findFirst({
      where: { id, branchId: req.branchId },
      include: { items: true },
    })
    if (!doc) throw notFound('ไม่พบเอกสารนี้')
    if (doc.status === 'ยกเลิก') throw conflict('เอกสารนี้ถูกยกเลิกไปแล้ว')

    const actorName = req.cashier?.name ?? req.account.email
    const reverse: Record<string, MovementType> = {
      RECEIVE: 'ISSUE', ISSUE: 'RECEIVE', TRANSFER_OUT: 'TRANSFER_IN', TRANSFER_IN: 'TRANSFER_OUT',
    }

    return prisma.$transaction(async (tx) => {
      if (doc.docType !== 'COUNT') {
        for (const item of doc.items) {
          const docType = doc.docType === 'ADJUST'
            ? ((item.diffQty ?? new Prisma.Decimal(0)).greaterThan(0) ? 'ADJUST_DEC' : 'ADJUST_INC')
            : reverse[doc.docType]
          if (!docType) continue
          const qty = doc.docType === 'ADJUST' ? (item.diffQty ?? new Prisma.Decimal(0)).abs() : item.qty
          if (qty.isZero()) continue
          await recordMovement(tx, {
            branchId: req.branchId,
            productId: item.productId,
            pluId: item.pluId,
            docType: docType as MovementType,
            docNo: doc.docNo,
            documentId: doc.id,
            qty,
            ratio: item.ratio,
            unitCost: item.unitPrice.toFixed(2),
            occurredAt: new Date(),
            actorName,
            note: `ยกเลิกเอกสาร: ${reason}`,
          })
        }
      }
      const updated = await tx.stockDocument.update({
        where: { id },
        data: { status: 'ยกเลิก', note: `${doc.note ?? ''}\nยกเลิก: ${reason}`.trim() },
      })
      app.broadcast(req.branchId, 'stock.updated', { docNo: doc.docNo, action: 'cancelled' })
      return updated
    })
  })

  // ───────── โอนระหว่างสาขา ─────────
  app.get('/transfers', { preHandler: app.requirePermission('/inventory/transferOut') }, async (req) => {
    const query = listQuerySchema.parse(req.query)
    const extra = z.object({
      direction: z.enum(['out', 'in', 'all']).default('all'),
      status: z.string().optional(),
    }).parse(req.query)

    const where: Prisma.StockDocumentWhereInput = {
      deletedAt: null,
      ...(extra.status ? { status: extra.status } : {}),
      ...(query.search ? { docNo: { contains: query.search, mode: 'insensitive' } } : {}),
    }
    if (extra.direction === 'out') {
      where.docType = 'TRANSFER_OUT'
      where.branchId = req.branchId
    } else if (extra.direction === 'in') {
      where.docType = 'TRANSFER_OUT'
      where.toBranchId = req.branchId
    } else {
      where.OR = [
        { docType: 'TRANSFER_OUT', branchId: req.branchId },
        { docType: 'TRANSFER_OUT', toBranchId: req.branchId },
        { docType: 'TRANSFER_IN', branchId: req.branchId },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.stockDocument.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(query), include: { items: true } }),
      prisma.stockDocument.count({ where }),
    ])
    return paged(rows, total, query)
  })

  /** สร้างใบส่งออกสินค้า (TO) */
  app.post('/transfers/out', { preHandler: app.requirePermission('/inventory/transferOut', 'edit') }, async (req) => {
    const body = z.object({
      toBranchId: z.string().uuid(),
      dueDate: z.string().optional(),
      note: z.string().nullable().optional(),
      /** โอนทันที = รับอัตโนมัติที่ปลายทาง */
      immediate: z.boolean().default(false),
      items: z.array(z.object({
        productId: z.string().uuid(),
        qty: z.union([z.string(), z.number()]),
      })).min(1, 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'),
    }).parse(req.body)

    if (body.toBranchId === req.branchId) throw badRequest('สาขาต้นทางและปลายทางต้องไม่เป็นสาขาเดียวกัน')
    const target = await prisma.branch.findFirst({ where: { id: body.toBranchId, deletedAt: null } })
    if (!target) throw notFound('ไม่พบสาขาปลายทาง')

    const actorName = req.cashier?.name ?? req.account.email
    const now = new Date()

    return prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: body.items.map((i) => i.productId) }, branchId: req.branchId },
        include: { unit: true, plus: { where: { isDefault: true } } },
      })
      const byId = new Map(products.map((p) => [p.id, p]))

      for (const item of body.items) {
        const p = byId.get(item.productId)
        if (!p) throw notFound(`ไม่พบสินค้ารหัส ${item.productId}`)
        const stock = p.plus[0]?.stockQty ?? new Prisma.Decimal(0)
        if (stock.minus(String(item.qty)).lessThan(0)) {
          throw badRequest('สินค้าคงเหลือไม่เพียงพอ — สินค้าคงเหลือสาขาต้นทางเหลือน้อยกว่า 0 กรุณาตรวจสอบสินค้าคงเหลือ')
        }
      }

      const docNo = await nextStockDocNo(tx, req.branchId, 'transferOut')
      const doc = await tx.stockDocument.create({
        data: {
          branchId: req.branchId,
          docType: 'TRANSFER_OUT',
          docNo,
          status: body.immediate ? 'สำเร็จ' : 'รออนุมัติ',
          fromBranchId: req.branchId,
          toBranchId: body.toBranchId,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          note: body.note ?? null,
          createdBy: actorName,
          items: {
            create: body.items.map((item, index) => {
              const p = byId.get(item.productId)!
              return {
                productId: p.id,
                pluId: p.plus[0]?.id ?? null,
                barcode: p.barcode,
                name: p.name,
                unitName: p.unit?.name ?? null,
                ratio: '1',
                qty: String(item.qty),
                unitPrice: p.stdCost,
                lineTotal: new Prisma.Decimal(p.stdCost).times(String(item.qty)).toFixed(2),
                orderIndex: index,
              }
            }),
          },
        },
        include: { items: true },
      })

      // ตัดสต็อกต้นทางทันทีเมื่อส่งออก
      for (const item of doc.items) {
        await recordMovement(tx, {
          branchId: req.branchId,
          productId: item.productId,
          pluId: item.pluId,
          docType: 'TRANSFER_OUT',
          docNo,
          documentId: doc.id,
          qty: item.qty,
          ratio: 1,
          unitCost: item.unitPrice.toFixed(2),
          occurredAt: now,
          actorName,
        })
      }

      if (body.immediate) await receiveTransfer(tx, doc.id, doc.items.map((i) => ({ itemId: i.id, qty: i.qty })), actorName)
      return doc
    })
  })

  /** อนุมัติรับโอน (TI) — กรอกจำนวนรับจริง ส่วนที่ขาดสร้างเอกสารตีกลับ */
  app.post('/transfers/:id/approve', { preHandler: app.requirePermission('/inventory/transferIn', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      items: z.array(z.object({
        itemId: z.string().uuid(),
        receivedQty: z.union([z.string(), z.number()]),
      })).min(1),
    }).parse(req.body)

    const doc = await prisma.stockDocument.findFirst({
      where: { id, docType: 'TRANSFER_OUT', toBranchId: req.branchId },
      include: { items: true },
    })
    if (!doc) throw notFound('ไม่พบเอกสารโอนที่ส่งมายังสาขานี้')
    if (doc.status !== 'รออนุมัติ') throw conflict('เอกสารนี้ถูกดำเนินการไปแล้ว')

    const actorName = req.cashier?.name ?? req.account.email
    return prisma.$transaction((tx) =>
      receiveTransfer(tx, doc.id, body.items.map((i) => ({ itemId: i.itemId, qty: new Prisma.Decimal(String(i.receivedQty)) })), actorName),
    )
  })

  app.post('/transfers/:id/reject', { preHandler: app.requirePermission('/inventory/transferIn', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body)
    const doc = await prisma.stockDocument.findFirst({
      where: { id, docType: 'TRANSFER_OUT', toBranchId: req.branchId },
      include: { items: true },
    })
    if (!doc) throw notFound('ไม่พบเอกสารโอนที่ส่งมายังสาขานี้')

    const actorName = req.cashier?.name ?? req.account.email
    return prisma.$transaction(async (tx) => {
      // คืนสินค้าทั้งหมดกลับสาขาต้นทาง (เอกสารตีกลับ)
      const returnNo = await nextStockDocNo(tx, doc.branchId, 'productReturn')
      const returnDoc = await tx.stockDocument.create({
        data: {
          branchId: doc.branchId, docType: 'RETURN', docNo: returnNo, status: 'สำเร็จ',
          fromBranchId: doc.toBranchId, toBranchId: doc.branchId,
          refDocNo: doc.docNo, note: reason, createdBy: actorName,
          items: {
            create: doc.items.map((i, index) => ({
              productId: i.productId, pluId: i.pluId, barcode: i.barcode, name: i.name,
              unitName: i.unitName, ratio: i.ratio, qty: i.qty, unitPrice: i.unitPrice,
              lineTotal: i.lineTotal, orderIndex: index,
            })),
          },
        },
        include: { items: true },
      })
      for (const item of returnDoc.items) {
        await recordMovement(tx, {
          branchId: doc.branchId, productId: item.productId, pluId: item.pluId,
          docType: 'RETURN', docNo: returnNo, documentId: returnDoc.id,
          qty: item.qty, ratio: 1, unitCost: item.unitPrice.toFixed(2),
          occurredAt: new Date(), actorName, note: reason,
        })
      }
      await tx.stockDocument.update({
        where: { id: doc.id },
        data: { status: 'ยกเลิก', linkedDocId: returnDoc.id, note: reason },
      })
      return returnDoc
    })
  })
}

/** สร้างเอกสารรับโอน (TI) เพิ่มสต็อกปลายทาง และตีกลับส่วนที่รับไม่ครบ */
async function receiveTransfer(
  tx: Prisma.TransactionClient,
  transferOutId: string,
  received: { itemId: string; qty: Prisma.Decimal | string | number }[],
  actorName: string,
) {
  const doc = await tx.stockDocument.findUniqueOrThrow({
    where: { id: transferOutId },
    include: { items: true },
  })
  if (!doc.toBranchId) throw badRequest('เอกสารโอนไม่มีสาขาปลายทาง')

  const receivedById = new Map(received.map((r) => [r.itemId, new Prisma.Decimal(String(r.qty))]))
  const now = new Date()
  const inNo = await nextStockDocNo(tx, doc.toBranchId, 'transferIn')

  const inDoc = await tx.stockDocument.create({
    data: {
      branchId: doc.toBranchId, docType: 'TRANSFER_IN', docNo: inNo, status: 'สำเร็จ',
      fromBranchId: doc.branchId, toBranchId: doc.toBranchId,
      refDocNo: doc.docNo, receivedAt: now, createdBy: actorName, approvedBy: actorName,
      linkedDocId: doc.id,
      items: {
        create: doc.items.map((i, index) => ({
          productId: i.productId, pluId: i.pluId, barcode: i.barcode, name: i.name,
          unitName: i.unitName, ratio: i.ratio, qty: i.qty,
          receivedQty: receivedById.get(i.id) ?? i.qty,
          unitPrice: i.unitPrice, lineTotal: i.lineTotal, orderIndex: index,
        })),
      },
    },
    include: { items: true },
  })

  let shortfall = false
  for (const item of inDoc.items) {
    const qty = item.receivedQty ?? item.qty
    if (qty.greaterThan(0)) {
      await recordMovement(tx, {
        branchId: doc.toBranchId, productId: item.productId, pluId: null,
        docType: 'TRANSFER_IN', docNo: inNo, documentId: inDoc.id,
        qty, ratio: 1, unitCost: item.unitPrice.toFixed(2),
        occurredAt: now, actorName,
      })
    }
    if (qty.lessThan(item.qty)) shortfall = true
  }

  // ส่วนที่รับไม่ครบ → คืนกลับสาขาต้นทาง
  if (shortfall) {
    const returnNo = await nextStockDocNo(tx, doc.branchId, 'productReturn')
    const shortItems = inDoc.items
      .filter((i) => (i.receivedQty ?? i.qty).lessThan(i.qty))
      .map((i, index) => ({
        productId: i.productId, pluId: i.pluId, barcode: i.barcode, name: i.name,
        unitName: i.unitName, ratio: i.ratio,
        qty: i.qty.minus(i.receivedQty ?? i.qty),
        unitPrice: i.unitPrice,
        lineTotal: i.unitPrice.times(i.qty.minus(i.receivedQty ?? i.qty)),
        orderIndex: index,
      }))
    const returnDoc = await tx.stockDocument.create({
      data: {
        branchId: doc.branchId, docType: 'RETURN', docNo: returnNo, status: 'สำเร็จ',
        fromBranchId: doc.toBranchId, toBranchId: doc.branchId, refDocNo: doc.docNo,
        note: 'รับสินค้าไม่ครบตามเอกสารโอน', createdBy: actorName,
        items: { create: shortItems },
      },
      include: { items: true },
    })
    for (const item of returnDoc.items) {
      await recordMovement(tx, {
        branchId: doc.branchId, productId: item.productId, pluId: item.pluId,
        docType: 'RETURN', docNo: returnNo, documentId: returnDoc.id,
        qty: item.qty, ratio: 1, unitCost: item.unitPrice.toFixed(2),
        occurredAt: now, actorName, note: 'รับสินค้าไม่ครบ',
      })
    }
  }

  await tx.stockDocument.update({
    where: { id: doc.id },
    data: { status: 'สำเร็จ', linkedDocId: inDoc.id, receivedAt: now, approvedBy: actorName },
  })
  return inDoc
}

/** ผลรวมทิศทางของเอกสารปรับปรุง เพื่อเลือกเลขรัน ADJI / ADJD */
async function computeAdjustDirection(
  tx: Prisma.TransactionClient,
  items: z.infer<typeof docItemSchema>[],
): Promise<number> {
  const plus = await tx.productPlu.findMany({
    where: { productId: { in: items.map((i) => i.productId) }, isDefault: true },
    select: { productId: true, stockQty: true },
  })
  const stockByProduct = new Map(plus.map((p) => [p.productId, p.stockQty]))
  let total = 0
  for (const item of items) {
    if (item.countedQty === undefined) continue
    const current = stockByProduct.get(item.productId) ?? new Prisma.Decimal(0)
    total += new Prisma.Decimal(String(item.countedQty)).minus(current).toNumber()
  }
  return total
}

function sortStock(sort: string | undefined, order: 'asc' | 'desc'): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'code': return [{ barcode: order }]
    case 'category': return [{ category: { name: order } }, { name: 'asc' }]
    case 'qty': return [{ name: order }]
    default: return [{ name: order }]
  }
}

export default routes
