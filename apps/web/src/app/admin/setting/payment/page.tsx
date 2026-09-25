'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { useCan } from '@/hooks/useSession'

interface PaymentConfig {
  id: string
  methodKey: string
  label: string
  enabled: boolean
  config: Record<string, unknown> | null
  isCustom: boolean
}

export default function PaymentSettingPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [rows, setRows] = useState<PaymentConfig[]>([])
  const [saved, setSaved] = useState(false)

  const query = useQuery({
    queryKey: ['payment-config', branchId],
    queryFn: () => api<PaymentConfig[]>(`/branches/${branchId}/payment-config`),
    enabled: Boolean(branchId),
  })
  useEffect(() => { if (query.data) setRows(query.data) }, [query.data])

  const save = useMutation({
    mutationFn: () =>
      api(`/branches/${branchId}/payment-config`, {
        method: 'PUT',
        body: { methods: rows.map((r) => ({ methodKey: r.methodKey, label: r.label, enabled: r.enabled, config: r.config })) },
      }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['payment-config'] }) },
  })
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t) }, [saved])

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const canEdit = can('/setting/payment', 'edit').allowed

  const setConfig = (i: number, key: string, value: string | boolean) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, config: { ...(r.config ?? {}), [key]: value } } : r)))

  return (
    <div className="space-y-4">
      <PageHeader
        title="การชำระเงิน"
        subtitle="เลือกประเภทการชำระเงินสำหรับร้านค้า"
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</button> : null}
      />
      {saved ? <p className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">บันทึกเรียบร้อย</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r, i) => (
          <Card key={r.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{r.label}</p>
              <Toggle
                checked={r.enabled} label={r.label}
                disabled={!canEdit || r.methodKey === 'cash'}
                onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, enabled: v } : x)))}
              />
            </div>
            {r.methodKey === 'cash' ? <p className="text-xs text-slate-400">เงินสดเปิดใช้งานเสมอ</p> : null}

            {r.methodKey === 'promptpay' && r.enabled ? (
              <div className="space-y-2">
                <div>
                  <label className="label" htmlFor="pp-id">Mobile No. / ID Card / TAX ID</label>
                  <input
                    id="pp-id" className="input" disabled={!canEdit}
                    value={String(r.config?.id ?? '')}
                    onChange={(e) => setConfig(i, 'id', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="pp-name">Account name</label>
                  <input
                    id="pp-name" className="input" disabled={!canEdit}
                    value={String(r.config?.accountName ?? '')}
                    onChange={(e) => setConfig(i, 'accountName', e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox" className="h-4 w-4 accent-[#2EB88A]" disabled={!canEdit}
                    checked={Boolean(r.config?.showOnReceipt)}
                    onChange={(e) => setConfig(i, 'showOnReceipt', e.target.checked)}
                  />
                  แสดง QR บนใบเสร็จ
                </label>
              </div>
            ) : null}

            {r.methodKey === 'edc' && r.enabled ? (
              <div>
                <label className="label" htmlFor="edc-ip">EDC Wi-Fi IP</label>
                <input id="edc-ip" className="input" disabled={!canEdit} value={String(r.config?.wifiIp ?? '')} onChange={(e) => setConfig(i, 'wifiIp', e.target.value)} />
              </div>
            ) : null}

            {r.methodKey === 'linepay' && r.enabled ? (
              <div className="space-y-2">
                <div>
                  <label className="label" htmlFor="lp-id">Channel ID</label>
                  <input id="lp-id" className="input" disabled={!canEdit} value={String(r.config?.channelId ?? '')} onChange={(e) => setConfig(i, 'channelId', e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="lp-secret">Channel Secret</label>
                  <input id="lp-secret" type="password" className="input" disabled={!canEdit} value={String(r.config?.channelSecret ?? '')} onChange={(e) => setConfig(i, 'channelSecret', e.target.value)} />
                </div>
              </div>
            ) : null}

            {r.methodKey === 'thaidotcom' && r.enabled ? (
              <div>
                <label className="label" htmlFor="tdc-id">Merchant ID</label>
                <input id="tdc-id" className="input" disabled={!canEdit} value={String(r.config?.merchantId ?? '')} onChange={(e) => setConfig(i, 'merchantId', e.target.value)} />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  )
}
