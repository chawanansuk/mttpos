'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { dateTimeTH } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Unit { id: string; name: string; enabled: boolean; updatedAt: string }

export default function UnitPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [editing, setEditing] = useState<Partial<Unit> | null>(null)
  const [deleting, setDeleting] = useState<Unit | null>(null)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['units', branchId],
    queryFn: () => api<Unit[]>('/units'),
    enabled: Boolean(branchId),
  })
  const save = useMutation({
    mutationFn: (input: Partial<Unit>) =>
      input.id ? api(`/units/${input.id}`, { method: 'PUT', body: input }) : api('/units', { method: 'POST', body: input }),
    onSuccess: () => { setEditing(null); setError(null); void qc.invalidateQueries({ queryKey: ['units'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/units/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['units'] }) },
    onError: (e) => { setDeleting(null); setError(e instanceof ApiError ? e.message : 'ลบไม่สำเร็จ') },
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const rows = query.data ?? []
  const canEdit = can('/product/unit', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="หน่วยบรรจุ" subtitle={`${rows.length} หน่วย`}
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => setEditing({ enabled: true })}>เพิ่มหน่วยบรรจุ</button> : null}
      />
      {error ? <p className="rounded-card bg-red-50 px-4 py-2.5 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>หน่วยบรรจุ</th><th>วันที่อัปเดต</th><th>ใช้งาน</th><th></th></tr></thead>
            <tbody>
              {rows.map((u, i) => (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td className="font-medium">
                    {canEdit ? <button type="button" className="hover:text-brand hover:underline" onClick={() => setEditing(u)}>{u.name}</button> : u.name}
                  </td>
                  <td>{dateTimeTH(u.updatedAt)}</td>
                  <td><Toggle checked={u.enabled} label={`ใช้งาน ${u.name}`} disabled={!canEdit} onChange={(v) => save.mutate({ id: u.id, enabled: v })} /></td>
                  <td>{can('/product/unit', 'remove').allowed ? <button type="button" className="text-danger hover:underline" onClick={() => setDeleting(u)}>ลบ</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyState /> : null}
        </div>
      </Card>

      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)}
        title={editing?.id ? 'แก้ไขหน่วยบรรจุ' : 'เพิ่มหน่วยบรรจุ'} size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => editing && save.mutate(editing)} disabled={!editing?.name}>บันทึก</button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="unit-name">หน่วยบรรจุ</label>
              <input id="unit-name" className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm">ใช้งาน</span>
              <Toggle checked={editing.enabled ?? true} label="ใช้งาน" onChange={(v) => setEditing({ ...editing, enabled: v })} />
            </label>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="ยืนยันการลบหน่วยสินค้า"
        message={`คุณต้องการลบหน่วยบรรจุ "${deleting?.name}" หรือไม่`}
        confirmLabel="ลบ" tone="danger" busy={remove.isPending}
      />
    </div>
  )
}
