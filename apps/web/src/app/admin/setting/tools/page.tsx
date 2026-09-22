'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Badge, Card, ConfirmModal, EmptyState, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { dateTimeTH } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Device {
  id: string
  posNumber: string
  posType: string
  deviceName: string | null
  deviceType: string
  appVersion: string | null
  status: string
  enabled: boolean
  printReceipt: boolean
  scan: boolean
  itemSize: string
  receiptType: number
  printerIp: string | null
  invoiceRunNumber: number
  lastUsedAt: string | null
  lastSyncProductAt: string | null
}

export default function ToolsPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [releasing, setReleasing] = useState<Device | null>(null)

  const query = useQuery({
    queryKey: ['pos-devices', branchId],
    queryFn: () => api<Device[]>(`/branches/${branchId}/pos-devices`),
    enabled: Boolean(branchId),
  })

  const patch = useMutation({
    mutationFn: (input: { id: string } & Partial<Device>) => {
      const { id, ...body } = input
      return api(`/pos-devices/${id}`, { method: 'PATCH', body })
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pos-devices'] }),
  })
  const release = useMutation({
    mutationFn: (id: string) => api(`/pos-devices/${id}/release`, { method: 'POST' }),
    onSuccess: () => { setReleasing(null); void qc.invalidateQueries({ queryKey: ['pos-devices'] }) },
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const rows = query.data ?? []
  const canEdit = can('/setting/tools', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader title="เครื่องมือสำหรับผู้ดูแลระบบ" subtitle="จัดการเครื่อง POS สำหรับร้านค้า" />

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((d) => (
          <Card key={d.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">หมายเลขเครื่อง POS - {d.posNumber}</p>
                <p className="text-sm text-slate-500">{d.deviceName ?? '-'} · {d.deviceType}</p>
              </div>
              <Badge tone={d.status === 'กำลังถูกใช้งาน' ? 'green' : 'slate'}>{d.status}</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-1.5 text-sm">
              <div className="flex gap-2"><dt className="text-slate-500">ประเภท</dt><dd>{d.posType}</dd></div>
              <div className="flex gap-2"><dt className="text-slate-500">เวอร์ชั่น</dt><dd>{d.appVersion ?? '-'}</dd></div>
              <div className="flex gap-2"><dt className="text-slate-500">เลขบิลล่าสุด</dt><dd className="tabular-nums">{d.invoiceRunNumber}</dd></div>
              <div className="flex gap-2"><dt className="text-slate-500">ใช้งานล่าสุด</dt><dd>{d.lastUsedAt ? dateTimeTH(d.lastUsedAt) : '-'}</dd></div>
              <div className="col-span-2 flex gap-2"><dt className="text-slate-500">ซิงค์ล่าสุด</dt><dd>{d.lastSyncProductAt ? dateTimeTH(d.lastSyncProductAt) : 'ยังไม่เคยซิงค์'}</dd></div>
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                พิมพ์ใบเสร็จอัตโนมัติ
                <Toggle checked={d.printReceipt} label="พิมพ์อัตโนมัติ" disabled={!canEdit} onChange={(v) => patch.mutate({ id: d.id, printReceipt: v })} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                ใช้เครื่องสแกน
                <Toggle checked={d.scan} label="ใช้เครื่องสแกน" disabled={!canEdit} onChange={(v) => patch.mutate({ id: d.id, scan: v })} />
              </label>
              <div>
                <label className="label" htmlFor={`size-${d.id}`}>ขนาดปุ่มสินค้า</label>
                <select
                  id={`size-${d.id}`} className="input" value={d.itemSize} disabled={!canEdit}
                  onChange={(e) => patch.mutate({ id: d.id, itemSize: e.target.value })}
                >
                  <option value="SMALL">ปกติ</option>
                  <option value="LARGE">ใหญ่</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`rt-${d.id}`}>รูปแบบใบเสร็จ</label>
                <select
                  id={`rt-${d.id}`} className="input" value={d.receiptType} disabled={!canEdit}
                  onChange={(e) => patch.mutate({ id: d.id, receiptType: Number(e.target.value) })}
                >
                  <option value={1}>ใบเสร็จย่อ 58mm</option>
                  <option value={2}>ใบเสร็จ 80mm</option>
                  <option value={3}>A4</option>
                </select>
              </div>
            </div>

            {canEdit ? (
              <button type="button" className="btn-danger w-full" onClick={() => setReleasing(d)}>
                ปลดการใช้งานเครื่อง POS
              </button>
            ) : null}
          </Card>
        ))}
        {rows.length === 0 ? <EmptyState /> : null}
      </div>

      <ConfirmModal
        open={Boolean(releasing)} onClose={() => setReleasing(null)}
        onConfirm={() => releasing && release.mutate(releasing.id)}
        title="ปลดการใช้งานเครื่อง POS"
        message={`ต้องการปลดเครื่อง ${releasing?.posNumber} หรือไม่ หลังปลดแล้วเครื่องอื่นจะมาผูกหมายเลขนี้ได้`}
        confirmLabel="ปลดการใช้งาน" tone="danger" busy={release.isPending}
      />
    </div>
  )
}
