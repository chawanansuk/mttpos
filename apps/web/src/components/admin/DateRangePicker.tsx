'use client'

import { useState } from 'react'
import { addDaysISO, rangeLabel, startOfMonthISO, todayISO } from '@/lib/format'
import { Modal } from '@/components/ui'

export interface DateRange { from: string; to: string }

/** ตัวเลือกช่วงวันที่บน top bar — เปลี่ยนแล้วทุกหน้ารายงานโหลดใหม่ (หัวข้อ 6.0) */
export function DateRangePicker({
  value, onChange,
}: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)

  const presets: { label: string; range: () => DateRange }[] = [
    { label: 'วันนี้', range: () => ({ from: todayISO(), to: todayISO() }) },
    { label: 'เมื่อวาน', range: () => ({ from: addDaysISO(todayISO(), -1), to: addDaysISO(todayISO(), -1) }) },
    { label: '7 วันล่าสุด', range: () => ({ from: addDaysISO(todayISO(), -6), to: todayISO() }) },
    { label: '30 วันล่าสุด', range: () => ({ from: addDaysISO(todayISO(), -29), to: todayISO() }) },
    { label: 'เดือนนี้', range: () => ({ from: startOfMonthISO(), to: todayISO() }) },
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => { setDraft(value); setOpen(true) }}
        className="btn-ghost h-9 gap-2 text-sm"
        title="เลือกช่วงวันที่"
      >
        <span aria-hidden>📅</span>
        <span className="tabular-nums">{rangeLabel(value.from, value.to)}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="เลือกช่วงวันที่"
        size="md"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button>
            <button
              className="btn-primary"
              onClick={() => {
                // กันกรณีเลือกวันเริ่มหลังวันสิ้นสุด
                const range = draft.from > draft.to ? { from: draft.to, to: draft.from } : draft
                onChange(range)
                setOpen(false)
              }}
            >
              ตกลง
            </button>
          </>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.label} type="button" className="btn-ghost h-8 text-xs" onClick={() => setDraft(p.range())}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="range-from">ตั้งแต่วันที่</label>
            <input
              id="range-from" type="date" className="input"
              value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="range-to">ถึงวันที่</label>
            <input
              id="range-to" type="date" className="input"
              value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
