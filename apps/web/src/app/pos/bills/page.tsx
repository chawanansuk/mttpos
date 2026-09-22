'use client'

import clsx from 'clsx'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { computeTotals, useCart, type CartLine } from '@/lib/pos/cart'
import { getBranchSettings, pendingList, type BranchSettings } from '@/lib/pos/sync'
import { PosHeader } from '@/components/pos/PosHeader'
import { Modal } from '@/components/ui'
import { baht, dateTimeTH, todayISO } from '@/lib/format'

interface Receipt {
  id: string
  receiptNo: string
  soldAt: string
  status: 'ปกติ' | 'ยกเลิก'
  grandTotal: string
  totalQty: string
  voidReason: string | null
}

interface OpenBill {
  id: string
  refNo: string
  openedAt: string
  note: string | null
  items: CartLine[]
  totals: { grandTotal: string }
}

interface PendingRow {
  clientId: string
  summary: { receiptNo: string; grandTotal: string; soldAt: string; itemCount: number }
  attempts: number
  lastError: string | null
}

function BillsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const cart = useCart()
  const [tab, setTab] = useState<'today' | 'open' | 'pending'>('today')
  const [branch, setBranch] = useState<BranchSettings | undefined>()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [openBills, setOpenBills] = useState<OpenBill[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Receipt | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [pin, setPin] = useState('')
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdNote, setHoldNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setBranch(await getBranchSettings())
      const today = todayISO()
      const [list, open] = await Promise.all([
        api<{ data: Receipt[] }>('/receipts', { query: { from: today, to: today, limit: 100 } }).catch(() => ({ data: [] })),
        api<{ data: OpenBill[] }>('/open-bills').catch(() => ({ data: [] })),
      ])
      setReceipts(list.data)
      setOpenBills(open.data)
      const q = await pendingList()
      setPending(q.map((p) => ({ clientId: p.clientId, summary: p.summary, attempts: p.attempts, lastError: p.lastError })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    if (!session.cashier) { router.replace('/pos/lock'); return }
    if (params.get('hold') === '1' && cart.lines.length > 0) setHoldOpen(true)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const holdBill = async () => {
    setError(null)
    try {
      const totals = computeTotals(cart.lines, branch, cart.billDiscount)
      await api('/open-bills', {
        method: 'POST',
        body: {
          orderType: cart.orderType,
          salesChannel: cart.salesChannel,
          memberId: cart.member?.id ?? null,
          note: holdNote || null,
          items: cart.lines,
          totals,
        },
      })
      cart.clear()
      setHoldOpen(false)
      setHoldNote('')
      setTab('open')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'พักบิลไม่สำเร็จ')
    }
  }

  const resumeBill = (bill: OpenBill) => {
    cart.clear()
    cart.loadLines(bill.items)
    cart.setField('openBillId', bill.id)
    router.push('/pos/sale')
  }

  const doVoid = async () => {
    if (!voidTarget) return
    setError(null)
    try {
      // ยกเลิกบิลต้องผ่านการยืนยัน PIN ของผู้มีสิทธิ์ (หัวข้อ 7.7)
      const approver = await api<{ cashier: { name: string } }>('/auth/pin/verify', {
        method: 'POST',
        body: { pin, permission: 'voidBill' },
      })
      await api(`/receipts/${voidTarget.id}/void`, {
        method: 'POST',
        body: { reason: voidReason, approvedBy: approver.cashier.name },
      })
      setVoidTarget(null); setVoidReason(''); setPin('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ยกเลิกบิลไม่สำเร็จ')
    }
  }

  const tabs = [
    { key: 'today' as const, label: `บิลวันนี้ (${receipts.length})` },
    { key: 'open' as const, label: `บิลที่เปิดอยู่ (${openBills.length})` },
    { key: 'pending' as const, label: `รอส่ง (${pending.length})` },
  ]

  return (
    <div className="min-h-screen">
      <PosHeader title="การจัดการบิล" />

      <div className="mx-auto max-w-3xl p-4">
        {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

        <div className="mb-4 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={clsx('btn h-11 flex-1 text-sm', tab === t.key ? 'bg-brand text-white' : 'btn-ghost')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center"><span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand" /></div>
        ) : null}

        {!loading && tab === 'today' ? (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className={clsx('card flex items-center gap-3 p-3', r.status === 'ยกเลิก' && 'opacity-70')}>
                <div className="min-w-0 flex-1">
                  <p className={clsx('font-medium', r.status === 'ยกเลิก' && 'text-danger line-through')}>{r.receiptNo}</p>
                  <p className="text-xs text-slate-400">
                    {dateTimeTH(r.soldAt)} · {r.totalQty} ชิ้น
                    {r.status === 'ยกเลิก' ? ` · ยกเลิก: ${r.voidReason ?? '-'}` : ''}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{baht(r.grandTotal)}</span>
                <div className="flex shrink-0 gap-1">
                  <a className="btn-ghost h-9 px-2 text-xs" href={`/print/receipt/${r.id}`} target="_blank" rel="noreferrer">พิมพ์ซ้ำ</a>
                  {r.status === 'ปกติ' ? (
                    <button type="button" className="btn-ghost h-9 px-2 text-xs text-danger" onClick={() => { setVoidTarget(r); setVoidReason(''); setPin('') }}>
                      ยกเลิก
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {receipts.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">ยังไม่มีบิลวันนี้</p> : null}
          </ul>
        ) : null}

        {!loading && tab === 'open' ? (
          <ul className="space-y-2">
            {openBills.map((b) => (
              <li key={b.id} className="card flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.refNo}</p>
                  <p className="text-xs text-slate-400">{dateTimeTH(b.openedAt)} · {b.items.length} รายการ {b.note ? `· ${b.note}` : ''}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{baht(b.totals?.grandTotal)}</span>
                <button type="button" className="btn-primary h-9 shrink-0 px-3 text-xs" onClick={() => resumeBill(b)}>เรียกกลับ</button>
              </li>
            ))}
            {openBills.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">ไม่มีบิลที่พักไว้</p> : null}
          </ul>
        ) : null}

        {!loading && tab === 'pending' ? (
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.clientId} className="card p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.summary.receiptNo}</p>
                    <p className="text-xs text-slate-400">{dateTimeTH(p.summary.soldAt)} · {p.summary.itemCount} รายการ</p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">{baht(p.summary.grandTotal)}</span>
                </div>
                {p.lastError ? (
                  <p className="mt-1.5 text-xs text-danger">ลองส่งแล้ว {p.attempts} ครั้ง · {p.lastError}</p>
                ) : null}
              </li>
            ))}
            {pending.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">ไม่มีบิลค้างส่ง</p> : null}
          </ul>
        ) : null}
      </div>

      <Modal open={holdOpen} onClose={() => setHoldOpen(false)} title="พักบิล" size="sm"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setHoldOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={holdBill}>พักบิล</button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-500">บิลจะถูกเก็บไว้ในรายการ &ldquo;บิลที่เปิดอยู่&rdquo; และเรียกกลับมาขายต่อได้</p>
        <label className="label" htmlFor="hold-note">หมายเหตุ (เช่น ชื่อลูกค้า)</label>
        <input id="hold-note" className="input" value={holdNote} onChange={(e) => setHoldNote(e.target.value)} />
      </Modal>

      <Modal
        open={Boolean(voidTarget)} onClose={() => setVoidTarget(null)} size="sm"
        title={`ยกเลิกบิล ${voidTarget?.receiptNo ?? ''}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setVoidTarget(null)}>ยกเลิก</button>
            <button className="btn-danger" onClick={doVoid} disabled={!voidReason.trim() || pin.length !== 4}>ยืนยัน</button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">สต็อกและคะแนนสมาชิกจะถูกคืนกลับ และเลขบิลนี้จะไม่ถูกนำมาใช้ซ้ำ</p>
          <div>
            <label className="label" htmlFor="v-reason">เหตุผล *</label>
            <input id="v-reason" className="input" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="v-pin">PIN ผู้มีสิทธิ์ยกเลิกบิล *</label>
            <input
              id="v-pin" className="input tracking-[0.5em] text-center text-lg" inputMode="numeric" maxLength={4}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function BillsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" /></div>}>
      <BillsInner />
    </Suspense>
  )
}
