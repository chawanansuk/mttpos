'use client'

import clsx from 'clsx'

/** แป้นตัวเลขขนาดใหญ่สำหรับหน้าจอสัมผัส (ปุ่ม ≥ 44px ตามหัวข้อ 11) */
export function Numpad({
  onDigit, onBackspace, onClear, onEnter, enterLabel = 'ตกลง', enterDisabled, allowDecimal = true,
}: {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear?: () => void
  onEnter?: () => void
  enterLabel?: string
  enterDisabled?: boolean
  allowDecimal?: boolean
}) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', allowDecimal ? '.' : 'C', '0', '⌫']

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            if (k === '⌫') onBackspace()
            else if (k === 'C') onClear?.()
            else onDigit(k)
          }}
          className={clsx(
            'h-14 rounded-xl border border-slate-200 bg-white text-xl font-medium transition active:scale-95',
            'hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700',
          )}
        >
          {k}
        </button>
      ))}
      {onClear && allowDecimal ? (
        <button type="button" onClick={onClear} className="h-14 rounded-xl border border-slate-200 bg-white text-base font-medium dark:border-slate-700 dark:bg-slate-800">
          ล้าง
        </button>
      ) : <span />}
      {onEnter ? (
        <button
          type="button" onClick={onEnter} disabled={enterDisabled}
          className="col-span-2 h-14 rounded-xl bg-brand text-lg font-semibold text-white disabled:opacity-40"
        >
          {enterLabel}
        </button>
      ) : null}
    </div>
  )
}
