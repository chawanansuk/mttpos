'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, EmptyState, NoAccess, PageHeader, Spinner } from '@/components/ui'
import { baht, dateTimeTH } from '@/lib/format'
import { useRealtime } from '@/hooks/useRealtime'

interface OpenBill {
  id: string
  refNo: string
  openedAt: string
  updatedAt: string
  note: string | null
  tableNo: string | null
  table?: { tableNo: string } | null
  totals: Record<string, string>
}

export default function CurrentBillPage() {
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const query = useQuery({
    queryKey: ['open-bills', branchId],
    queryFn: () => api<{ data: OpenBill[]; total: number }>('/open-bills'),
    enabled: Boolean(branchId),
  })

  // บิลที่เปิดอยู่ต้องอัปเดตทันทีเมื่อเครื่องขายพักบิลหรือปิดบิล
  const { lastEvent } = useRealtime(branchId)
  useEffect(() => {
    if (lastEvent?.event === 'open_bill.updated' || lastEvent?.event === 'receipt.created') {
      void query.refetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent])

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />

  const rows = query.data?.data ?? []
  const columns = [
    'วันที่', 'วันที่อัปเดต', 'เลขที่รายการ', 'รวมก่อนลด', 'ส่วนลด', 'ยอดขาย',
    'สินค้ามีภาษี', 'สินค้าไม่มีภาษี', 'โต๊ะ', 'หมายเหตุท้ายบิล', 'สถานะ',
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="บิลที่เปิดอยู่" subtitle={`${rows.length} รายการ · อัปเดตอัตโนมัติ`} />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((bill) => (
                <tr key={bill.id}>
                  <td>{dateTimeTH(bill.openedAt)}</td>
                  <td>{dateTimeTH(bill.updatedAt)}</td>
                  <td className="font-medium">{bill.refNo}</td>
                  <td className="num">{baht(bill.totals?.subtotal)}</td>
                  <td className="num">{baht(bill.totals?.discountTotal)}</td>
                  <td className="num font-semibold">{baht(bill.totals?.grandTotal)}</td>
                  <td className="num">{baht(bill.totals?.vatableAmount)}</td>
                  <td className="num">{baht(bill.totals?.nonVatableAmount)}</td>
                  <td>{bill.table?.tableNo ?? bill.tableNo ?? '-'}</td>
                  <td>{bill.note ?? '-'}</td>
                  <td>เปิดอยู่</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyState /> : null}
        </div>
      </Card>
    </div>
  )
}
