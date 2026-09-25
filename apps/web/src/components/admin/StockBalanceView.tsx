'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { Badge, Card, EmptyState, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { qty } from '@/lib/format'

interface BalanceRow {
  productId: string
  barcode: string
  name: string
  unitName: string
  categoryName: string
  balance: string
  status: 'never_moved' | 'out_of_stock' | 'low_stock' | 'ok'
}

const STATUS_LABEL: Record<BalanceRow['status'], string> = {
  never_moved: 'ยังไม่มีการเคลื่อนไหว',
  out_of_stock: 'สินค้าหมด',
  low_stock: 'สินค้าเหลือน้อย',
  ok: 'ปกติ',
}

/**
 * ใช้ร่วมกันโดยหน้า สินค้าคงเหลือตาม SKU / ตามขนาดบรรจุ / มี Serial No. / เหลือน้อย / หมด
 * (หัวข้อ 6.7) — ต่างกันแค่พารามิเตอร์ by และ filter
 */
export function StockBalanceView({
  title, by = 'sku', filter = 'all',
}: {
  title: string
  by?: 'sku' | 'plu'
  filter?: 'all' | 'low' | 'out' | 'never' | 'serial'
}) {
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [searchBy, setSearchBy] = useState('all')
  const [sort, setSort] = useState('name')

  const query = useQuery({
    queryKey: ['stock-balance', branchId, by, filter, page, applied, searchBy, sort],
    queryFn: () =>
      api<{ data: BalanceRow[]; page: number; limit: number; total: number; totalPages: number }>('/stock/balance', {
        query: { by, filter, page, limit: 50, search: applied || undefined, searchBy, sort },
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
        title={title}
        subtitle={`${data.total.toLocaleString()} รายการ`}
        actions={
          <button
            type="button" className="btn-info"
            onClick={() => downloadExport('/stock/balance', { by, filter, search: applied || undefined }, title)}
          >
            ส่งออกไฟล์
          </button>
        }
      />

      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search) }}
        >
          <div>
            <label className="label" htmlFor="sb-by">ค้นหาจาก</label>
            <select id="sb-by" className="input w-44" value={searchBy} onChange={(e) => setSearchBy(e.target.value)}>
              <option value="all">สินค้าทั้งหมด</option>
              <option value="name">ชื่อสินค้า</option>
              <option value="code">รหัสสินค้า</option>
              <option value="category">กลุ่มสินค้า</option>
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="sb-q">คำค้นหา</label>
            <input id="sb-q" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="กรุณาเลือกหมวดหมู่การค้นหา" />
          </div>
          <div>
            <label className="label" htmlFor="sb-sort">เรียงโดย</label>
            <select id="sb-sort" className="input w-40" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
              <option value="name">ชื่อสินค้า</option>
              <option value="code">รหัสสินค้า</option>
              <option value="category">กลุ่มสินค้า</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">ค้นหา</button>
        </form>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วยบรรจุ</th>
                <th>กลุ่มสินค้า</th><th className="text-right">คงเหลือ</th><th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, i) => (
                <tr key={`${row.productId}-${row.barcode}`}>
                  <td>{(data.page - 1) * data.limit + i + 1}</td>
                  <td>{row.barcode || '-'}</td>
                  <td className="max-w-[320px] truncate" title={row.name}>
                    <Link href={`/admin/inventory/stockcard/${row.productId}`} className="hover:text-brand hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td>{row.unitName || '-'}</td>
                  <td>{row.categoryName || '-'}</td>
                  <td className={`num ${Number(row.balance) < 0 ? 'text-danger' : ''}`}>
                    {row.status === 'never_moved' ? '-' : qty(row.balance)}
                  </td>
                  <td>
                    {row.status === 'ok' ? (
                      <Badge tone="green">ปกติ</Badge>
                    ) : (
                      <Badge tone={row.status === 'out_of_stock' ? 'red' : row.status === 'low_stock' ? 'amber' : 'slate'}>
                        {STATUS_LABEL[row.status]}
                      </Badge>
                    )}
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
