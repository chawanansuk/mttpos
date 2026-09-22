'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { GENDERS } from '@medee/domain'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { Card, EmptyState, Modal, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { baht, dateTH, dateTimeTH } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Member {
  id: string
  name: string
  gender: string
  phone: string | null
  email: string | null
  birthdate: string | null
  channel: string
  firstVisitAt: string | null
  lastVisitAt: string | null
  totalSpent: string
  pointsBalance: number
  memberGroup: { name: string } | null
}

export default function MemberPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', gender: 'ไม่ระบุ', phone: '', email: '', birthdate: '' })

  const query = useQuery({
    queryKey: ['members', branchId, page, applied],
    queryFn: () =>
      api<{ data: Member[]; page: number; limit: number; total: number; totalPages: number }>('/members', {
        query: { page, limit: 50, search: applied || undefined },
      }),
    enabled: Boolean(branchId),
  })

  const create = useMutation({
    mutationFn: () =>
      api('/members', {
        method: 'POST',
        body: {
          name: draft.name.trim(),
          gender: draft.gender,
          phone: draft.phone || null,
          email: draft.email || null,
          birthdate: draft.birthdate || null,
        },
      }),
    onSuccess: () => {
      setCreating(false); setError(null)
      setDraft({ name: '', gender: 'ไม่ระบุ', phone: '', email: '', birthdate: '' })
      void qc.invalidateQueries({ queryKey: ['members'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const data = query.data
  if (!data) return <EmptyState />
  const canEdit = can('/member/data', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title={`สมาชิกทั้งหมด (${data.total})`}
        actions={
          <>
            <button type="button" className="btn-info" onClick={() => downloadExport('/members', { search: applied || undefined }, 'รายชื่อสมาชิก')}>
              ส่งออกไฟล์
            </button>
            {canEdit ? <button type="button" className="btn-primary" onClick={() => setCreating(true)}>เพิ่มสมาชิก</button> : null}
          </>
        }
      />
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search) }}>
          <div className="min-w-[240px] flex-1">
            <label className="label" htmlFor="m-search">ค้นหาโดยชื่อ อีเมล หรือเบอร์โทรศัพท์</label>
            <input id="m-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary">ค้นหา</button>
        </form>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>ชื่อสมาชิก</th><th>ช่องทาง</th><th>กลุ่มลูกค้า</th><th>วันเกิด</th>
                <th>เบอร์โทรศัพท์</th><th>อีเมล</th><th>เยี่ยมชมครั้งแรก</th><th>เยี่ยมชมครั้งล่าสุด</th>
                <th className="text-right">ใช้จ่ายสะสม</th><th className="text-right">คะแนนคงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((m, i) => (
                <tr key={m.id}>
                  <td>{(data.page - 1) * data.limit + i + 1}</td>
                  <td className="font-medium">
                    <Link href={`/admin/member/${m.id}`} className="hover:text-brand hover:underline">{m.name}</Link>
                  </td>
                  <td>{m.channel}</td>
                  <td>{m.memberGroup?.name ?? '-'}</td>
                  <td>{m.birthdate ? dateTH(m.birthdate) : '-'}</td>
                  <td>{m.phone || '-'}</td>
                  <td>{m.email || '-'}</td>
                  <td>{m.firstVisitAt ? dateTimeTH(m.firstVisitAt) : '-'}</td>
                  <td>{m.lastVisitAt ? dateTimeTH(m.lastVisitAt) : '-'}</td>
                  <td className="num">{baht(m.totalSpent)}</td>
                  <td className="num">{m.pointsBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 ? <EmptyState /> : null}
        </div>
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
      </Card>

      <Modal
        open={creating} onClose={() => setCreating(false)} title="เพิ่มสมาชิก"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCreating(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => create.mutate()} disabled={!draft.name.trim() || create.isPending}>บันทึกข้อมูล</button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mem-name">ชื่อ - นามสกุล *</label>
            <input id="mem-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="mem-gender">เพศ *</label>
            <select id="mem-gender" className="input" value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })}>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mem-phone">เบอร์โทรศัพท์</label>
            <input id="mem-phone" className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="mem-email">อีเมล</label>
            <input id="mem-email" type="email" className="input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="mem-bd">วัน/เดือน/ปี เกิด</label>
            <input id="mem-bd" type="date" className="input" value={draft.birthdate} onChange={(e) => setDraft({ ...draft, birthdate: e.target.value })} />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Modal>
    </div>
  )
}
