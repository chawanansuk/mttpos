import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { Prisma, prisma } from '@medee/db'
import { applyGp, formatDateRangeLabel, stockValuation } from '@medee/domain'
import { z } from 'zod'
import { branchToday, getBranch } from '../lib/branch.js'
import { listQuerySchema } from '../lib/pagination.js'
import { sendExport, type ExportColumn } from '../lib/export.js'

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** ช่วงวันขายที่ใช้กับทุกรายงาน — ไม่ระบุ = วันนี้ */
async function resolveRange(req: FastifyRequest) {
  const parsed = rangeSchema.parse(req.query)
  const branch = await getBranch(req.branchId)
  const today = branchToday(branch)
  const from = parsed.from ?? today
  const to = parsed.to ?? today
  return { branch, from, to, label: formatDateRangeLabel(from, to) }
}

function num(value: unknown): string {
  return new Prisma.Decimal((value as string) ?? 0).toFixed(2)
}

const routes: FastifyPluginAsync = async (app) => {
  /** หน้ารายงานสรุป (/dashboard) — หัวข้อ 6.2 */
  app.get('/reports/dashboard', { preHandler: app.requirePermission('/dashboard') }, async (req) => {
    const { branch, from, to, label } = await resolveRange(req)
    const scope = { branchId: req.branchId, businessDay: { gte: from, lte: to } }

    const [sales, voided, payments, hourly, daily, topProducts, topCategories, stockRows] = await Promise.all([
      prisma.receipt.aggregate({
        where: { ...scope, status: 'ปกติ' },
        _sum: {
          grandTotal: true, profit: true, discountTotal: true, subtotal: true,
          billDiscount: true, vatableAmount: true, nonVatableAmount: true,
          vatAmount: true, serviceCharge: true,
        },
        _count: true,
      }),
      prisma.receipt.aggregate({
        where: { ...scope, status: 'ยกเลิก' },
        _sum: { grandTotal: true }, _count: true,
      }),
      prisma.$queryRaw<{ method: string; amount: string }[]>`
        SELECT rp.method, SUM(rp.amount)::text AS amount
        FROM receipt_payments rp JOIN receipts r ON r.id = rp."receiptId"
        WHERE r."branchId" = ${req.branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
          AND r.status = 'ปกติ'
        GROUP BY rp.method ORDER BY 2 DESC`,
      from === to
        ? prisma.$queryRaw<{ hour: string; amount: string }[]>`
            SELECT to_char(r."soldAt" AT TIME ZONE ${branch.timezone}, 'HH24') AS hour,
                   SUM(r."grandTotal")::text AS amount
            FROM receipts r
            WHERE r."branchId" = ${req.branchId}::uuid AND r."businessDay" = ${from} AND r.status = 'ปกติ'
            GROUP BY 1 ORDER BY 1`
        : Promise.resolve([]),
      from === to
        ? Promise.resolve([])
        : prisma.$queryRaw<{ day: string; amount: string }[]>`
            SELECT r."businessDay" AS day, SUM(r."grandTotal")::text AS amount
            FROM receipts r
            WHERE r."branchId" = ${req.branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
              AND r.status = 'ปกติ'
            GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ name: string; barcode: string | null; qty: string; amount: string }[]>`
        SELECT ri.name, ri.barcode, SUM(ri.qty)::text AS qty, SUM(ri."netAfterBillDiscount")::text AS amount
        FROM receipt_items ri JOIN receipts r ON r.id = ri."receiptId"
        WHERE r."branchId" = ${req.branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
          AND r.status = 'ปกติ'
        GROUP BY 1, 2 ORDER BY SUM(ri.qty) DESC LIMIT 10`,
      prisma.$queryRaw<{ name: string; qty: string; amount: string }[]>`
        SELECT COALESCE(ri."categoryName", 'Uncategory') AS name,
               SUM(ri.qty)::text AS qty, SUM(ri."netAfterBillDiscount")::text AS amount
        FROM receipt_items ri JOIN receipts r ON r.id = ri."receiptId"
        WHERE r."branchId" = ${req.branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
          AND r.status = 'ปกติ'
        GROUP BY 1 ORDER BY SUM(ri.qty) DESC LIMIT 10`,
      prisma.$queryRaw<{ balance: string; cost: string; price: string }[]>`
        SELECT pp."stockQty"::text AS balance, p."stdCost"::text AS cost, p.price::text AS price
        FROM product_plus pp JOIN products p ON p.id = pp."productId"
        WHERE p."branchId" = ${req.branchId}::uuid AND p."deletedAt" IS NULL
          AND pp."isDefault" = true AND pp."deletedAt" IS NULL`,
    ])

    const billCount = sales._count
    const grandTotal = sales._sum.grandTotal ?? new Prisma.Decimal(0)

    return {
      range: { from, to, label },
      /** การ์ดตัวเลข 3 ใบ: ยอดขาย · กำไร · ส่วนลด */
      cards: {
        sales: grandTotal.toFixed(2),
        profit: (sales._sum.profit ?? new Prisma.Decimal(0)).toFixed(2),
        discount: (sales._sum.discountTotal ?? new Prisma.Decimal(0)).toFixed(2),
      },
      /** การ์ด "จำนวนบิล" */
      bills: {
        total: billCount,
        averagePerBill: billCount > 0 ? grandTotal.dividedBy(billCount).toFixed(2) : '0.00',
        voidCount: voided._count,
        voidAmount: (voided._sum.grandTotal ?? new Prisma.Decimal(0)).toFixed(2),
      },
      /** การ์ดสรุปยอด */
      summary: {
        subtotal: (sales._sum.subtotal ?? new Prisma.Decimal(0)).toFixed(2),
        billDiscount: (sales._sum.billDiscount ?? new Prisma.Decimal(0)).toFixed(2),
        vatableAmount: (sales._sum.vatableAmount ?? new Prisma.Decimal(0)).toFixed(2),
        nonVatableAmount: (sales._sum.nonVatableAmount ?? new Prisma.Decimal(0)).toFixed(2),
        vatAmount: (sales._sum.vatAmount ?? new Prisma.Decimal(0)).toFixed(2),
        serviceCharge: (sales._sum.serviceCharge ?? new Prisma.Decimal(0)).toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        vatRate: branch.vatRate.toFixed(2),
      },
      payments: payments.map((p) => ({ method: p.method, amount: num(p.amount) })),
      /** วันเดียว → รายชั่วโมง ; หลายวัน → รายวัน */
      chart: from === to
        ? { mode: 'hourly', points: hourly.map((h) => ({ label: `${h.hour}.00`, amount: num(h.amount) })) }
        : { mode: 'daily', points: daily.map((d) => ({ label: d.day, amount: num(d.amount) })) },
      topProducts: topProducts.map((p, i) => ({ rank: i + 1, ...p, amount: num(p.amount) })),
      topCategories: topCategories.map((c, i) => ({ rank: i + 1, ...c, amount: num(c.amount) })),
      /** ข้อมูลสต็อก ณ ปัจจุบัน (ไม่ขึ้นกับช่วงวัน) */
      stock: stockValuation(stockRows),
    }
  })

  /** นิยามรายงานทั้งหมด: path สิทธิ์ · SQL · คอลัมน์ตามสเปก */
  interface ReportDef {
    key: string
    title: string
    permission: string
    columns: ExportColumn[]
    run: (ctx: { branchId: string; from: string; to: string; timezone: string; search?: string }) => Promise<Record<string, unknown>[]>
  }

  const money = (v: unknown) => num(v)

  const REPORTS: ReportDef[] = [
    {
      key: 'daily',
      title: 'ยอดขายสินค้าตามวัน',
      permission: '/report/daily',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'subtotal', header: 'รวมก่อนลด' },
        { key: 'discount', header: 'ส่วนลด' },
        { key: 'vatAmount', header: 'คิดเป็นมูลค่าภาษี' },
        { key: 'serviceCharge', header: 'ค่าบริการ' },
        { key: 'profit', header: 'กำไร' },
        { key: 'sales', header: 'ยอดขาย' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT r."businessDay" AS day,
                 SUM(r.subtotal)::text AS subtotal,
                 SUM(r."discountTotal")::text AS discount,
                 SUM(r."vatAmount")::text AS "vatAmount",
                 SUM(r."serviceCharge")::text AS "serviceCharge",
                 SUM(r.profit)::text AS profit,
                 SUM(r."grandTotal")::text AS sales
          FROM receipts r
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1 ORDER BY 1`
        return rows.map((r) => ({
          day: r.day,
          subtotal: money(r.subtotal),
          // ต้นฉบับแสดงส่วนลดเป็นค่าลบ
          discount: `-${money(r.discount)}`,
          vatAmount: money(r.vatAmount),
          serviceCharge: money(r.serviceCharge),
          profit: money(r.profit),
          sales: money(r.sales),
        }))
      },
    },
    {
      key: 'bill-items',
      title: 'ยอดขายตามรายละเอียดบิล',
      permission: '/report/sell',
      columns: [
        { key: 'soldAt', header: 'วันที่' },
        { key: 'receiptNo', header: 'เลขที่บิล' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'qty', header: 'จำนวน' },
        { key: 'unitPrice', header: 'ราคาขาย/หน่วย' },
        { key: 'optionTotal', header: 'มูลค่าตัวเลือก' },
        { key: 'subtotal', header: 'รวมก่อนลด' },
        { key: 'discount', header: 'ส่วนลด' },
        { key: 'net', header: 'ยอดสุทธิ' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT r."soldAt"::text AS "soldAt", r."receiptNo", ri.barcode, ri.name,
                 ri.qty::text AS qty, ri."unitPrice"::text AS "unitPrice",
                 ri."optionTotal"::text AS "optionTotal", ri.subtotal::text AS subtotal,
                 ri."itemDiscount"::text AS discount, ri."netAfterBillDiscount"::text AS net
          FROM receipt_items ri JOIN receipts r ON r.id = ri."receiptId"
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          ORDER BY r."soldAt", ri."orderIndex"`
        return rows.map((r) => ({
          ...r,
          unitPrice: money(r.unitPrice), optionTotal: money(r.optionTotal),
          subtotal: money(r.subtotal), discount: money(r.discount), net: money(r.net),
        }))
      },
    },
    {
      key: 'by-sku',
      title: 'ยอดขายตามสินค้า',
      permission: '/report/sku',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'qty', header: 'ขายได้จำนวน' },
        { key: 'balance', header: 'คงเหลือ' },
        { key: 'sales', header: 'ยอดขาย' },
        { key: 'cost', header: 'ต้นทุน' },
        { key: 'profit', header: 'กำไร' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT ri.barcode, ri.name, ri."categoryName",
                 SUM(ri.qty)::text AS qty,
                 SUM(ri."netAfterBillDiscount")::text AS sales,
                 SUM(ri.cost)::text AS cost,
                 (SUM(ri."netAfterBillDiscount") - SUM(ri.cost))::text AS profit,
                 COALESCE(MAX(pp."stockQty"), 0)::text AS balance
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri."receiptId"
          LEFT JOIN product_plus pp ON pp."productId" = ri."productId" AND pp."isDefault" = true
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1, 2, 3 ORDER BY SUM(ri.qty) DESC`
        return rows.map((r, i) => ({
          rank: i + 1, barcode: r.barcode, name: r.name, categoryName: r.categoryName,
          qty: r.qty, balance: r.balance,
          sales: money(r.sales), cost: money(r.cost), profit: money(r.profit),
        }))
      },
    },
    {
      key: 'by-plu',
      title: 'ยอดขายสินค้าตามขนาดบรรจุ',
      permission: '/report/plu',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'qty', header: 'ขายได้จำนวน' },
        { key: 'sales', header: 'ยอดขาย' },
        { key: 'balance', header: 'คงเหลือ' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT ri.barcode, ri.name, ri."categoryName",
                 SUM(ri.qty)::text AS qty,
                 SUM(ri."netAfterBillDiscount")::text AS sales,
                 COALESCE(MAX(pp."stockQty"), 0)::text AS balance
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri."receiptId"
          LEFT JOIN product_plus pp ON pp.id = ri."pluId"
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY ri."pluId", 1, 2, 3 ORDER BY SUM(ri.qty) DESC`
        return rows.map((r, i) => ({ rank: i + 1, ...r, sales: money(r.sales) }))
      },
    },
    {
      key: 'unsold',
      title: 'สินค้าที่ไม่มีการขาย',
      permission: '/report/unsell',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'cost', header: 'ราคาทุน' },
        { key: 'balance', header: 'คงเหลือ' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT p.barcode, p.name, c.name AS "categoryName",
                 p."stdCost"::text AS cost, COALESCE(pp."stockQty", 0)::text AS balance
          FROM products p
          LEFT JOIN categories c ON c.id = p."categoryId"
          LEFT JOIN product_plus pp ON pp."productId" = p.id AND pp."isDefault" = true
          WHERE p."branchId" = ${branchId}::uuid AND p."deletedAt" IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM receipt_items ri JOIN receipts r ON r.id = ri."receiptId"
              WHERE ri."productId" = p.id AND r."businessDay" BETWEEN ${from} AND ${to} AND r.status = 'ปกติ'
            )
          ORDER BY p.name`
        return rows.map((r, i) => ({ rank: i + 1, ...r, cost: money(r.cost) }))
      },
    },
    {
      key: 'by-category',
      title: 'การขายแยกตามกลุ่มสินค้า',
      permission: '/report/category',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'sales', header: 'ยอดขาย' },
        { key: 'qty', header: 'จำนวน' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT COALESCE(ri."categoryName", 'Uncategory') AS "categoryName",
                 SUM(ri."netAfterBillDiscount")::text AS sales, SUM(ri.qty)::text AS qty
          FROM receipt_items ri JOIN receipts r ON r.id = ri."receiptId"
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1 ORDER BY SUM(ri.qty) DESC`
        return rows.map((r, i) => ({ rank: i + 1, ...r, sales: money(r.sales) }))
      },
    },
    {
      key: 'payments',
      title: 'การชำระเงิน',
      permission: '/report/payment',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'total', header: 'ชำระรวม' },
        { key: 'เงินสด', header: 'เงินสด' },
        { key: 'โอน(พร้อมเพย์)', header: 'โอน(พร้อมเพย์)' },
        { key: 'บัตรเครดิต', header: 'บัตรเครดิต' },
        { key: 'EDC', header: 'EDC' },
        { key: 'คูปอง', header: 'คูปอง' },
        { key: 'Online', header: 'Online' },
        { key: 'มัดจำ', header: 'มัดจำ' },
        { key: 'อื่นๆ', header: 'อื่นๆ' },
        { key: 'outstanding', header: 'ยอดค้างชำระ' },
      ],
      run: async ({ branchId, from, to }) => {
        const [payments, sales] = await Promise.all([
          prisma.$queryRaw<{ day: string; method: string; amount: string }[]>`
            SELECT r."businessDay" AS day, rp.method, SUM(rp.amount)::text AS amount
            FROM receipt_payments rp JOIN receipts r ON r.id = rp."receiptId"
            WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
              AND r.status = 'ปกติ'
            GROUP BY 1, 2`,
          prisma.$queryRaw<{ day: string; amount: string }[]>`
            SELECT r."businessDay" AS day, SUM(r."grandTotal")::text AS amount
            FROM receipts r
            WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
              AND r.status = 'ปกติ'
            GROUP BY 1`,
        ])
        const salesByDay = new Map(sales.map((s) => [s.day, new Prisma.Decimal(s.amount)]))
        type PayRow = { day: string; total: Prisma.Decimal } & Record<string, unknown>
        const byDay = new Map<string, PayRow>()
        for (const p of payments) {
          const row = byDay.get(p.day) ?? ({ day: p.day, total: new Prisma.Decimal(0) } as PayRow)
          row[p.method] = money(p.amount)
          row.total = row.total.plus(p.amount)
          byDay.set(p.day, row)
        }
        return [...byDay.values()]
          .map((row) => {
            const daySales = salesByDay.get(row.day) ?? new Prisma.Decimal(0)
            return {
              ...row,
              total: row.total.toFixed(2),
              // ชำระรวมอาจน้อยกว่ายอดขายเมื่อมีบิลที่ยังไม่ชำระครบ
              outstanding: daySales.minus(row.total).toFixed(2),
            }
          })
          .sort((a, b) => b.day.localeCompare(a.day))
      },
    },
    {
      key: 'voids',
      title: 'ยกเลิกการขาย',
      permission: '/report/voidbill',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'billCount', header: 'จำนวนบิล' },
        { key: 'subtotal', header: 'รวมก่อนลด' },
        { key: 'discount', header: 'ส่วนลด' },
        { key: 'vatAmount', header: 'ภาษีมูลค่าเพิ่ม' },
        { key: 'sales', header: 'ยอดขาย' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT r."businessDay" AS day, COUNT(*)::text AS "billCount",
                 SUM(r.subtotal)::text AS subtotal, SUM(r."discountTotal")::text AS discount,
                 SUM(r."vatAmount")::text AS "vatAmount", SUM(r."grandTotal")::text AS sales
          FROM receipts r
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ยกเลิก'
          GROUP BY 1 ORDER BY 1 DESC`
        return rows.map((r) => ({
          ...r, subtotal: money(r.subtotal), discount: money(r.discount),
          vatAmount: money(r.vatAmount), sales: money(r.sales),
        }))
      },
    },
    {
      key: 'options',
      title: 'ยอดขายตามตัวเลือก',
      permission: '/report/optional',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'name', header: 'ชื่อตัวเลือก' },
        { key: 'billCount', header: 'จำนวนบิล' },
        { key: 'price', header: 'ราคาขาย' },
        { key: 'sales', header: 'ยอดขาย' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT opt->>'name' AS name,
                 COUNT(DISTINCT r.id)::text AS "billCount",
                 MAX((opt->>'price')::numeric)::text AS price,
                 SUM((opt->>'price')::numeric * COALESCE((opt->>'qty')::numeric, 1) * ri.qty)::text AS sales
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri."receiptId"
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ri.options, '[]'::jsonb)) AS opt
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1 ORDER BY COUNT(DISTINCT r.id) ASC`
        return rows.map((r, i) => ({ rank: i + 1, ...r, price: money(r.price), sales: money(r.sales) }))
      },
    },
    {
      key: 'option-cost',
      title: 'ต้นทุนตามตัวเลือก',
      permission: '/report/optionSalesByCost',
      columns: [
        { key: 'productName', header: 'ชื่อสินค้า', width: 30 },
        { key: 'groupName', header: 'กลุ่มตัวเลือก' },
        { key: 'name', header: 'ชื่อตัวเลือก' },
        { key: 'qty', header: 'จำนวนการขาย' },
        { key: 'price', header: 'ราคาขาย' },
        { key: 'sales', header: 'ยอดสุทธิ' },
        { key: 'cost', header: 'ต้นทุนรวม' },
        { key: 'profit', header: 'กำไร' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT ri.name AS "productName", COALESCE(opt->>'groupName', '-') AS "groupName",
                 opt->>'name' AS name,
                 SUM(COALESCE((opt->>'qty')::numeric, 1) * ri.qty)::text AS qty,
                 MAX((opt->>'price')::numeric)::text AS price,
                 SUM((opt->>'price')::numeric * COALESCE((opt->>'qty')::numeric, 1) * ri.qty)::text AS sales,
                 SUM(COALESCE((opt->>'cost')::numeric, 0) * COALESCE((opt->>'qty')::numeric, 1) * ri.qty)::text AS cost
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri."receiptId"
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ri.options, '[]'::jsonb)) AS opt
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1, 2, 3 ORDER BY 3`
        return rows.map((r) => ({
          ...r, price: money(r.price), sales: money(r.sales), cost: money(r.cost),
          profit: new Prisma.Decimal(r.sales ?? 0).minus(r.cost ?? 0).toFixed(2),
        }))
      },
    },
    {
      key: 'option-by-date',
      title: 'การสั่งกลุ่มตัวเลือกตามวัน',
      permission: '/report/optionSalesByDate',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'productName', header: 'ชื่อสินค้า', width: 30 },
        { key: 'name', header: 'ชื่อตัวเลือก' },
        { key: 'qty', header: 'จำนวนการขาย' },
        { key: 'sales', header: 'ยอดสุทธิ' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT r."businessDay" AS day, COALESCE(ri."categoryName", '-') AS "categoryName",
                 ri.name AS "productName", opt->>'name' AS name,
                 SUM(COALESCE((opt->>'qty')::numeric, 1) * ri.qty)::text AS qty,
                 SUM((opt->>'price')::numeric * COALESCE((opt->>'qty')::numeric, 1) * ri.qty)::text AS sales
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri."receiptId"
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ri.options, '[]'::jsonb)) AS opt
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC`
        return rows.map((r) => ({ ...r, sales: money(r.sales) }))
      },
    },
    {
      key: 'cash-in-out',
      title: 'นำเงินเข้า-นำเงินออก',
      permission: '/report/cashIn-Out',
      columns: [
        { key: 'occurredAt', header: 'วันที่' },
        { key: 'roundNo', header: 'รอบการขาย' },
        { key: 'typeLabel', header: 'ประเภท' },
        { key: 'category', header: 'หมวดหมู่' },
        { key: 'detail', header: 'รายละเอียด', width: 30 },
        { key: 'amount', header: 'จำนวน' },
        { key: 'actorName', header: 'บันทึกโดย' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT cio."occurredAt"::text AS "occurredAt", cr."roundNo"::text AS "roundNo",
                 cio.type, cio.category, COALESCE(cio.detail, '-') AS detail,
                 cio.amount::text AS amount, COALESCE(c.name, '-') AS "actorName"
          FROM cash_in_outs cio
          JOIN cash_rounds cr ON cr.id = cio."cashRoundId"
          LEFT JOIN cashiers c ON c.id = cio."cashierId"
          WHERE cr."branchId" = ${branchId}::uuid AND cr."businessDay" BETWEEN ${from} AND ${to}
          ORDER BY cio."occurredAt"`
        return rows.map((r) => ({
          ...r,
          typeLabel: r.type === 'IN' ? 'นำเงินเข้า' : 'นำเงินออก',
          amount: money(r.amount),
        }))
      },
    },
    {
      key: 'channels',
      title: 'ยอดขายตามช่องทางการขาย',
      permission: '/report/salesChannels',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'channel', header: 'ช่องทางการขาย' },
        { key: 'billCount', header: 'จำนวนบิล' },
        { key: 'gross', header: 'ก่อนหัก GP' },
        { key: 'gpAmount', header: 'ค่า GP' },
        { key: 'net', header: 'ยอดขาย' },
      ],
      run: async ({ branchId, from, to }) => {
        const [rows, configs] = await Promise.all([
          prisma.$queryRaw<Record<string, string>[]>`
            SELECT r."salesChannel" AS channel, COUNT(*)::text AS "billCount",
                   SUM(r."grandTotal")::text AS gross
            FROM receipts r
            WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
              AND r.status = 'ปกติ'
            GROUP BY 1 ORDER BY SUM(r."grandTotal") ASC`,
          prisma.salesChannelConfig.findMany({ where: { branchId } }),
        ])
        const gpByLabel = new Map(configs.map((c) => [c.label, c.gpPercent.toString()]))
        return rows.map((r, i) => ({
          rank: i + 1,
          channel: r.channel,
          billCount: r.billCount,
          ...applyGp(r.gross, gpByLabel.get(r.channel!) ?? 0),
        }))
      },
    },
    {
      key: 'tables',
      title: 'สถิติการใช้โต๊ะ',
      permission: '/report/table',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'tableNo', header: 'หมายเลขโต๊ะ' },
        { key: 'billCount', header: 'จำนวนบิล' },
        { key: 'guests', header: 'ลูกค้าทั้งหมด' },
        { key: 'items', header: 'รายการสินค้า' },
        { key: 'sales', header: 'ยอดขาย' },
        { key: 'avgMinutes', header: 'ระยะเวลาใช้โต๊ะเฉลี่ย (นาที)' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT r."businessDay" AS day, COALESCE(t."tableNo", r."tableNo", '-') AS "tableNo",
                 COUNT(DISTINCT r.id)::text AS "billCount",
                 COALESCE(SUM(r.guests), 0)::text AS guests,
                 COUNT(ri.id)::text AS items,
                 SUM(r."grandTotal")::text AS sales,
                 '0' AS "avgMinutes"
          FROM receipts r
          LEFT JOIN tables t ON t.id = r."tableId"
          LEFT JOIN receipt_items ri ON ri."receiptId" = r.id
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ' AND r."tableId" IS NOT NULL
          GROUP BY 1, 2 ORDER BY 1 DESC`
        return rows.map((r) => ({ ...r, sales: money(r.sales) }))
      },
    },
    {
      key: 'tax-summary',
      title: 'สรุปภาษีขาย',
      permission: '/report/tax',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'firstNo', header: 'เลขที่บิลเริ่มต้น' },
        { key: 'lastNo', header: 'เลขที่บิลสุดท้าย' },
        { key: 'nonVatable', header: 'สินค้าไม่มีภาษี' },
        { key: 'beforeVat', header: 'มูลค่าก่อน VAT' },
        { key: 'vatAmount', header: 'คิดเป็นมูลค่าภาษี' },
        { key: 'sales', header: 'ยอดขาย' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT r."businessDay" AS day,
                 MIN(r."receiptNo") AS "firstNo", MAX(r."receiptNo") AS "lastNo",
                 SUM(r."nonVatableAmount")::text AS "nonVatable",
                 SUM(r."amountBeforeVat")::text AS "beforeVat",
                 SUM(r."vatAmount")::text AS "vatAmount",
                 SUM(r."grandTotal")::text AS sales
          FROM receipts r
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY 1 ORDER BY 1`
        return rows.map((r) => ({
          ...r, nonVatable: money(r.nonVatable), beforeVat: money(r.beforeVat),
          vatAmount: money(r.vatAmount), sales: money(r.sales),
        }))
      },
    },
    {
      key: 'tax-invoices',
      title: 'บิลที่ออกใบกำกับภาษี',
      permission: '/report/newPayment',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'taxInvoiceNo', header: 'เลขที่ใบกำกับภาษี' },
        { key: 'receiptNo', header: 'เลขที่บิล' },
        { key: 'subtotal', header: 'ยอดรวมก่อนลด' },
        { key: 'beforeVat', header: 'มูลค่าก่อน VAT' },
        { key: 'discount', header: 'ส่วนลด' },
        { key: 'vatAmount', header: 'ภาษี' },
        { key: 'serviceCharge', header: 'ค่าบริการ' },
        { key: 'rounding', header: 'ปัดเศษ' },
        { key: 'grandTotal', header: 'รวมทั้งสิ้น' },
        { key: 'channel', header: 'ช่องทาง' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.receipt.findMany({
          where: {
            branchId, businessDay: { gte: from, lte: to },
            taxInvoiceNo: { not: null },
          },
          orderBy: { soldAt: 'asc' },
        })
        return rows.map((r) => ({
          day: r.businessDay, taxInvoiceNo: r.taxInvoiceNo, receiptNo: r.receiptNo,
          subtotal: r.subtotal.toFixed(2), beforeVat: r.amountBeforeVat.toFixed(2),
          discount: r.discountTotal.toFixed(2), vatAmount: r.vatAmount.toFixed(2),
          serviceCharge: r.serviceCharge.toFixed(2), rounding: r.rounding.toFixed(2),
          grandTotal: r.grandTotal.toFixed(2), channel: r.salesChannel,
        }))
      },
    },
    {
      key: 'tax-items',
      title: 'สรุปการขายเฉพาะสินค้ามีภาษี',
      permission: '/report/taxBillSales',
      columns: [
        { key: 'soldAt', header: 'วันที่' },
        { key: 'receiptNo', header: 'เลขที่บิล' },
        { key: 'vatMode', header: 'ประเภทภาษี' },
        { key: 'vatableAmount', header: 'มูลค่าสินค้ามีภาษี' },
        { key: 'serviceCharge', header: 'ค่าบริการ' },
        { key: 'beforeVat', header: 'รวมมูลค่าก่อนภาษี' },
        { key: 'vatAmount', header: 'ภาษีมูลค่าเพิ่ม' },
        { key: 'total', header: 'ยอดรวมเฉพาะสินค้ามีภาษี' },
        { key: 'taxInvoiceNo', header: 'เลขที่ใบกำกับภาษี' },
      ],
      run: async ({ branchId, from, to }) => {
        const branch = await getBranch(branchId)
        const rows = await prisma.receipt.findMany({
          where: {
            branchId, businessDay: { gte: from, lte: to }, status: 'ปกติ',
            vatableAmount: { gt: 0 },
          },
          orderBy: { soldAt: 'asc' },
        })
        return rows.map((r) => ({
          soldAt: r.soldAt.toISOString(), receiptNo: r.receiptNo,
          vatMode: branch.isVatIncluded ? 'สินค้ารวมภาษีแล้ว' : 'แยกภาษี',
          vatableAmount: r.vatableAmount.toFixed(2),
          serviceCharge: r.serviceCharge.toFixed(2),
          beforeVat: r.amountBeforeVat.toFixed(2),
          vatAmount: r.vatAmount.toFixed(2),
          total: r.amountBeforeVat.plus(r.vatAmount).toFixed(2),
          taxInvoiceNo: r.taxInvoiceNo ?? '-',
        }))
      },
    },
    {
      key: 'by-cashier',
      title: 'ยอดขายแยกตามพนักงาน',
      permission: '/report/cashier',
      columns: [
        { key: 'cashierName', header: 'พนักงาน' },
        { key: 'totalSales', header: 'ยอดขายทั้งหมด' },
        { key: 'เงินสด', header: 'เงินสด' },
        { key: 'โอน(พร้อมเพย์)', header: 'โอน(พร้อมเพย์)' },
        { key: 'บัตรเครดิต', header: 'บัตรเครดิต' },
        { key: 'totalBill', header: 'totalBill' },
        { key: 'soldBills', header: 'บิลที่ขาย' },
        { key: 'voidBills', header: 'บิลยกเลิก' },
        { key: 'discountBills', header: 'บิลที่ทำส่วนลด' },
        { key: 'billDiscount', header: 'ส่วนลดท้ายบิล' },
        { key: 'itemDiscount', header: 'ส่วนลดในรายการ' },
      ],
      run: async ({ branchId, from, to }) => {
        const [base, payments] = await Promise.all([
          prisma.$queryRaw<Record<string, string>[]>`
            SELECT COALESCE(c.name, '-') AS "cashierName", c.id::text AS "cashierId",
                   SUM(CASE WHEN r.status = 'ปกติ' THEN r."grandTotal" ELSE 0 END)::text AS "totalSales",
                   COUNT(*)::text AS "totalBill",
                   COUNT(*) FILTER (WHERE r.status = 'ปกติ')::text AS "soldBills",
                   COUNT(*) FILTER (WHERE r.status = 'ยกเลิก')::text AS "voidBills",
                   COUNT(*) FILTER (WHERE r.status = 'ปกติ' AND r."discountTotal" > 0)::text AS "discountBills",
                   SUM(CASE WHEN r.status = 'ปกติ' THEN r."billDiscount" ELSE 0 END)::text AS "billDiscount",
                   SUM(CASE WHEN r.status = 'ปกติ' THEN r."itemDiscountTotal" ELSE 0 END)::text AS "itemDiscount"
            FROM receipts r LEFT JOIN cashiers c ON c.id = r."cashierId"
            WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            GROUP BY 1, 2`,
          prisma.$queryRaw<{ cashierId: string | null; method: string; amount: string }[]>`
            SELECT r."cashierId"::text AS "cashierId", rp.method, SUM(rp.amount)::text AS amount
            FROM receipt_payments rp JOIN receipts r ON r.id = rp."receiptId"
            WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
              AND r.status = 'ปกติ'
            GROUP BY 1, 2`,
        ])
        return base.map((row) => {
          const out: Record<string, unknown> = {
            ...row,
            totalSales: money(row.totalSales),
            billDiscount: money(row.billDiscount),
            itemDiscount: money(row.itemDiscount),
          }
          for (const p of payments.filter((x) => x.cashierId === row.cashierId)) {
            out[p.method] = money(p.amount)
          }
          return out
        })
      },
    },
    {
      key: 'timesheet',
      title: 'ชั่วโมงการทำงาน',
      permission: '/report/timesheet',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'cashierName', header: 'ชื่อพนักงาน' },
        { key: 'clockIn', header: 'เวลาเข้างาน' },
        { key: 'clockOut', header: 'เวลาออกงาน' },
        { key: 'hours', header: 'ชั่วโมงการทำงาน' },
      ],
      run: async ({ branchId, from, to, timezone }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT to_char(t."clockInAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
                 c.name AS "cashierName",
                 to_char(t."clockInAt" AT TIME ZONE ${timezone}, 'HH24:MI') AS "clockIn",
                 COALESCE(to_char(t."clockOutAt" AT TIME ZONE ${timezone}, 'HH24:MI'), '-') AS "clockOut",
                 COALESCE(t.hours::text, '-') AS hours
          FROM timesheets t JOIN cashiers c ON c.id = t."cashierId"
          WHERE t."branchId" = ${branchId}::uuid
            AND to_char(t."clockInAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') BETWEEN ${from} AND ${to}
          ORDER BY t."clockInAt" DESC`
        return rows
      },
    },
    {
      key: 'by-customer',
      title: 'ยอดใช้จ่ายตามลูกค้า',
      permission: '/report/phone',
      columns: [
        { key: 'phone', header: 'เบอร์โทรศัพท์' },
        { key: 'name', header: 'ชื่อลูกค้า', width: 30 },
        { key: 'address', header: 'ที่อยู่', width: 30 },
        { key: 'sales', header: 'ยอดขาย' },
        { key: 'orderType', header: 'ประเภทการสั่ง' },
        { key: 'salesChannel', header: 'ช่องทางการขาย' },
      ],
      run: async ({ branchId, from, to }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT COALESCE(m.phone, '-') AS phone, m.name, COALESCE(m.address, '-') AS address,
                 SUM(r."grandTotal")::text AS sales,
                 MAX(r."orderType") AS "orderType", MAX(r."salesChannel") AS "salesChannel"
          FROM receipts r JOIN members m ON m.id = r."memberId"
          WHERE r."branchId" = ${branchId}::uuid AND r."businessDay" BETWEEN ${from} AND ${to}
            AND r.status = 'ปกติ'
          GROUP BY m.id, 1, 2, 3 ORDER BY SUM(r."grandTotal") DESC`
        return rows.map((r) => ({ ...r, sales: money(r.sales) }))
      },
    },
    {
      key: 'stock-in-items',
      title: 'รับสินค้าเข้าแสดงรายการ',
      permission: '/report/stockin',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'unitName', header: 'หน่วยบรรจุ' },
        { key: 'docCount', header: 'จำนวนเอกสาร' },
        { key: 'qty', header: 'จำนวนรับเข้า' },
        { key: 'discount', header: 'ส่วนลดรวม' },
        { key: 'total', header: 'รวมมูลค่ารับเข้า' },
      ],
      run: async ({ branchId, from, to, timezone }) => stockDocItems(branchId, from, to, timezone, 'RECEIVE'),
    },
    {
      key: 'stock-out-items',
      title: 'จ่ายสินค้าออกแสดงรายการ',
      permission: '/report/stockout',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'unitName', header: 'หน่วยบรรจุ' },
        { key: 'docCount', header: 'จำนวนเอกสาร' },
        { key: 'qty', header: 'จำนวนจ่ายออก' },
        { key: 'discount', header: 'ส่วนลดรวม' },
        { key: 'total', header: 'รวมมูลค่าจ่ายออก' },
      ],
      run: async ({ branchId, from, to, timezone }) => stockDocItems(branchId, from, to, timezone, 'ISSUE'),
    },
    {
      key: 'stock-out-by-type',
      title: 'สินค้าจ่ายออกตามประเภท',
      permission: '/report/stockOutbyType',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'issueType', header: 'ประเภท' },
        { key: 'qty', header: 'จำนวนจ่ายออก' },
      ],
      run: async ({ branchId, from, to, timezone }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT to_char(d."createdAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
                 di.barcode, di.name, COALESCE(d."issueType", 'ไม่ระบุประเภท') AS "issueType",
                 SUM(di.qty)::text AS qty
          FROM stock_document_items di JOIN stock_documents d ON d.id = di."documentId"
          WHERE d."branchId" = ${branchId}::uuid AND d."docType" = 'ISSUE' AND d.status <> 'ยกเลิก'
            AND to_char(d."createdAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') BETWEEN ${from} AND ${to}
          GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC`
        return rows
      },
    },
    {
      key: 'non-adjusted',
      title: 'สินค้าที่ยังไม่ปรับปรุงสต๊อก',
      permission: '/report/nonadjust',
      columns: [
        { key: 'rank', header: '#' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 40 },
        { key: 'categoryName', header: 'กลุ่มสินค้า' },
        { key: 'unitName', header: 'หน่วยบรรจุ' },
        { key: 'balance', header: 'คงเหลือ' },
      ],
      run: async ({ branchId }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT p.barcode, p.name, COALESCE(c.name, '-') AS "categoryName",
                 CONCAT(COALESCE(pp."skuRatio", 1)::text, ' / ', COALESCE(u.name, '-')) AS "unitName",
                 COALESCE(pp."stockQty"::text, '-') AS balance
          FROM products p
          LEFT JOIN categories c ON c.id = p."categoryId"
          LEFT JOIN units u ON u.id = p."unitId"
          LEFT JOIN product_plus pp ON pp."productId" = p.id AND pp."isDefault" = true
          WHERE p."branchId" = ${branchId}::uuid AND p."deletedAt" IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM stock_movements sm
              WHERE sm."productId" = p.id AND sm."docType" IN ('ADJUST_INC', 'ADJUST_DEC')
            )
          ORDER BY p.name`
        return rows.map((r, i) => ({ rank: i + 1, ...r }))
      },
    },
    {
      key: 'transfers',
      title: 'การโอนและรับสินค้า',
      permission: '/inventory/transfer/transferReport',
      columns: [
        { key: 'day', header: 'วันที่' },
        { key: 'docTypeLabel', header: 'ประเภทเอกสาร' },
        { key: 'fromBranch', header: 'สาขาต้นทาง' },
        { key: 'toBranch', header: 'สาขาปลายทาง' },
        { key: 'barcode', header: 'รหัสสินค้า' },
        { key: 'name', header: 'ชื่อสินค้า', width: 30 },
        { key: 'qty', header: 'จำนวน' },
        { key: 'receivedQty', header: 'จำนวนรับเข้า' },
        { key: 'docNo', header: 'เลขที่เอกสาร' },
        { key: 'refDocNo', header: 'เลขที่เอกสารอ้างอิง' },
        { key: 'receivedAt', header: 'วันที่รับ' },
        { key: 'dueDate', header: 'วันครบกำหนด' },
      ],
      run: async ({ branchId, from, to, timezone }) => {
        const rows = await prisma.$queryRaw<Record<string, string>[]>`
          SELECT to_char(d."createdAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
                 d."docType", COALESCE(bf."branchName", '-') AS "fromBranch",
                 COALESCE(bt."branchName", '-') AS "toBranch",
                 di.barcode, di.name, di.qty::text AS qty,
                 COALESCE(di."receivedQty"::text, '-') AS "receivedQty",
                 d."docNo", COALESCE(d."refDocNo", '-') AS "refDocNo",
                 COALESCE(to_char(d."receivedAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD'), '-') AS "receivedAt",
                 COALESCE(to_char(d."dueDate" AT TIME ZONE ${timezone}, 'YYYY-MM-DD'), '-') AS "dueDate"
          FROM stock_document_items di JOIN stock_documents d ON d.id = di."documentId"
          LEFT JOIN branches bf ON bf.id = d."fromBranchId"
          LEFT JOIN branches bt ON bt.id = d."toBranchId"
          WHERE d."docType" IN ('TRANSFER_OUT', 'TRANSFER_IN', 'RETURN')
            AND (d."branchId" = ${branchId}::uuid OR d."toBranchId" = ${branchId}::uuid)
            AND to_char(d."createdAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') BETWEEN ${from} AND ${to}
          ORDER BY d."createdAt" DESC`
        const labels: Record<string, string> = {
          TRANSFER_OUT: 'โอนออก', TRANSFER_IN: 'รับเข้า', RETURN: 'ตีกลับ',
        }
        return rows.map((r) => ({ ...r, docTypeLabel: labels[r.docType!] ?? r.docType }))
      },
    },
  ]

  for (const report of REPORTS) {
    app.get(`/reports/${report.key}`, { preHandler: app.requirePermission(report.permission) }, async (req, reply) => {
      const query = listQuerySchema.parse(req.query)
      const { branch, from, to, label } = await resolveRange(req)
      const rows = await report.run({
        branchId: req.branchId, from, to, timezone: branch.timezone, search: query.search,
      })

      if (query.export) {
        return sendExport(reply, query.export, report.title, report.columns, rows, {
          title: report.title, subtitle: label,
        })
      }

      const start = (query.page - 1) * query.limit
      return {
        title: report.title,
        columns: report.columns,
        range: { from, to, label },
        data: rows.slice(start, start + query.limit),
        page: query.page,
        limit: query.limit,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / query.limit)),
      }
    })
  }

  /** รายการรายงานทั้งหมด — UI ใช้สร้างเมนู */
  app.get('/reports', { preHandler: app.withBranch }, async () =>
    REPORTS.map((r) => ({ key: r.key, title: r.title, permission: r.permission, columns: r.columns })),
  )

  /** รายละเอียดบิลยกเลิก (expand ใต้แถวในรายงานยกเลิกการขาย) */
  app.get('/reports/voids/:day', { preHandler: app.requirePermission('/report/voidbill') }, async (req) => {
    const { day } = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.params)
    const receipts = await prisma.receipt.findMany({
      where: { branchId: req.branchId, businessDay: day, status: 'ยกเลิก' },
      include: { items: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { soldAt: 'asc' },
    })
    return receipts.flatMap((r) =>
      r.items.map((i) => ({
        receiptNo: r.receiptNo,
        barcode: i.barcode,
        name: i.name,
        qty: i.qty.toString(),
        unitPrice: i.unitPrice.toFixed(2),
        subtotal: i.subtotal.toFixed(2),
        discount: i.itemDiscount.toFixed(2),
        net: i.net.toFixed(2),
        voidedBy: r.voidedBy,
        voidedAt: r.voidedAt,
        voidReason: r.voidReason,
      })),
    )
  })
}

/** รายงานรับเข้า/จ่ายออกแสดงรายการ (รวมตามสินค้า) */
async function stockDocItems(
  branchId: string, from: string, to: string, timezone: string, docType: 'RECEIVE' | 'ISSUE',
) {
  const rows = await prisma.$queryRaw<Record<string, string>[]>`
    SELECT di.barcode, di.name,
           CONCAT(COALESCE(di."unitName", '-'), ' / ', di.ratio::text) AS "unitName",
           COUNT(DISTINCT d.id)::text AS "docCount",
           SUM(di.qty)::text AS qty,
           SUM(di.discount)::text AS discount,
           SUM(di."lineTotal")::text AS total
    FROM stock_document_items di JOIN stock_documents d ON d.id = di."documentId"
    WHERE d."branchId" = ${branchId}::uuid AND d."docType" = ${docType} AND d.status <> 'ยกเลิก'
      AND to_char(d."createdAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') BETWEEN ${from} AND ${to}
    GROUP BY 1, 2, 3 ORDER BY 2`
  return rows.map((r, i) => ({
    rank: i + 1, ...r,
    discount: new Prisma.Decimal(r.discount ?? 0).toFixed(2),
    total: new Prisma.Decimal(r.total ?? 0).toFixed(2),
  }))
}

export default routes
