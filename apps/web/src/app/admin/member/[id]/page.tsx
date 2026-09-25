'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { MEMBER_NOTE_STATUSES, MEMBER_NOTE_TAGS } from '@medee/domain'
import { api, ApiError } from '@/lib/api'
import { Badge, Card, EmptyState, Modal, NoAccess, PageHeader, Spinner } from '@/components/ui'
import { baht, dateTH, dateTimeTH, qty } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Summary {
  member: {
    id: string; name: string; gender: string; phone: string | null; email: string | null
    birthdate: string | null; channel: string; pointsBalance: number; totalSpent: string
    memberGroup: { name: string } | null
  }
  billCount: number
  totalAmount: string
  averagePerBill: string
  frequentProducts: { name: string; barcode: string | null; qty: string; amount: string }[]
  recentReceipts: { id: string; receiptNo: string; soldAt: string; grandTotal: string }[]
  notes: { id: string; title: string; detail: string | null; status: string; tags: string[]; createdAt: string; createdBy: string | null }[]
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>()
  const qc = useQueryClient()
  const can = useCan()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState({ title: '', detail: '', status: 'ไม่มีสถานะ', tags: [] as string[] })

  const query = useQuery({
    queryKey: ['member-summary', params.id],
    queryFn: () => api<Summary>(`/members/${params.id}/summary`),
    enabled: Boolean(params.id),
  })

  const addNote = useMutation({
    mutationFn: () => api(`/members/${params.id}/notes`, { method: 'POST', body: note }),
    onSuccess: () => {
      setNoteOpen(false)
      setNote({ title: '', detail: '', status: 'ไม่มีสถานะ', tags: [] })
      void qc.invalidateQueries({ queryKey: ['member-summary', params.id] })
    },
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const d = query.data
  if (!d) return <EmptyState />

  return (
    <div className="space-y-4">
      <PageHeader
        title={d.member.name}
        subtitle={`${d.member.channel} · คะแนนคงเหลือ ${d.member.pointsBalance}`}
        actions={<Link href="/admin/member/data" className="btn-ghost">← กลับ</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-semibold text-white">
            {d.member.name.slice(0, 1).toUpperCase()}
          </span>
          <dl className="min-w-0 space-y-1 text-sm">
            <div className="flex gap-2"><dt className="text-slate-500">เพศ</dt><dd>{d.member.gender}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-500">เบอร์</dt><dd>{d.member.phone || '-'}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-500">อีเมล</dt><dd className="truncate">{d.member.email || '-'}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-500">วันเกิด</dt><dd>{d.member.birthdate ? dateTH(d.member.birthdate) : '-'}</dd></div>
            {d.member.memberGroup ? (
              <div className="flex gap-2"><dt className="text-slate-500">กลุ่มลูกค้า</dt><dd><Badge tone="green">{d.member.memberGroup.name}</Badge></dd></div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">มูลค่ารวม</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-brand">{baht(d.totalAmount)}</p>
          <p className="mt-1 text-sm text-slate-500">{d.billCount} บิล</p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">เฉลี่ย/บิล</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{baht(d.averagePerBill)}</p>
          <p className="mt-1 text-sm text-slate-500">ใช้จ่ายสะสม {baht(d.member.totalSpent)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">สินค้าที่ซื้อบ่อย</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>ชื่อ</th><th>บาร์โค้ด</th><th className="text-right">จำนวน</th><th className="text-right">ยอด</th></tr></thead>
              <tbody>
                {d.frequentProducts.map((p) => (
                  <tr key={`${p.name}-${p.barcode}`}>
                    <td className="max-w-[200px] truncate" title={p.name}>{p.name}</td>
                    <td>{p.barcode ?? '-'}</td>
                    <td className="num">{qty(p.qty)}</td>
                    <td className="num">{baht(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.frequentProducts.length === 0 ? <EmptyState /> : null}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">การซื้อล่าสุด</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>เลขบิล</th><th>วันเวลา</th><th className="text-right">ยอด</th></tr></thead>
              <tbody>
                {d.recentReceipts.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.receiptNo}</td>
                    <td>{dateTimeTH(r.soldAt)}</td>
                    <td className="num">{baht(r.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.recentReceipts.length === 0 ? <EmptyState /> : null}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">บันทึกของร้านค้า</h2>
          {can('/member/data', 'edit').allowed ? (
            <button type="button" className="btn-ghost" onClick={() => setNoteOpen(true)}>เพิ่มบันทึก</button>
          ) : null}
        </div>
        {d.notes.length === 0 ? (
          <EmptyState message="ยังไม่มีบันทึก" />
        ) : (
          <ul className="space-y-2">
            {d.notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{n.title}</p>
                  <Badge tone={n.status === 'ปิดเคส' ? 'green' : n.status === 'รอดำเนินการ' ? 'amber' : 'slate'}>{n.status}</Badge>
                  {n.tags.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
                  <span className="ml-auto text-xs text-slate-400">{dateTimeTH(n.createdAt)} · {n.createdBy ?? '-'}</span>
                </div>
                {n.detail ? <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{n.detail}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={noteOpen} onClose={() => setNoteOpen(false)} title="บันทึกข้อมูลลูกค้า"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setNoteOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => addNote.mutate()} disabled={!note.title.trim() || addNote.isPending}>บันทึก</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="n-title">หัวข้อ</label>
            <input id="n-title" className="input" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="n-detail">รายละเอียด</label>
            <textarea id="n-detail" className="input min-h-[80px] py-2" value={note.detail} onChange={(e) => setNote({ ...note, detail: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="n-status">สถานะ</label>
            <select id="n-status" className="input" value={note.status} onChange={(e) => setNote({ ...note, status: e.target.value })}>
              {MEMBER_NOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span className="label">ป้ายกำกับ</span>
            <div className="flex flex-wrap gap-2">
              {MEMBER_NOTE_TAGS.map((t) => {
                const on = note.tags.includes(t)
                return (
                  <button
                    key={t} type="button"
                    onClick={() => setNote({ ...note, tags: on ? note.tags.filter((x) => x !== t) : [...note.tags, t] })}
                    className={`rounded-full px-3 py-1 text-xs ${on ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
