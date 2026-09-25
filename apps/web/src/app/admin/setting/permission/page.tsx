'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import {
  PERMISSION_ACTIONS, PERMISSION_ACTION_LABELS, buildPermissionSet,
  type ModuleDef, type PermissionAction, type PermissionSet,
} from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { Badge, Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { dateTH } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface BranchUser {
  id: string
  accountId: string
  email: string
  name: string
  role: string
  isOwner: boolean
  updatedAt: string
  permissions: PermissionSet
}

export default function PermissionPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId

  const [editing, setEditing] = useState<BranchUser | null>(null)
  const [perms, setPerms] = useState<PermissionSet>({})
  const [activeTab, setActiveTab] = useState<string>('dashboard')
  const [adding, setAdding] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', role: 'Manager' as 'Manager' | 'Franchise' })
  const [checked, setChecked] = useState<null | { exists: boolean; name?: string }>(null)
  const [deleting, setDeleting] = useState<BranchUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  const users = useQuery({
    queryKey: ['branch-users', branchId],
    queryFn: () => api<BranchUser[]>(`/branches/${branchId}/users`),
    enabled: Boolean(branchId),
  })
  const schema = useQuery({
    queryKey: ['permission-schema'],
    queryFn: () => api<ModuleDef[]>('/permission-schema'),
  })

  useEffect(() => {
    if (!editing) return
    // เติมช่องที่ยังไม่มีในข้อมูลเดิมให้ครบตามโครงมาตรฐาน
    const base = buildPermissionSet()
    const merged: PermissionSet = { ...base }
    for (const [key, mod] of Object.entries(editing.permissions ?? {})) {
      const template = base[key]
      if (!template) continue
      merged[key] = {
        ...template,
        enable: mod.enable ?? false,
        lock: mod.lock ?? template.lock,
        menu: template.menu.map((m) => {
          const saved = mod.menu?.find((x) => x.path === m.path)
          return saved ? { ...m, ...saved } : m
        }),
      }
    }
    setPerms(merged)
    setActiveTab(Object.keys(merged)[0] ?? 'dashboard')
  }, [editing])

  const savePerms = useMutation({
    mutationFn: () =>
      api(`/branches/${branchId}/users/${editing!.id}/permissions`, { method: 'PUT', body: { permissions: perms } }),
    onSuccess: () => { setEditing(null); void qc.invalidateQueries({ queryKey: ['branch-users'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกสิทธิ์ไม่สำเร็จ'),
  })

  const checkEmail = useMutation({
    mutationFn: () => api<{ exists: boolean; account: { displayName: string } | null }>('/users/check-email', { method: 'POST', body: { email: newUser.email } }),
    onSuccess: (d) => setChecked({ exists: d.exists, name: d.account?.displayName }),
  })
  const addUser = useMutation({
    mutationFn: () => api(`/branches/${branchId}/users`, { method: 'POST', body: newUser }),
    onSuccess: () => {
      setAdding(false); setChecked(null); setNewUser({ email: '', role: 'Manager' })
      void qc.invalidateQueries({ queryKey: ['branch-users'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'เพิ่มผู้ใช้ไม่สำเร็จ'),
  })
  const removeUser = useMutation({
    mutationFn: (id: string) => api(`/branches/${branchId}/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['branch-users'] }) },
  })

  if (users.error instanceof ApiError && users.error.isForbidden) return <NoAccess />
  if (users.isLoading || schema.isLoading) return <Spinner />
  const canEdit = can('/setting/permission', 'edit').allowed
  const modules = schema.data ?? []
  const activeModule = modules.find((m) => m.key === activeTab)
  const activePerm = perms[activeTab]

  const setMenu = (path: string, action: PermissionAction, value: boolean) => {
    setPerms((prev) => {
      const mod = prev[activeTab]
      if (!mod) return prev
      return {
        ...prev,
        [activeTab]: {
          ...mod,
          menu: mod.menu.map((m) => (m.path === path ? { ...m, [action]: value } : m)),
        },
      }
    })
  }

  const setAllRows = (action: PermissionAction, value: boolean) => {
    setPerms((prev) => {
      const mod = prev[activeTab]
      if (!mod) return prev
      return { ...prev, [activeTab]: { ...mod, menu: mod.menu.map((m) => ({ ...m, [action]: value })) } }
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="สิทธิการเข้าถึง"
        subtitle={`${users.data?.length ?? 0} ผู้ใช้`}
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => { setAdding(true); setChecked(null) }}>+ เพิ่มผู้ใช้</button> : null}
      />
      {error ? <p className="rounded-card bg-red-50 px-4 py-2.5 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(users.data ?? []).map((u) => (
          <button
            key={u.id}
            type="button"
            disabled={u.isOwner || !canEdit}
            onClick={() => setEditing(u)}
            className="card flex items-center gap-3 p-4 text-left transition hover:shadow-md disabled:cursor-default disabled:opacity-90"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-semibold text-white">
              {u.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.email}</p>
              {u.isOwner ? (
                <Badge tone="green">owner</Badge>
              ) : (
                <p className="text-xs text-slate-400">
                  {u.name} · วันที่อัปเดต : {dateTH(u.updatedAt)}
                </p>
              )}
            </div>
            {!u.isOwner && can('/setting/permission', 'remove').allowed ? (
              <span
                role="button"
                tabIndex={0}
                className="text-danger"
                onClick={(e) => { e.stopPropagation(); setDeleting(u) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setDeleting(u) } }}
              >
                🗑
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ตารางสิทธิ์ 11 แท็บ × 4 คอลัมน์ */}
      <Modal
        open={Boolean(editing)} onClose={() => setEditing(null)} size="xl"
        title={`แก้ไขสิทธิ์ — ${editing?.email ?? ''}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => savePerms.mutate()} disabled={savePerms.isPending}>บันทึก</button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {modules.map((m) => (
              <button
                key={m.key} type="button" onClick={() => setActiveTab(m.key)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-sm',
                  activeTab === m.key ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {activePerm && activeModule ? (
            <>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                <span className="text-sm font-medium">
                  {activePerm.enable ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} — {activeModule.label}
                </span>
                <Toggle
                  checked={activePerm.enable} label="เปิดใช้งานโมดูล"
                  onChange={(v) => setPerms({ ...perms, [activeTab]: { ...activePerm, enable: v } })}
                />
              </label>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>เมนู</th>
                      {PERMISSION_ACTIONS.map((a) => (
                        <th key={a} className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span>{PERMISSION_ACTION_LABELS[a]}</span>
                            <button
                              type="button"
                              className="text-[10px] font-normal text-brand hover:underline"
                              onClick={() => setAllRows(a, !activePerm.menu.every((m) => m[a]))}
                            >
                              ทั้งหมด
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activePerm.menu.map((m) => (
                      <tr key={m.path}>
                        <td className="!whitespace-normal">
                          {m.label}
                          {m.lock ? <Badge tone="amber">ล็อกตามแพ็กเกจ</Badge> : null}
                          <p className="text-xs text-slate-400">{m.path}</p>
                        </td>
                        {PERMISSION_ACTIONS.map((a) => (
                          <td key={a} className="text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#2EB88A]"
                              aria-label={`${PERMISSION_ACTION_LABELS[a]} ${m.label}`}
                              checked={Boolean(m[a])}
                              disabled={m.lock || !activePerm.enable}
                              onChange={(e) => setMenu(m.path, a, e.target.checked)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </Modal>

      <Modal
        open={adding} onClose={() => setAdding(false)} title="เพิ่มผู้ใช้" size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAdding(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => addUser.mutate()} disabled={!checked?.exists || addUser.isPending}>บันทึก</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="u-role">ประเภทผู้ใช้ *</label>
            <select id="u-role" className="input" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'Manager' | 'Franchise' })}>
              <option value="Manager">Manager</option>
              <option value="Franchise">Franchise</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-email">อีเมล *</label>
            <div className="flex gap-2">
              <input
                id="u-email" type="email" className="input"
                value={newUser.email}
                onChange={(e) => { setNewUser({ ...newUser, email: e.target.value }); setChecked(null) }}
              />
              <button type="button" className="btn-ghost shrink-0" onClick={() => checkEmail.mutate()} disabled={!newUser.email}>ตรวจสอบ</button>
            </div>
            {checked ? (
              <p className={clsx('mt-2 text-sm', checked.exists ? 'text-brand' : 'text-danger')}>
                {checked.exists ? `พบบัญชี: ${checked.name}` : 'ไม่พบบัญชีของอีเมลนี้ — ให้ผู้ใช้สมัครก่อน'}
              </p>
            ) : null}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeUser.mutate(deleting.id)}
        title="ลบผู้ใช้" message={`ต้องการลบสิทธิ์ของ ${deleting?.email} ออกจากสาขานี้หรือไม่`}
        confirmLabel="ลบ" tone="danger" busy={removeUser.isPending}
      />
    </div>
  )
}
