'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { useShell } from '@/components/admin/Shell'
import { Badge, Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { baht, dateTimeTH, qty } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Receipt {
  id: string
  receiptNo: string
  soldAt: string
  status: 'ปกติ' | 'ยกเลิก'
  subtotal: string
  discountTotal: string
  promotionDiscount: string
  grandTotal: string
  vatableAmount: string
  nonVatableAmount: string
  amountBeforeVat: string
  vatAmount: string
  optionTotal: string
  serviceCharge: string
  rounding: string
  deliveryFee: string
  voidReason?: string | null
  voidedBy?: string | null
  cashier?: { name: string } | null
  member?: { name: string } | null
}

interface ReceiptDetail extends Receipt {
  items: {
    id: string; barcode: string | null; name: string; qty: string; unitPrice: string
    itemDiscount: string; subtotal: string; net: string
  }[]
  payments: { id: string; method: string; amount: string; received: string; change: string }[]
  posDevice?: { posNumber: string } | null
}

interface ListResponse {
  data: Receipt[]
  page: number
  limit: number
  total: number
  totalPages: number
  summary: { _sum: { grandTotal: string | null; discountTotal: string | null; subtotal: string | null; profit: string | null }; _count: number }
  range: { from: string; to: string }
}

export default function TransactionPage() {
  const { range } = useShell()
  const can = useCan()
  const qc = useQueryClient()
  const branchId = typeof window === 'undefined' ? null : session.branchId

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [status, setStatus] = useState<'' | 'ปกติ' | 'ยกเลิก'>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Receipt | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['receipts', branchId, range.from, range.to, page, limit, applied, status],
    queryFn: () =>
      api<ListResponse>('/receipts', {
        query: { from: range.from, to: range.to, page, limit, search: applied || undefined, status: status || undefined },
      }),
    enabled: Boolean(branchId),
  })

  const detail = useQuery({
    queryKey: ['receipt', expanded],
    queryFn: () => api<ReceiptDetail>(`/receipts/${expanded}`),
    enabled: Boolean(expanded),
  })

  const voidMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api(`/receipts/${input.id}/void`, { method: 'POST', body: { reason: input.reason } }),
    onSuccess: () => {
      setVoidTarget(null)
      setVoidReason('')
      setError(null)
      void qc.invalidateQueries({ queryKey: ['receipts'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ยกเลิกบิลไม่สำเร็จ'),
  })

  if (list.error instanceof ApiError && list.error.isForbidden) return <NoAccess />
  if (list.isLoading) return <Spinner />
  const data = list.data
  if (!data) return <EmptyState />

  const canVoid = can('/report/transaction', 'remove').allowed
  const canExport = can('/report/transaction', 'export').allowed

  const columns = [
    'วันที่', 'เลขที่บิล', 'รวมก่อนลด', 'ส่วนลด', 'ส่วนลดโปรโมชัน', 'ยอดขาย',
    'สินค้ามีภาษี', 'สินค้าไม่มีภาษี', 'มูลค่าก่อน VAT', 'คิดเป็นมูลค่าภาษี',
    'มูลค่าตัวเลือก', 'ค่าบริการ', 'ปัดเศษ', 'ค่าจัดส่ง', 'สถานะ',
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="ประวัติการขาย"
        subtitle={`วันที่ ${range.from} ถึง ${range.to}`}
        actions={
          canExport ? (
            <button
              type="button" className="btn-info"
              onClick={() => downloadExport('/receipts', { from: range.from, to: range.to }, 'ประวัติการขาย')}
            >
              ส่งออกไฟล์
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="py-3"><p className="text-xs text-slate-500">จำนวนบิล</p><p className="text-lg font-semibold tabular-nums">{data.summary._count}</p></Card>
        <Card className="py-3"><p className="text-xs text-slate-500">รวมก่อนลด</p><p className="text-lg font-semibold tabular-nums">{baht(data.summary._sum.subtotal)}</p></Card>
        <Card className="py-3"><p className="text-xs text-slate-500">ส่วนลด</p><p className="text-lg font-semibold tabular-nums text-danger">{baht(data.summary._sum.discountTotal)}</p></Card>
        <Card className="py-3"><p className="text-xs text-slate-500">ยอดขาย</p><p className="text-lg font-semibold tabular-nums text-brand">{baht(data.summary._sum.grandTotal)}</p></Card>
      </div>

      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search) }}
        >
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="tx-search">เลขที่บิล</label>
            <input id="tx-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PS002006889" />
          </div>
          <div>
            <label className="label" htmlFor="tx-status">สถานะ</label>
            <select id="tx-status" className="input w-32" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }}>
              <option value="">ทั้งหมด</option>
              <option value="ปกติ">ปกติ</option>
              <option value="ยกเลิก">ยกเลิก</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">ค้นหา</button>
          <div>
            <label className="label" htmlFor="tx-limit">แสดง</label>
            <select id="tx-limit" className="input w-24" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1) }}>
              {[10, 20, 30, 40, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </form>

        <div className="table-wrap">
          <table className="table">
            <thead><tr>{columns.map((c) => <th key={c} className={c === 'วันที่' || c === 'เลขที่บิล' || c === 'สถานะ' ? undefined : 'text-right'}>{c}</th>)}</tr></thead>
            <tbody>
              {data.data.map((r) => {
                const voided = r.status === 'ยกเลิก'
                const isOpen = expanded === r.id
                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className={clsx('cursor-pointer', voided && 'text-danger')}
                    >
                      <td>{dateTimeTH(r.soldAt)}</td>
                      <td className="font-medium">{r.receiptNo}</td>
                      <td className="num">{baht(r.subtotal)}</td>
                      <td className="num">{baht(r.discountTotal)}</td>
                      <td className="num">{baht(r.promotionDiscount)}</td>
                      <td className="num font-semibold">{baht(r.grandTotal)}</td>
                      <td className="num">{baht(r.vatableAmount)}</td>
                      <td className="num">{baht(r.nonVatableAmount)}</td>
                      <td className="num">{baht(r.amountBeforeVat)}</td>
                      <td className="num">{baht(r.vatAmount)}</td>
                      <td className="num">{baht(r.optionTotal)}</td>
                      <td className="num">{baht(r.serviceCharge)}</td>
                      <td className="num">{baht(r.rounding)}</td>
                      <td className="num">{baht(r.deliveryFee)}</td>
                      <td><Badge tone={voided ? 'red' : 'green'}>{r.status}</Badge></td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${r.id}-detail`} className="bg-slate-50 dark:bg-slate-900/60">
                        <td colSpan={columns.length} className="!whitespace-normal p-4">
                          {detail.isLoading || !detail.data ? (
                            <Spinner label="กำลังโหลดรายละเอียดบิล…" />
                          ) : (
                            <div className="space-y-4">
                              <h3 className="text-sm font-semibold">รายการสินค้า</h3>
                              <div className="table-wrap bg-white dark:bg-slate-900">
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th>เลขที่บิล</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
                                      <th className="text-right">จำนวน</th><th className="text-right">ราคาขาย/หน่วย</th>
                                      <th className="text-right">ส่วนลดรายการ</th><th className="text-right">รวมก่อนลด</th>
                                      <th className="text-right">ยอดสุทธิ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.data.items.map((item) => (
                                      <tr key={item.id}>
                                        <td>{detail.data!.receiptNo}</td>
                                        <td>{item.barcode ?? '-'}</td>
                                        <td className="max-w-[260px] truncate" title={item.name}>{item.name}</td>
                                        <td className="num">{qty(item.qty)}</td>
                                        <td className="num">{baht(item.unitPrice)}</td>
                                        <td className="num">{baht(item.itemDiscount)}</td>
                                        <td className="num">{baht(item.subtotal)}</td>
                                        <td className="num font-medium">{baht(item.net)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2">
                                <dl className="space-y-1 text-sm">
                                  <div className="flex justify-between"><dt className="text-slate-500">ส่วนลด</dt><dd className="tabular-nums">{baht(detail.data.discountTotal)}</dd></div>
                                  <div className="flex justify-between"><dt className="text-slate-500">ส่วนลดโปรโมชัน</dt><dd className="tabular-nums">{baht(detail.data.promotionDiscount)}</dd></div>
                                  <div className="flex justify-between"><dt className="text-slate-500">ค่าบริการ</dt><dd className="tabular-nums">{baht(detail.data.serviceCharge)}</dd></div>
                                  {detail.data.member ? (
                                    <div className="flex justify-between"><dt className="text-slate-500">สมาชิก</dt><dd>{detail.data.member.name}</dd></div>
                                  ) : null}
                                  {detail.data.cashier ? (
                                    <div className="flex justify-between"><dt className="text-slate-500">พนักงาน</dt><dd>{detail.data.cashier.name}</dd></div>
                                  ) : null}
                                </dl>

                                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                                  <p className="mb-2 text-sm font-medium">การชำระเงิน</p>
                                  {detail.data.payments.map((p) => (
                                    <div key={p.id} className="flex justify-between text-sm">
                                      <span className="text-slate-500">{p.method}</span>
                                      <span className="tabular-nums">{baht(p.amount)}</span>
                                    </div>
                                  ))}
                                  <div className="mt-1 flex justify-between text-sm">
                                    <span className="text-slate-500">เงินทอน</span>
                                    <span className="tabular-nums">{baht(detail.data.payments[0]?.change ?? 0)}</span>
                                  </div>
                                </div>
                              </div>

                              {voided ? (
                                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">
                                  ยกเลิกโดย {detail.data.voidedBy ?? '-'} · เหตุผล: {detail.data.voidReason ?? '-'}
                                </p>
                              ) : null}

                              <div className="flex flex-wrap gap-2">
                                <a
                                  className="btn-ghost"
                                  href={`/print/receipt/${detail.data.id}?back=/admin/report/transaction`}
                                >
                                  พิมพ์ใบกำกับภาษีอย่างย่อ
                                </a>
                                {canVoid && !voided ? (
                                  <button type="button" className="btn-danger" onClick={() => setVoidTarget(r)}>
                                    ยกเลิกบิล
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </>
                )
              })}
            </tbody>
          </table>
          {data.data.length === 0 ? <EmptyState /> : null}
        </div>

        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
      </Card>

      <Modal
        open={Boolean(voidTarget)}
        onClose={() => { setVoidTarget(null); setError(null) }}
        title={`ยกเลิกบิล ${voidTarget?.receiptNo ?? ''}`}
        size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setVoidTarget(null)}>ยกเลิก</button>
            <button
              className="btn-danger"
              disabled={!voidReason.trim() || voidMutation.isPending}
              onClick={() => voidTarget && voidMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() })}
            >
              {voidMutation.isPending ? 'กำลังยกเลิก…' : 'ยืนยันการยกเลิก'}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          บิลที่ยกเลิกจะไม่ถูกนับในยอดขาย สต็อกและคะแนนสมาชิกจะถูกคืนกลับ และเลขบิลนี้จะไม่ถูกนำมาใช้ซ้ำ
        </p>
        <label className="label" htmlFor="void-reason">เหตุผลในการยกเลิก *</label>
        <input
          id="void-reason" className="input" value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder="เช่น ลูกค้าเปลี่ยนใจ / คิดเงินผิด"
        />
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </Modal>
    </div>
  )
}
