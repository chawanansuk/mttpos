'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { useShell } from '@/components/admin/Shell'
import { Card, EmptyState, FeatureLocked, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { cellValue, isNumericCell } from '@/lib/format'

interface ReportColumn { key: string; header: string; width?: number }
interface ReportResponse {
  title: string
  columns: ReportColumn[]
  range: { from: string; to: string; label: string }
  data: Record<string, unknown>[]
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * หน้ารายงานแบบทั่วไป — ใช้ได้กับทุกรายงานในหัวข้อ 6.6–6.8
 * โครงคอลัมน์มาจาก API จึงไม่ต้องเขียนหน้าแยกทีละรายงาน
 */
export default function ReportPage() {
  const params = useParams<{ key: string }>()
  const reportKey = params.key
  const { range } = useShell()
  const branchId = typeof window === 'undefined' ? null : session.branchId

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [exporting, setExporting] = useState(false)

  const query = useQuery({
    queryKey: ['report', reportKey, branchId, range.from, range.to, page, limit, applied],
    queryFn: () =>
      api<ReportResponse>(`/reports/${reportKey}`, {
        query: { from: range.from, to: range.to, page, limit, search: applied || undefined },
      }),
    enabled: Boolean(branchId && reportKey),
  })

  const numericColumns = useMemo(() => {
    const first = query.data?.data[0]
    if (!first) return new Set<string>()
    const set = new Set<string>()
    for (const [key, value] of Object.entries(first)) {
      if (isNumericCell(value)) set.add(key)
    }
    return set
  }, [query.data])

  if (query.error instanceof ApiError) {
    if (query.error.isLocked) return <FeatureLocked title={query.error.message} />
    if (query.error.isForbidden) return <NoAccess />
  }
  if (query.isLoading) return <Spinner />

  const data = query.data
  if (!data) return <EmptyState message="ไม่พบรายงานนี้" />

  const onExport = async () => {
    setExporting(true)
    try {
      await downloadExport(
        `/reports/${reportKey}`,
        { from: range.from, to: range.to, search: applied || undefined },
        data.title,
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.title}
        subtitle={data.range.label}
        actions={
          <button type="button" className="btn-info" onClick={onExport} disabled={exporting}>
            {exporting ? 'กำลังส่งออก…' : 'ส่งออกไฟล์'}
          </button>
        }
      />

      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search) }}
        >
          <div className="min-w-[200px] flex-1">
            <label className="label" htmlFor="report-search">ค้นหา</label>
            <input
              id="report-search" className="input" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="พิมพ์คำค้นหา"
            />
          </div>
          <button type="submit" className="btn-primary">ค้นหา</button>
          <div>
            <label className="label" htmlFor="report-limit">แสดง</label>
            <select
              id="report-limit" className="input w-24"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1) }}
            >
              {[10, 20, 30, 40, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </form>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {data.columns.map((c) => (
                  <th key={c.key} className={numericColumns.has(c.key) ? 'text-right' : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.map((row, i) => (
                <tr key={i}>
                  {data.columns.map((c) => (
                    <td key={c.key} className={numericColumns.has(c.key) ? 'num' : undefined}>
                      {cellValue(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 ? <EmptyState /> : null}
        </div>

        <Pagination
          page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit}
          onChange={setPage}
        />
      </Card>
    </div>
  )
}
