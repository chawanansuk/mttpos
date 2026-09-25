'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, NoAccess, PageHeader, Spinner, Toggle } from '@/components/ui'
import { useCan } from '@/hooks/useSession'

interface ReceiptSettings {
  receiptHeader: string
  headerShowOnReceipt: boolean
  footer1: string | null
  footer2: string | null
  showDetailOnReceipt: boolean
  showNoteOnReceipt: boolean
  showQueueOnReceipt: boolean
  showBarcodeOnReceipt: boolean
  showVatOnReceipt: boolean
  showOptionGroupOnReceipt: boolean
  wordingToReplace: string
  receiptFormat: 'abb' | 'receipt' | 'custom'
  receiptUseBuddhistYear: boolean
  taxInvoiceSignerName: string | null
  promptpayShowOnReceipt: boolean
  promptpayAccName: string | null
}

export default function ReceiptSettingPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [form, setForm] = useState<Partial<ReceiptSettings>>({})
  const [saved, setSaved] = useState(false)

  const query = useQuery({
    queryKey: ['receipt-settings', branchId],
    queryFn: () => api<ReceiptSettings>(`/branches/${branchId}/receipt-settings`),
    enabled: Boolean(branchId),
  })
  useEffect(() => { if (query.data) setForm(query.data) }, [query.data])

  const save = useMutation({
    mutationFn: () => api(`/branches/${branchId}/receipt-settings`, { method: 'PUT', body: form }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['receipt-settings'] }) },
  })
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t) }, [saved])

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const canEdit = can('/setting/receipt', 'edit').allowed
  const set = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) => setForm({ ...form, [k]: v })

  const toggles: [keyof ReceiptSettings, string][] = [
    ['showQueueOnReceipt', 'แสดงคิวบนใบเสร็จ'],
    ['showBarcodeOnReceipt', 'แสดงบาร์โค้ดบนใบเสร็จ'],
    ['showDetailOnReceipt', 'แสดงรายละเอียดใบเสร็จ'],
    ['showNoteOnReceipt', 'แสดงหมายเหตุบนใบเสร็จ'],
    ['showOptionGroupOnReceipt', 'แสดงชื่อกลุ่มตัวเลือก'],
    ['showVatOnReceipt', 'แสดง VAT บนใบเสร็จ'],
    ['headerShowOnReceipt', 'แสดงหัวใบเสร็จ'],
    ['promptpayShowOnReceipt', 'แสดง QR พร้อมเพย์ท้ายบิล'],
    ['receiptUseBuddhistYear', 'แสดงปีเป็น พ.ศ.'],
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="ใบเสร็จรับเงิน"
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึกการตั้งค่า</button> : null}
      />
      {saved ? <p className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">บันทึกเรียบร้อย</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">🖨️ การพิมพ์ทั่วไป</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="r-format">รูปแบบใบเสร็จ</label>
                <select id="r-format" className="input" value={form.receiptFormat ?? 'abb'} disabled={!canEdit} onChange={(e) => set('receiptFormat', e.target.value as ReceiptSettings['receiptFormat'])}>
                  <option value="abb">ใบกำกับภาษีอย่างย่อ</option>
                  <option value="receipt">ใบเสร็จรับเงิน</option>
                  <option value="custom">กำหนดเอง</option>
                </select>
              </div>
              {toggles.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                  <span className="text-sm">{label}</span>
                  <Toggle checked={Boolean(form[key])} label={label} disabled={!canEdit} onChange={(v) => set(key, v as never)} />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold">📋 ข้อความบนใบเสร็จ</h2>
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="r-header">หัวใบเสร็จ</label>
                <input id="r-header" className="input" value={form.receiptHeader ?? ''} disabled={!canEdit} onChange={(e) => set('receiptHeader', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="r-word">คำแทนที่ (Wording to Replace)</label>
                <input id="r-word" className="input" value={form.wordingToReplace ?? ''} disabled={!canEdit} onChange={(e) => set('wordingToReplace', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="r-f1">ท้ายบิล บรรทัดที่ 1</label>
                <input id="r-f1" className="input" value={form.footer1 ?? ''} disabled={!canEdit} onChange={(e) => set('footer1', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="r-f2">ท้ายบิล บรรทัดที่ 2</label>
                <input id="r-f2" className="input" value={form.footer2 ?? ''} disabled={!canEdit} onChange={(e) => set('footer2', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="r-signer">ชื่อผู้มีอำนาจลงนาม (ใบกำกับภาษีเต็มรูป)</label>
                <input id="r-signer" className="input" value={form.taxInvoiceSignerName ?? ''} disabled={!canEdit} onChange={(e) => set('taxInvoiceSignerName', e.target.value)} />
              </div>
            </div>
          </Card>
        </div>

        {/* ตัวอย่างใบเสร็จ */}
        <Card className="h-fit">
          <h2 className="mb-3 text-sm font-semibold">ตัวอย่างใบเสร็จ</h2>
          <div className="mx-auto max-w-[300px] rounded border border-dashed border-slate-300 bg-white p-4 font-mono text-[11px] leading-relaxed text-slate-800 dark:border-slate-600">
            <p className="text-center text-sm font-bold">ร้านมีดีทวีคูณ</p>
            <p className="text-center">สาขา: สำเพ็ง</p>
            {form.headerShowOnReceipt ? <p className="text-center">{form.receiptHeader}</p> : null}
            <p className="mt-1 text-center font-semibold">
              {form.receiptFormat === 'receipt' ? 'ใบเสร็จรับเงิน' : 'ใบกำกับภาษีอย่างย่อ'}
            </p>
            <p className="text-center">ตลาดเก่า สำเพ็ง Chinatown , Bangkok</p>
            <p className="text-center">โทร 0616629659</p>
            <p className="mt-1">วันที่: 22/09/{form.receiptUseBuddhistYear ? '2569' : '2026'} 09:36</p>
            <p>Invoice #: PS002006889</p>
            <p>POS #: 002   พนักงาน: cashier1</p>
            {form.showQueueOnReceipt ? <p>คิว: 23</p> : null}
            <p className="my-1 border-t border-dashed border-slate-300" />
            <div className="flex justify-between"><span>Qty {form.wordingToReplace || 'รายการ'}</span><span>Total</span></div>
            <p className="my-1 border-t border-dashed border-slate-300" />
            {form.showDetailOnReceipt ? (
              <>
                <div className="flex justify-between"><span>6 KIWI512 มีด512</span><span>120.00</span></div>
                <p className="pl-3 text-slate-500">@30.00 ส่วนลด -60.00</p>
                <div className="flex justify-between"><span>6 KIWI502 มีด502</span><span>160.00</span></div>
                <p className="pl-3 text-slate-500">@40.00 ส่วนลด -80.00</p>
              </>
            ) : (
              <div className="flex justify-between"><span>19 รายการ</span><span>680.00</span></div>
            )}
            <p className="my-1 border-t border-dashed border-slate-300" />
            <div className="flex justify-between"><span>รวมเป็นเงิน</span><span>970.00</span></div>
            <div className="flex justify-between"><span>ส่วนลด</span><span>-290.00</span></div>
            {form.showVatOnReceipt ? <div className="flex justify-between"><span>VAT 0%</span><span>0.00</span></div> : null}
            <div className="mt-1 flex justify-between text-sm font-bold"><span>จำนวน 19 ชิ้น</span><span>680.00</span></div>
            <p className="my-1 border-t border-dashed border-slate-300" />
            <p>การชำระเงิน</p>
            <div className="flex justify-between"><span>เงินสด</span><span>680.00</span></div>
            <div className="flex justify-between"><span>เงินทอน</span><span>0.00</span></div>
            {form.promptpayShowOnReceipt ? (
              <p className="mt-2 text-center text-slate-500">[ QR พร้อมเพย์ — {form.promptpayAccName ?? 'ร้านค้า'} ]</p>
            ) : null}
            <p className="mt-2 text-center">{form.footer1}</p>
            <p className="text-center">{form.footer2}</p>
            <p className="mt-2 text-center text-slate-400">Powered by Medee POS</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
