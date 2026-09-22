'use client'

import clsx from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'

/** การ์ดเนื้อหามาตรฐานของหลังบ้าน (หัวข้อ 6.0) */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card p-4 sm:p-5', className)}>{children}</div>
}

export function PageHeader({
  title, subtitle, actions, help,
}: { title: string; subtitle?: string; actions?: ReactNode; help?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800 dark:text-slate-100">
          {title}
          {help}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

/** ข้อความ "ไม่มีรายการ" ตามต้นฉบับ */
export function EmptyState({ message = 'ไม่มีรายการ' }: { message?: string }) {
  return (
    <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">{message}</div>
  )
}

/** หน้าที่ไม่มีสิทธิ์เข้าถึง (หัวข้อ 6.0) */
export function NoAccess() {
  return (
    <Card className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-3xl dark:bg-slate-800">
        🔒
      </div>
      <p className="text-lg font-medium text-slate-700 dark:text-slate-200">ไม่สามารถเข้าถึงข้อมูลนี้ได้</p>
      <p className="mt-1 text-sm text-slate-400">Can&apos;t access this information.</p>
    </Card>
  )
}

/** ฟีเจอร์ที่ถูกล็อกตามแพ็กเกจ — แสดงหน้าโปรโมทแทน 403 */
export function FeatureLocked({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warn/10 text-3xl">
        ✨
      </div>
      <p className="text-lg font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        {description ?? 'ฟีเจอร์นี้ยังไม่เปิดใช้งานสำหรับร้านของคุณ — ติดต่อทีมงานเพื่อเปิดใช้'}
      </p>
      <button type="button" className="btn-primary mt-5">ติดต่อพนักงาน</button>
    </Card>
  )
}

export function Badge({
  children, tone = 'slate',
}: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
    red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  }
  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function Toggle({
  checked, onChange, disabled, label,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/** โมดัลยืนยัน/ฟอร์ม — ปิดด้วย Esc หรือคลิกพื้นหลัง */
export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        className={clsx(
          'max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-card dark:bg-slate-900',
          widths[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** โมดัลยืนยันแบบเดียวกับต้นฉบับ: "คุณต้องการ…หรือไม่" */
export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = 'บันทึก', tone = 'primary', busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  busy?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'กำลังบันทึก…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </Modal>
  )
}

export function Pagination({
  page, totalPages, total, limit, onChange,
}: { page: number; totalPages: number; total: number; limit: number; onChange: (p: number) => void }) {
  if (total === 0) return null
  const from = (page - 1) * limit + 1
  const to = Math.min(total, page * limit)

  const pages: (number | '…')[] = []
  const push = (v: number | '…') => { if (pages[pages.length - 1] !== v) pages.push(v) }
  for (let p = 1; p <= totalPages; p++) {
    if (p <= 2 || p > totalPages - 2 || Math.abs(p - page) <= 1) push(p)
    else push('…')
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-slate-500 dark:text-slate-400">
        Showing {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()} entries
      </p>
      <div className="flex items-center gap-1">
        <button className="btn-ghost h-9 px-2" disabled={page <= 1} onClick={() => onChange(page - 1)}>«</button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-2 text-slate-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={clsx(
                'btn h-9 min-w-[36px] px-2',
                p === page ? 'bg-brand text-white' : 'btn-ghost',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button className="btn-ghost h-9 px-2" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>»</button>
      </div>
    </div>
  )
}
