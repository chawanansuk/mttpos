'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Badge, Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner } from '@/components/ui'
import { dateTimeTH } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Provider { id: string; name: string; logo: string | null; isSystem: boolean; updatedAt: string }

export default function DeliveryPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<Provider | null>(null)

  const query = useQuery({
    queryKey: ['delivery-providers', branchId],
    queryFn: () => api<Provider[]>('/delivery-providers'),
    enabled: Boolean(branchId),
  })
  const create = useMutation({
    mutationFn: () => api('/delivery-providers', { method: 'POST', body: { name } }),
    onSuccess: () => { setAdding(false); setName(''); void qc.invalidateQueries({ queryKey: ['delivery-providers'] }) },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/delivery-providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['delivery-providers'] }) },
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const rows = query.data ?? []
  const canEdit = can('/setting/delivery', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="รายชื่อผู้ให้บริการเดลิเวอรี่"
        subtitle={`${rows.length} ราย`}
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>เพิ่มผู้ให้บริการ</button> : null}
      />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>ชื่อ</th><th>ประเภท</th><th>วันที่อัปเดต</th><th></th></tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.isSystem ? <Badge>ระบบ</Badge> : <Badge tone="green">เพิ่มเอง</Badge>}</td>
                  <td>{dateTimeTH(p.updatedAt)}</td>
                  <td>
                    {!p.isSystem && can('/setting/delivery', 'remove').allowed ? (
                      <button type="button" className="text-danger hover:underline" onClick={() => setDeleting(p)}>ลบ</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyState /> : null}
        </div>
      </Card>

      <Modal
        open={adding} onClose={() => setAdding(false)} title="เพิ่มผู้ให้บริการ" size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAdding(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => create.mutate()} disabled={!name.trim()}>บันทึก</button>
          </>
        }
      >
        <label className="label" htmlFor="dp-name">ชื่อผู้ให้บริการ</label>
        <input id="dp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="ลบผู้ให้บริการ" message={`ต้องการลบ "${deleting?.name}" หรือไม่`}
        confirmLabel="ลบ" tone="danger" busy={remove.isPending}
      />
    </div>
  )
}
