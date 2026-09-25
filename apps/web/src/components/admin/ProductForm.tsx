'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { PRICE_CHANNEL_LABELS, PRICE_CHANNELS, stepUnitPrice, type PriceChannel } from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { Badge, Card, ConfirmModal, EmptyState, Modal, PageHeader, Spinner, Toggle } from '@/components/ui'
import { baht, qty } from '@/lib/format'

type TabKey = 'basic' | 'optionGroups' | 'plus' | 'channels' | 'stepPrices'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: 'ข้อมูลเบื้องต้น' },
  { key: 'optionGroups', label: 'กลุ่มตัวเลือก' },
  { key: 'plus', label: 'ขนาดบรรจุอื่นๆ' },
  { key: 'channels', label: 'ช่องทางการขาย' },
  { key: 'stepPrices', label: 'ราคาขายเพิ่มเติม' },
]

interface Category { id: string; name: string; bgColor: string }
interface Unit { id: string; name: string }
interface OptionGroup { id: string; name: string; required: boolean; items: { option: { id: string; name: string; price: string } }[] }

interface Plu {
  id: string; pluCode: string; name: string; skuRatio: string; price: string; cost: string
  stockQty: string; isDefault: boolean; useStepPrice: boolean; unit?: { name: string } | null
}
interface StepPrice { id: string; minQty: string; price: string; unitPrice: string; cost: string }
interface ChannelPrice { id: string; channel: PriceChannel; enabled: boolean; price: string; diff: string }

interface ProductDetail {
  id: string
  name: string
  price: string
  stdCost: string
  barcode: string | null
  skuCode: string | null
  skuType: 'P' | 'BOM' | 'SN' | 'SV'
  vatType: 'V' | 'N'
  categoryId: string | null
  unitId: string | null
  description: string | null
  favorite: boolean
  isOnScreen: boolean
  serviceCharge: boolean
  negotiatePrice: boolean
  color: string
  lowStockThreshold: string | null
  enabled: boolean
  plus: Plu[]
  stepPrices: StepPrice[]
  channelPrices: ChannelPrice[]
  optionGroups: { optionGroupId: string }[]
  category: Category | null
  unit: Unit | null
}

interface BasicForm {
  name: string
  price: string
  stdCost: string
  barcode: string
  categoryId: string
  unitId: string
  skuType: 'P' | 'BOM' | 'SN' | 'SV'
  vatType: 'V' | 'N'
  description: string
  favorite: boolean
  isOnScreen: boolean
  serviceCharge: boolean
  negotiatePrice: boolean
  lowStockThreshold: string
  color: string
}

const EMPTY: BasicForm = {
  name: '', price: '0', stdCost: '0', barcode: '', categoryId: '', unitId: '',
  skuType: 'P', vatType: 'V', description: '', favorite: true, isOnScreen: true,
  serviceCharge: false, negotiatePrice: false, lowStockThreshold: '', color: 'rgba(158, 158, 158, 1)',
}

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const isNew = !productId

  const [tab, setTab] = useState<TabKey>('basic')
  const [form, setForm] = useState<BasicForm>(EMPTY)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmSave, setConfirmSave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ['categories', branchId],
    queryFn: () => api<Category[]>('/categories'),
    enabled: Boolean(branchId),
  })
  const units = useQuery({
    queryKey: ['units', branchId],
    queryFn: () => api<Unit[]>('/units'),
    enabled: Boolean(branchId),
  })
  const optionGroups = useQuery({
    queryKey: ['option-groups', branchId],
    queryFn: () => api<OptionGroup[]>('/option-groups'),
    enabled: Boolean(branchId),
  })
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api<ProductDetail>(`/products/${productId}`),
    enabled: Boolean(productId),
  })

  useEffect(() => {
    if (!product.data) return
    const p = product.data
    setForm({
      name: p.name,
      price: p.price,
      stdCost: p.stdCost,
      barcode: p.barcode ?? '',
      categoryId: p.categoryId ?? '',
      unitId: p.unitId ?? '',
      skuType: p.skuType,
      vatType: p.vatType,
      description: p.description ?? '',
      favorite: p.favorite,
      isOnScreen: p.isOnScreen,
      serviceCharge: p.serviceCharge,
      negotiatePrice: p.negotiatePrice,
      lowStockThreshold: p.lowStockThreshold ?? '',
      color: p.color,
    })
  }, [product.data])

  // ตั้งค่า default หน่วยบรรจุเป็น "ชิ้น" ตามต้นฉบับ
  useEffect(() => {
    if (!isNew || form.unitId || !units.data?.length) return
    const preferred = units.data.find((u) => u.name === 'ชิ้น') ?? units.data[0]!
    setForm((f) => ({ ...f, unitId: preferred.id }))
  }, [isNew, form.unitId, units.data])

  const validate = (): string[] => {
    const out: string[] = []
    if (!form.name.trim()) out.push('กรุณากรอกชื่อสินค้า')
    if (!form.categoryId) out.push('กรุณาเลือกกลุ่มสินค้า')
    if (!form.unitId) out.push('กรุณาเลือกหน่วยบรรจุ')
    if (Number.isNaN(Number(form.price))) out.push('ราคาสินค้าต้องเป็นตัวเลข')
    return out
  }

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        price: form.price || '0',
        stdCost: form.stdCost || '0',
        barcode: form.barcode.trim() || null,
        categoryId: form.categoryId,
        unitId: form.unitId,
        skuType: form.skuType,
        vatType: form.vatType,
        description: form.description || null,
        favorite: form.favorite,
        isOnScreen: form.isOnScreen,
        serviceCharge: form.serviceCharge,
        negotiatePrice: form.negotiatePrice,
        color: form.color,
        lowStockThreshold: form.lowStockThreshold === '' ? null : form.lowStockThreshold,
      }
      if (isNew) return api<ProductDetail>('/products', { method: 'POST', body })
      return api<ProductDetail>(`/products/${productId}`, { method: 'PUT', body })
    },
    onSuccess: (data) => {
      setConfirmSave(false)
      setToast('บันทึกสินค้าเรียบร้อย')
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['product', productId] })
      if (isNew) router.replace(`/admin/product/${data.id}`)
    },
    onError: (e) => {
      setConfirmSave(false)
      setErrors([e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'])
    },
  })

  const remove = useMutation({
    mutationFn: () => api(`/products/${productId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      router.replace('/admin/product')
    },
  })

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  if (productId && product.isLoading) return <Spinner />

  // แท็บอื่นเปิดได้ต่อเมื่อบันทึกข้อมูลเบื้องต้นแล้ว (ตามต้นฉบับ)
  const tabsLocked = isNew

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'เพิ่มสินค้า' : form.name || 'แก้ไขสินค้า'}
        subtitle={product.data?.barcode ? `รหัสสินค้า ${product.data.barcode}` : undefined}
        actions={
          <>
            <Link href="/admin/product" className="btn-ghost">← กลับ</Link>
            {!isNew ? (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)} aria-label="ลบสินค้า">🗑</button>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const issues = validate()
                setErrors(issues)
                if (issues.length === 0) setConfirmSave(true)
              }}
            >
              บันทึก
            </button>
          </>
        }
      />

      {toast ? (
        <div className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit p-2">
          {product.data ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg p-2">
              <span className="h-10 w-10 shrink-0 rounded" style={{ background: form.color }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{form.name}</p>
                <p className="text-xs text-slate-400">{baht(form.price)} บาท</p>
              </div>
            </div>
          ) : null}
          <nav className="space-y-1">
            {TABS.map((t) => {
              const locked = tabsLocked && t.key !== 'basic'
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={locked}
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-40',
                    tab === t.key ? 'bg-brand text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                  title={locked ? 'บันทึกข้อมูลเบื้องต้นก่อน' : undefined}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </Card>

        <Card>
          {errors.length ? (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger dark:bg-red-950/40">
              <p className="mb-1 font-medium">กรอกข้อมูลไม่ถูกต้อง</p>
              <ul className="list-inside list-disc">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ) : null}

          {tab === 'basic' ? (
            <BasicTab
              form={form} setForm={setForm}
              categories={categories.data ?? []} units={units.data ?? []}
            />
          ) : null}

          {tab === 'optionGroups' && productId ? (
            <OptionGroupTab
              productId={productId}
              groups={optionGroups.data ?? []}
              selected={product.data?.optionGroups.map((g) => g.optionGroupId) ?? []}
              onSaved={() => { void product.refetch(); setToast('บันทึกกลุ่มตัวเลือกเรียบร้อย') }}
            />
          ) : null}

          {tab === 'plus' && productId ? (
            <PluTab
              productId={productId}
              plus={product.data?.plus ?? []}
              units={units.data ?? []}
              productName={form.name}
              onChanged={() => { void product.refetch(); setToast('บันทึกขนาดบรรจุเรียบร้อย') }}
            />
          ) : null}

          {tab === 'channels' && productId ? (
            <ChannelTab
              productId={productId}
              retailPrice={form.price}
              channelPrices={product.data?.channelPrices ?? []}
              onSaved={() => { void product.refetch(); setToast('บันทึกราคาช่องทางเรียบร้อย') }}
            />
          ) : null}

          {tab === 'stepPrices' && productId ? (
            <StepPriceTab
              productId={productId}
              basePrice={form.price}
              baseCost={form.stdCost}
              steps={product.data?.stepPrices ?? []}
              onSaved={() => { void product.refetch(); setToast('บันทึกราคาขายเพิ่มเติมเรียบร้อย') }}
            />
          ) : null}
        </Card>
      </div>

      <ConfirmModal
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={() => save.mutate()}
        title="ยืนยันการบันทึกสินค้า"
        message="คุณต้องการบันทึกสินค้าหรือไม่"
        busy={save.isPending}
      />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        title="ลบสินค้า"
        message="คุณต้องการลบสินค้าหรือไม่"
        confirmLabel="ลบ"
        tone="danger"
        busy={remove.isPending}
      />
    </div>
  )
}

const PALETTE = [
  'rgba(76, 175, 80, 1)', 'rgba(255, 152, 0, 1)', 'rgba(156, 39, 176, 1)', 'rgba(244, 67, 54, 1)',
  'rgba(233, 30, 99, 1)', 'rgba(0, 188, 212, 1)', 'rgba(121, 85, 72, 1)', 'rgba(96, 125, 139, 1)',
  'rgba(139, 195, 74, 1)', 'rgba(63, 81, 181, 1)', 'rgba(33, 150, 243, 1)', 'rgba(158, 158, 158, 1)',
]

function BasicTab({
  form, setForm, categories, units,
}: {
  form: BasicForm
  setForm: (f: BasicForm) => void
  categories: Category[]
  units: Unit[]
}) {
  const set = <K extends keyof BasicForm>(key: K, value: BasicForm[K]) => setForm({ ...form, [key]: value })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <span className="label">ภาพสินค้า</span>
          <div className="h-28 w-28 rounded-card border border-slate-200 dark:border-slate-700" style={{ background: form.color }} />
          <div className="mt-2 flex w-28 flex-wrap gap-1">
            {PALETTE.map((c) => (
              <button
                key={c} type="button" aria-label="เลือกสี"
                onClick={() => set('color', c)}
                className={clsx('h-5 w-5 rounded', form.color === c && 'ring-2 ring-brand ring-offset-1')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="grid min-w-[280px] flex-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-name">* ชื่อสินค้า</label>
            <input id="pf-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pf-price">* ราคาสินค้า</label>
            <input id="pf-price" className="input text-right" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pf-cost">ต้นทุน</label>
            <input id="pf-cost" className="input text-right" inputMode="decimal" value={form.stdCost} onChange={(e) => set('stdCost', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pf-barcode">รหัสสินค้า (บาร์โค้ด)</label>
            <input id="pf-barcode" className="input" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pf-low">ปริมาณสต๊อกเหลือน้อย</label>
            <input id="pf-low" className="input text-right" inputMode="decimal" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} placeholder="ไม่แจ้งเตือน" />
          </div>
          <div>
            <label className="label" htmlFor="pf-cat">* กลุ่มสินค้า</label>
            <select id="pf-cat" className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">เลือกกลุ่มสินค้า</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pf-unit">* หน่วยบรรจุ</label>
            <select id="pf-unit" className="input" value={form.unitId} onChange={(e) => set('unitId', e.target.value)}>
              <option value="">เลือกหน่วยบรรจุ</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pf-type">* ประเภทสินค้า</label>
            <select id="pf-type" className="input" value={form.skuType} onChange={(e) => set('skuType', e.target.value as BasicForm['skuType'])}>
              <option value="P">สินค้าทั่วไป</option>
              <option value="BOM">สินค้าประกอบ (BOM)</option>
              <option value="SN">สินค้ามี Serial</option>
              <option value="SV">สินค้าบริการ (สินค้าไม่มีสต๊อก)</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="pf-desc">รายละเอียดสินค้า</label>
        <textarea
          id="pf-desc" className="input min-h-[80px] py-2" maxLength={5000}
          value={form.description} onChange={(e) => set('description', e.target.value)}
        />
        <p className="mt-1 text-right text-xs text-slate-400">({form.description.length}/5000)</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {([
          ['vatType', 'สินค้ามีภาษี', form.vatType === 'V'],
          ['favorite', 'สินค้า-นิยม', form.favorite],
          ['serviceCharge', 'ค่าบริการ', form.serviceCharge],
          ['isOnScreen', 'แสดงบนหน้าขาย', form.isOnScreen],
          ['negotiatePrice', 'ราคาด่วน', form.negotiatePrice],
        ] as const).map(([key, label, checked]) => (
          <label key={key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <span className="text-sm">{label}</span>
            <Toggle
              checked={checked}
              label={label}
              onChange={(v) => {
                if (key === 'vatType') set('vatType', v ? 'V' : 'N')
                else set(key, v as never)
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function OptionGroupTab({
  productId, groups, selected, onSaved,
}: { productId: string; groups: OptionGroup[]; selected: string[]; onSaved: () => void }) {
  const [picked, setPicked] = useState<string[]>(selected)
  useEffect(() => setPicked(selected), [selected])

  const save = useMutation({
    mutationFn: () => api(`/products/${productId}/option-groups`, { method: 'PUT', body: { optionGroupIds: picked } }),
    onSuccess: onSaved,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">กลุ่มตัวเลือกที่ใช้งาน รวม {picked.length}</h2>
        <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          บันทึกกลุ่มตัวเลือก
        </button>
      </div>
      {groups.length === 0 ? (
        <EmptyState message="ยังไม่มีกลุ่มตัวเลือกในร้าน — สร้างได้ที่หน้า กลุ่มตัวเลือก" />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <label key={g.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="checkbox" className="mt-1 h-4 w-4 accent-[#2EB88A]"
                checked={picked.includes(g.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, g.id] : picked.filter((id) => id !== g.id))}
              />
              <div>
                <p className="text-sm font-medium">
                  {g.name} {g.required ? <Badge tone="amber">ต้องการ</Badge> : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {g.items.map((i) => `${i.option.name} ${baht(i.option.price)}`).join(' · ') || 'ไม่มีตัวเลือกในกลุ่ม'}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function PluTab({
  productId, plus, units, productName, onChanged,
}: { productId: string; plus: Plu[]; units: Unit[]; productName: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    pluCode: '', name: productName, unitId: units[0]?.id ?? '', skuRatio: '1', price: '0', cost: '0', useStepPrice: false,
  })

  const create = useMutation({
    mutationFn: () => api(`/products/${productId}/plus`, { method: 'POST', body: draft }),
    onSuccess: () => { setOpen(false); setError(null); onChanged() },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ'),
  })
  const remove = useMutation({
    mutationFn: (pluId: string) => api(`/products/${productId}/plus/${pluId}`, { method: 'DELETE' }),
    onSuccess: onChanged,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ลบไม่สำเร็จ'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">ขนาดบรรจุอื่นๆ</h2>
        <button
          type="button" className="btn-primary"
          onClick={() => {
            setDraft({ pluCode: '', name: productName, unitId: units[0]?.id ?? '', skuRatio: '1', price: '0', cost: '0', useStepPrice: false })
            setOpen(true)
          }}
        >
          เพิ่มขนาดบรรจุอื่นๆ
        </button>
      </div>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วยบรรจุ</th>
              <th className="text-right">ตัดสต็อก</th><th className="text-right">ราคาสินค้า</th>
              <th className="text-right">คงเหลือ</th><th>Step price</th><th></th>
            </tr>
          </thead>
          <tbody>
            {plus.map((p) => (
              <tr key={p.id}>
                <td>{p.pluCode}</td>
                <td className="max-w-[240px] truncate" title={p.name}>
                  {p.name} {p.isDefault ? <Badge tone="green">หลัก</Badge> : null}
                </td>
                <td>{p.unit?.name ?? '-'}</td>
                <td className="num">{qty(p.skuRatio)}</td>
                <td className="num">{baht(p.price)}</td>
                <td className="num">{p.isDefault ? qty(p.stockQty) : '-'}</td>
                <td>{p.useStepPrice || p.isDefault ? 'ใช้' : '-'}</td>
                <td>
                  {p.isDefault ? null : (
                    <button type="button" className="text-danger hover:underline" onClick={() => remove.mutate(p.id)}>ลบ</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} title="เพิ่มขนาดบรรจุอื่นๆ"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => create.mutate()} disabled={create.isPending}>บันทึก</button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="plu-name">ชื่อสินค้า</label>
            <input id="plu-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="plu-code">รหัสสินค้า (บาร์โค้ด ห้ามซ้ำ)</label>
            <input id="plu-code" className="input" value={draft.pluCode} onChange={(e) => setDraft({ ...draft, pluCode: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="plu-unit">หน่วยบรรจุ</label>
            <select id="plu-unit" className="input" value={draft.unitId} onChange={(e) => setDraft({ ...draft, unitId: e.target.value })}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="plu-ratio">ตัดสต็อก (1 หน่วยนี้ = กี่หน่วยฐาน)</label>
            <input id="plu-ratio" className="input text-right" inputMode="decimal" value={draft.skuRatio} onChange={(e) => setDraft({ ...draft, skuRatio: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="plu-price">ราคาสินค้า</label>
            <input id="plu-price" className="input text-right" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" className="h-4 w-4 accent-[#2EB88A]"
                checked={draft.useStepPrice}
                onChange={(e) => setDraft({ ...draft, useStepPrice: e.target.checked })}
              />
              ใช้ราคาขายเพิ่มเติมเมื่อถึงจำนวนที่กำหนดไว้
            </label>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Modal>
    </div>
  )
}

function ChannelTab({
  productId, retailPrice, channelPrices, onSaved,
}: { productId: string; retailPrice: string; channelPrices: ChannelPrice[]; onSaved: () => void }) {
  const initial = useMemo(() => {
    const map = new Map(channelPrices.map((c) => [c.channel, c]))
    return PRICE_CHANNELS.map((channel) => ({
      channel,
      enabled: map.get(channel)?.enabled ?? (channel === 'retail'),
      price: map.get(channel)?.price ?? retailPrice,
    }))
  }, [channelPrices, retailPrice])

  const [rows, setRows] = useState(initial)
  useEffect(() => setRows(initial), [initial])

  const save = useMutation({
    mutationFn: () =>
      api(`/products/${productId}/channel-prices`, {
        method: 'PUT',
        body: { channels: rows.filter((r) => r.channel !== 'retail') },
      }),
    onSuccess: onSaved,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">ราคาตามช่องทางการขาย</h2>
        <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึกราคาช่องทาง</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row, i) => {
          const isRetail = row.channel === 'retail'
          const diff = Number(row.price) - Number(retailPrice)
          return (
            <div key={row.channel} className="rounded-card border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">{PRICE_CHANNEL_LABELS[row.channel]}</p>
                {isRetail ? (
                  <Badge tone="green">NO GP</Badge>
                ) : (
                  <Toggle
                    checked={row.enabled}
                    label={PRICE_CHANNEL_LABELS[row.channel]}
                    onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, enabled: v } : r)))}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input text-right" inputMode="decimal"
                  value={isRetail ? retailPrice : row.price}
                  disabled={isRetail || !row.enabled}
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))}
                />
                {!isRetail && row.enabled ? (
                  <span className={clsx('w-20 shrink-0 text-right text-xs tabular-nums', diff < 0 ? 'text-danger' : 'text-brand')}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StepPriceTab({
  productId, basePrice, baseCost, steps, onSaved,
}: { productId: string; basePrice: string; baseCost: string; steps: StepPrice[]; onSaved: () => void }) {
  const [rows, setRows] = useState<{ minQty: string; price: string }[]>(
    steps.filter((s) => Number(s.minQty) > 1).map((s) => ({ minQty: s.minQty, price: s.price })),
  )
  useEffect(() => {
    setRows(steps.filter((s) => Number(s.minQty) > 1).map((s) => ({ minQty: s.minQty, price: s.price })))
  }, [steps])

  const save = useMutation({
    mutationFn: () => api(`/products/${productId}/step-prices`, { method: 'PUT', body: { steps: rows } }),
    onSuccess: onSaved,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">ราคาขายเพิ่มเติม (ตามจำนวน)</h2>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { minQty: '2', price: basePrice }])}>
            เพิ่มราคาขาย
          </button>
          <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึก</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="text-right">จำนวน/ราคาขาย</th>
              <th className="text-right">ต้นทุน</th>
              <th className="text-right">ราคาขาย</th>
              <th className="text-right">ราคาขาย/หน่วย</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="opacity-60">
              <td className="num">1</td>
              <td className="num">{baht(baseCost)}</td>
              <td className="num">{baht(basePrice)}</td>
              <td className="num">{baht(basePrice)}</td>
              <td className="text-xs text-slate-400">ราคาปกติ</td>
            </tr>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="input h-9 w-24 text-right" inputMode="decimal" value={row.minQty}
                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, minQty: e.target.value } : r)))}
                    aria-label="จำนวนขั้นต่ำ"
                  />
                </td>
                <td className="num">{baht(Number(baseCost) * Number(row.minQty || 0))}</td>
                <td>
                  <input
                    className="input h-9 w-28 text-right" inputMode="decimal" value={row.price}
                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))}
                    aria-label="ราคาขายของชุด"
                  />
                </td>
                <td className="num font-medium">{stepUnitPrice(row.price || '0', row.minQty || '1')}</td>
                <td>
                  <button type="button" className="text-danger hover:underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState message="ยังไม่มีราคาขายเพิ่มเติม" /> : null}
      </div>
    </div>
  )
}
