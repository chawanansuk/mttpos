'use client'

import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateChange, outstandingAmount, promptPayPayload, type BillTotals } from '@medee/domain'
import { api, ApiError, session } from '@/lib/api'
import { getPaymentConfigs, queueReceipt, flushQueue, type BranchSettings } from '@/lib/pos/sync'
import { useCart } from '@/lib/pos/cart'
import { Modal } from '@/components/ui'
import { Numpad } from './Numpad'
import { baht } from '@/lib/format'

interface PaymentLine { method: string; amount: string }

interface PaymentConfig {
  methodKey: string
  label: string
  enabled: boolean
  config: Record<string, unknown> | null
}

/** หน้าชำระเงิน (หัวข้อ 5.4) — เงินสด · พร้อมเพย์ · ช่องทางอื่นที่เปิดไว้ · ชำระหลายช่องทาง */
export function PaymentSheet({
  branch, totals, onClose, onDone,
}: {
  branch: BranchSettings
  totals: BillTotals
  onClose: () => void
  onDone: (receiptNo: string) => void
}) {
  const cart = useCart()
  const router = useRouter()
  const [configs, setConfigs] = useState<PaymentConfig[]>([])
  const [method, setMethod] = useState('เงินสด')
  const [received, setReceived] = useState('')
  const [splits, setSplits] = useState<PaymentLine[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ receiptNo: string; change: string; offline: boolean; receiptId?: string } | null>(null)

  useEffect(() => { void getPaymentConfigs().then((c) => setConfigs(c.filter((x) => x.enabled))) }, [])

  const due = totals.grandTotal
  const outstanding = useMemo(
    () => outstandingAmount(due, splits.map((s) => ({ amount: s.amount }))),
    [due, splits],
  )
  const change = calculateChange(received || 0, branch.isMultiplePayment ? outstanding : due)

  const fastButtons = useMemo(
    () => branch.fastInput.split(',').map((v) => v.trim()).filter(Boolean),
    [branch.fastInput],
  )

  const promptpay = useMemo(() => {
    if (!branch.paymentPromptpay || !branch.promptpayId) return null
    try {
      return promptPayPayload({
        promptPayId: branch.promptpayId,
        amount: branch.isMultiplePayment ? outstanding : due,
        merchantName: branch.promptpayAccName ?? undefined,
      })
    } catch {
      return null
    }
  }, [branch, due, outstanding])

  const submit = async () => {
    setBusy(true); setError(null)
    const clientId = crypto.randomUUID()
    const cashier = session.cashier
    const payments: { method: string; amount: string; received?: string }[] = branch.isMultiplePayment && splits.length
      ? [...splits, ...(Number(outstanding) > 0 ? [{ method, amount: outstanding }] : [])]
      : [{ method, amount: due, received: received || due }]

    const payload = {
      clientId,
      cashierId: cashier?.id,
      soldAt: new Date().toISOString(),
      orderType: cart.orderType,
      salesChannel: cart.salesChannel,
      memberId: cart.member?.id ?? null,
      note: cart.note || undefined,
      guests: cart.guests,
      tableId: cart.tableId,
      openBillId: cart.openBillId,
      billDiscount: cart.billDiscount,
      items: cart.lines.map((l) => ({
        productId: l.productId ?? undefined,
        pluId: l.pluId ?? undefined,
        barcode: l.barcode ?? undefined,
        name: l.name,
        unitName: l.unitName,
        ratio: l.ratio,
        qty: l.qty,
        unitPrice: l.unitPrice,
        cost: l.cost,
        itemDiscount: l.itemDiscount || '0',
        itemDiscountType: l.itemDiscountType,
        vatType: l.vatType,
        options: l.options,
        note: l.note || undefined,
        serialNo: l.serialNo ?? undefined,
      })),
      payments,
    }

    try {
      if (!navigator.onLine) throw new ApiError(0, 'ออฟไลน์')
      // รอไม่เกิน 10 วินาที ไม่งั้นลูกค้ายืนรอ — ถ้าเซิร์ฟเวอร์บันทึกไปแล้วจริง
      // ตอนส่งคิวซ้ำจะไม่เกิดบิลซ้ำ เพราะใช้ clientId เดียวกัน
      const res = await api<{ id: string; receiptNo: string; change: string }>('/receipts', {
        method: 'POST', body: payload, timeoutMs: 10_000,
      })
      setDone({ receiptNo: res.receiptNo, change: res.change, offline: false, receiptId: res.id })
    } catch (err) {
      // ออฟไลน์หรือส่งไม่สำเร็จ → เก็บเข้าคิวแล้วขายต่อได้ทันที (หัวข้อ 7.10)
      const isNetwork = !navigator.onLine || (err instanceof ApiError && (err.status === 0 || err.status >= 500))
      if (!isNetwork) {
        setError(err instanceof ApiError ? err.message : 'บันทึกบิลไม่สำเร็จ')
        setBusy(false)
        return
      }
      const localNo = `OFFLINE-${clientId.slice(0, 8).toUpperCase()}`
      await queueReceipt({
        clientId,
        payload,
        summary: { receiptNo: localNo, grandTotal: due, soldAt: payload.soldAt, itemCount: cart.lines.length },
      })
      setDone({ receiptNo: localNo, change, offline: true })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={() => onDone(done.receiptNo)} title="ชำระเงินเรียบร้อย" size="sm">
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl dark:bg-brand-900/40">✓</span>
          <div>
            <p className="text-sm text-slate-500">เลขที่บิล</p>
            <p className="text-lg font-semibold">{done.receiptNo}</p>
          </div>
          <div className="rounded-xl bg-slate-100 py-4 dark:bg-slate-800">
            <p className="text-sm text-slate-500">เงินทอน</p>
            <p className="text-4xl font-bold tabular-nums text-brand">{baht(done.change)}</p>
          </div>
          {done.offline ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              บันทึกไว้ในเครื่องแล้ว — ระบบจะส่งขึ้นเซิร์ฟเวอร์อัตโนมัติเมื่อกลับมาออนไลน์
            </p>
          ) : null}
          {cart.member ? (
            <p className="text-sm text-slate-500">สมาชิก {cart.member.name} ได้รับคะแนนจากบิลนี้แล้ว</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {done.receiptId ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const id = done.receiptId
                  onDone(done.receiptNo)
                  router.push(`/print/receipt/${id}?back=/pos/sale`)
                }}
              >
                พิมพ์ใบเสร็จ
              </button>
            ) : <span />}
            <button type="button" className="btn-primary" onClick={() => onDone(done.receiptNo)}>บิลใหม่</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="ชำระเงิน" size="lg">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50 py-5 text-center dark:bg-brand-900/30">
            <p className="text-sm text-brand-700 dark:text-brand-200">ยอดที่ต้องชำระ</p>
            <p className="text-4xl font-bold tabular-nums text-brand">{baht(branch.isMultiplePayment ? outstanding : due)}</p>
          </div>

          <div>
            <p className="label">วิธีชำระเงิน</p>
            <div className="grid grid-cols-2 gap-2">
              {configs.map((c) => {
                const label = c.methodKey === 'cash' ? 'เงินสด' : c.methodKey === 'promptpay' ? 'โอน(พร้อมเพย์)' : c.label
                return (
                  <button
                    key={c.methodKey} type="button" onClick={() => setMethod(label)}
                    className={clsx('btn h-12', method === label ? 'bg-brand text-white' : 'btn-ghost')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {method === 'โอน(พร้อมเพย์)' && promptpay ? (
            <div className="rounded-xl border border-slate-200 p-4 text-center dark:border-slate-700">
              <p className="mb-2 text-sm font-medium">สแกนจ่ายด้วยพร้อมเพย์</p>
              <p className="break-all rounded bg-slate-100 p-2 text-[9px] leading-tight dark:bg-slate-800">{promptpay}</p>
              <p className="mt-2 text-xs text-slate-400">{branch.promptpayAccName}</p>
            </div>
          ) : null}

          {branch.isMultiplePayment ? (
            <div className="space-y-2">
              <p className="label">รายการชำระ</p>
              {splits.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <span>{s.method}</span>
                  <span className="tabular-nums">{baht(s.amount)}</span>
                  <button type="button" className="text-danger" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>ลบ</button>
                </div>
              ))}
              <button
                type="button" className="btn-ghost w-full"
                disabled={!received || Number(received) <= 0 || Number(outstanding) <= 0}
                onClick={() => {
                  const amount = Math.min(Number(received), Number(outstanding)).toFixed(2)
                  setSplits([...splits, { method, amount }])
                  setReceived('')
                }}
              >
                + เพิ่มบรรทัดชำระ ({method})
              </button>
            </div>
          ) : null}

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}
        </div>

        <div className="space-y-3">
          <div>
            <p className="label">รับเงินมา</p>
            <p className="rounded-xl bg-slate-100 py-4 text-center text-3xl font-bold tabular-nums dark:bg-slate-800">
              {received || '0'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost h-10 flex-1 text-sm" onClick={() => setReceived(branch.isMultiplePayment ? outstanding : due)}>พอดี</button>
            {fastButtons.map((v) => (
              <button key={v} type="button" className="btn-ghost h-10 flex-1 text-sm" onClick={() => setReceived(String(Number(received || 0) + Number(v)))}>
                {Number(v).toLocaleString()}
              </button>
            ))}
          </div>

          <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800">
            <span className="text-sm text-slate-500">เงินทอน</span>
            <span className="text-xl font-bold tabular-nums text-brand">{baht(change)}</span>
          </div>

          <Numpad
            onDigit={(d) => setReceived((v) => (d === '.' && v.includes('.') ? v : v + d))}
            onBackspace={() => setReceived((v) => v.slice(0, -1))}
            onClear={() => setReceived('')}
            enterLabel={busy ? 'กำลังบันทึก…' : 'ยืนยันการชำระเงิน'}
            enterDisabled={busy || (branch.isMultiplePayment ? Number(outstanding) > 0 && !received : false)}
            onEnter={submit}
          />

          <button type="button" className="btn-ghost w-full" onClick={onClose} disabled={busy}>ย้อนกลับ</button>
        </div>
      </div>
    </Modal>
  )
}

export { flushQueue }
