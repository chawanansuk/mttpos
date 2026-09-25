'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { normalizePath } from '@medee/domain'
import { session } from '@/lib/api'
import { logout, useCan, useMe, usePermissions } from '@/hooks/useSession'
import { todayISO } from '@/lib/format'
import { DateRangePicker, type DateRange } from './DateRangePicker'
import { MENU_GROUPS, TOP_MENU, permissionPathOf, type MenuItem } from './menu'

interface ShellContext {
  range: DateRange
  setRange: (r: DateRange) => void
  branchId: string | null
  branchLabel: string
}
const Ctx = createContext<ShellContext | null>(null)

/** ช่วงวันที่ที่เลือกบน top bar — ทุกหน้ารายงานอ่านค่าจากที่นี่ */
export function useShell(): ShellContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShell ต้องอยู่ภายใน AdminShell')
  return ctx
}

function Badge({ kind }: { kind?: 'new' | 'beta' }) {
  if (!kind) return null
  return (
    <span
      className={clsx(
        'ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
        kind === 'new' ? 'bg-brand/15 text-brand-700' : 'bg-info/15 text-info',
      )}
    >
      {kind}
    </span>
  )
}

function NavLink({ item, onNavigate }: { item: MenuItem; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = normalizePath(pathname) === normalizePath(item.path)
  return (
    <Link
      href={item.path}
      onClick={onNavigate}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-brand text-white'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      <span className="truncate">{item.label}</span>
      <Badge kind={item.badge} />
    </Link>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const me = useMe()
  const perms = usePermissions()
  const can = useCan()

  // หน้า admin อ่านโทเค็น/สาขาจาก localStorage จึง render ได้หลัง mount เท่านั้น
  // มิฉะนั้น HTML ฝั่ง server กับ client จะไม่ตรงกัน (hydration mismatch)
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ รายงาน: true, จัดการข้อมูล: true })
  const [dark, setDark] = useState(false)
  const [range, setRange] = useState<DateRange>({ from: todayISO(), to: todayISO() })
  const [branchId, setBranchId] = useState<string | null>(null)
  const [pendingBranch, setPendingBranch] = useState<string>('')

  useEffect(() => {
    setMounted(true)
    if (!session.token) { router.replace('/login'); return }
    setBranchId(session.branchId)
    setDark(document.documentElement.classList.contains('dark'))
  }, [router])

  // เลือกสาขาแรกอัตโนมัติเมื่อยังไม่เคยเลือก
  useEffect(() => {
    if (branchId || !me.data?.branches?.length) return
    const first = me.data.branches[0]!
    session.branchId = first.id
    setBranchId(first.id)
    setPendingBranch(first.id)
  }, [branchId, me.data])

  useEffect(() => { if (branchId) setPendingBranch(branchId) }, [branchId])

  const branchLabel = useMemo(
    () => me.data?.branches.find((b) => b.id === branchId)?.label ?? '',
    [me.data, branchId],
  )

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('medee.theme', next ? 'dark' : 'light') } catch { /* ignore */ }
  }

  /** ซ่อนเมนูที่ผู้ใช้ไม่มีสิทธิ์อ่าน (หัวข้อ 3.3) */
  const visible = (item: MenuItem) => {
    if (perms.isLoading) return true
    return can(permissionPathOf(item.path)).allowed
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">M</span>
        {!collapsed ? (
          <div className="leading-tight">
            <p className="text-sm font-semibold">Medee POS</p>
            <p className="text-[11px] text-slate-400">หลังบ้าน</p>
          </div>
        ) : null}
      </div>

      {TOP_MENU.filter(visible).map((item) => (
        <NavLink key={item.path} item={item} onNavigate={() => setMobileOpen(false)} />
      ))}

      {MENU_GROUPS.map((group) => {
        const sections = (group.sections ?? []).map((s) => ({ ...s, items: s.items.filter(visible) }))
          .filter((s) => s.items.length > 0)
        const flat = group.items.filter(visible)
        if (!sections.length && !flat.length) return null
        const open = openGroups[group.label] ?? false
        return (
          <div key={group.label} className="mt-2">
            <button
              type="button"
              onClick={() => setOpenGroups((s) => ({ ...s, [group.label]: !open }))}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span aria-hidden>{group.icon}</span>
              {!collapsed ? <span className="truncate">{group.label}</span> : null}
              {!collapsed ? <span className={clsx('ml-auto transition-transform', open && 'rotate-90')}>›</span> : null}
            </button>
            {open ? (
              <div className="mt-1 space-y-0.5 pl-1">
                {flat.map((item) => (
                  <NavLink key={item.path} item={item} onNavigate={() => setMobileOpen(false)} />
                ))}
                {sections.map((section) => (
                  <div key={section.label} className="mt-2">
                    <p className="px-3 py-1 text-[11px] font-medium text-slate-400">{section.label}</p>
                    {section.items.map((item) => (
                      <NavLink key={item.path} item={item} onNavigate={() => setMobileOpen(false)} />
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}

      <button type="button" onClick={toggleTheme} className="btn-ghost mt-auto justify-start gap-2">
        <span aria-hidden>{dark ? '☀️' : '🌙'}</span>
        {!collapsed ? <span>{dark ? 'โหมดกลางวัน' : 'โหมดกลางคืน'}</span> : null}
      </button>
    </nav>
  )

  const value: ShellContext = { range, setRange, branchId, branchLabel }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      </div>
    )
  }

  return (
    <Ctx.Provider value={value}>
      <div className="flex min-h-screen">
        {/* Sidebar เดสก์ท็อป */}
        <aside
          className={clsx(
            'hidden shrink-0 border-r border-slate-200 bg-white transition-[width] lg:block dark:border-slate-800 dark:bg-slate-900',
            collapsed ? 'w-[76px]' : 'w-64',
          )}
        >
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        {/* Sidebar มือถือ */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900">{sidebar}</aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              className="btn-ghost h-9 w-9 px-0"
              aria-label="สลับเมนู"
              onClick={() => (window.innerWidth < 1024 ? setMobileOpen((v) => !v) : setCollapsed((v) => !v))}
            >
              ☰
            </button>

            <DateRangePicker value={range} onChange={setRange} />

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-slate-400 sm:inline">TH</span>
              <div className="relative">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                      {(me.data?.account.displayName ?? '?').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hidden text-sm sm:inline">{me.data?.account.displayName ?? '…'}</span>
                  </summary>
                  <div className="absolute right-0 z-40 mt-1 w-56 rounded-card border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    <Link href="/admin/shop" className="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">บัญชีร้านค้า</Link>
                    <Link href="/admin/setting/shop" className="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">ร้านค้า</Link>
                    <Link href="/admin/setting/permission" className="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">สิทธิการเข้าถึง</Link>
                    <Link href="/pos" className="block px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">ไปหน้าขาย (POS)</Link>
                    <button type="button" onClick={logout} className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-slate-50 dark:hover:bg-slate-800">
                      ออกจากระบบ
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </header>

          <main className="flex-1 p-3 sm:p-5">
            {/* การ์ดเลือกสาขา — อยู่บนสุดของทุกหน้า */}
            <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
              <span aria-hidden className="text-lg">🏪</span>
              <select
                className="input max-w-xs"
                value={pendingBranch}
                onChange={(e) => setPendingBranch(e.target.value)}
                aria-label="เลือกสาขา"
              >
                <option value="">เลือกสาขา...</option>
                {me.data?.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary"
                disabled={!pendingBranch || pendingBranch === branchId}
                onClick={() => {
                  session.branchId = pendingBranch
                  setBranchId(pendingBranch)
                  window.location.reload()
                }}
              >
                ตกลง
              </button>
              {branchLabel ? (
                <span className="ml-auto text-xs text-slate-400">กำลังดู: {branchLabel}</span>
              ) : null}
            </div>

            {branchId ? children : <div className="card p-10 text-center text-slate-400">กรุณาเลือกสาขา</div>}
          </main>

          <footer className="border-t border-slate-200 px-4 py-3 text-center text-xs text-slate-400 dark:border-slate-800">
            © {new Date().getFullYear()} Medee POS — ร้านมีดีทวีคูณ · v1.0.0
            <span className="ml-2 text-slate-300">{pathname}</span>
          </footer>
        </div>
      </div>
    </Ctx.Provider>
  )
}
