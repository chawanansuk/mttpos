'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { useCan } from '@/hooks/useSession'

interface AlertSettings {
  notifyEnabled: boolean
  notifySales: boolean
  notifyCashRound: boolean
  notifyCloseShopReport: boolean
  notifyTimeAttendance: boolean
  notifyLowStock: boolean
  notifyVoidBill: boolean
  notifyChannel: string | null
  notifyRefCode: string | null
}

const TOPICS: [keyof AlertSettings, string][] = [
  ['notifySales', 'การขาย (บิลใหม่)'],
  ['notifyCashRound', 'เปิด/ปิดรอบเงินสด'],
  ['notifyCloseShopReport', 'ใบสรุปปิดร้าน'],
  ['notifyTimeAttendance', 'เวลาเข้า-ออกพนักงาน'],
  ['notifyLowStock', 'สินค้าใกล้หมด'],
  ['notifyVoidBill', 'ยกเลิกบิล'],
]

export default function AlertPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [form, setForm] = useState<Partial<AlertSettings>>({})
  const [saved, setSaved] = useState(false)

  const query = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api<AlertSettings>(`/branches/${branchId}`),
    enabled: Boolean(branchId),
  })
  useEffect(() => { if (query.data) setForm(query.data) }, [query.data])

  const save = useMutation({
    mutationFn: () => api(`/branches/${branchId}`, { method: 'PUT', body: form }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['branch'] }) },
  })
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t) }, [saved])

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const canEdit = can('/setting/alert', 'edit').allowed
  const set = <K extends keyof AlertSettings>(k: K, v: AlertSettings[K]) => setForm({ ...form, [k]: v })

  return (
    <div className="space-y-4">
      <PageHeader
        title="การแจ้งเตือน"
        subtitle="ส่งแจ้งเตือนเหตุการณ์สำคัญไปยัง LINE หรือ Telegram"
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</button> : null}
      />
      {saved ? <p className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">บันทึกเรียบร้อย</p> : null}

      <Card className="space-y-4">
        <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3 dark:border-slate-700">
          <span className="font-medium">เปิดใช้งานการแจ้งเตือน</span>
          <Toggle checked={form.notifyEnabled ?? false} label="เปิดใช้งาน" disabled={!canEdit} onChange={(v) => set('notifyEnabled', v)} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="a-channel">ช่องทาง</label>
            <select id="a-channel" className="input" value={form.notifyChannel ?? ''} disabled={!canEdit || !form.notifyEnabled} onChange={(e) => set('notifyChannel', e.target.value || null)}>
              <option value="">เลือกช่องทาง</option>
              <option value="line">LINE</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="a-code">รหัสอ้างอิง 6 หลัก</label>
            <input
              id="a-code" className="input tracking-[0.3em]" maxLength={6}
              value={form.notifyRefCode ?? ''} disabled={!canEdit || !form.notifyEnabled}
              onChange={(e) => set('notifyRefCode', e.target.value)}
            />
          </div>
        </div>

        <div>
          <span className="label">หัวข้อแจ้งเตือน</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOPICS.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                <span className="text-sm">{label}</span>
                <Toggle
                  checked={Boolean(form[key])} label={label}
                  disabled={!canEdit || !form.notifyEnabled}
                  onChange={(v) => set(key, v as never)}
                />
              </label>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
