'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { db, type LocalCashier } from '@/lib/pos/db'
import { getBranchSettings, pullMaster } from '@/lib/pos/sync'
import { Numpad } from '@/components/pos/Numpad'

/** หน้าเลือกพนักงาน + ใส่ PIN 4 หลัก (หัวข้อ 5.1) */
export default function PosLockPage() {
  const router = useRouter()
  const [cashiers, setCashiers] = useState<LocalCashier[]>([])
  const [selected, setSelected] = useState<LocalCashier | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shopName, setShopName] = useState('')

  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    void (async () => {
      const rows = await db().cashiers.orderBy('orderIndex').toArray()
      if (rows.length === 0) {
        // เครื่องเพิ่งถูกผูก แต่ยังไม่มีข้อมูลในเครื่อง
        try { await pullMaster(true) } catch { /* ออฟไลน์ */ }
        setCashiers(await db().cashiers.orderBy('orderIndex').toArray())
      } else {
        setCashiers(rows)
      }
      const branch = await getBranchSettings()
      setShopName(branch ? `${branch.shop.name} · ${branch.branchName}` : '')
    })()
  }, [router])

  const submit = async (value: string) => {
    if (!selected || value.length !== 4) return
    setBusy(true); setError(null)
    try {
      const res = await api<{ accessToken: string; cashier: { id: string; name: string; permissions: Record<string, unknown> } }>(
        '/auth/pin',
        { method: 'POST', body: { cashierId: selected.id, pin: value } },
      )
      session.deviceToken = res.accessToken
      session.cashier = res.cashier
      const branch = await getBranchSettings()
      // ถ้าร้านเปิดใช้การจัดการเงินสด ต้องเปิดรอบขายก่อนถึงจะขายได้
      router.replace(branch?.cashManagement ? '/pos/cash' : '/pos/sale')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'PIN ไม่ถูกต้อง')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const pushDigit = (d: string) => {
    if (d === '.') return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) void submit(next)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-5 text-center">
          <h1 className="text-lg font-semibold">{selected ? `ใส่ PIN ของ ${selected.name}` : 'เลือกพนักงาน'}</h1>
          <p className="mt-1 text-sm text-slate-500">{shopName}</p>
        </div>

        {!selected ? (
          <div className="grid grid-cols-2 gap-3">
            {cashiers.map((c) => (
              <button
                key={c.id} type="button"
                onClick={() => { setSelected(c); setPin(''); setError(null) }}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-5 transition hover:border-brand dark:border-slate-700"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-semibold text-white">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-sm font-medium">{c.name}</span>
              </button>
            ))}
            {cashiers.length === 0 ? (
              <p className="col-span-2 py-8 text-center text-sm text-slate-400">
                ยังไม่มีข้อมูลพนักงานในเครื่อง — เชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-600'}`}
                />
              ))}
            </div>
            {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
            <Numpad
              onDigit={pushDigit}
              onBackspace={() => setPin(pin.slice(0, -1))}
              onClear={() => setPin('')}
              allowDecimal={false}
            />
            <button type="button" className="btn-ghost w-full" onClick={() => { setSelected(null); setPin(''); setError(null) }} disabled={busy}>
              ← เลือกพนักงานคนอื่น
            </button>
          </div>
        )}

        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs dark:border-slate-800">
          <button type="button" className="text-slate-400 hover:text-brand" onClick={() => router.push('/pos/setup')}>
            ตั้งค่าเครื่องขายใหม่
          </button>
        </div>
      </div>
    </div>
  )
}
