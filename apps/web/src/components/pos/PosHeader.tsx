'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { session } from '@/lib/api'
import { flushQueue, lastSyncAt, pendingCount, pullMaster } from '@/lib/pos/sync'
import { timeTH } from '@/lib/format'

const MENU = [
  { href: '/pos/sale', label: 'ขายหน้าร้าน', icon: '🛒' },
  { href: '/pos/bills', label: 'การจัดการบิล', icon: '🧾' },
  { href: '/pos/cash', label: 'จัดการเงินสด', icon: '💰' },
  { href: '/pos/products', label: 'สินค้าทั้งหมด', icon: '📦' },
  { href: '/pos/settings', label: 'การตั้งค่า', icon: '⚙️' },
]

export function PosHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  // ข้อมูลพนักงานอยู่ใน localStorage จึงอ่านได้หลัง mount เท่านั้น (กัน hydration mismatch)
  const [cashier, setCashier] = useState<{ name: string } | null>(null)

  const refreshStatus = async () => {
    setPending(await pendingCount())
    setSyncedAt(await lastSyncAt())
  }

  useEffect(() => {
    setCashier(session.cashier)
    setOnline(navigator.onLine)
    void refreshStatus()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    // ส่งบิลที่ค้างขึ้น server อัตโนมัติทุก 30 วินาทีเมื่อออนไลน์
    const timer = setInterval(async () => {
      if (!navigator.onLine) return
      await flushQueue()
      await refreshStatus()
    }, 30_000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(timer)
    }
  }, [])

  const sync = async () => {
    setSyncing(true)
    try {
      await flushQueue()
      await pullMaster()
      await refreshStatus()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" className="btn-ghost h-11 w-11 px-0 text-lg" aria-label="เมนู" onClick={() => setMenuOpen(true)}>☰</button>
        <h1 className="truncate text-base font-semibold">{title}</h1>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={clsx(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              online ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
            )}
          >
            {online ? 'ออนไลน์' : 'ออฟไลน์'}
            {pending > 0 ? ` · รอส่ง ${pending}` : ''}
          </span>
          <button type="button" className="btn-ghost h-11 gap-1.5 text-sm" onClick={sync} disabled={syncing || !online}>
            <span className={syncing ? 'inline-block animate-spin' : ''} aria-hidden>⟳</span>
            <span className="hidden sm:inline">{syncedAt ? timeTH(syncedAt) : 'ซิงค์'}</span>
          </button>
          {right}
          {cashier ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white" title={cashier.name}>
              {cashier.name.slice(0, 1).toUpperCase()}
            </span>
          ) : null}
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <nav className="relative flex h-full w-72 flex-col gap-1 bg-white p-3 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2 px-2 py-1">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">M</span>
              <div>
                <p className="text-sm font-semibold">Medee POS</p>
                <p className="text-xs text-slate-400">{cashier?.name ?? 'ยังไม่ได้เข้าสู่ระบบ'}</p>
              </div>
            </div>
            {MENU.map((m) => (
              <Link
                key={m.href} href={m.href} onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span aria-hidden>{m.icon}</span>{m.label}
              </Link>
            ))}
            <Link href="/admin/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
              <span aria-hidden>📊</span>รายงาน (หลังบ้าน)
            </Link>
            <button
              type="button"
              className="mt-auto flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-danger hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => { session.cashier = null; router.replace('/pos/lock') }}
            >
              <span aria-hidden>🔒</span>ออกจากระบบ / สลับพนักงาน
            </button>
          </nav>
        </div>
      ) : null}
    </>
  )
}
