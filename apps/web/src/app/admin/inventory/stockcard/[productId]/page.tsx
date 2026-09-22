'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { api, ApiError, downloadExport } from '@/lib/api'
import { Badge, Card, EmptyState, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { dateTimeTH, qty } from '@/lib/format'

interface Movement {
  id: string
  occurredAt: string
  docNo: string
  docType: string
  docTypeLabel: string
  qty: string
  balanceAfter: string
  actorName: string | null
  note: string | null
}

const TONE: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  RECEIVE: 'green', VOID: 'green', ADJUST_INC: 'green', TRANSFER_IN: 'green', RETURN: 'green',
  SALE: 'red', ISSUE: 'red', ADJUST_DEC: 'red', TRANSFER_OUT: 'red',
}

export default function StockCardPage() {
  const params = useParams<{ productId: string }>()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['stock-movements', params.productId, page],
    queryFn: () =>
      api<{
        product: { id: string; name: string; barcode: string | null }
        data: Movement[]; page: number; limit: number; total: number; totalPages: number
      }>(`/stock/movements/${params.productId}`, { query: { page, limit: 50 } }),
    enabled: Boolean(params.productId),
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const data = query.data
  if (!data) return <EmptyState />

  return (
    <div className="space-y-4">
      <PageHeader
        title={`ชื่อสินค้า : ${data.product.name}`}
        subtitle={data.product.barcode ? `รหัสสินค้า ${data.product.barcode}` : undefined}
        actions={
          <>
            <Link href="/admin/inventory/stockcard" className="btn-ghost">← กลับ</Link>
            <button
              type="button" className="btn-info"
              onClick={() => downloadExport(`/stock/movements/${params.productId}`, {}, `ความเคลื่อนไหว-${data.product.name}`)}
            >
              ส่งออกไฟล์
            </button>
          </>
        }
      />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่</th><th>เลขที่เอกสาร</th><th>ประเภท</th>
                <th className="text-right">จำนวน</th><th className="text-right">คงเหลือหลังรายการ</th>
                <th>ปรับปรุงโดย</th><th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((m) => (
                <tr key={m.id}>
                  <td>{dateTimeTH(m.occurredAt)}</td>
                  <td className="font-medium">{m.docNo}</td>
                  <td><Badge tone={TONE[m.docType] ?? 'slate'}>{m.docTypeLabel}</Badge></td>
                  <td className={`num ${Number(m.qty) < 0 ? 'text-danger' : 'text-brand'}`}>
                    {Number(m.qty) > 0 ? '+' : ''}{qty(m.qty)}
                  </td>
                  <td className="num font-medium">{qty(m.balanceAfter)}</td>
                  <td>{m.actorName ?? '-'}</td>
                  <td className="max-w-[240px] truncate" title={m.note ?? ''}>{m.note ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 ? <EmptyState message="ยังไม่มีการเคลื่อนไหว" /> : null}
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
      </Card>
    </div>
  )
}
