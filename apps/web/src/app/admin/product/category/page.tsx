'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { KITCHEN_PRIORITY_LABELS } from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { dateTimeTH } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Category {
  id: string
  name: string
  bgColor: string
  icon: string | null
  enabled: boolean
  kitchenPriority: 'LOW' | 'MEDIUM' | 'HIGH'
  isSystem: boolean
  orderIndex: number
  updatedAt: string
  _count: { products: number }
}

const PALETTE = [
  '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#E91E63', '#00BCD4',
  '#795548', '#607D8B', '#8BC34A', '#3F51B5', '#2196F3', '#009688',
  '#CDDC39', '#FFC107', '#9E9E9E', '#BDBDBD',
]

export default function CategoryPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [editing, setEditing] = useState<Partial<Category> | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['categories', branchId],
    queryFn: () => api<Category[]>('/categories'),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: (input: Partial<Category>) =>
      input.id
        ? api(`/categories/${input.id}`, { method: 'PUT', body: input })
        : api('/categories', { method: 'POST', body: input }),
    onSuccess: () => { setEditing(null); setError(null); void qc.invalidateQueries({ queryKey: ['categories'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['categories'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ลบไม่สำเร็จ'),
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const rows = query.data ?? []
  const canEdit = can('/product/category', 'edit').allowed
  const canRemove = can('/product/category', 'remove').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="กลุ่มสินค้า"
        subtitle={`${rows.length} กลุ่ม`}
        actions={canEdit ? (
          <button type="button" className="btn-primary" onClick={() => setEditing({ bgColor: '#4CAF50', enabled: true, kitchenPriority: 'MEDIUM' })}>
            เพิ่มกลุ่มสินค้า
          </button>
        ) : null}
      />

      {error ? <p className="rounded-card bg-red-50 px-4 py-2.5 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>กลุ่มสินค้า</th><th>สีพื้นหลัง</th><th className="text-right">จำนวนสินค้า</th>
                <th>ใช้งาน</th><th>ความเร่งด่วนในการทำอาหาร</th><th>วันที่อัปเดต</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td className="font-medium">
                    {canEdit ? (
                      <button type="button" className="hover:text-brand hover:underline" onClick={() => setEditing(c)}>{c.name}</button>
                    ) : c.name}
                  </td>
                  <td><span className="inline-block h-5 w-10 rounded" style={{ background: c.bgColor }} /></td>
                  <td className="num">{c._count.products}</td>
                  <td>
                    <Toggle
                      checked={c.enabled} label={`ใช้งาน ${c.name}`} disabled={!canEdit}
                      onChange={(v) => save.mutate({ id: c.id, enabled: v })}
                    />
                  </td>
                  <td>{KITCHEN_PRIORITY_LABELS[c.kitchenPriority]}</td>
                  <td>{dateTimeTH(c.updatedAt)}</td>
                  <td>
                    {canRemove && !c.isSystem ? (
                      <button type="button" className="text-danger hover:underline" onClick={() => setDeleting(c)}>ลบ</button>
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
        open={Boolean(editing)} onClose={() => setEditing(null)}
        title={editing?.id ? 'แก้ไขกลุ่มสินค้า' : 'เพิ่มกลุ่มสินค้า'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => editing && save.mutate(editing)} disabled={!editing?.name || save.isPending}>บันทึก</button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="cat-name">* ชื่อกลุ่มสินค้า</label>
              <input id="cat-name" className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <span className="label">สีพื้นหลัง</span>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c} type="button" aria-label={`เลือกสี ${c}`}
                    onClick={() => setEditing({ ...editing, bgColor: c })}
                    className={`h-8 w-8 rounded ${editing.bgColor === c ? 'ring-2 ring-brand ring-offset-2' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="cat-priority">ความเร่งด่วนในการทำอาหาร</label>
              <select
                id="cat-priority" className="input"
                value={editing.kitchenPriority ?? 'MEDIUM'}
                onChange={(e) => setEditing({ ...editing, kitchenPriority: e.target.value as Category['kitchenPriority'] })}
              >
                <option value="LOW">ตํ่า ( LOW )</option>
                <option value="MEDIUM">ปานกลาง ( MEDIUM )</option>
                <option value="HIGH">สูง ( HIGH )</option>
              </select>
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
        title="ลบกลุ่มสินค้า"
        message={`คุณต้องการลบกลุ่ม "${deleting?.name}" หรือไม่ สินค้าในกลุ่มนี้จะถูกย้ายไป Uncategory`}
        confirmLabel="ลบ" tone="danger" busy={remove.isPending}
      />
    </div>
  )
}
