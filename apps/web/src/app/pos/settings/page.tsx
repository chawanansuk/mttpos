'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { session } from '@/lib/api'
import { db } from '@/lib/pos/db'
import { getBranchSettings, lastSyncAt, pendingCount, pullMaster, unbindDevice, type BranchSettings } from '@/lib/pos/sync'
import { PosHeader } from '@/components/pos/PosHeader'
import { ConfirmModal } from '@/components/ui'
import { dateTimeTH } from '@/lib/format'

/** ตั้งค่าบนเครื่อง (หัวข้อ 5.13) — ซิงค์ · ข้อมูลในเครื่อง · ปลดเครื่อง */
export default function PosSettingsPage() {
  const router = useRouter()
  const [branch, setBranch] = useState<BranchSettings | undefined>()
  const [counts, setCounts] = useState({ products: 0, members: 0, categories: 0, pending: 0 })
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [unbinding, setUnbinding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dark, setDark] = useState(false)

  const load = async () => {
    setBranch(await getBranchSettings())
    setSyncedAt(await lastSyncAt())
    setCounts({
      products: await db().products.count(),
      members: await db().members.count(),
      categories: await db().categories.count(),
      pending: await pendingCount(),
    })
  }

  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    setDark(document.documentElement.classList.contains('dark'))
    void load()
  }, [router])

  const fullSync = async () => {
    setSyncing(true); setMessage(null)
    try {
      const res = await pullMaster(true)
      await load()
      setMessage(`ดาวน์โหลดข้อมูลใหม่ทั้งหมดแล้ว (${res.products} สินค้า)`)
    } catch {
      setMessage('ซิงค์ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ')
    } finally {
      setSyncing(false)
    }
  }

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('medee.theme', next ? 'dark' : 'light') } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen">
      <PosHeader title="การตั้งค่า" />

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {message ? <p className="rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">{message}</p> : null}

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">ข้อมูลเครื่อง</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">ร้าน</dt><dd>{branch ? `${branch.shop.name} · ${branch.branchName}` : '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">พนักงาน</dt><dd>{session.cashier?.name ?? '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ซิงค์ล่าสุด</dt><dd>{syncedAt ? dateTimeTH(syncedAt) : 'ยังไม่เคยซิงค์'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">สินค้าในเครื่อง</dt><dd className="tabular-nums">{counts.products.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">กลุ่มสินค้า</dt><dd className="tabular-nums">{counts.categories}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">สมาชิก</dt><dd className="tabular-nums">{counts.members.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">บิลรอส่ง</dt><dd className={`tabular-nums ${counts.pending > 0 ? 'text-amber-600' : ''}`}>{counts.pending}</dd></div>
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">การตั้งค่าที่มีผลกับหน้าขาย</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">VAT</dt><dd>{branch?.vatRate ?? '0'}% {branch?.isVatIncluded ? '(รวมในราคา)' : '(แยก)'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ค่าบริการ</dt><dd>{branch?.enabledServiceCharge ? `${branch.serviceChargeRate}%` : 'ปิด'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ปัดเศษ</dt><dd>{branch?.roundingType === 'none' ? 'ไม่ปัด' : `${branch?.roundingType} หน่วย ${branch?.roundingAmount}`}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">จัดการเงินสด</dt><dd>{branch?.cashManagement ? 'เปิด' : 'ปิด'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ชำระหลายช่องทาง</dt><dd>{branch?.isMultiplePayment ? 'เปิด' : 'ปิด'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">แก้ไขรายการในตะกร้า</dt><dd>{branch?.editableItem ? 'ได้' : 'ไม่ได้'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">ปุ่มเงินด่วน</dt><dd>{branch?.fastInput ?? '-'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-400">แก้ไขการตั้งค่าเหล่านี้ได้ที่หลังบ้าน → การตั้งค่า → ร้านค้า</p>
        </div>

        <div className="card space-y-2 p-5">
          <h2 className="mb-1 text-sm font-semibold">การเชื่อมต่อข้อมูล</h2>
          <button type="button" className="btn-primary w-full" onClick={fullSync} disabled={syncing}>
            {syncing ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดข้อมูลใหม่ทั้งหมด'}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={toggleTheme}>
            {dark ? '☀️ โหมดกลางวัน' : '🌙 โหมดกลางคืน'}
          </button>
          <button type="button" className="btn-danger w-full" onClick={() => setUnbinding(true)}>
            ปลดเครื่องขายนี้
          </button>
          <p className="text-xs text-slate-400">
            การปลดเครื่องจะล้างข้อมูลทั้งหมดในเครื่องนี้ — ตรวจสอบว่าบิลค้างส่งถูกส่งขึ้นระบบครบแล้วก่อนปลด
          </p>
        </div>
      </div>

      <ConfirmModal
        open={unbinding} onClose={() => setUnbinding(false)}
        onConfirm={async () => { await unbindDevice(); router.replace('/pos/setup') }}
        title="ปลดเครื่องขาย"
        message={counts.pending > 0
          ? `ยังมีบิลค้างส่ง ${counts.pending} บิล หากปลดตอนนี้ข้อมูลจะหาย — ต้องการปลดเครื่องหรือไม่`
          : 'ต้องการปลดเครื่องขายนี้และล้างข้อมูลในเครื่องหรือไม่'}
        confirmLabel="ปลดเครื่อง" tone="danger"
      />
    </div>
  )
}
