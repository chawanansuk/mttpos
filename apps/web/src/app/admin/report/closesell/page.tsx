'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { useShell } from '@/components/admin/Shell'
import { Badge, Card, EmptyState, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { baht, dateTimeTH } from '@/lib/format'

interface Round {
  id: string
  openedAt: string
  posNumber: string
  roundNo: number
  closedAt: string | null
  openedByName: string | null
  openingCash: string
  cashSales: string
  cashIn: string
  cashOut: string
  expectedCash: string
  countedCash: string | null
  difference: string | null
  status: 'open' | 'closed'
}

export default function CloseSellPage() {
  const { range } = useShell()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['cash-rounds', branchId, range.from, range.to, page],
    queryFn: () =>
      api<{ data: Round[]; page: number; limit: number; total: number; totalPages: number }>('/cash-rounds', {
        query: { from: range.from, to: range.to, page, limit: 50 },
      }),
    enabled: Boolean(branchId),
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const data = query.data
  if (!data) return <EmptyState />

  return (
    <div className="space-y-4">
      <PageHeader
        title="ปิดรอบการขาย"
        subtitle={`วันที่ ${range.from} ถึง ${range.to}`}
        actions={
          <button
            type="button" className="btn-info"
            onClick={() => downloadExport('/cash-rounds', { from: range.from, to: range.to }, 'ปิดรอบการขาย')}
          >
            ส่งออกไฟล์
          </button>
        }
      />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th><th>เครื่อง Order</th><th>รอบการขายที่</th><th>เวลาปิดรอบการขาย</th>
                <th>ปิดรอบขายโดย</th>
                <th className="text-right">ยอดขายด้วยเงินสด</th>
                <th className="text-right">เงินทอนเริ่มต้น</th>
                <th className="text-right">เงินเข้า</th>
                <th className="text-right">เงินออก</th>
                <th className="text-right">นับได้ในลิ้นชัก</th>
                <th className="text-right">ควรมีในลิ้นชัก</th>
                <th className="text-right">ส่วนต่าง</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td>{dateTimeTH(r.openedAt)}</td>
                  <td>{r.posNumber}</td>
                  <td>{r.roundNo}</td>
                  <td>{r.closedAt ? dateTimeTH(r.closedAt) : '-'}</td>
                  <td>{r.openedByName ?? '-'}</td>
                  <td className="num">{baht(r.cashSales)}</td>
                  <td className="num">{baht(r.openingCash)}</td>
                  <td className="num">{baht(r.cashIn)}</td>
                  <td className="num">{baht(r.cashOut)}</td>
                  <td className="num">{r.countedCash ? baht(r.countedCash) : '-'}</td>
                  <td className="num">{baht(r.expectedCash)}</td>
                  <td className={`num ${Number(r.difference ?? 0) < 0 ? 'text-danger' : ''}`}>
                    {r.difference ? baht(r.difference) : '-'}
                  </td>
                  <td>
                    <Badge tone={r.status === 'open' ? 'amber' : 'green'}>
                      {r.status === 'open' ? 'เปิดอยู่' : 'ปิดแล้ว'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 ? <EmptyState /> : null}
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
      </Card>
    </div>
  )
}
