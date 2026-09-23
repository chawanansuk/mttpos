'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CASH_IN_OUT_CATEGORIES, summarizeCashRound } from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { getBranchSettings, type BranchSettings } from '@/lib/pos/sync'
import { PosHeader } from '@/components/pos/PosHeader'
import { Numpad } from '@/components/pos/Numpad'
import { Modal } from '@/components/ui'
import { baht, dateTimeTH, signedBaht } from '@/lib/format'

interface CashRound {
  id: string
  roundNo: number
  openedAt: string
  openingCash: string
  cashSales: string
  cashInTotal: string
  cashOutTotal: string
  status: 'open' | 'closed'
  cashInOuts: { id: string; type: 'IN' | 'OUT'; category: string; detail: string | null; amount: string; occurredAt: string }[]
  summary: { openingCash: string; cashSales: string; cashIn: string; cashOut: string; expectedCash: string }
}

/** จัดการเงินสด: เปิดรอบ · นำเงินเข้า-ออก · ปิดรอบ (หัวข้อ 5.6) */
export default function CashPage() {
  const router = useRouter()
  const [branch, setBranch] = useState<BranchSettings | undefined>()
  const [round, setRound] = useState<CashRound | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [opening, setOpening] = useState('')
  const [movement, setMovement] = useState<{ type: 'IN' | 'OUT' } | null>(null)
  const [moveAmount, setMoveAmount] = useState('')
  const [moveCategory, setMoveCategory] = useState<string>(CASH_IN_OUT_CATEGORIES[0])
  const [moveDetail, setMoveDetail] = useState('')
  const [closing, setClosing] = useState(false)
  const [counted, setCounted] = useState('')
  const [closed, setClosed] = useState<{ expected: string; counted: string; difference: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setBranch(await getBranchSettings())
      const data = await api<CashRound | null>('/cash-rounds/current')
      setRound(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'โหลดข้อมูลรอบการขายไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    if (!session.cashier) { router.replace('/pos/lock'); return }
    void load()
  }, [router])

  const openRound = async () => {
    setError(null)
    try {
      await api('/cash-rounds', { method: 'POST', body: { openingCash: opening || '0' } })
      setOpening('')
      await load()
      router.replace('/pos/sale')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'เปิดรอบไม่สำเร็จ')
    }
  }

  const addMovement = async () => {
    if (!round || !movement) return
    setError(null)
    try {
      await api(`/cash-rounds/${round.id}/cash-movement`, {
        method: 'POST',
        body: { type: movement.type, category: moveCategory, detail: moveDetail || null, amount: moveAmount },
      })
      setMovement(null); setMoveAmount(''); setMoveDetail('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  const closeRound = async () => {
    if (!round) return
    setError(null)
    try {
      const res = await api<{ summary: { expectedCash: string; countedCash: string; difference: string } }>(
        `/cash-rounds/${round.id}/close`,
        { method: 'POST', body: { countedCash: counted || '0' } },
      )
      setClosing(false)
      setClosed({
        expected: res.summary.expectedCash,
        counted: res.summary.countedCash,
        difference: res.summary.difference,
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ปิดรอบไม่สำเร็จ')
    }
  }

  const expected = round
    ? summarizeCashRound({
        openingCash: round.openingCash,
        cashSales: round.cashSales,
        cashIn: round.cashInTotal,
        cashOut: round.cashOutTotal,
        countedCash: counted || null,
      })
    : null

  return (
    <div className="min-h-screen">
      <PosHeader title="จัดการเงินสด" />

      <div className="mx-auto max-w-2xl p-4">
        {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

        {loading ? (
          <div className="py-16 text-center"><span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand" /></div>
        ) : !round ? (
          <div className="card p-5">
            <h2 className="mb-1 text-lg font-semibold">เปิดรอบการขาย</h2>
            <p className="mb-4 text-sm text-slate-500">
              {branch?.cashManagement
                ? 'ร้านเปิดใช้การจัดการเงินสด — ต้องเปิดรอบก่อนจึงจะขายได้'
                : 'เปิดรอบเพื่อบันทึกเงินสดในลิ้นชัก'}
            </p>
            <p className="label">เงินทอนเริ่มต้น</p>
            <p className="mb-4 rounded-xl bg-slate-100 py-4 text-center text-3xl font-bold tabular-nums dark:bg-slate-800">
              {opening || '0'}
            </p>
            <Numpad
              onDigit={(d) => setOpening((v) => (d === '.' && v.includes('.') ? v : v + d))}
              onBackspace={() => setOpening((v) => v.slice(0, -1))}
              onClear={() => setOpening('')}
              enterLabel="เปิดรอบการขาย"
              onEnter={openRound}
            />
            {!branch?.cashManagement ? (
              <button type="button" className="btn-ghost mt-3 w-full" onClick={() => router.replace('/pos/sale')}>ข้ามไปหน้าขาย</button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">รอบการขายที่ {round.roundNo}</h2>
                  <p className="text-sm text-slate-500">เปิดเมื่อ {dateTimeTH(round.openedAt)}</p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  เปิดอยู่
                </span>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">เงินทอนเริ่มต้น</dt><dd className="tabular-nums">{baht(round.openingCash)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">ยอดขายด้วยเงินสด</dt><dd className="tabular-nums">{baht(round.cashSales)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">นำเงินเข้า</dt><dd className="tabular-nums text-brand">{signedBaht(round.cashInTotal, '+')}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">นำเงินออก</dt><dd className="tabular-nums text-danger">{signedBaht(round.cashOutTotal, '-')}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold dark:border-slate-800">
                  <dt>ควรมีในลิ้นชัก</dt><dd className="tabular-nums">{baht(expected?.expectedCash ?? 0)}</dd>
                </div>
              </dl>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost" onClick={() => { setMovement({ type: 'IN' }); setMoveAmount('') }}>นำเงินเข้า</button>
                <button type="button" className="btn-ghost" onClick={() => { setMovement({ type: 'OUT' }); setMoveAmount('') }}>นำเงินออก</button>
              </div>
              <button type="button" className="btn-primary mt-2 w-full" onClick={() => { setCounted(''); setClosing(true) }}>ปิดรอบการขาย</button>
              <button type="button" className="btn-ghost mt-2 w-full" onClick={() => router.replace('/pos/sale')}>← กลับไปหน้าขาย</button>
            </div>

            <div className="card p-5">
              <h3 className="mb-3 text-sm font-semibold">รายการนำเงินเข้า-ออกของรอบนี้</h3>
              {round.cashInOuts.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">ไม่มีรายการ</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {round.cashInOuts.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2.5">
                      <span>
                        <span className="block font-medium">{m.type === 'IN' ? 'นำเงินเข้า' : 'นำเงินออก'} · {m.category}</span>
                        <span className="block text-xs text-slate-400">{m.detail || '-'} · {dateTimeTH(m.occurredAt)}</span>
                      </span>
                      <span className={`tabular-nums ${m.type === 'IN' ? 'text-brand' : 'text-danger'}`}>
                        {m.type === 'IN' ? '+' : '-'}{baht(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(movement)} onClose={() => setMovement(null)} size="sm"
        title={movement?.type === 'IN' ? 'นำเงินเข้าลิ้นชัก' : 'นำเงินออกจากลิ้นชัก'}
      >
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="m-cat">หมวดหมู่</label>
            <select id="m-cat" className="input" value={moveCategory} onChange={(e) => setMoveCategory(e.target.value)}>
              {CASH_IN_OUT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="m-detail">รายละเอียด</label>
            <input id="m-detail" className="input" value={moveDetail} onChange={(e) => setMoveDetail(e.target.value)} placeholder="เช่น ค่าน้ำสั่งโลตัส" />
          </div>
          <p className="rounded-xl bg-slate-100 py-4 text-center text-3xl font-bold tabular-nums dark:bg-slate-800">{moveAmount || '0'}</p>
          <Numpad
            onDigit={(d) => setMoveAmount((v) => (d === '.' && v.includes('.') ? v : v + d))}
            onBackspace={() => setMoveAmount((v) => v.slice(0, -1))}
            onClear={() => setMoveAmount('')}
            enterLabel="บันทึก"
            enterDisabled={!moveAmount || Number(moveAmount) <= 0}
            onEnter={addMovement}
          />
        </div>
      </Modal>

      <Modal open={closing} onClose={() => setClosing(false)} title="ปิดรอบการขาย" size="sm">
        <div className="space-y-3">
          <dl className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <div className="flex justify-between"><dt className="text-slate-500">ยอดขายด้วยเงินสด</dt><dd className="tabular-nums">{baht(round?.cashSales ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">เงินทอนเริ่มต้น</dt><dd className="tabular-nums">{baht(round?.openingCash ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">เงินเข้า</dt><dd className="tabular-nums">{baht(round?.cashInTotal ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">เงินออก</dt><dd className="tabular-nums">{baht(round?.cashOutTotal ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold dark:border-slate-700">
              <dt>ควรมีในลิ้นชัก</dt><dd className="tabular-nums">{baht(expected?.expectedCash ?? 0)}</dd>
            </div>
          </dl>
          <p className="label">จำนวนเงินที่นับได้ในลิ้นชัก</p>
          <p className="rounded-xl bg-slate-100 py-4 text-center text-3xl font-bold tabular-nums dark:bg-slate-800">{counted || '0'}</p>
          {counted ? (
            <p className={`text-center text-sm ${Number(expected?.difference ?? 0) === 0 ? 'text-brand' : 'text-danger'}`}>
              ส่วนต่าง {baht(expected?.difference ?? 0)}
            </p>
          ) : null}
          <Numpad
            onDigit={(d) => setCounted((v) => (d === '.' && v.includes('.') ? v : v + d))}
            onBackspace={() => setCounted((v) => v.slice(0, -1))}
            onClear={() => setCounted('')}
            enterLabel="ยืนยันปิดรอบ"
            enterDisabled={!counted}
            onEnter={closeRound}
          />
        </div>
      </Modal>

      <Modal open={Boolean(closed)} onClose={() => { setClosed(null); router.replace('/pos/cash') }} title="ปิดรอบการขายเรียบร้อย" size="sm">
        {closed ? (
          <div className="space-y-3 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl dark:bg-brand-900/40">✓</span>
            <dl className="space-y-1.5 text-left text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">ควรมีในลิ้นชัก</dt><dd className="tabular-nums">{baht(closed.expected)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">นับได้</dt><dd className="tabular-nums">{baht(closed.counted)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold dark:border-slate-800">
                <dt>ส่วนต่าง</dt>
                <dd className={`tabular-nums ${Number(closed.difference) === 0 ? 'text-brand' : 'text-danger'}`}>{baht(closed.difference)}</dd>
              </div>
            </dl>
            <button type="button" className="btn-primary w-full" onClick={() => { setClosed(null); void load() }}>ตกลง</button>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
