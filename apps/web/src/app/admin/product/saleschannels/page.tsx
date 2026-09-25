'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { useCan } from '@/hooks/useSession'

interface ChannelConfig { id: string; channel: string; label: string; enabled: boolean; gpPercent: string }

export default function SalesChannelsPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [rows, setRows] = useState<ChannelConfig[]>([])
  const [saved, setSaved] = useState(false)

  const query = useQuery({
    queryKey: ['sales-channels', branchId],
    queryFn: () => api<ChannelConfig[]>('/sales-channels'),
    enabled: Boolean(branchId),
  })
  useEffect(() => { if (query.data) setRows(query.data) }, [query.data])

  const save = useMutation({
    mutationFn: () =>
      api('/sales-channels', {
        method: 'PUT',
        body: { channels: rows.map((r) => ({ channel: r.channel, enabled: r.enabled, gpPercent: r.gpPercent })) },
      }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['sales-channels'] }) },
  })
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t) }, [saved])

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const canEdit = can('/product/saleschannels', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="ช่องทางการขาย"
        subtitle="ตั้งค่าช่องทางการขาย สำหรับรายการเดลิเวอรี่"
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</button> : null}
      />
      {saved ? <p className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">บันทึกเรียบร้อย</p> : null}
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c, i) => (
            <div key={c.id} className="rounded-card border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">{c.label}</p>
                <Toggle
                  checked={c.enabled} label={c.label} disabled={!canEdit}
                  onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, enabled: v } : r)))}
                />
              </div>
              <label className="label" htmlFor={`gp-${c.channel}`}>GP (%)</label>
              <input
                id={`gp-${c.channel}`} className="input text-right" inputMode="decimal"
                value={c.gpPercent} disabled={!canEdit}
                onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, gpPercent: e.target.value } : r)))}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
