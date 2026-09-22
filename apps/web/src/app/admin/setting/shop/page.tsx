'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BUSINESS_TYPES } from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { Card, ConfirmModal, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { useCan } from '@/hooks/useSession'

interface Branch {
  id: string
  branchName: string
  businessType: number
  address1: string | null
  address2: string | null
  tel: string | null
  taxId: string
  timezone: string
  currency: string
  openTime: string
  closeTime: string
  vatRate: string
  isVatIncluded: boolean
  enabledServiceCharge: boolean
  serviceChargeRate: string
  roundingType: 'none' | 'up' | 'down' | 'nearest'
  roundingAmount: string
  isAvgCost: boolean
  fastInput: string
  cashManagement: boolean
  isMultiplePayment: boolean
  editableItem: boolean
  isSoldByWeight: boolean
  bahtPerPoint: string
  plan: string
  expireAt: string | null
  shop: { id: string; name: string }
}

export default function ShopSettingPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [form, setForm] = useState<Partial<Branch>>({})
  const [confirm, setConfirm] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api<Branch>(`/branches/${branchId}`),
    enabled: Boolean(branchId),
  })
  useEffect(() => { if (query.data) setForm(query.data) }, [query.data])

  const save = useMutation({
    mutationFn: () => api(`/branches/${branchId}`, { method: 'PUT', body: form }),
    onSuccess: () => { setConfirm(false); setSaved(true); setError(null); void qc.invalidateQueries({ queryKey: ['branch'] }) },
    onError: (e) => { setConfirm(false); setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ') },
  })
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t) }, [saved])

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const canEdit = can('/setting/shop', 'edit').allowed
  const set = <K extends keyof Branch>(k: K, v: Branch[K]) => setForm({ ...form, [k]: v })

  return (
    <div className="space-y-4">
      <PageHeader
        title="ร้านค้า"
        subtitle="จัดการข้อมูลร้านค้าเบื้องต้น"
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => setConfirm(true)}>อัปเดตข้อมูล</button> : null}
      />
      {saved ? <p className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">บันทึกเรียบร้อย</p> : null}
      {error ? <p className="rounded-card bg-red-50 px-4 py-2.5 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold">ข้อมูลร้าน</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="s-shop">ชื่อร้าน</label>
            <input id="s-shop" className="input" value={query.data?.shop.name ?? ''} disabled />
          </div>
          <div>
            <label className="label" htmlFor="s-branch">* สาขา</label>
            <input id="s-branch" className="input" value={form.branchName ?? ''} disabled={!canEdit} onChange={(e) => set('branchName', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-type">* ประเภทธุรกิจ</label>
            <select id="s-type" className="input" value={form.businessType ?? 0} disabled={!canEdit} onChange={(e) => set('businessType', Number(e.target.value))}>
              {BUSINESS_TYPES.map((t, i) => <option key={t} value={i}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-tax">เลขประจำตัวผู้เสียภาษี</label>
            <input id="s-tax" className="input" value={form.taxId ?? ''} disabled={!canEdit} onChange={(e) => set('taxId', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-tel">เบอร์โทรศัพท์</label>
            <input id="s-tel" className="input" value={form.tel ?? ''} disabled={!canEdit} onChange={(e) => set('tel', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-cur">สกุลเงิน</label>
            <input id="s-cur" className="input" value={form.currency ?? 'THB'} disabled={!canEdit} onChange={(e) => set('currency', e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="s-addr1">ที่อยู่บรรทัดที่ 1</label>
            <input id="s-addr1" className="input" value={form.address1 ?? ''} disabled={!canEdit} onChange={(e) => set('address1', e.target.value)} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="s-addr2">ที่อยู่บรรทัดที่ 2</label>
            <input id="s-addr2" className="input" value={form.address2 ?? ''} disabled={!canEdit} onChange={(e) => set('address2', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-open">เวลาเปิดร้าน</label>
            <input id="s-open" type="time" className="input" value={form.openTime ?? '00:00'} disabled={!canEdit} onChange={(e) => set('openTime', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-close">เวลาปิดร้าน</label>
            <input id="s-close" type="time" className="input" value={form.closeTime ?? '23:59'} disabled={!canEdit} onChange={(e) => set('closeTime', e.target.value)} />
          </div>
          <p className="self-end text-xs text-amber-600">
            ⚠️ เวลาเปิด-ปิดร้านใช้ตัด &ldquo;วันขาย&rdquo; ในรายงานรายวัน การแก้ไขจะทำให้ตัวเลขในรายงานเปลี่ยน
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold">ภาษี ค่าบริการ และการปัดเศษ</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="s-vat">ภาษีมูลค่าเพิ่ม (%)</label>
            <input id="s-vat" className="input text-right" inputMode="decimal" value={form.vatRate ?? '0'} disabled={!canEdit} onChange={(e) => set('vatRate', e.target.value)} />
          </div>
          <label className="flex items-center justify-between self-end rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm">ราคาสินค้ารวม VAT แล้ว</span>
            <Toggle checked={form.isVatIncluded ?? false} label="รวม VAT" disabled={!canEdit} onChange={(v) => set('isVatIncluded', v)} />
          </label>
          <div>
            <label className="label" htmlFor="s-sc">ค่าบริการ (%)</label>
            <input id="s-sc" className="input text-right" inputMode="decimal" value={form.serviceChargeRate ?? '0'} disabled={!canEdit} onChange={(e) => set('serviceChargeRate', e.target.value)} />
          </div>
          <label className="flex items-center justify-between self-end rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm">เปิดใช้ค่าบริการ</span>
            <Toggle checked={form.enabledServiceCharge ?? false} label="ค่าบริการ" disabled={!canEdit} onChange={(v) => set('enabledServiceCharge', v)} />
          </label>
          <div>
            <label className="label" htmlFor="s-round">การปัดเศษ</label>
            <select id="s-round" className="input" value={form.roundingType ?? 'none'} disabled={!canEdit} onChange={(e) => set('roundingType', e.target.value as Branch['roundingType'])}>
              <option value="none">ไม่ปัดเศษ</option>
              <option value="up">ปัดขึ้น</option>
              <option value="down">ปัดลง</option>
              <option value="nearest">ปัดใกล้ที่สุด</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-roundamt">หน่วยการปัด</label>
            <select id="s-roundamt" className="input" value={form.roundingAmount ?? '1'} disabled={!canEdit} onChange={(e) => set('roundingAmount', e.target.value)}>
              <option value="0.25">0.25</option>
              <option value="0.5">0.50</option>
              <option value="1">1.00</option>
            </select>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm">ใช้ต้นทุนเฉลี่ย</span>
            <Toggle checked={form.isAvgCost ?? false} label="ต้นทุนเฉลี่ย" disabled={!canEdit} onChange={(v) => set('isAvgCost', v)} />
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold">พฤติกรรมหน้าขาย</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="s-fast">ปุ่มจำนวนเงินด่วน (คั่นด้วยจุลภาค)</label>
            <input id="s-fast" className="input" value={form.fastInput ?? ''} disabled={!canEdit} onChange={(e) => set('fastInput', e.target.value)} placeholder="20,50,100,500,1000" />
          </div>
          <div>
            <label className="label" htmlFor="s-point">เงินกี่บาท = 1 คะแนนสมาชิก</label>
            <input id="s-point" className="input text-right" inputMode="decimal" value={form.bahtPerPoint ?? '0'} disabled={!canEdit} onChange={(e) => set('bahtPerPoint', e.target.value)} />
          </div>
          {([
            ['cashManagement', 'เปิดใช้การจัดการเงินสด (รอบการขาย)'],
            ['isMultiplePayment', 'ชำระหลายช่องทางต่อบิล'],
            ['editableItem', 'แก้ไขชื่อ/ราคาในตะกร้าได้'],
            ['isSoldByWeight', 'ขายตามน้ำหนัก'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <span className="text-sm">{label}</span>
              <Toggle checked={Boolean(form[key])} label={label} disabled={!canEdit} onChange={(v) => set(key, v as never)} />
            </label>
          ))}
        </div>
      </Card>

      <ConfirmModal
        open={confirm} onClose={() => setConfirm(false)} onConfirm={() => save.mutate()}
        title="ยืนยันการบันทึก" message="คุณต้องการอัปเดตข้อมูลร้านค้าหรือไม่" busy={save.isPending}
      />
    </div>
  )
}
