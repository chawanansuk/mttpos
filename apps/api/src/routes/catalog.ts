import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '@medee/db'
import { z } from 'zod'
import { badRequest, notFound } from '../lib/errors.js'

const routes: FastifyPluginAsync = async (app) => {
  // ───────── กลุ่มสินค้า (/product/category) ─────────
  app.get('/categories', { preHandler: app.withBranch }, async (req) => {
    return prisma.category.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    })
  })

  app.post('/categories', { preHandler: app.requirePermission('/product/category', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1, 'กรุณากรอกชื่อกลุ่มสินค้า'),
      bgColor: z.string().default('#BDBDBD'),
      icon: z.string().nullable().optional(),
      enabled: z.boolean().default(true),
      kitchenPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
      showOnCustomerMenu: z.boolean().default(true),
    }).parse(req.body)
    const count = await prisma.category.count({ where: { branchId: req.branchId } })
    const created = await prisma.category.create({
      data: { branchId: req.branchId, orderIndex: count, ...body },
    })
    app.broadcast(req.branchId, 'product.updated', { type: 'category.created', id: created.id })
    return created
  })

  app.put('/categories/:id', { preHandler: app.requirePermission('/product/category', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      name: z.string().min(1).optional(),
      bgColor: z.string().optional(),
      icon: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
      kitchenPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      showOnCustomerMenu: z.boolean().optional(),
      orderIndex: z.number().int().optional(),
    }).parse(req.body)
    await assertIn(
      () => prisma.category.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบกลุ่มสินค้านี้',
    )
    const updated = await prisma.category.update({ where: { id }, data: body })
    app.broadcast(req.branchId, 'product.updated', { type: 'category.updated', id })
    return updated
  })

  /** ลบกลุ่มสินค้า — สินค้าในกลุ่มถูกย้ายไป Uncategory (หัวข้อ 6.9.3) */
  app.delete('/categories/:id', { preHandler: app.requirePermission('/product/category', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const category = await prisma.category.findFirst({ where: { id, branchId: req.branchId } })
    if (!category) throw notFound('ไม่พบกลุ่มสินค้านี้')
    if (category.isSystem) throw badRequest('ไม่สามารถลบกลุ่มสินค้าของระบบได้')

    const fallback = await prisma.category.findFirst({
      where: { branchId: req.branchId, isSystem: true },
    })
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { categoryId: id },
        data: { categoryId: fallback?.id ?? null },
      }),
      prisma.category.update({ where: { id }, data: { deletedAt: new Date() } }),
    ])
    return { ok: true, movedTo: fallback?.name ?? null }
  })

  // ───────── หน่วยบรรจุ (/product/unit) ─────────
  app.get('/units', { preHandler: app.withBranch }, async (req) =>
    prisma.unit.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  )

  app.post('/units', { preHandler: app.requirePermission('/product/unit', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1, 'กรุณากรอกชื่อหน่วยบรรจุ'),
      enabled: z.boolean().default(true),
    }).parse(req.body)
    return prisma.unit.create({ data: { branchId: req.branchId, ...body } })
  })

  app.put('/units/:id', { preHandler: app.requirePermission('/product/unit', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      name: z.string().min(1).optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body)
    await assertIn(
      () => prisma.unit.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบหน่วยบรรจุนี้',
    )
    return prisma.unit.update({ where: { id }, data: body })
  })

  app.delete('/units/:id', { preHandler: app.requirePermission('/product/unit', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertIn(
      () => prisma.unit.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบหน่วยบรรจุนี้',
    )
    const used = await prisma.product.count({ where: { unitId: id, deletedAt: null } })
    if (used > 0) throw badRequest(`มีสินค้า ${used} รายการใช้หน่วยบรรจุนี้อยู่ ไม่สามารถลบได้`)
    await prisma.unit.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  // ───────── ตัวเลือกเสริม (/product/option) ─────────
  app.get('/options', { preHandler: app.withBranch }, async (req) =>
    prisma.productOption.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
    }),
  )

  app.post('/options', { preHandler: app.requirePermission('/product/option', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1, 'กรุณากรอกชื่อตัวเลือก'),
      price: z.union([z.string(), z.number()]).default('0'),
      cost: z.union([z.string(), z.number()]).default('0'),
      enabled: z.boolean().default(true),
      qrOrderEnabled: z.boolean().default(false),
    }).parse(req.body)
    const count = await prisma.productOption.count({ where: { branchId: req.branchId } })
    return prisma.productOption.create({
      data: {
        branchId: req.branchId, orderIndex: count, ...body,
        price: String(body.price), cost: String(body.cost),
      },
    })
  })

  app.put('/options/:id', { preHandler: app.requirePermission('/product/option', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      name: z.string().min(1).optional(),
      price: z.union([z.string(), z.number()]).optional(),
      cost: z.union([z.string(), z.number()]).optional(),
      enabled: z.boolean().optional(),
      qrOrderEnabled: z.boolean().optional(),
    }).parse(req.body)
    await assertIn(
      () => prisma.productOption.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบตัวเลือกนี้',
    )
    return prisma.productOption.update({
      where: { id },
      data: {
        ...body,
        price: body.price === undefined ? undefined : String(body.price),
        cost: body.cost === undefined ? undefined : String(body.cost),
      },
    })
  })

  app.delete('/options/:id', { preHandler: app.requirePermission('/product/option', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertIn(
      () => prisma.productOption.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบตัวเลือกนี้',
    )
    await prisma.productOption.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  // ───────── กลุ่มตัวเลือก (/product/optiongroup) ─────────
  app.get('/option-groups', { preHandler: app.withBranch }, async (req) =>
    prisma.optionGroup.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { orderIndex: 'asc' },
      include: { items: { include: { option: true }, orderBy: { orderIndex: 'asc' } } },
    }),
  )

  app.post('/option-groups', { preHandler: app.requirePermission('/product/optiongroup', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1, 'กรุณากรอกชื่อกลุ่มตัวเลือก'),
      required: z.boolean().default(false),
      minSelect: z.number().int().min(0).default(0),
      maxSelect: z.number().int().min(1).default(1),
      optionIds: z.array(z.string().uuid()).default([]),
    }).parse(req.body)
    if (body.required && body.minSelect < 1) {
      throw badRequest('กลุ่มตัวเลือกที่บังคับเลือก ต้องกำหนด "อย่างน้อย" ตั้งแต่ 1 ขึ้นไป')
    }
    if (body.maxSelect < body.minSelect) {
      throw badRequest('"จำนวนสูงสุด" ต้องไม่น้อยกว่า "อย่างน้อย"')
    }
    const count = await prisma.optionGroup.count({ where: { branchId: req.branchId } })
    return prisma.optionGroup.create({
      data: {
        branchId: req.branchId, orderIndex: count,
        name: body.name, required: body.required,
        minSelect: body.minSelect, maxSelect: body.maxSelect,
        items: { create: body.optionIds.map((optionId, i) => ({ optionId, orderIndex: i })) },
      },
      include: { items: { include: { option: true } } },
    })
  })

  app.put('/option-groups/:id', { preHandler: app.requirePermission('/product/optiongroup', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      name: z.string().min(1).optional(),
      required: z.boolean().optional(),
      minSelect: z.number().int().min(0).optional(),
      maxSelect: z.number().int().min(1).optional(),
      optionIds: z.array(z.string().uuid()).optional(),
    }).parse(req.body)
    await assertIn(
      () => prisma.optionGroup.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบกลุ่มตัวเลือกนี้',
    )
    if (body.optionIds) {
      await prisma.optionGroupItem.deleteMany({ where: { optionGroupId: id } })
      await prisma.optionGroupItem.createMany({
        data: body.optionIds.map((optionId, i) => ({ optionGroupId: id, optionId, orderIndex: i })),
      })
    }
    const { optionIds: _omit, ...rest } = body
    void _omit
    return prisma.optionGroup.update({
      where: { id }, data: rest,
      include: { items: { include: { option: true } } },
    })
  })

  app.delete('/option-groups/:id', { preHandler: app.requirePermission('/product/optiongroup', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertIn(
      () => prisma.optionGroup.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบกลุ่มตัวเลือกนี้',
    )
    await prisma.optionGroup.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  // ───────── ช่องทางการขาย (/product/saleschannels) ─────────
  app.get('/sales-channels', { preHandler: app.withBranch }, async (req) =>
    prisma.salesChannelConfig.findMany({
      where: { branchId: req.branchId },
      orderBy: { orderIndex: 'asc' },
    }),
  )

  app.put('/sales-channels', { preHandler: app.requirePermission('/product/saleschannels', 'edit') }, async (req) => {
    const body = z.object({
      channels: z.array(z.object({
        channel: z.string(),
        enabled: z.boolean(),
        gpPercent: z.union([z.string(), z.number()]),
      })),
    }).parse(req.body)
    for (const c of body.channels) {
      await prisma.salesChannelConfig.updateMany({
        where: { branchId: req.branchId, channel: c.channel },
        data: { enabled: c.enabled, gpPercent: String(c.gpPercent) },
      })
    }
    return { ok: true }
  })

  // ───────── ช่วงเวลาการขาย (/product/mangesaleshours) ─────────
  app.get('/sales-hours', { preHandler: app.withBranch }, async (req) =>
    prisma.salesHour.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      include: { slots: true },
      orderBy: { name: 'asc' },
    }),
  )

  app.post('/sales-hours', { preHandler: app.requirePermission('/product/mangesaleshours', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1),
      slots: z.array(z.object({
        weekday: z.number().int().min(0).max(6),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })).default([]),
    }).parse(req.body)

    // แต่ละวันเพิ่มได้สูงสุด 3 ช่วง และห้ามซ้อนกัน (หัวข้อ 6.9.7)
    const byDay = new Map<number, { start: string; end: string }[]>()
    for (const s of body.slots) {
      const list = byDay.get(s.weekday) ?? []
      list.push(s)
      byDay.set(s.weekday, list)
    }
    for (const [weekday, list] of byDay) {
      if (list.length > 3) throw badRequest(`วันที่ ${weekday} กำหนดช่วงเวลาได้ไม่เกิน 3 ช่วง`)
      const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start))
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]!.start < sorted[i - 1]!.end) {
          throw badRequest('ช่วงเวลาการขายซ้อนทับกัน กรุณาตรวจสอบอีกครั้ง')
        }
      }
    }

    return prisma.salesHour.create({
      data: { branchId: req.branchId, name: body.name, slots: { create: body.slots } },
      include: { slots: true },
    })
  })

  app.delete('/sales-hours/:id', { preHandler: app.requirePermission('/product/mangesaleshours', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertIn(
      () => prisma.salesHour.findFirst({ where: { id: id, branchId: req.branchId, deletedAt: null } }),
      'ไม่พบช่วงเวลาการขายนี้',
    )
    await prisma.salesHour.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  // ───────── ผู้ให้บริการเดลิเวอรี่ (/setting/delivery) ─────────
  app.get('/delivery-providers', { preHandler: app.withBranch }, async (req) =>
    prisma.deliveryProvider.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    }),
  )

  app.post('/delivery-providers', { preHandler: app.requirePermission('/setting/delivery', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1),
      logo: z.string().nullable().optional(),
    }).parse(req.body)
    return prisma.deliveryProvider.create({ data: { branchId: req.branchId, ...body } })
  })

  app.delete('/delivery-providers/:id', { preHandler: app.requirePermission('/setting/delivery', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const row = await prisma.deliveryProvider.findFirst({ where: { id, branchId: req.branchId } })
    if (!row) throw notFound('ไม่พบผู้ให้บริการรายนี้')
    if (row.isSystem) throw badRequest('ไม่สามารถลบผู้ให้บริการที่ระบบตั้งไว้ได้')
    await prisma.deliveryProvider.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  // ───────── เครื่องพิมพ์ ─────────
  app.get('/printers', { preHandler: app.withBranch }, async (req) =>
    prisma.printer.findMany({
      where: { branchId: req.branchId, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  )

  app.post('/printers', { preHandler: app.requirePermission('/setting/tools', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1),
      kind: z.enum(['star', 'epson', 'ethernet', 'bluetooth', 'usb']).default('ethernet'),
      ip: z.string().nullable().optional(),
      role: z.enum(['receipt', 'kitchen', 'sticker']).default('receipt'),
      categoryIds: z.array(z.string().uuid()).default([]),
      printLanguage: z.string().default('th'),
    }).parse(req.body)
    return prisma.printer.create({ data: { branchId: req.branchId, ...body } })
  })
}

/** ตรวจว่าเรคคอร์ดอยู่ในสาขาที่กำลังทำงานอยู่ */
async function assertIn(find: () => Promise<unknown>, message: string) {
  const row = await find()
  if (!row) throw notFound(message)
}

export default routes
