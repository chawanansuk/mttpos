'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { baht } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Option { id: string; name: string; price: string; cost: string; enabled: boolean; qrOrderEnabled: boolean }

export default function OptionPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [editing, setEditing] = useState<Partial<Option> | null>(null)
  const [deleting, setDeleting] = useState<Option | null>(null)

  const query = useQuery({
    queryKey: ['options', branchId],
    queryFn: () => api<Option[]>('/options'),
    enabled: Boolean(branchId),
  })
  const save = useMutation({
    mutationFn: (input: Partial<Option>) =>
      input.id ? api(`/options/${input.id}`, { method: 'PUT', body: input }) : api('/options', { method: 'POST', body: input }),
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ['options'] }) },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/options/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['options'] }) },
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const rows = query.data ?? []
  const canEdit = can('/product/option', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="ตัวเลือกเสริม" subtitle={`${rows.length} รายการ`}
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => setEditing({ enabled: true, price: '0', cost: '0' })}>เพิ่มตัวเลือก</button> : null}
      />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>ชื่อตัวเลือก</th><th className="text-right">ต้นทุน</th><th className="text-right">ราคาสินค้า</th>
                <th>เปิดขายบน QR Order</th><th>เปิดใช้งาน</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.id}>
                  <td>{i + 1}</td>
                  <td className="font-medium">
                    {canEdit ? <button type="button" className="hover:text-brand hover:underline" onClick={() => setEditing(o)}>{o.name}</button> : o.name}
                  </td>
                  <td className="num">{Number(o.cost) > 0 ? baht(o.cost) : '-'}</td>
                  <td className="num">{baht(o.price)}</td>
                  <td><Toggle checked={o.qrOrderEnabled} label="QR Order" disabled={!canEdit} onChange={(v) => save.mutate({ id: o.id, qrOrderEnabled: v })} /></td>
                  <td><Toggle checked={o.enabled} label="เปิดใช้งาน" disabled={!canEdit} onChange={(v) => save.mutate({ id: o.id, enabled: v })} /></td>
                  <td>{can('/product/option', 'remove').allowed ? <button type="button" className="text-danger hover:underline" onClick={() => setDeleting(o)}>ลบ</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyState /> : null}
        </div>
      </Card>

      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)}
        title={editing?.id ? 'แก้ไขตัวเลือก' : 'เพิ่มตัวเลือก'} size="sm"
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
              <label className="label" htmlFor="opt-name">ชื่อตัวเลือก</label>
              <input id="opt-name" className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="opt-price">ราคา/หน่วย</label>
                <input id="opt-price" className="input text-right" inputMode="decimal" value={editing.price ?? '0'} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="opt-cost">ต้นทุน</label>
                <input id="opt-cost" className="input text-right" inputMode="decimal" value={editing.cost ?? '0'} onChange={(e) => setEditing({ ...editing, cost: e.target.value })} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="ลบตัวเลือก" message={`ต้องการลบตัวเลือก "${deleting?.name}" หรือไม่`}
        confirmLabel="ลบ" tone="danger" busy={remove.isPending}
      />
    </div>
  )
}
