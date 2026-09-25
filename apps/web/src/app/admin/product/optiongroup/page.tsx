'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Badge, Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { baht } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Option { id: string; name: string; price: string }
interface OptionGroup {
  id: string; name: string; required: boolean; minSelect: number; maxSelect: number
  items: { optionId: string; option: Option }[]
}

interface Draft {
  id?: string
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  optionIds: string[]
}

const EMPTY: Draft = { name: '', required: false, minSelect: 0, maxSelect: 1, optionIds: [] }

export default function OptionGroupPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState<OptionGroup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const groups = useQuery({
    queryKey: ['option-groups', branchId],
    queryFn: () => api<OptionGroup[]>('/option-groups'),
    enabled: Boolean(branchId),
  })
  const options = useQuery({
    queryKey: ['options', branchId],
    queryFn: () => api<Option[]>('/options'),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: (input: Draft) =>
      input.id
        ? api(`/option-groups/${input.id}`, { method: 'PUT', body: input })
        : api('/option-groups', { method: 'POST', body: input }),
    onSuccess: () => { setDraft(null); setError(null); void qc.invalidateQueries({ queryKey: ['option-groups'] }) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/option-groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ['option-groups'] }) },
  })

  if (groups.error instanceof ApiError && groups.error.isForbidden) return <NoAccess />
  if (groups.isLoading) return <Spinner />
  const rows = groups.data ?? []
  const canEdit = can('/product/optiongroup', 'edit').allowed
  const filtered = (options.data ?? []).filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <PageHeader
        title="กลุ่มตัวเลือก" subtitle={`${rows.length} กลุ่ม`}
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => { setDraft(EMPTY); setSearch('') }}>เพิ่มกลุ่มตัวเลือก</button> : null}
      />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>ชื่อกลุ่มตัวเลือก</th><th>ต้องการ</th><th className="text-right">อย่างน้อย</th><th className="text-right">สูงสุด</th><th>ตัวเลือก</th><th></th></tr></thead>
            <tbody>
              {rows.map((g, i) => (
                <tr key={g.id}>
                  <td>{i + 1}</td>
                  <td className="font-medium">
                    {canEdit ? (
                      <button
                        type="button" className="hover:text-brand hover:underline"
                        onClick={() => setDraft({
                          id: g.id, name: g.name, required: g.required,
                          minSelect: g.minSelect, maxSelect: g.maxSelect,
                          optionIds: g.items.map((x) => x.optionId),
                        })}
                      >
                        {g.name}
                      </button>
                    ) : g.name}
                  </td>
                  <td>{g.required ? <Badge tone="amber">บังคับเลือก</Badge> : '-'}</td>
                  <td className="num">{g.minSelect}</td>
                  <td className="num">{g.maxSelect}</td>
                  <td className="max-w-[320px] truncate text-xs text-slate-500">
                    {g.items.map((x) => x.option.name).join(', ') || '-'}
                  </td>
                  <td>{can('/product/optiongroup', 'remove').allowed ? <button type="button" className="text-danger hover:underline" onClick={() => setDeleting(g)}>ลบ</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyState /> : null}
        </div>
      </Card>

      <Modal
        open={Boolean(draft)} onClose={() => setDraft(null)}
        title={draft?.id ? 'แก้ไขกลุ่มตัวเลือก' : 'เพิ่มกลุ่มตัวเลือก'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDraft(null)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => draft && save.mutate(draft)} disabled={!draft?.name || save.isPending}>บันทึก</button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="og-name">ชื่อกลุ่มตัวเลือก</label>
              <input id="og-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm">ต้องการ (บังคับเลือก)</span>
              <Toggle
                checked={draft.required} label="ต้องการ"
                onChange={(v) => setDraft({ ...draft, required: v, minSelect: v ? Math.max(1, draft.minSelect) : draft.minSelect })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="og-min">อย่างน้อย</label>
                <input id="og-min" type="number" min={0} className="input text-right" value={draft.minSelect} onChange={(e) => setDraft({ ...draft, minSelect: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="og-max">จำนวนสูงสุด</label>
                <input id="og-max" type="number" min={1} className="input text-right" value={draft.maxSelect} onChange={(e) => setDraft({ ...draft, maxSelect: Number(e.target.value) })} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label mb-0">เพิ่มตัวเลือก ({draft.optionIds.length})</span>
              </div>
              <input className="input mb-2" placeholder="ค้นหาจากชื่อตัวเลือก" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                {filtered.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox" className="h-4 w-4 accent-[#2EB88A]"
                      checked={draft.optionIds.includes(o.id)}
                      onChange={(e) => setDraft({
                        ...draft,
                        optionIds: e.target.checked
                          ? [...draft.optionIds, o.id]
                          : draft.optionIds.filter((id) => id !== o.id),
                      })}
                    />
                    <span className="text-sm">{o.name}</span>
                    <span className="ml-auto text-sm tabular-nums text-slate-400">{baht(o.price)}</span>
                  </label>
                ))}
                {filtered.length === 0 ? <EmptyState message="ไม่พบตัวเลือก" /> : null}
              </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title="ลบกลุ่มตัวเลือก" message={`ต้องการลบกลุ่ม "${deleting?.name}" หรือไม่`}
        confirmLabel="ลบ" tone="danger" busy={remove.isPending}
      />
    </div>
  )
}
