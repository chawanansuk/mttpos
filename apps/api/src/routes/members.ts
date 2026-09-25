import type { FastifyPluginAsync } from 'fastify'
import { Prisma, prisma } from '@medee/db'
import { averagePerBill } from '@medee/domain'
import { z } from 'zod'
import { badRequest, notFound } from '../lib/errors.js'
import { listQuerySchema, paged, skipTake } from '../lib/pagination.js'
import { sendExport } from '../lib/export.js'

const memberSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อ - นามสกุล'),
  gender: z.enum(['ชาย', 'หญิง', 'ไม่ระบุ']).default('ไม่ระบุ'),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  birthdate: z.string().nullable().optional(),
  channel: z.string().default('หน้าร้าน'),
  memberGroupId: z.string().uuid().nullable().optional(),
  address: z.string().nullable().optional(),
})

const routes: FastifyPluginAsync = async (app) => {
  app.get('/members', { preHandler: app.requirePermission('/member/data') }, async (req, reply) => {
    const query = listQuerySchema.parse(req.query)
    const search = query.search?.trim()
    const where: Prisma.MemberWhereInput = {
      branchId: req.branchId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.member.findMany({
        where, orderBy: { createdAt: 'asc' },
        ...(query.export ? {} : skipTake(query)),
        include: { memberGroup: { select: { name: true } } },
      }),
      prisma.member.count({ where }),
    ])

    if (query.export) {
      return sendExport(reply, query.export, 'รายชื่อสมาชิก', [
        { key: 'name', header: 'ชื่อสมาชิก', width: 30 },
        { key: 'channel', header: 'ช่องทาง' },
        { key: 'birthdate', header: 'วันเกิด' },
        { key: 'phone', header: 'เบอร์โทรศัพท์' },
        { key: 'email', header: 'อีเมล' },
        { key: 'firstVisitAt', header: 'เยี่ยมชมครั้งแรก' },
        { key: 'lastVisitAt', header: 'เยี่ยมชมครั้งล่าสุด' },
        { key: 'totalSpent', header: 'ใช้จ่ายสะสม' },
        { key: 'pointsBalance', header: 'คะแนนคงเหลือ' },
      ], rows.map((m) => ({
        name: m.name, channel: m.channel,
        birthdate: m.birthdate?.toISOString().slice(0, 10) ?? '-',
        phone: m.phone ?? '', email: m.email ?? '-',
        firstVisitAt: m.firstVisitAt?.toISOString() ?? '-',
        lastVisitAt: m.lastVisitAt?.toISOString() ?? '-',
        totalSpent: m.totalSpent.toFixed(2), pointsBalance: m.pointsBalance,
      })))
    }
    return paged(rows, total, query)
  })

  app.post('/members', { preHandler: app.requirePermission('/member/data', 'edit') }, async (req) => {
    const body = memberSchema.parse(req.body)
    return prisma.member.create({
      data: {
        branchId: req.branchId,
        ...body,
        birthdate: body.birthdate ? new Date(body.birthdate) : null,
      },
    })
  })

  app.put('/members/:id', { preHandler: app.requirePermission('/member/data', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = memberSchema.partial().parse(req.body)
    await assertMember(id, req.branchId)
    return prisma.member.update({
      where: { id },
      data: {
        ...body,
        birthdate: body.birthdate === undefined ? undefined : body.birthdate ? new Date(body.birthdate) : null,
      },
    })
  })

  app.delete('/members/:id', { preHandler: app.requirePermission('/member/data', 'remove') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await assertMember(id, req.branchId)
    await prisma.member.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  })

  /** หน้าสรุปสมาชิก: มูลค่ารวม/เฉลี่ยต่อบิล/สินค้าที่ซื้อบ่อย/การซื้อล่าสุด (หัวข้อ 6.12) */
  app.get('/members/:id/summary', { preHandler: app.requirePermission('/member/data') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const member = await prisma.member.findFirst({
      where: { id, branchId: req.branchId, deletedAt: null },
      include: { memberGroup: true },
    })
    if (!member) throw notFound('ไม่พบสมาชิกรายนี้')

    const [agg, frequent, recent, notes] = await Promise.all([
      prisma.receipt.aggregate({
        where: { memberId: id, status: 'ปกติ' },
        _sum: { grandTotal: true }, _count: true,
      }),
      prisma.$queryRaw<{ name: string; barcode: string | null; qty: string; amount: string }[]>`
        SELECT ri.name, ri.barcode, SUM(ri.qty)::text AS qty, SUM(ri."netAfterBillDiscount")::text AS amount
        FROM receipt_items ri
        JOIN receipts r ON r.id = ri."receiptId"
        WHERE r."memberId" = ${id}::uuid AND r.status = 'ปกติ'
        GROUP BY ri.name, ri.barcode
        ORDER BY SUM(ri.qty) DESC
        LIMIT 5
      `,
      prisma.receipt.findMany({
        where: { memberId: id, status: 'ปกติ' },
        orderBy: { soldAt: 'desc' }, take: 5,
        select: { id: true, receiptNo: true, soldAt: true, grandTotal: true },
      }),
      prisma.memberNote.findMany({
        where: { memberId: id, deletedAt: null }, orderBy: { createdAt: 'desc' },
      }),
    ])

    const total = agg._sum.grandTotal ?? new Prisma.Decimal(0)
    return {
      member,
      billCount: agg._count,
      totalAmount: total.toFixed(2),
      averagePerBill: averagePerBill(total.toFixed(2), agg._count),
      frequentProducts: frequent,
      recentReceipts: recent,
      notes,
    }
  })

  app.get('/members/:id/receipts', { preHandler: app.requirePermission('/member/data') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const query = listQuerySchema.parse(req.query)
    const where = { memberId: id, branchId: req.branchId }
    const [rows, total] = await Promise.all([
      prisma.receipt.findMany({ where, orderBy: { soldAt: 'desc' }, ...skipTake(query) }),
      prisma.receipt.count({ where }),
    ])
    return paged(rows, total, query)
  })

  /** บันทึกของร้านค้า (member notes) */
  app.get('/members/:id/notes', { preHandler: app.requirePermission('/member/data') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return prisma.memberNote.findMany({
      where: { memberId: id, deletedAt: null }, orderBy: { createdAt: 'desc' },
    })
  })

  app.post('/members/:id/notes', { preHandler: app.requirePermission('/member/data', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      title: z.string().min(1, 'กรุณากรอกหัวข้อ'),
      detail: z.string().nullable().optional(),
      status: z.enum(['ไม่มีสถานะ', 'รอดำเนินการ', 'กำลังดำเนินการ', 'ปิดเคส']).default('ไม่มีสถานะ'),
      tags: z.array(z.string()).default([]),
    }).parse(req.body)
    await assertMember(id, req.branchId)
    return prisma.memberNote.create({
      data: { memberId: id, ...body, createdBy: req.cashier?.name ?? req.account.email },
    })
  })

  /** ปรับคะแนนด้วยมือ */
  app.post('/members/:id/points/adjust', { preHandler: app.requirePermission('/member/data', 'edit') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({
      points: z.number().int(),
      note: z.string().optional(),
    }).parse(req.body)
    const member = await assertMember(id, req.branchId)
    if (member.pointsBalance + body.points < 0) throw badRequest('คะแนนคงเหลือติดลบไม่ได้')

    return prisma.$transaction(async (tx) => {
      await tx.memberPointTransaction.create({
        data: { memberId: id, points: body.points, type: 'adjust', note: body.note },
      })
      return tx.member.update({
        where: { id },
        data: { pointsBalance: { increment: body.points } },
      })
    })
  })

  /** กลุ่มลูกค้า (ผูกราคาขายส่ง) */
  app.get('/member-groups', { preHandler: app.withBranch }, async (req) =>
    prisma.memberGroup.findMany({ where: { branchId: req.branchId }, orderBy: { name: 'asc' } }),
  )

  app.post('/member-groups', { preHandler: app.requirePermission('/member/data', 'edit') }, async (req) => {
    const body = z.object({
      name: z.string().min(1),
      priceChannel: z.string().nullable().optional(),
    }).parse(req.body)
    return prisma.memberGroup.create({ data: { branchId: req.branchId, ...body } })
  })

  /** นำเข้ารายชื่อสมาชิก (/member/ImportMember) */
  app.post('/members/import', { preHandler: app.requirePermission('/member/ImportMember', 'edit') }, async (req) => {
    const body = z.object({
      commit: z.boolean().default(false),
      rows: z.array(z.record(z.string())).min(1),
    }).parse(req.body)

    const ok: Record<string, string>[] = []
    const failed: { row: number; reasons: string[] }[] = []
    body.rows.forEach((row, i) => {
      const reasons: string[] = []
      if (!(row['ชื่อ'] ?? row.name ?? '').trim()) reasons.push('ไม่ได้กรอกชื่อ')
      const phone = (row['เบอร์โทรศัพท์'] ?? row.phone ?? '').trim()
      if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) reasons.push('เบอร์โทรศัพท์ไม่ถูกต้อง')
      const points = (row['คะแนน'] ?? row.points ?? '').trim()
      if (points && Number.isNaN(Number(points))) reasons.push('คะแนนต้องเป็นตัวเลข')
      if (reasons.length) failed.push({ row: i + 1, reasons })
      else ok.push(row)
    })

    if (!body.commit) return { dryRun: true, passed: ok.length, failed: failed.length, errors: failed }

    let created = 0
    let updated = 0
    for (const row of ok) {
      const name = (row['ชื่อ'] ?? row.name ?? '').trim()
      const phone = (row['เบอร์โทรศัพท์'] ?? row.phone ?? '').trim() || null
      const points = Number((row['คะแนน'] ?? row.points ?? '0').trim() || 0)
      const existing = phone
        ? await prisma.member.findFirst({ where: { branchId: req.branchId, phone, deletedAt: null } })
        : null
      if (existing) {
        // ข้อมูลที่นำเข้าใหม่ทับของเดิม และคะแนนปรับเป็นยอดล่าสุดที่นำเข้า
        await prisma.member.update({
          where: { id: existing.id },
          data: {
            name, pointsBalance: points,
            email: (row['อีเมล'] ?? row.email ?? '').trim() || existing.email,
          },
        })
        updated += 1
      } else {
        await prisma.member.create({
          data: {
            branchId: req.branchId, name, phone, pointsBalance: points,
            gender: (row['เพศ'] ?? row.gender ?? 'ไม่ระบุ').trim() || 'ไม่ระบุ',
            email: (row['อีเมล'] ?? row.email ?? '').trim() || null,
            channel: 'import',
          },
        })
        created += 1
      }
    }
    return { dryRun: false, created, updated, failed: failed.length, errors: failed }
  })
}

async function assertMember(id: string, branchId: string) {
  const member = await prisma.member.findFirst({ where: { id, branchId, deletedAt: null } })
  if (!member) throw notFound('ไม่พบสมาชิกรายนี้')
  return member
}

export default routes
