import type { FastifyPluginAsync } from 'fastify'
import { Prisma, prisma } from '@medee/db'
import { PRICE_CHANNELS, stepUnitPrice } from '@medee/domain'
import { z } from 'zod'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { listQuerySchema, paged, skipTake } from '../lib/pagination.js'
import { sendExport } from '../lib/export.js'

const productSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อสินค้า'),
  price: z.union([z.string(), z.number()]),
  stdCost: z.union([z.string(), z.number()]).optional(),
  barcode: z.string().trim().min(1).nullable().optional(),
  skuCode: z.string().nullable().optional(),
  skuType: z.enum(['P', 'BOM', 'SN', 'SV']).default('P'),
  vatType: z.enum(['V', 'N']).default('N'),
  categoryId: z.string().uuid({ message: 'กรุณาเลือกกลุ่มสินค้า' }),
  unitId: z.string().uuid({ message: 'กรุณาเลือกหน่วยบรรจุ' }),
  description: z.string().max(5000).nullable().optional(),
  favorite: z.boolean().optional(),
  isOnScreen: z.boolean().optional(),
  serviceCharge: z.boolean().optional(),
  negotiatePrice: z.boolean().optional(),
  isSoldByWeight: z.boolean().optional(),
  color: z.string().optional(),
  imagePath: z.string().nullable().optional(),
  lowStockThreshold: z.union([z.string(), z.number()]).nullable().optional(),
  enabled: z.boolean().optional(),
  translations: z.record(z.unknown()).nullable().optional(),
})

/** เรียงตาม: ชื่อสินค้า | ล่าสุด | กลุ่มสินค้า | ราคาสินค้า (หัวข้อ 6.9.1) */
function orderByOf(sort: string | undefined, order: 'asc' | 'desc'): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'latest': return [{ updatedAt: order === 'asc' ? 'asc' : 'desc' }]
    case 'category': return [{ category: { name: order } }, { name: 'asc' }]
    case 'price': return [{ price: order }]
    case 'name':
    default: return [{ name: order }]
  }
}

/** ค้นหาตาม: สินค้าทั้งหมด | ชื่อสินค้า | รหัสสินค้า | กลุ่มสินค้า | ประเภทสินค้า */
function searchWhere(searchBy: string | undefined, search: string | undefined): Prisma.ProductWhereInput {
  if (!search) return {}
  const q = search.trim()
  switch (searchBy) {
    case 'name': return { name: { contains: q, mode: 'insensitive' } }
    case 'code': return { OR: [{ barcode: { contains: q } }, { skuCode: { contains: q, mode: 'insensitive' } }, { plus: { some: { pluCode: { contains: q } } } }] }
    case 'category': return { category: { name: { contains: q, mode: 'insensitive' } } }
    case 'type': return { skuType: q.toUpperCase() }
    default:
      return {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q } },
          { skuCode: { contains: q, mode: 'insensitive' } },
          { keyword: { contains: q.toLowerCase() } },
          { plus: { some: { pluCode: { contains: q } } } },
        ],
      }
  }
}

const routes: FastifyPluginAsync = async (app) => {
  /** รายการสินค้า (list / grid) */
  app.get('/products', { preHandler: app.requirePermission('/product') }, async (req, reply) => {
    const query = listQuerySchema.parse(req.query)
    const extra = z.object({ categoryId: z.string().uuid().optional(), favorite: z.coerce.boolean().optional() })
      .parse(req.query)

    const where: Prisma.ProductWhereInput = {
      branchId: req.branchId,
      deletedAt: null,
      ...searchWhere(query.searchBy, query.search),
      ...(extra.categoryId ? { categoryId: extra.categoryId } : {}),
      ...(extra.favorite ? { favorite: true } : {}),
    }

    if (query.export) {
      const rows = await prisma.product.findMany({
        where, orderBy: orderByOf(query.sort, query.order),
        include: { category: true, unit: true, plus: true },
      })
      return sendExport(reply, query.export, 'รายการสินค้า', [
        { key: 'skuCode', header: 'SKUCode' },
        { key: 'barcode', header: 'รหัสบาร์โค้ด' },
        { key: 'category', header: 'กลุ่มสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'price', header: 'ราคาขาย' },
        { key: 'cost', header: 'ต้นทุน' },
        { key: 'unit', header: 'หน่วยบรรจุ' },
        { key: 'ratio', header: 'Ratio' },
        { key: 'vat', header: 'VAT' },
        { key: 'type', header: 'Type' },
        { key: 'stock', header: 'คงเหลือ' },
      ], rows.flatMap((p) =>
        (p.plus.length ? p.plus : [null]).map((plu) => ({
          skuCode: p.skuCode ?? '',
          barcode: plu?.pluCode ?? p.barcode ?? '',
          category: p.category?.name ?? '',
          name: plu?.name ?? p.name,
          price: (plu?.price ?? p.price).toFixed(2),
          cost: (plu?.cost ?? p.stdCost).toFixed(2),
          unit: p.unit?.name ?? '',
          ratio: (plu?.skuRatio ?? 1).toString(),
          vat: p.vatType,
          type: p.skuType,
          stock: plu?.isDefault ? plu.stockQty.toString() : '',
        })),
      ))
    }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where, orderBy: orderByOf(query.sort, query.order), ...skipTake(query),
        include: {
          category: { select: { id: true, name: true, bgColor: true } },
          unit: { select: { id: true, name: true } },
          plus: { where: { isDefault: true }, select: { stockQty: true, pluCode: true } },
          _count: { select: { plus: true, stepPrices: true } },
        },
      }),
      prisma.product.count({ where }),
    ])

    return paged(
      rows.map((p) => ({
        ...p,
        stockQty: p.plus[0]?.stockQty ?? new Prisma.Decimal(0),
        pluCount: p._count.plus,
        hasStepPrice: p._count.stepPrices > 0,
      })),
      total,
      query,
    )
  })

  /** สินค้า-นิยม สำหรับแท็บแรกของหน้าขาย */
  app.get('/products/favorites', { preHandler: app.withBranch }, async (req) =>
    prisma.product.findMany({
      where: { branchId: req.branchId, deletedAt: null, favorite: true, isOnScreen: true, enabled: true },
      orderBy: { favoriteIndex: 'asc' },
      include: { plus: true, category: { select: { name: true, bgColor: true } } },
    }),
  )

  app.get('/products/:id', { preHandler: app.requirePermission('/product') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const product = await prisma.product.findFirst({
      where: { id, branchId: req.branchId, deletedAt: null },
      include: {
        category: true, unit: true,
        plus: { where: { deletedAt: null }, include: { unit: true }, orderBy: { isDefault: 'desc' } },
        stepPrices: { orderBy: { minQty: 'asc' } },
        channelPrices: true,
        bomItems: { include: { component: { select: { id: true, name: true, stdCost: true } } } },
        serials: true,
        optionGroups: { include: { optionGroup: { include: { items: { include: { option: true } } } } } },
      },
    })
    if (!product) throw notFound('ไม่พบสินค้านี้')
    return product
  })

  app.post('/products', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const body = productSchema.parse(req.body)
    await assertBarcodeFree(req.branchId, body.barcode ?? null, null)

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          branchId: req.branchId,
          ...body,
          price: String(body.price),
          stdCost: String(body.stdCost ?? 0),
          avgCost: String(body.stdCost ?? 0),
          lowStockThreshold: body.lowStockThreshold === null || body.lowStockThreshold === undefined
            ? null : String(body.lowStockThreshold),
          keyword: `${body.name} ${body.barcode ?? ''}`.trim().toLowerCase(),
          source: req.tokenKind === 'device' ? 'pos' : 'web',
          translations: (body.translations ?? undefined) as object | undefined,
          createdBy: req.cashier?.name ?? req.account.email,
        },
      })
      // ทุก SKU ต้องมี PLU หลัก ratio = 1 ที่ถือยอดคงเหลือ
      await tx.productPlu.create({
        data: {
          productId: product.id,
          pluCode: body.barcode ?? product.id.slice(0, 12),
          name: body.name,
          unitId: body.unitId,
          skuRatio: '1',
          price: String(body.price),
          cost: String(body.stdCost ?? 0),
          isDefault: true,
        },
      })
      await tx.productChannelPrice.create({
        data: { productId: product.id, channel: 'retail', enabled: true, price: String(body.price) },
      })
      return product
    })

    app.broadcast(req.branchId, 'product.updated', { id: created.id, action: 'created' })
    return created
  })

  app.put('/products/:id', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = productSchema.partial().parse(req.body)
    const existing = await prisma.product.findFirst({ where: { id, branchId: req.branchId, deletedAt: null } })
    if (!existing) throw notFound('ไม่พบสินค้านี้')
    if (body.barcode !== undefined) await assertBarcodeFree(req.branchId, body.barcode, id)

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...body,
        price: body.price === undefined ? undefined : String(body.price),
        stdCost: body.stdCost === undefined ? undefined : String(body.stdCost),
        lowStockThreshold: body.lowStockThreshold === undefined
          ? undefined
          : body.lowStockThreshold === null ? null : String(body.lowStockThreshold),
        keyword: body.name ? `${body.name} ${body.barcode ?? existing.barcode ?? ''}`.trim().toLowerCase() : undefined,
        translations: (body.translations ?? undefined) as object | undefined,
        updatedBy: req.cashier?.name ?? req.account.email,
      },
    })

    // ราคาของ PLU หลักต้องตามราคา SKU
    if (body.price !== undefined || body.barcode !== undefined) {
      await prisma.productPlu.updateMany({
        where: { productId: id, isDefault: true },
        data: {
          price: body.price === undefined ? undefined : String(body.price),
          pluCode: body.barcode ?? undefined,
          name: body.name ?? undefined,
        },
      })
      await prisma.productChannelPrice.updateMany({
        where: { productId: id, channel: 'retail' },
        data: { price: body.price === undefined ? undefined : String(body.price) },
      })
    }

    // หลังบันทึก push ให้ทุกเครื่อง POS ซิงค์เอง (ต้นฉบับต้องกด Sync)
    app.broadcast(req.branchId, 'product.updated', { id, action: 'updated' })
    return updated
  })

  app.delete('/products/:id', { preHandler: app.requirePermission('/product', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const existing = await prisma.product.findFirst({ where: { id, branchId: req.branchId, deletedAt: null } })
    if (!existing) throw notFound('ไม่พบสินค้านี้')
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } })
    app.broadcast(req.branchId, 'product.updated', { id, action: 'deleted' })
    return { ok: true }
  })

  /** เพิ่มสินค้าแบบเร็ว — สูงสุด 10 แถวต่อครั้ง (หัวข้อ 6.9.1) */
  app.post('/products/quick-add', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const body = z.object({
      rows: z.array(z.object({
        name: z.string().min(1),
        price: z.union([z.string(), z.number()]),
        cost: z.union([z.string(), z.number()]).optional(),
        barcode: z.string().trim().min(1).optional(),
        categoryId: z.string().uuid(),
        unitId: z.string().uuid(),
        vatType: z.enum(['V', 'N']).default('N'),
      })).min(1).max(10, 'เพิ่มสินค้าแบบเร็วได้สูงสุด 10 รายการต่อครั้ง'),
    }).parse(req.body)

    const created = []
    for (const row of body.rows) {
      await assertBarcodeFree(req.branchId, row.barcode ?? null, null)
      const product: { id: string } = await prisma.product.create({
        data: {
          branchId: req.branchId,
          name: row.name,
          price: String(row.price),
          stdCost: String(row.cost ?? 0),
          avgCost: String(row.cost ?? 0),
          barcode: row.barcode ?? null,
          categoryId: row.categoryId,
          unitId: row.unitId,
          vatType: row.vatType,
          source: 'quick add',
          keyword: `${row.name} ${row.barcode ?? ''}`.trim().toLowerCase(),
          plus: {
            create: {
              pluCode: row.barcode ?? `QA${Date.now()}${created.length}`,
              name: row.name,
              unitId: row.unitId,
              skuRatio: '1',
              price: String(row.price),
              cost: String(row.cost ?? 0),
              isDefault: true,
            },
          },
          channelPrices: { create: { channel: 'retail', enabled: true, price: String(row.price) } },
        },
      })
      created.push(product)
    }
    app.broadcast(req.branchId, 'product.updated', { action: 'quick-add', count: created.length })
    return { created: created.length, products: created }
  })

  /** แก้ไขสินค้าแบบเร็ว — แก้ชื่อ/ราคา/ต้นทุนหลายรายการแล้วบันทึกครั้งเดียว */
  app.put('/products/quick-edit', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const body = z.object({
      rows: z.array(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        price: z.union([z.string(), z.number()]).optional(),
        stdCost: z.union([z.string(), z.number()]).optional(),
      })).min(1),
    }).parse(req.body)

    await prisma.$transaction(
      body.rows.map((row) =>
        prisma.product.updateMany({
          where: { id: row.id, branchId: req.branchId, deletedAt: null },
          data: {
            name: row.name,
            price: row.price === undefined ? undefined : String(row.price),
            stdCost: row.stdCost === undefined ? undefined : String(row.stdCost),
          },
        }),
      ),
    )
    for (const row of body.rows) {
      if (row.price === undefined && row.name === undefined) continue
      await prisma.productPlu.updateMany({
        where: { productId: row.id, isDefault: true },
        data: {
          price: row.price === undefined ? undefined : String(row.price),
          name: row.name,
        },
      })
    }
    app.broadcast(req.branchId, 'product.updated', { action: 'quick-edit', count: body.rows.length })
    return { updated: body.rows.length }
  })

  // ───────── ขนาดบรรจุอื่น ๆ (PLU) ─────────
  app.post('/products/:id/plus', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      pluCode: z.string().trim().min(1, 'กรุณากรอกรหัสสินค้า (บาร์โค้ด)'),
      name: z.string().min(1),
      unitId: z.string().uuid(),
      skuRatio: z.union([z.string(), z.number()]).default(1),
      price: z.union([z.string(), z.number()]),
      cost: z.union([z.string(), z.number()]).optional(),
      useStepPrice: z.boolean().default(false),
      imagePath: z.string().nullable().optional(),
    }).parse(req.body)

    await assertProductInBranch(id, req.branchId)
    await assertBarcodeFree(req.branchId, body.pluCode, id)
    if (Number(body.skuRatio) <= 0) throw badRequest('อัตราการตัดสต็อกต้องมากกว่า 0')

    const created = await prisma.productPlu.create({
      data: {
        productId: id, ...body,
        skuRatio: String(body.skuRatio),
        price: String(body.price),
        cost: String(body.cost ?? 0),
        isDefault: false,
      },
    })
    app.broadcast(req.branchId, 'product.updated', { id, action: 'plu.created' })
    return created
  })

  app.put('/products/:id/plus/:pluId', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id, pluId } = z.object({ id: z.string().uuid(), pluId: z.string().uuid() }).parse(req.params)
    const body = z.object({
      pluCode: z.string().trim().min(1).optional(),
      name: z.string().min(1).optional(),
      unitId: z.string().uuid().optional(),
      skuRatio: z.union([z.string(), z.number()]).optional(),
      price: z.union([z.string(), z.number()]).optional(),
      cost: z.union([z.string(), z.number()]).optional(),
      useStepPrice: z.boolean().optional(),
    }).parse(req.body)
    await assertProductInBranch(id, req.branchId)
    if (body.pluCode) await assertBarcodeFree(req.branchId, body.pluCode, id)
    return prisma.productPlu.update({
      where: { id: pluId },
      data: {
        ...body,
        skuRatio: body.skuRatio === undefined ? undefined : String(body.skuRatio),
        price: body.price === undefined ? undefined : String(body.price),
        cost: body.cost === undefined ? undefined : String(body.cost),
      },
    })
  })

  app.delete('/products/:id/plus/:pluId', { preHandler: app.requirePermission('/product', 'remove') }, async (req) => {
    const { id, pluId } = z.object({ id: z.string().uuid(), pluId: z.string().uuid() }).parse(req.params)
    await assertProductInBranch(id, req.branchId)
    const plu = await prisma.productPlu.findFirst({ where: { id: pluId, productId: id } })
    if (!plu) throw notFound('ไม่พบขนาดบรรจุนี้')
    if (plu.isDefault) throw badRequest('ไม่สามารถลบขนาดบรรจุหลักของสินค้าได้')
    await prisma.productPlu.update({ where: { id: pluId }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  // ───────── ราคาขายเพิ่มเติม (step price) ─────────
  app.put('/products/:id/step-prices', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      steps: z.array(z.object({
        minQty: z.union([z.string(), z.number()]),
        price: z.union([z.string(), z.number()]),
        pluId: z.string().uuid().nullable().optional(),
      })),
    }).parse(req.body)
    const product = await assertProductInBranch(id, req.branchId)

    await prisma.$transaction(async (tx) => {
      await tx.productStepPrice.deleteMany({ where: { productId: id } })
      for (const s of body.steps) {
        if (Number(s.minQty) <= 0) throw badRequest('จำนวนขั้นต้องมากกว่า 0')
        await tx.productStepPrice.create({
          data: {
            productId: id,
            pluId: s.pluId ?? null,
            minQty: String(s.minQty),
            price: String(s.price),
            unitPrice: stepUnitPrice(String(s.price), String(s.minQty)),
            cost: new Prisma.Decimal(product.stdCost).times(Number(s.minQty)).toFixed(2),
          },
        })
      }
    })
    app.broadcast(req.branchId, 'product.updated', { id, action: 'step-prices' })
    return prisma.productStepPrice.findMany({ where: { productId: id }, orderBy: { minQty: 'asc' } })
  })

  // ───────── ราคาตามช่องทางการขาย ─────────
  app.put('/products/:id/channel-prices', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      channels: z.array(z.object({
        channel: z.enum(PRICE_CHANNELS as [string, ...string[]]),
        enabled: z.boolean(),
        price: z.union([z.string(), z.number()]),
      })),
    }).parse(req.body)
    const product = await assertProductInBranch(id, req.branchId)

    for (const c of body.channels) {
      const diff = new Prisma.Decimal(String(c.price)).minus(product.price).toFixed(2)
      await prisma.productChannelPrice.upsert({
        where: { productId_channel: { productId: id, channel: c.channel } },
        create: { productId: id, channel: c.channel, enabled: c.enabled, price: String(c.price), diff },
        update: { enabled: c.enabled, price: String(c.price), diff },
      })
    }
    app.broadcast(req.branchId, 'product.updated', { id, action: 'channel-prices' })
    return prisma.productChannelPrice.findMany({ where: { productId: id } })
  })

  // ───────── กลุ่มตัวเลือกที่ผูกกับสินค้า ─────────
  app.put('/products/:id/option-groups', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ optionGroupIds: z.array(z.string().uuid()) }).parse(req.body)
    await assertProductInBranch(id, req.branchId)
    await prisma.$transaction([
      prisma.productOptionGroup.deleteMany({ where: { productId: id } }),
      prisma.productOptionGroup.createMany({
        data: body.optionGroupIds.map((optionGroupId, i) => ({ productId: id, optionGroupId, orderIndex: i })),
      }),
    ])
    app.broadcast(req.branchId, 'product.updated', { id, action: 'option-groups' })
    return { ok: true }
  })

  // ───────── ส่วนประกอบของสินค้าประกอบ (BOM) ─────────
  app.put('/products/:id/bom', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      components: z.array(z.object({
        componentProductId: z.string().uuid(),
        qtyPerUnit: z.union([z.string(), z.number()]),
      })),
    }).parse(req.body)
    await assertProductInBranch(id, req.branchId)
    if (body.components.some((c) => c.componentProductId === id)) {
      throw badRequest('สินค้าประกอบมีตัวเองเป็นส่วนประกอบไม่ได้')
    }

    await prisma.$transaction(async (tx) => {
      await tx.productBomItem.deleteMany({ where: { productId: id } })
      for (const c of body.components) {
        await tx.productBomItem.create({
          data: { productId: id, componentProductId: c.componentProductId, qtyPerUnit: String(c.qtyPerUnit) },
        })
      }
      // ต้นทุนของสินค้าประกอบ = ผลรวมต้นทุนส่วนประกอบ
      const components = await tx.product.findMany({
        where: { id: { in: body.components.map((c) => c.componentProductId) } },
        select: { id: true, stdCost: true },
      })
      const costMap = new Map(components.map((c) => [c.id, c.stdCost]))
      const total = body.components.reduce(
        (a, c) => a.plus(new Prisma.Decimal(costMap.get(c.componentProductId) ?? 0).times(String(c.qtyPerUnit))),
        new Prisma.Decimal(0),
      )
      await tx.product.update({
        where: { id },
        data: { stdCost: total.toFixed(2), skuType: 'BOM' },
      })
    })
    return prisma.productBomItem.findMany({ where: { productId: id }, include: { component: true } })
  })

  // ───────── หมายเลขผลิตภัณฑ์ (Serial) ─────────
  app.post('/products/:id/serials', { preHandler: app.requirePermission('/product', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ serials: z.array(z.string().min(1)).min(1) }).parse(req.body)
    await assertProductInBranch(id, req.branchId)
    await prisma.productSerial.createMany({
      data: body.serials.map((serialNo) => ({ productId: id, serialNo })),
      skipDuplicates: true,
    })
    return prisma.productSerial.findMany({ where: { productId: id } })
  })

  // ───────── จัดการเมนูขายหน้าร้าน (/product/managemenuranking) ─────────
  app.put('/products/ranking', { preHandler: app.requirePermission('/product/managemenuranking', 'edit') }, async (req) => {
    const body = z.object({
      /** favorite = แท็บ "สินค้า-นิยม" · หรือส่ง categoryId เพื่อเรียงในกลุ่ม */
      scope: z.enum(['favorite', 'category']),
      categoryId: z.string().uuid().optional(),
      productIds: z.array(z.string().uuid()),
    }).parse(req.body)

    await prisma.$transaction(
      body.productIds.map((id, index) =>
        prisma.product.updateMany({
          where: { id, branchId: req.branchId },
          data: body.scope === 'favorite'
            ? { favorite: true, favoriteIndex: index }
            : { itemSequence: index },
        }),
      ),
    )
    app.broadcast(req.branchId, 'product.updated', { action: 'ranking' })
    return { ok: true }
  })

  /** นำเข้ารายการสินค้าจาก CSV — dry-run ก่อนแล้วค่อยบันทึก (หัวข้อ 6.9.9) */
  app.post('/products/import', { preHandler: app.requirePermission('/product/importProduct', 'edit') }, async (req) => {
    const body = z.object({
      commit: z.boolean().default(false),
      rows: z.array(z.record(z.string())).min(1),
    }).parse(req.body)

    const [categories, units] = await Promise.all([
      prisma.category.findMany({ where: { branchId: req.branchId, deletedAt: null } }),
      prisma.unit.findMany({ where: { branchId: req.branchId, deletedAt: null } }),
    ])
    const categoryByName = new Map(categories.map((c) => [c.name.trim(), c]))
    const unitByName = new Map(units.map((u) => [u.name.trim(), u]))
    const existingBarcodes = new Set(
      (await prisma.productPlu.findMany({
        where: { product: { branchId: req.branchId, deletedAt: null } },
        select: { pluCode: true },
      })).map((p) => p.pluCode),
    )

    const ok: Record<string, string>[] = []
    const failed: { row: number; reasons: string[] }[] = []
    const seen = new Set<string>()

    body.rows.forEach((row, index) => {
      const reasons: string[] = []
      const barcode = (row.Barcode ?? '').trim()
      const name = (row['Product Name'] ?? '').trim()
      const category = (row.Category ?? '').trim()
      const unit = (row.Unit ?? '').trim()
      const price = (row.Price ?? '').trim()

      if (!barcode) reasons.push('ไม่ได้กรอก Barcode')
      if (!name) reasons.push('ไม่ได้กรอก Product Name')
      if (!category) reasons.push('ไม่ได้กรอก Category')
      if (!unit) reasons.push('ไม่ได้กรอก Unit')
      if (!price || Number.isNaN(Number(price))) reasons.push('Price ต้องเป็นตัวเลข')
      if (row.Cost && Number.isNaN(Number(row.Cost))) reasons.push('Cost ต้องเป็นตัวเลข')
      if (row.Ratio && Number.isNaN(Number(row.Ratio))) reasons.push('Ratio ต้องเป็นตัวเลข')
      if (category && !categoryByName.has(category)) reasons.push(`ไม่พบกลุ่มสินค้า "${category}"`)
      if (unit && !unitByName.has(unit)) reasons.push(`ไม่พบหน่วยบรรจุ "${unit}"`)
      if (barcode && seen.has(barcode)) reasons.push('Barcode ซ้ำกันในไฟล์')
      if (barcode && existingBarcodes.has(barcode)) reasons.push('Barcode นี้มีอยู่แล้วในระบบ')
      if (barcode) seen.add(barcode)

      if (reasons.length) failed.push({ row: index + 1, reasons })
      else ok.push(row)
    })

    if (!body.commit) {
      return { dryRun: true, passed: ok.length, failed: failed.length, errors: failed }
    }

    let created = 0
    for (const row of ok) {
      const category = categoryByName.get((row.Category ?? '').trim())!
      const unit = unitByName.get((row.Unit ?? '').trim())!
      const barcode = (row.Barcode ?? '').trim()
      const ratio = Number(row.Ratio ?? 1) || 1

      // สินค้าเดียวกันต่างขนาด ใช้ SKUCode เดียวกัน → สร้างเป็น PLU ของ SKU เดิม
      const skuCode = (row.SKUCode ?? '').trim() || null
      const parent = skuCode
        ? await prisma.product.findFirst({ where: { branchId: req.branchId, skuCode, deletedAt: null } })
        : null

      if (parent) {
        await prisma.productPlu.create({
          data: {
            productId: parent.id, pluCode: barcode, name: (row['Product Name'] ?? '').trim(),
            unitId: unit.id, skuRatio: String(ratio),
            price: String(Number(row.Price)), cost: String(Number(row.Cost ?? 0)),
            isDefault: false,
          },
        })
      } else {
        await prisma.product.create({
          data: {
            branchId: req.branchId,
            skuCode,
            name: (row['Product Name'] ?? '').trim(),
            price: String(Number(row.Price)),
            stdCost: String(Number(row.Cost ?? 0)),
            avgCost: String(Number(row.Cost ?? 0)),
            barcode,
            categoryId: category.id,
            unitId: unit.id,
            vatType: (row.VAT ?? 'N').trim().toUpperCase() === 'V' ? 'V' : 'N',
            skuType: ['P', 'BOM', 'SN', 'SV'].includes((row.Type ?? 'P').trim().toUpperCase())
              ? (row.Type ?? 'P').trim().toUpperCase() : 'P',
            description: row.Description ?? null,
            source: 'web import',
            keyword: `${(row['Product Name'] ?? '').trim()} ${barcode}`.toLowerCase(),
            plus: {
              create: {
                pluCode: barcode, name: (row['Product Name'] ?? '').trim(), unitId: unit.id,
                skuRatio: String(ratio), price: String(Number(row.Price)),
                cost: String(Number(row.Cost ?? 0)), isDefault: true,
              },
            },
            channelPrices: { create: { channel: 'retail', enabled: true, price: String(Number(row.Price)) } },
          },
        })
      }
      created += 1
    }

    app.broadcast(req.branchId, 'product.updated', { action: 'import', count: created })
    return { dryRun: false, created, failed: failed.length, errors: failed }
  })
}

async function assertProductInBranch(id: string, branchId: string) {
  const product = await prisma.product.findFirst({ where: { id, branchId, deletedAt: null } })
  if (!product) throw notFound('ไม่พบสินค้านี้')
  return product
}

/** บาร์โค้ดห้ามซ้ำทุกกรณีภายในสาขา (หัวข้อ 6.9.9) */
async function assertBarcodeFree(branchId: string, barcode: string | null, exceptProductId: string | null) {
  if (!barcode) return
  const hit = await prisma.productPlu.findFirst({
    where: {
      pluCode: barcode,
      deletedAt: null,
      product: { branchId, deletedAt: null, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) },
    },
    include: { product: { select: { name: true } } },
  })
  if (hit) throw conflict(`รหัสสินค้า ${barcode} ถูกใช้กับ "${hit.product.name}" แล้ว`)
}

export default routes
