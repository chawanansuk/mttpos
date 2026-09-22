'use client'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Card, EmptyState, PageHeader } from '@/components/ui'

const HEADERS = ['ชื่อ', 'เพศ', 'เบอร์โทรศัพท์', 'อีเมล', 'วันเกิด', 'คะแนน', 'กลุ่ม']

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const [head, ...body] = lines
  if (!head) return []
  const cols = head.split(',').map((c) => c.trim())
  return body.map((line) => {
    const cells = line.split(',')
    return Object.fromEntries(cols.map((c, i) => [c, (cells[i] ?? '').trim()]))
  })
}

export default function MemberImportPage() {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [result, setResult] = useState<{ passed?: number; created?: number; updated?: number; failed: number; errors: { row: number; reasons: string[] }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: (commit: boolean) => api<typeof result & object>('/members/import', { method: 'POST', body: { commit, rows } }),
    onSuccess: (d) => { setResult(d as never); setError(null) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'นำเข้าไม่สำเร็จ'),
  })

  const downloadTemplate = () => {
    const csv = [HEADERS.join(','), 'สมชาย ใจดี,ชาย,0812345678,somchai@example.com,1990-01-15,0,'].join('\r\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'medee-pos-member-template.csv'
    a.click()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`นำเข้ารายชื่อสมาชิก (${rows.length} รายการ)`}
        actions={<button type="button" className="btn-info" onClick={downloadTemplate}>ดาวน์โหลดไฟล์ตัวอย่าง</button>}
      />

      <div className="rounded-card bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        ข้อมูลที่จะถูกอัปเดตเป็นข้อมูลล่าสุดที่ทำการบันทึก และข้อมูลคะแนนจะปรับยอดเป็นคะแนนล่าสุดที่มีการนำเข้า
      </div>

      <Card>
        <label
          htmlFor="member-file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-slate-300 py-12 text-center hover:border-brand dark:border-slate-700"
        >
          <span className="mb-2 text-4xl" aria-hidden>👥</span>
          <p className="text-sm font-medium">เลือกไฟล์ CSV รายชื่อสมาชิก</p>
          <input
            id="member-file" type="file" accept=".csv,text/csv" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setRows(parseCsv(await f.text()))
              setResult(null)
            }}
          />
        </label>

        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

        {rows.length > 0 ? (
          <>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => run.mutate(false)} disabled={run.isPending}>ตรวจสอบข้อมูล</button>
              <button type="button" className="btn-primary" onClick={() => run.mutate(true)} disabled={run.isPending || !result}>บันทึกเข้าระบบ</button>
              <button type="button" className="btn-ghost" onClick={() => { setRows([]); setResult(null) }}>ล้าง</button>
            </div>
            <div className="table-wrap mt-4">
              <table className="table">
                <thead><tr>{HEADERS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => <tr key={i}>{HEADERS.map((h) => <td key={h}>{r[h] || '-'}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState message="ยังไม่ได้เลือกไฟล์" />
        )}
      </Card>

      {result ? (
        <Card>
          <p className="text-sm">
            <span className="text-brand">
              ผ่าน {result.passed ?? ((result.created ?? 0) + (result.updated ?? 0))} รายการ
            </span>
            {' · '}
            <span className="text-danger">ไม่ผ่าน {result.failed} รายการ</span>
          </p>
          {result.errors.length ? (
            <ul className="mt-2 list-inside list-disc text-sm text-danger">
              {result.errors.slice(0, 20).map((e) => <li key={e.row}>แถว {e.row}: {e.reasons.join(' · ')}</li>)}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
