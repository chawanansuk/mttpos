'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, ApiError, session } from '@/lib/api'
import { useShell } from '@/components/admin/Shell'
import { Card, EmptyState, NoAccess, PageHeader, Spinner } from '@/components/ui'
import { baht, intNumber, qty } from '@/lib/format'
import { useRealtime } from '@/hooks/useRealtime'

interface Dashboard {
  range: { from: string; to: string; label: string }
  cards: { sales: string; profit: string; discount: string }
  bills: { total: number; averagePerBill: string; voidCount: number; voidAmount: string }
  summary: {
    subtotal: string; billDiscount: string; vatableAmount: string; nonVatableAmount: string
    vatAmount: string; serviceCharge: string; grandTotal: string; vatRate: string
  }
  payments: { method: string; amount: string }[]
  chart: { mode: 'hourly' | 'daily'; points: { label: string; amount: string }[] }
  topProducts: { rank: number; name: string; barcode: string | null; qty: string; amount: string }[]
  topCategories: { rank: number; name: string; qty: string; amount: string }[]
  stock: { totalQty: string; totalCost: string; totalSaleValue: string }
}

const DONUT_COLORS = ['#2EB88A', '#3B8BEB', '#F5A623', '#F44336', '#9C27B0', '#607D8B']

function StatCard({
  label, value, tone, icon,
}: { label: string; value: string; tone: 'green' | 'blue' | 'red'; icon: string }) {
  const bars = { green: 'bg-brand', blue: 'bg-info', red: 'bg-danger' }
  const texts = { green: 'text-brand', blue: 'text-info', red: 'text-danger' }
  return (
    <div className="card relative flex items-center gap-4 overflow-hidden p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${bars[tone]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-1 truncate text-2xl font-semibold tabular-nums ${texts[tone]}`}>{baht(value)}</p>
      </div>
      <span className="text-3xl opacity-20" aria-hidden>{icon}</span>
    </div>
  )
}

export default function DashboardPage() {
  const { range } = useShell()
  const branchId = typeof window === 'undefined' ? null : session.branchId

  const query = useQuery({
    queryKey: ['dashboard', branchId, range.from, range.to],
    queryFn: () => api<Dashboard>('/reports/dashboard', { query: { from: range.from, to: range.to } }),
    enabled: Boolean(branchId),
  })

  // ยอดวันนี้อัปเดตทันทีเมื่อมีบิลใหม่จากเครื่องขาย
  const { lastEvent } = useRealtime(branchId)
  useEffect(() => {
    if (lastEvent?.event === 'receipt.created' || lastEvent?.event === 'receipt.voided') {
      void query.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent])

  if (query.isLoading) return <Spinner />
  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (!query.data) return <EmptyState message="ไม่สามารถโหลดรายงานสรุปได้" />

  const d = query.data
  const chartData = d.chart.points.map((p) => ({ label: p.label, amount: Number(p.amount) }))
  const paymentData = d.payments.map((p) => ({ name: p.method, value: Number(p.amount) }))

  return (
    <div className="space-y-4">
      <PageHeader title="รายงานสรุป" subtitle={d.range.label} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="ยอดขาย" value={d.cards.sales} tone="green" icon="💵" />
        <StatCard label="กำไร" value={d.cards.profit} tone="blue" icon="📈" />
        <StatCard label="ส่วนลด" value={d.cards.discount} tone="red" icon="🏷️" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">การชำระเงิน</h2>
          {paymentData.length ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                      {paymentData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => baht(v)} />
                    <Legend verticalAlign="bottom" height={24} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">จำนวนบิล</h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">รวมทั้งสิ้น</dt><dd className="font-medium tabular-nums">{intNumber(d.bills.total)} บิล</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">เฉลี่ย/บิล</dt><dd className="font-medium tabular-nums">{baht(d.bills.averagePerBill)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ยกเลิก</dt><dd className="font-medium tabular-nums text-danger">{intNumber(d.bills.voidCount)} บิล</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">มูลค่าการยกเลิก</dt><dd className="font-medium tabular-nums text-danger">{baht(d.bills.voidAmount)}</dd></div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">สรุปยอด</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">รวมก่อนลด</dt><dd className="tabular-nums">{baht(d.summary.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ส่วนลดท้ายบิล</dt><dd className="tabular-nums">-{baht(d.summary.billDiscount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">สินค้ามีภาษี</dt><dd className="tabular-nums">{baht(d.summary.vatableAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">สินค้าไม่มีภาษี</dt><dd className="tabular-nums">{baht(d.summary.nonVatableAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">คิดเป็นมูลค่าภาษี {d.summary.vatRate}%</dt><dd className="tabular-nums">{baht(d.summary.vatAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ค่าบริการ</dt><dd className="tabular-nums">{baht(d.summary.serviceCharge)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold dark:border-slate-800">
              <dt>ยอดขาย</dt><dd className="tabular-nums text-brand">{baht(d.summary.grandTotal)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-500">จำนวนสินค้าคงเหลือ</p><p className="mt-1 text-xl font-semibold tabular-nums">{qty(d.stock.totalQty)} ชิ้น</p></Card>
        <Card><p className="text-sm text-slate-500">มูลค่าต้นทุนรวม</p><p className="mt-1 text-xl font-semibold tabular-nums">{baht(d.stock.totalCost)} บาท</p></Card>
        <Card><p className="text-sm text-slate-500">มูลค่าสินค้าคงเหลือ</p><p className="mt-1 text-xl font-semibold tabular-nums">{baht(d.stock.totalSaleValue)} บาท</p></Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">
          {d.chart.mode === 'hourly' ? 'ยอดขายแยกตามช่วงเวลา' : 'ยอดขายรายวัน'}
        </h2>
        {chartData.length ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(v) => intNumber(v)} />
                <Tooltip formatter={(v: number) => [baht(v), 'ยอดขาย']} />
                <Bar dataKey="amount" fill="#2EB88A" radius={[4, 4, 0, 0]} isAnimationActive={false} minPointSize={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">สินค้าขายดี</h2>
            <a href="/admin/report/by-sku" className="text-xs text-brand hover:underline">ดูเพิ่มเติม →</a>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ลำดับ</th><th>ชื่อสินค้า</th><th className="text-right">จำนวน</th><th className="text-right">ยอดขาย</th></tr></thead>
              <tbody>
                {d.topProducts.map((p) => (
                  <tr key={`${p.rank}-${p.barcode}`}>
                    <td>{p.rank}</td>
                    <td className="max-w-[240px] truncate" title={p.name}>{p.name}</td>
                    <td className="num">{qty(p.qty)}</td>
                    <td className="num">{baht(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.topProducts.length === 0 ? <EmptyState /> : null}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">ประเภทสินค้าขายดี</h2>
            <a href="/admin/report/by-category" className="text-xs text-brand hover:underline">ดูเพิ่มเติม →</a>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ลำดับ</th><th>ชื่อประเภท</th><th className="text-right">จำนวน</th><th className="text-right">ยอดขาย</th></tr></thead>
              <tbody>
                {d.topCategories.map((c) => (
                  <tr key={c.rank}>
                    <td>{c.rank}</td>
                    <td>{c.name}</td>
                    <td className="num">{qty(c.qty)}</td>
                    <td className="num">{baht(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.topCategories.length === 0 ? <EmptyState /> : null}
          </div>
        </Card>
      </div>
    </div>
  )
}
