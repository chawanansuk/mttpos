'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CASHIER_PERMISSION_KEYS, CASHIER_PERMISSION_LABELS, allCashierPermissions, type CashierPermissions } from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { useCan } from '@/hooks/useSession'

interface Cashier {
  id: string
  name: string
  orderIndex: number
  enabled: boolean
  permissions: CashierPermissions
  webUsername: string | null
}

export default function CashierPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [editing, setEditing] = useState<(Partial<Cashier> & { pin?: string }) | null>(null)
  const [webLogin, setWebLogin] = useState<Cashier | null>(null)
  const [webForm, setWebForm] = useState({ username: '', password: '' })
  const [deleting, setDeleting] = useState<Cashier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['cashiers', branchId],
    queryFn: () => api<Cashier[]>(`/branches/${branchId}/cashiers`),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: async (input: Partial<Cashier> & { pin?: string }) => {
      if (input.id) {
        await api(`/cashiers/${input.id}`, {
          method: 'PUT',
          body: { name: input.name, permissions: input.permissions, orderIndex: input.orderIndex, enabled: input.enabled },
        })
        if (input.pin) await api(`/cashiers/${input.id}/pin`, { method: 'PUT', body: { pin: input.pin } })
        return
      }
      await api(`/branches/${branchId}/cashiers`, {
        method: 'POST',
        body: { name: input.name, pin: input.pin, permissions: input.permissions, orderIndex: input.orderIndex },
      })
    },
    onSuccess: () => { setEditing(null); setError(null); void qc.invalidateQueries({ queryKey: ['cashiers'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })

  const saveWeb = useMutation({
    mutationFn: () => api(`/cashiers/${webLogin!.id}/web-login`, { method: 'PUT', body: webForm }),
    onSuccess: () => { setWebLogin(null); setWebForm({ username: '', password: '' }); void qc.invalidateQueries({ queryKey: ['cashiers'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api(`/cashiers/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['cashiers'] }) },
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const rows = query.data ?? []
  const canEdit = can('/setting/cashier', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="พนักงาน"
        subtitle={`${rows.length} คน · พนักงานหน้าร้านเข้าใช้เครื่องขายด้วย PIN 4 หลัก`}
        actions={canEdit ? (
          <button
            type="button" className="btn-primary"
            onClick={() => setEditing({ name: '', pin: '', permissions: allCashierPermissions(), orderIndex: rows.length + 1, enabled: true })}
          >
            เพิ่มพนักงาน
          </button>
        ) : null}
      />
      {error ? <p className="rounded-card bg-red-50 px-4 py-2.5 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => (
          <Card key={c.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white">
                {c.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-slate-400">ลำดับ {c.orderIndex} · {c.enabled ? 'ใช้งาน' : 'ปิดใช้งาน'}</p>
              </div>
              <Toggle checked={c.enabled} label={`ใช้งาน ${c.name}`} disabled={!canEdit} onChange={(v) => save.mutate({ id: c.id, name: c.name, enabled: v, permissions: c.permissions, orderIndex: c.orderIndex })} />
            </div>
            <p className="text-xs text-slate-500">
              {CASHIER_PERMISSION_KEYS.filter((k) => c.permissions?.[k]).map((k) => CASHIER_PERMISSION_LABELS[k]).join(' · ') || 'ไม่มีสิทธิ์'}
            </p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost h-9 text-xs" onClick={() => setEditing(c)}>แก้ไข</button>
                <button type="button" className="btn-ghost h-9 text-xs" onClick={() => { setWebLogin(c); setWebForm({ username: c.webUsername ?? '', password: '' }) }}>จัดการข้อมูล</button>
                {can('/setting/cashier', 'remove').allowed ? (
                  <button type="button" className="btn-ghost h-9 text-xs text-danger" onClick={() => setDeleting(c)}>ลบ</button>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
        {rows.length === 0 ? <EmptyState /> : null}
      </div>

      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)}
        title={editing?.id ? `แก้ไขพนักงาน — ${editing.name}` : 'เพิ่มพนักงาน'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button
              className="btn-primary"
              onClick={() => editing && save.mutate(editing)}
              disabled={!editing?.name || (!editing.id && !/^\d{4}$/.test(editing.pin ?? '')) || save.isPending}
            >
              บันทึก
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="c-name">ชื่อพนักงาน</label>
                <input id="c-name" className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="c-pin">PIN 4 หลัก {editing.id ? '(เว้นว่างหากไม่เปลี่ยน)' : '*'}</label>
                <input
                  id="c-pin" className="input tracking-[0.4em]" inputMode="numeric" maxLength={4}
                  value={editing.pin ?? ''} onChange={(e) => setEditing({ ...editing, pin: e.target.value.replace(/\D/g, '') })}
                />
              </div>
              <div>
                <label className="label" htmlFor="c-order">ลำดับการแสดง</label>
                <input id="c-order" type="number" className="input text-right" value={editing.orderIndex ?? 1} onChange={(e) => setEditing({ ...editing, orderIndex: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="c-cap">เพดานส่วนลด (%) — เว้นว่าง = ไม่จำกัด</label>
                <input
                  id="c-cap" className="input text-right" inputMode="decimal"
                  value={editing.permissions?.maxDiscountPercent ?? ''}
                  onChange={(e) => setEditing({
                    ...editing,
                    permissions: { ...editing.permissions, maxDiscountPercent: e.target.value === '' ? null : Number(e.target.value) },
                  })}
                />
              </div>
            </div>

            <div>
              <span className="label">สิทธิ์ในแอป POS</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {CASHIER_PERMISSION_KEYS.map((k) => (
                  <label key={k} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="text-sm">{CASHIER_PERMISSION_LABELS[k]}</span>
                    <Toggle
                      checked={Boolean(editing.permissions?.[k])}
                      label={CASHIER_PERMISSION_LABELS[k]}
                      onChange={(v) => setEditing({ ...editing, permissions: { ...editing.permissions, [k]: v } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(webLogin)} onClose={() => setWebLogin(null)} size="sm"
        title="สร้างชื่อผู้ใช้/รหัสผ่าน"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setWebLogin(null)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => saveWeb.mutate()} disabled={webForm.username.length < 3 || webForm.password.length < 6}>บันทึก</button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-500">สำหรับให้พนักงานเข้าเว็บเช็คสต็อกบนมือถือ</p>
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="w-user">ชื่อผู้ใช้</label>
            <input id="w-user" className="input" value={webForm.username} onChange={(e) => setWebForm({ ...webForm, username: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="w-pass">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
            <input id="w-pass" type="password" className="input" value={webForm.password} onChange={(e) => setWebForm({ ...webForm, password: e.target.value })} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="ลบพนักงาน" message={`ต้องการลบพนักงาน "${deleting?.name}" หรือไม่`}
        confirmLabel="ลบ" tone="danger" busy={remove.isPending}
      />
    </div>
  )
}
