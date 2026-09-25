'use client'

import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { Badge, Card, EmptyState, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { baht, qty } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface ProductRow {
  id: string
  name: string
  barcode: string | null
  skuCode: string | null
  price: string
  stdCost: string
  skuType: 'P' | 'BOM' | 'SN' | 'SV'
  vatType: 'V' | 'N'
  color: string
  imagePath: string | null
  favorite: boolean
  stockQty: string
  pluCount: number
  hasStepPrice: boolean
  category: { id: string; name: string; bgColor: string } | null
  unit: { id: string; name: string } | null
}

const SKU_TYPE_LABEL: Record<string, string> = {
  P: 'สินค้าทั่วไป', BOM: 'สินค้าประกอบ (BOM)', SN: 'สินค้ามี Serial', SV: 'สินค้าบริการ',
}

export default function ProductListPage() {
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const can = useCan()
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [searchBy, setSearchBy] = useState('all')
  const [sort, setSort] = useState('name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')

  const query = useQuery({
    queryKey: ['products', branchId, page, applied, searchBy, sort, order],
    queryFn: () =>
      api<{ data: ProductRow[]; page: number; limit: number; total: number; totalPages: number }>('/products', {
        query: { page, limit: 50, search: applied || undefined, searchBy, sort, order },
      }),
    enabled: Boolean(branchId),
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const data = query.data
  if (!data) return <EmptyState />

  const canEdit = can('/product', 'edit').allowed
  const canExport = can('/product', 'export').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="การจัดการสินค้า"
        subtitle={`สินค้า ${data.total.toLocaleString()} รายการ`}
        actions={
          <>
            {canExport ? (
              <button type="button" className="btn-info" onClick={() => downloadExport('/products', { search: applied || undefined }, 'รายการสินค้า')}>
                ส่งออกไฟล์
              </button>
            ) : null}
            {canEdit ? (
              <>
                <Link href="/admin/product/importProduct" className="btn-ghost">นำเข้ารายการสินค้า</Link>
                <Link href="/admin/product/new" className="btn-primary">+ เพิ่มสินค้า</Link>
              </>
            ) : null}
          </>
        }
      />

      <div className="rounded-card bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
        ศูนย์กลางในการควบคุมข้อมูลสินค้าทั้งหมดภายในระบบ ช่วยให้ผู้ใช้สามารถเพิ่ม แก้ไข และจัดการสินค้าภายในร้านค้าได้อย่างมีประสิทธิภาพ
      </div>

      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search) }}
        >
          <div>
            <label className="label" htmlFor="p-by">ค้นหาจาก</label>
            <select id="p-by" className="input w-44" value={searchBy} onChange={(e) => setSearchBy(e.target.value)}>
              <option value="all">สินค้าทั้งหมด</option>
              <option value="name">ชื่อสินค้า</option>
              <option value="code">รหัสสินค้า</option>
              <option value="category">กลุ่มสินค้า</option>
              <option value="type">ประเภทสินค้า</option>
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="p-q">คำค้นหา</label>
            <input id="p-q" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="กรุณาเลือกหมวดหมู่การค้นหา" />
          </div>
          <button type="submit" className="btn-primary">ค้นหา</button>

          <div>
            <label className="label" htmlFor="p-sort">เรียงโดย</label>
            <div className="flex gap-1">
              <select id="p-sort" className="input w-36" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}>
                <option value="name">ชื่อสินค้า</option>
                <option value="latest">ล่าสุด</option>
                <option value="category">กลุ่มสินค้า</option>
                <option value="price">ราคาสินค้า</option>
              </select>
              <select className="input w-20" value={order} onChange={(e) => setOrder(e.target.value as 'asc' | 'desc')} aria-label="ลำดับ">
                <option value="asc">A→Z</option>
                <option value="desc">Z→A</option>
              </select>
            </div>
          </div>

          <div className="ml-auto flex items-end gap-1">
            <button type="button" onClick={() => setView('list')} className={clsx('btn h-10 w-10 px-0', view === 'list' ? 'bg-brand text-white' : 'btn-ghost')} aria-label="มุมมองรายการ">☰</button>
            <button type="button" onClick={() => setView('grid')} className={clsx('btn h-10 w-10 px-0', view === 'grid' ? 'bg-brand text-white' : 'btn-ghost')} aria-label="มุมมองกริด">▦</button>
          </div>
        </form>

        {view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {data.data.map((p) => (
              <Link
                key={p.id}
                href={`/admin/product/${p.id}`}
                className="group overflow-hidden rounded-card border border-slate-100 bg-white transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="relative flex h-24 items-center justify-center" style={{ background: p.color }}>
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {p.skuType}
                  </span>
                  {p.favorite ? <span className="absolute left-1.5 top-1.5 text-sm">⭐</span> : null}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium" title={p.name}>{p.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {p.unit?.name ?? '-'} · {p.category?.name ?? '-'}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-brand">฿ {baht(p.price)}</span>
                    {p.vatType === 'V' ? <Badge tone="amber">VAT</Badge> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th></th><th>สินค้า</th><th>กลุ่มสินค้า</th>
                  <th className="text-right">ราคาสินค้า</th><th className="text-right">คงเหลือ</th>
                  <th>ประเภทสินค้า</th><th>ประเภทภาษี</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id} className="cursor-pointer">
                    <td><span className="block h-7 w-7 rounded" style={{ background: p.color }} /></td>
                    <td>
                      <Link href={`/admin/product/${p.id}`} className="font-medium hover:text-brand hover:underline">
                        {p.name} <span className="text-xs text-slate-400">( {p.unit?.name ?? '-'} )</span>
                      </Link>
                      {p.barcode ? <p className="text-xs text-slate-400">{p.barcode}</p> : null}
                    </td>
                    <td>{p.category?.name ?? '-'}</td>
                    <td className="num">{baht(p.price)}</td>
                    <td className={clsx('num', Number(p.stockQty) < 0 && 'text-danger')}>{qty(p.stockQty)}</td>
                    <td>{SKU_TYPE_LABEL[p.skuType]}</td>
                    <td>{p.vatType === 'V' ? <Badge tone="amber">VAT</Badge> : <Badge>ไม่มีภาษี</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.data.length === 0 ? <EmptyState /> : null}

        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
      </Card>
    </div>
  )
}
