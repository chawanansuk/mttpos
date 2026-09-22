'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { db, type LocalCategory, type LocalProduct, type LocalUnit } from '@/lib/pos/db'
import { pullMaster } from '@/lib/pos/sync'
import { PosHeader } from '@/components/pos/PosHeader'
import { Modal } from '@/components/ui'
import { baht, qty as fmtQty } from '@/lib/format'

/** สินค้าทั้งหมดบนเครื่อง — ค้นหา ดูคงเหลือ และเพิ่มสินค้าแบบเร็ว (หัวข้อ 5.7) */
function ProductsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [products, setProducts] = useState<LocalProduct[]>([])
  const [categories, setCategories] = useState<LocalCategory[]>([])
  const [units, setUnits] = useState<LocalUnit[]>([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', price: '', cost: '', barcode: '', categoryId: '', unitId: '', vatType: 'N' as 'V' | 'N' })

  const load = async () => {
    const [p, c, u] = await Promise.all([
      db().products.toArray(), db().categories.orderBy('orderIndex').toArray(), db().units.toArray(),
    ])
    setProducts(p)
    setCategories(c)
    setUnits(u)
    return { c, u }
  }

  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    void (async () => {
      const { c, u } = await load()
      const prefill = params.get('new')
      if (prefill) {
        setDraft((d) => ({
          ...d,
          barcode: prefill,
          categoryId: c[0]?.id ?? '',
          unitId: u.find((x) => x.name === 'ชิ้น')?.id ?? u[0]?.id ?? '',
        }))
        setAdding(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const quickAdd = async () => {
    setBusy(true); setError(null)
    try {
      await api('/products/quick-add', {
        method: 'POST',
        body: {
          rows: [{
            name: draft.name.trim(),
            price: draft.price || '0',
            cost: draft.cost || '0',
            barcode: draft.barcode.trim() || undefined,
            categoryId: draft.categoryId,
            unitId: draft.unitId,
            vatType: draft.vatType,
          }],
        },
      })
      await pullMaster()
      await load()
      setAdding(false)
      setDraft({ name: '', price: '', cost: '', barcode: '', categoryId: '', unitId: '', vatType: 'N' })
      setToast('เพิ่มสินค้าเรียบร้อย')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'เพิ่มสินค้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = (q
    ? products.filter((p) =>
        p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q) || p.plus.some((x) => x.pluCode.includes(q)))
    : products
  ).slice(0, 200)

  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? '-'

  return (
    <div className="min-h-screen">
      <PosHeader
        title="สินค้าทั้งหมด"
        right={
          <button
            type="button" className="btn-primary h-11"
            onClick={() => {
              setDraft({
                name: '', price: '', cost: '', barcode: '',
                categoryId: categories[0]?.id ?? '',
                unitId: units.find((u) => u.name === 'ชิ้น')?.id ?? units[0]?.id ?? '',
                vatType: 'N',
              })
              setAdding(true)
            }}
          >
            + เพิ่มสินค้า
          </button>
        }
      />

      <div className="mx-auto max-w-3xl p-4">
        <input
          className="input mb-3 h-11" placeholder="ค้นหาชื่อ หรือยิงบาร์โค้ด"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <p className="mb-2 text-sm text-slate-500">{products.length.toLocaleString()} รายการในเครื่อง</p>

        <ul className="space-y-1.5">
          {visible.map((p) => {
            const main = p.plus.find((x) => x.isDefault)
            const stock = Number(main?.stockQty ?? 0)
            return (
              <li key={p.id} className="card flex items-center gap-3 p-3">
                <span className="h-10 w-10 shrink-0 rounded-lg" style={{ background: p.color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.barcode ?? '-'} · {categoryName(p.categoryId)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{baht(p.price)}</p>
                  <p className={`text-xs tabular-nums ${stock <= 0 ? 'text-danger' : 'text-slate-400'}`}>
                    คงเหลือ {fmtQty(main?.stockQty ?? 0)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
        {visible.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">ไม่พบสินค้า</p> : null}
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white">
          {toast}
        </div>
      ) : null}

      <Modal
        open={adding} onClose={() => setAdding(false)} title="เพิ่มสินค้าแบบเร็ว" size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setAdding(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={quickAdd} disabled={!draft.name.trim() || !draft.categoryId || !draft.unitId || busy}>
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="qa-name">ชื่อสินค้า *</label>
            <input id="qa-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="qa-price">ราคา *</label>
              <input id="qa-price" className="input text-right" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="qa-cost">ต้นทุน</label>
              <input id="qa-cost" className="input text-right" inputMode="decimal" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="qa-barcode">บาร์โค้ด</label>
            <input id="qa-barcode" className="input" value={draft.barcode} onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="qa-cat">กลุ่มสินค้า *</label>
              <select id="qa-cat" className="input" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="qa-unit">หน่วยบรรจุ *</label>
              <select id="qa-unit" className="input" value={draft.unitId} onChange={(e) => setDraft({ ...draft, unitId: e.target.value })}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="qa-vat">ประเภทภาษี</label>
            <select id="qa-vat" className="input" value={draft.vatType} onChange={(e) => setDraft({ ...draft, vatType: e.target.value as 'V' | 'N' })}>
              <option value="N">สินค้าไม่มีภาษี</option>
              <option value="V">สินค้ามีภาษี</option>
            </select>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  )
}

export default function PosProductsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" /></div>}>
      <ProductsInner />
    </Suspense>
  )
}
