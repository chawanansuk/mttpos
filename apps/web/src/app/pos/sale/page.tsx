'use client'

import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BillItemOption } from '@medee/domain'
import { session } from '@/lib/api'
import { db, type LocalCategory, type LocalMember, type LocalOptionGroup, type LocalProduct, type LocalUnit } from '@/lib/pos/db'
import { getBranchSettings, type BranchSettings } from '@/lib/pos/sync'
import { computeTotals, productToLine, useCart, type CartLine } from '@/lib/pos/cart'
import { PosHeader } from '@/components/pos/PosHeader'
import { Numpad } from '@/components/pos/Numpad'
import { Modal } from '@/components/ui'
import { baht, qty as fmtQty } from '@/lib/format'
import { PaymentSheet } from '@/components/pos/PaymentSheet'

const FAVORITE_TAB = '__favorite__'

export default function SalePage() {
  const router = useRouter()
  const cart = useCart()
  const searchRef = useRef<HTMLInputElement>(null)

  const [branch, setBranch] = useState<BranchSettings | undefined>()
  const [categories, setCategories] = useState<LocalCategory[]>([])
  const [units, setUnits] = useState<Map<string, string>>(new Map())
  const [optionGroups, setOptionGroups] = useState<LocalOptionGroup[]>([])
  const [products, setProducts] = useState<LocalProduct[]>([])
  const [tab, setTab] = useState<string>(FAVORITE_TAB)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // sheet ต่าง ๆ
  const [pluSheet, setPluSheet] = useState<LocalProduct | null>(null)
  const [optionSheet, setOptionSheet] = useState<{ product: LocalProduct; pluId?: string } | null>(null)
  const [priceSheet, setPriceSheet] = useState<{ product: LocalProduct; pluId?: string } | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [editLine, setEditLine] = useState<CartLine | null>(null)
  const [discountSheet, setDiscountSheet] = useState(false)
  const [memberSheet, setMemberSheet] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [members, setMembers] = useState<LocalMember[]>([])
  const [paying, setPaying] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)

  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    if (!session.cashier) { router.replace('/pos/lock'); return }
    void (async () => {
      const [b, cats, unitRows, groups, prods] = await Promise.all([
        getBranchSettings(),
        db().categories.orderBy('orderIndex').toArray(),
        db().units.toArray(),
        db().optionGroups.toArray(),
        db().products.toArray(),
      ])
      setBranch(b)
      setCategories(cats.filter((c) => c.enabled))
      setUnits(new Map(unitRows.map((u: LocalUnit) => [u.id, u.name])))
      setOptionGroups(groups)
      setProducts(prods.filter((p) => p.enabled))
    })()
  }, [router])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const totals = useMemo(
    () => computeTotals(cart.lines, branch, cart.billDiscount),
    [cart.lines, branch, cart.billDiscount],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) {
      return products
        .filter((p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? '').includes(q) ||
          (p.keyword ?? '').includes(q) ||
          p.plus.some((x) => x.pluCode.includes(q)),
        )
        .slice(0, 120)
    }
    const list = tab === FAVORITE_TAB
      ? products.filter((p) => p.favorite && p.isOnScreen)
      : products.filter((p) => p.categoryId === tab && p.isOnScreen)
    return [...list].sort((a, b) =>
      tab === FAVORITE_TAB ? a.favoriteIndex - b.favoriteIndex : a.itemSequence - b.itemSequence,
    )
  }, [products, tab, search])

  /** เพิ่มสินค้าเข้าตะกร้า โดยผ่าน sheet ที่จำเป็น (ขนาดบรรจุ / ตัวเลือก / ราคาด่วน) */
  const pickProduct = useCallback(
    (product: LocalProduct, pluId?: string) => {
      const hasManyPlus = product.plus.length > 1
      if (hasManyPlus && !pluId) { setPluSheet(product); return }
      if (product.optionGroups.length > 0) { setOptionSheet({ product, pluId }); return }
      if (product.negotiatePrice) { setPriceInput(''); setPriceSheet({ product, pluId }); return }

      const plu = product.plus.find((p) => p.id === pluId) ?? product.plus.find((p) => p.isDefault)
      cart.addLine(
        productToLine(product, {
          pluId,
          unitName: units.get(plu?.unitId ?? product.unitId ?? '') ?? '',
          priceChannel: cart.member?.priceChannel ?? null,
          useAvgCost: branch?.isAvgCost,
        }),
      )
      setToast(`เพิ่ม ${product.name}`)
    },
    [cart, units, branch],
  )

  /** รับบาร์โค้ดจากเครื่องสแกนแบบ keyboard wedge (พิมพ์เร็วแล้วจบด้วย Enter) */
  const onScan = (code: string) => {
    const value = code.trim()
    if (!value) return
    const product = products.find(
      (p) => p.barcode === value || p.plus.some((x) => x.pluCode === value),
    )
    if (!product) { setNotFound(value); return }
    const plu = product.plus.find((x) => x.pluCode === value)
    pickProduct(product, plu?.id)
    setSearch('')
  }

  const openMembers = async () => {
    setMembers(await db().members.limit(50).toArray())
    setMemberQuery('')
    setMemberSheet(true)
  }

  if (!branch) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      </div>
    )
  }

  const itemCount = cart.lines.reduce((a, l) => a + l.qty, 0)

  return (
    <div className="flex h-screen flex-col">
      <PosHeader title="ขายหน้าร้าน" />

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        {/* ── ซ้าย: ตะกร้า ── */}
        <aside className="flex min-h-0 w-full flex-col border-t border-slate-200 bg-white lg:w-[380px] lg:border-r lg:border-t-0 xl:w-[420px] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-2.5 dark:border-slate-800">
            <select
              className="input h-9 w-auto flex-1 text-sm"
              value={cart.orderType}
              onChange={(e) => cart.setField('orderType', e.target.value)}
              aria-label="ประเภทออเดอร์"
            >
              <option>ทานที่ร้าน</option>
              <option>กลับบ้าน</option>
              <option>เดลิเวอรี่</option>
            </select>
            <button type="button" className="btn-ghost h-9 text-sm" onClick={openMembers}>
              {cart.member ? `👤 ${cart.member.name}` : '+ สมาชิก'}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.lines.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">ยังไม่มีสินค้าในตะกร้า</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {cart.lines.map((line) => {
                  const lineTotal = Number(line.unitPrice) * line.qty
                    + line.options.reduce((a, o) => a + Number(o.price) * Number(o.qty ?? 1), 0) * line.qty
                    - Number(line.itemDiscount || 0)
                  return (
                    <li key={line.key} className="p-2.5">
                      <div className="flex items-start gap-2">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditLine(line)}>
                          <p className="truncate text-sm font-medium">{line.name}</p>
                          <p className="text-xs text-slate-400">
                            {baht(line.unitPrice)}
                            {line.unitName ? ` / ${line.unitName}` : ''}
                            {Number(line.itemDiscount) > 0 ? ` · ลด ${baht(line.itemDiscount)}` : ''}
                          </p>
                          {line.options.length ? (
                            <p className="truncate text-xs text-brand">
                              {line.options.map((o) => `${o.name} +${baht(o.price)}`).join(', ')}
                            </p>
                          ) : null}
                          {line.note ? <p className="truncate text-xs text-slate-400">* {line.note}</p> : null}
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" className="h-9 w-9 rounded-lg border border-slate-200 text-lg dark:border-slate-700" aria-label="ลดจำนวน" onClick={() => cart.changeQty(line.key, -1)}>−</button>
                          <span className="w-9 text-center text-sm tabular-nums">{fmtQty(line.qty)}</span>
                          <button type="button" className="h-9 w-9 rounded-lg border border-slate-200 text-lg dark:border-slate-700" aria-label="เพิ่มจำนวน" onClick={() => cart.changeQty(line.key, 1)}>+</button>
                        </div>
                        <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">{baht(lineTotal)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <dl className="mb-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">รวมก่อนลด</dt><dd className="tabular-nums">{baht(totals.subtotal)}</dd></div>
              {Number(totals.itemDiscountTotal) > 0 ? (
                <div className="flex justify-between text-danger"><dt>ส่วนลดรายการ</dt><dd className="tabular-nums">-{baht(totals.itemDiscountTotal)}</dd></div>
              ) : null}
              {Number(totals.billDiscount) > 0 ? (
                <div className="flex justify-between text-danger"><dt>ส่วนลดท้ายบิล</dt><dd className="tabular-nums">-{baht(totals.billDiscount)}</dd></div>
              ) : null}
              {Number(totals.serviceCharge) > 0 ? (
                <div className="flex justify-between"><dt className="text-slate-500">ค่าบริการ</dt><dd className="tabular-nums">{baht(totals.serviceCharge)}</dd></div>
              ) : null}
              {Number(totals.vatAmount) > 0 ? (
                <div className="flex justify-between"><dt className="text-slate-500">VAT {branch.vatRate}%</dt><dd className="tabular-nums">{baht(totals.vatAmount)}</dd></div>
              ) : null}
              {Number(totals.rounding) !== 0 ? (
                <div className="flex justify-between"><dt className="text-slate-500">ปัดเศษ</dt><dd className="tabular-nums">{baht(totals.rounding)}</dd></div>
              ) : null}
            </dl>
            <div className="mb-3 flex items-end justify-between">
              <span className="text-sm text-slate-500">ยอดสุทธิ ({fmtQty(itemCount)} ชิ้น)</span>
              <span className="text-3xl font-bold tabular-nums text-brand">{baht(totals.grandTotal)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="btn-ghost" onClick={() => setDiscountSheet(true)} disabled={cart.lines.length === 0}>ส่วนลด</button>
              <button
                type="button" className="btn-ghost"
                disabled={cart.lines.length === 0}
                onClick={() => router.push('/pos/bills?hold=1')}
              >
                พักบิล
              </button>
              <button type="button" className="btn-ghost text-danger" onClick={() => cart.clear()} disabled={cart.lines.length === 0}>ล้าง</button>
            </div>
            <button
              type="button"
              className="btn-primary mt-2 h-14 w-full text-lg"
              disabled={cart.lines.length === 0}
              onClick={() => setPaying(true)}
            >
              ชำระเงิน · {baht(totals.grandTotal)}
            </button>
          </div>
        </aside>

        {/* ── ขวา: สินค้า ── */}
        {/* min-w-0 จำเป็น มิฉะนั้น flex item จะไม่ยอมหดและกริดสินค้าจะล้นออกนอกจอ */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex gap-2 border-b border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <input
              ref={searchRef}
              className="input h-11"
              placeholder="ค้นหาชื่อ / รหัสสินค้า หรือยิงบาร์โค้ด"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onScan(search) } }}
              aria-label="ค้นหาหรือสแกนสินค้า"
            />
            {search ? (
              <button type="button" className="btn-ghost h-11" onClick={() => setSearch('')}>ล้าง</button>
            ) : null}
          </div>

          {!search ? (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button" onClick={() => setTab(FAVORITE_TAB)}
                className={clsx(
                  'shrink-0 rounded-lg px-4 py-2 text-sm font-medium',
                  tab === FAVORITE_TAB ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                ⭐ สินค้า-นิยม
              </button>
              {categories.map((c) => (
                <button
                  key={c.id} type="button" onClick={() => setTab(c.id)}
                  className={clsx('shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white')}
                  style={{ background: tab === c.id ? '#2EB88A' : c.bgColor }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="flex aspect-square flex-col justify-between overflow-hidden rounded-xl p-2 text-left text-white shadow-sm transition active:scale-95"
                  style={{ background: p.color }}
                >
                  <span className="line-clamp-3 text-xs font-medium leading-tight drop-shadow">{p.name}</span>
                  <span className="text-sm font-bold tabular-nums drop-shadow">{baht(p.price)}</span>
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">
                {search ? 'ไม่พบสินค้าที่ค้นหา' : 'ไม่มีสินค้าในกลุ่มนี้'}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white lg:bottom-6">
          {toast}
        </div>
      ) : null}

      {/* เลือกขนาดบรรจุ */}
      <Modal open={Boolean(pluSheet)} onClose={() => setPluSheet(null)} title="เลือกขนาดบรรจุ" size="sm">
        <div className="space-y-2">
          {pluSheet?.plus.map((plu) => (
            <button
              key={plu.id} type="button"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 hover:border-brand dark:border-slate-700"
              onClick={() => { const p = pluSheet; setPluSheet(null); pickProduct(p, plu.id) }}
            >
              <span>
                <span className="block text-sm font-medium">{plu.name}</span>
                <span className="block text-xs text-slate-400">
                  {units.get(plu.unitId ?? '') ?? '-'} · ตัดสต็อก {fmtQty(plu.skuRatio)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{baht(plu.price)}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* เลือกตัวเลือกเสริม */}
      {optionSheet ? (
        <OptionSheet
          product={optionSheet.product}
          pluId={optionSheet.pluId}
          groups={optionGroups}
          onClose={() => setOptionSheet(null)}
          onConfirm={(selected) => {
            const product = optionSheet.product
            const pluId = optionSheet.pluId
            setOptionSheet(null)
            if (product.negotiatePrice) {
              setPriceInput('')
              setPriceSheet({ product, pluId })
              return
            }
            const plu = product.plus.find((p) => p.id === pluId) ?? product.plus.find((p) => p.isDefault)
            cart.addLine(
              productToLine(product, {
                pluId,
                unitName: units.get(plu?.unitId ?? product.unitId ?? '') ?? '',
                cartOptions: selected,
                priceChannel: cart.member?.priceChannel ?? null,
                useAvgCost: branch.isAvgCost,
              }),
            )
            setToast(`เพิ่ม ${product.name}`)
          }}
        />
      ) : null}

      {/* ราคาด่วน */}
      <Modal open={Boolean(priceSheet)} onClose={() => setPriceSheet(null)} title={`ใส่ราคา — ${priceSheet?.product.name ?? ''}`} size="sm">
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-100 py-4 text-center text-3xl font-bold tabular-nums dark:bg-slate-800">
            {priceInput || '0'}
          </p>
          <Numpad
            onDigit={(d) => setPriceInput((v) => (d === '.' && v.includes('.') ? v : v + d))}
            onBackspace={() => setPriceInput((v) => v.slice(0, -1))}
            onClear={() => setPriceInput('')}
            enterLabel="เพิ่มลงตะกร้า"
            enterDisabled={!priceInput || Number(priceInput) < 0}
            onEnter={() => {
              if (!priceSheet) return
              const { product, pluId } = priceSheet
              const plu = product.plus.find((p) => p.id === pluId) ?? product.plus.find((p) => p.isDefault)
              cart.addLine(
                productToLine(product, {
                  pluId,
                  unitPrice: Number(priceInput).toFixed(2),
                  unitName: units.get(plu?.unitId ?? product.unitId ?? '') ?? '',
                  useAvgCost: branch.isAvgCost,
                }),
              )
              setPriceSheet(null)
              setToast(`เพิ่ม ${product.name}`)
            }}
          />
        </div>
      </Modal>

      {/* แก้ไขรายการในตะกร้า */}
      {editLine ? (
        <EditLineSheet
          line={editLine}
          editable={branch.editableItem}
          onClose={() => setEditLine(null)}
          onSave={(patch) => { cart.updateLine(editLine.key, patch); setEditLine(null) }}
          onRemove={() => { cart.removeLine(editLine.key); setEditLine(null) }}
        />
      ) : null}

      {/* ส่วนลดท้ายบิล */}
      <BillDiscountSheet
        open={discountSheet}
        onClose={() => setDiscountSheet(false)}
        current={cart.billDiscount}
        afterItem={totals.afterDiscount}
        onApply={(d) => { cart.setBillDiscount(d); setDiscountSheet(false) }}
      />

      {/* เลือกสมาชิก */}
      <Modal open={memberSheet} onClose={() => setMemberSheet(false)} title="เลือกสมาชิก" size="sm">
        <input
          className="input mb-3" placeholder="ค้นหาชื่อหรือเบอร์โทรศัพท์"
          value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)}
        />
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {cart.member ? (
            <button type="button" className="btn-ghost w-full text-danger" onClick={() => { cart.setMember(null); setMemberSheet(false) }}>
              ยกเลิกการเลือกสมาชิก
            </button>
          ) : null}
          {members
            .filter((m) => !memberQuery || m.name.includes(memberQuery) || (m.phone ?? '').includes(memberQuery))
            .map((m) => (
              <button
                key={m.id} type="button"
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 hover:border-brand dark:border-slate-700"
                onClick={() => {
                  cart.setMember({
                    id: m.id, name: m.name, pointsBalance: m.pointsBalance,
                    priceChannel: m.memberGroup?.priceChannel ?? null,
                  })
                  setMemberSheet(false)
                  if (m.memberGroup?.priceChannel) setToast(`ใช้ราคา${m.memberGroup.name} สำหรับ ${m.name}`)
                }}
              >
                <span className="text-left">
                  <span className="block text-sm font-medium">{m.name}</span>
                  <span className="block text-xs text-slate-400">{m.phone ?? '-'} · {m.memberGroup?.name ?? 'ทั่วไป'}</span>
                </span>
                <span className="text-xs text-slate-400">{m.pointsBalance} คะแนน</span>
              </button>
            ))}
        </div>
      </Modal>

      {/* ไม่พบสินค้าจากการสแกน */}
      <Modal open={Boolean(notFound)} onClose={() => setNotFound(null)} title="ไม่พบสินค้า" size="sm">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ไม่พบสินค้าที่มีรหัส <strong>{notFound}</strong> ในเครื่องนี้
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={() => setNotFound(null)}>ปิด</button>
          <button
            type="button" className="btn-primary flex-1"
            onClick={() => { const code = notFound; setNotFound(null); router.push(`/pos/products?new=${encodeURIComponent(code ?? '')}`) }}
          >
            เพิ่มสินค้าแบบเร็ว
          </button>
        </div>
      </Modal>

      {/* ชำระเงิน */}
      {paying ? (
        <PaymentSheet
          branch={branch}
          totals={totals}
          onClose={() => setPaying(false)}
          onDone={() => { setPaying(false); cart.clear(); setToast('บันทึกบิลเรียบร้อย') }}
        />
      ) : null}
    </div>
  )
}

function OptionSheet({
  product, pluId, groups, onClose, onConfirm,
}: {
  product: LocalProduct
  pluId?: string
  groups: LocalOptionGroup[]
  onClose: () => void
  onConfirm: (options: BillItemOption[]) => void
}) {
  const linked = product.optionGroups
    .map((g) => groups.find((x) => x.id === g.optionGroupId))
    .filter((g): g is LocalOptionGroup => Boolean(g))
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  void pluId

  const toggle = (group: LocalOptionGroup, optionId: string) => {
    setPicked((prev) => {
      const current = prev[group.id] ?? []
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((x) => x !== optionId) }
      // เลือกได้ไม่เกิน maxSelect — ถ้าเลือกได้ 1 ให้แทนที่ตัวเดิม
      if (group.maxSelect === 1) return { ...prev, [group.id]: [optionId] }
      if (current.length >= group.maxSelect) return prev
      return { ...prev, [group.id]: [...current, optionId] }
    })
  }

  const unmet = linked.filter((g) => g.required && (picked[g.id]?.length ?? 0) < Math.max(1, g.minSelect))

  const selected: BillItemOption[] = linked.flatMap((g) =>
    (picked[g.id] ?? []).map((optionId) => {
      const item = g.items.find((x) => x.optionId === optionId)!
      return { optionId, name: item.option.name, price: item.option.price, cost: item.option.cost, qty: 1, groupName: g.name }
    }),
  )

  return (
    <Modal
      open onClose={onClose} title={`ตัวเลือก — ${product.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" onClick={() => onConfirm(selected)} disabled={unmet.length > 0}>
            เพิ่มลงตะกร้า
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {linked.map((g) => (
          <div key={g.id}>
            <p className="mb-2 text-sm font-medium">
              {g.name}
              {g.required ? <span className="ml-1 text-danger">* เลือกอย่างน้อย {Math.max(1, g.minSelect)}</span> : null}
              <span className="ml-1 text-xs text-slate-400">(เลือกได้สูงสุด {g.maxSelect})</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((item) => {
                const on = (picked[g.id] ?? []).includes(item.optionId)
                return (
                  <button
                    key={item.optionId} type="button" onClick={() => toggle(g, item.optionId)}
                    className={clsx(
                      'rounded-lg border px-3 py-2.5 text-left text-sm',
                      on ? 'border-brand bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700',
                    )}
                  >
                    <span className="block">{item.option.name}</span>
                    <span className="block text-xs text-slate-400">+{baht(item.option.price)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {linked.length === 0 ? <p className="text-sm text-slate-400">สินค้านี้ยังไม่ได้ผูกกลุ่มตัวเลือก</p> : null}
      </div>
    </Modal>
  )
}

function EditLineSheet({
  line, editable, onClose, onSave, onRemove,
}: {
  line: CartLine
  editable: boolean
  onClose: () => void
  onSave: (patch: Partial<CartLine>) => void
  onRemove: () => void
}) {
  const [qty, setQty] = useState(String(line.qty))
  const [price, setPrice] = useState(line.unitPrice)
  const [discount, setDiscount] = useState(line.itemDiscount)
  const [discountType, setDiscountType] = useState(line.itemDiscountType)
  const [note, setNote] = useState(line.note)

  return (
    <Modal
      open onClose={onClose} title={line.name}
      footer={
        <>
          <button className="btn-danger mr-auto" onClick={onRemove}>ลบรายการ</button>
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button
            className="btn-primary"
            onClick={() => onSave({
              qty: Math.max(0.001, Number(qty) || 0),
              unitPrice: editable ? price : line.unitPrice,
              itemDiscount: discount || '0',
              itemDiscountType: discountType,
              note,
            })}
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="el-qty">จำนวน</label>
          <input id="el-qty" className="input text-right text-lg" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="el-price">ราคา/หน่วย</label>
          <input id="el-price" className="input text-right text-lg" inputMode="decimal" value={price} disabled={!editable} onChange={(e) => setPrice(e.target.value)} />
          {!editable ? <p className="mt-1 text-xs text-slate-400">ร้านปิดการแก้ไขราคาในตะกร้า</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="el-disc">ส่วนลดรายการ</label>
          <input id="el-disc" className="input text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="el-dtype">ประเภทส่วนลด</label>
          <select id="el-dtype" className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as CartLine['itemDiscountType'])}>
            <option value="amount">จำนวนเงิน</option>
            <option value="percent">เปอร์เซ็นต์ (%)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="el-note">หมายเหตุ</label>
          <input id="el-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}

function BillDiscountSheet({
  open, onClose, current, afterItem, onApply,
}: {
  open: boolean
  onClose: () => void
  current: { type: 'amount' | 'percent'; value: string } | null
  afterItem: string
  onApply: (d: { type: 'amount' | 'percent'; value: string } | null) => void
}) {
  const [type, setType] = useState<'amount' | 'percent'>(current?.type ?? 'amount')
  const [value, setValue] = useState(current?.value ?? '')

  useEffect(() => {
    if (!open) return
    setType(current?.type ?? 'amount')
    setValue(current?.value ?? '')
  }, [open, current])

  const preview = type === 'percent'
    ? (Number(afterItem) * Number(value || 0)) / 100
    : Number(value || 0)

  return (
    <Modal
      open={open} onClose={onClose} title="ส่วนลดท้ายบิล" size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={() => onApply(null)}>ไม่ใช้ส่วนลด</button>
          <button className="btn-primary" onClick={() => onApply(value ? { type, value } : null)}>ใช้ส่วนลด</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setType('amount')} className={clsx('btn h-11', type === 'amount' ? 'bg-brand text-white' : 'btn-ghost')}>จำนวนเงิน</button>
          <button type="button" onClick={() => setType('percent')} className={clsx('btn h-11', type === 'percent' ? 'bg-brand text-white' : 'btn-ghost')}>เปอร์เซ็นต์</button>
        </div>
        <p className="rounded-lg bg-slate-100 py-4 text-center text-3xl font-bold tabular-nums dark:bg-slate-800">
          {value || '0'}{type === 'percent' ? '%' : ''}
        </p>
        <p className="text-center text-sm text-slate-500">ลดจริง {baht(preview)} บาท</p>
        <Numpad
          onDigit={(d) => setValue((v) => (d === '.' && v.includes('.') ? v : v + d))}
          onBackspace={() => setValue((v) => v.slice(0, -1))}
          onClear={() => setValue('')}
        />
      </div>
    </Modal>
  )
}
