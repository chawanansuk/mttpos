'use client'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { Card, EmptyState, Modal, PageHeader } from '@/components/ui'

interface ImportResult {
  dryRun: boolean
  passed?: number
  created?: number
  failed: number
  errors: { row: number; reasons: string[] }[]
}

const TEMPLATE_HEADERS = ['SKUCode', 'Barcode', 'Category', 'Product Name', 'Price', 'Cost', 'Unit', 'Ratio', 'VAT', 'Type', 'Serial', 'Description']

/** แยก CSV แบบรองรับค่าที่ครอบด้วยเครื่องหมายคำพูด */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const clean = text.replace(/^﻿/, '')

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    if (ch === '\r') continue
    field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (!header) return []
  return body.map((cells) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])),
  )
}

export default function ImportProductPage() {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [fileName, setFileName] = useState('')

  const run = useMutation({
    mutationFn: (commit: boolean) => api<ImportResult>('/products/import', { method: 'POST', body: { commit, rows } }),
    onSuccess: (data) => { setResult(data); setError(null) },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'นำเข้าไม่สำเร็จ'),
  })

  const onFile = async (file: File) => {
    setFileName(file.name)
    setResult(null)
    const text = await file.text()
    const parsed = parseCsv(text)
    setRows(parsed)
    if (parsed.length === 0) setError('ไม่พบข้อมูลในไฟล์ หรือรูปแบบไฟล์ไม่ถูกต้อง')
    else setError(null)
  }

  const downloadTemplate = () => {
    const sample = [
      TEMPLATE_HEADERS.join(','),
      'w0169a,6931277603073,Wynn\'s เครื่องมือ,0169a ถอดกรอง,180,140,item,1,N,P,,',
      ',8851130050388,มีด,KIWI512 มีด512,30,20,ชิ้น,1,N,P,,',
    ].join('\r\n')
    const blob = new Blob([`﻿${sample}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'medee-pos-product-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="นำเข้ารายการสินค้า"
        subtitle={`จำนวนสินค้าที่นำเข้า (${rows.length} รายการ)`}
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => setShowRules(true)}>ดูข้อมูลเพิ่มเติม</button>
            <button type="button" className="btn-info" onClick={downloadTemplate}>ดาวน์โหลดไฟล์ตัวอย่าง</button>
          </>
        }
      />

      <Card>
        <label
          htmlFor="import-file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-slate-300 py-12 text-center hover:border-brand dark:border-slate-700"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) void onFile(file)
          }}
        >
          <span className="mb-2 text-4xl" aria-hidden>📄</span>
          <p className="text-sm font-medium">ลากไฟล์ CSV มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
          <p className="mt-1 text-xs text-slate-400">{fileName || 'รองรับไฟล์ .csv'}</p>
          <input
            id="import-file" type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }}
          />
        </label>

        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

        {rows.length > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => run.mutate(false)} disabled={run.isPending}>
                ตรวจสอบข้อมูล
              </button>
              <button
                type="button" className="btn-primary"
                onClick={() => run.mutate(true)}
                disabled={run.isPending || !result || result.failed === rows.length}
              >
                บันทึกเข้าระบบ
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setRows([]); setResult(null); setFileName('') }}>ล้าง</button>
            </div>

            <div className="table-wrap mt-4">
              <table className="table">
                <thead><tr>{TEMPLATE_HEADERS.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>{TEMPLATE_HEADERS.map((h) => <td key={h}>{r[h] || '-'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 ? <p className="px-3 py-2 text-xs text-slate-400">แสดง 20 แถวแรกจาก {rows.length} แถว</p> : null}
            </div>
          </>
        ) : (
          <EmptyState message="ยังไม่ได้เลือกไฟล์" />
        )}
      </Card>

      {result ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">
            {result.dryRun ? 'ผลการตรวจสอบ' : 'ผลการบันทึก'}
          </h2>
          <p className="text-sm">
            <span className="text-brand">ผ่าน {result.dryRun ? result.passed : result.created} รายการ</span>
            {' · '}
            <span className="text-danger">ไม่ผ่าน {result.failed} รายการ</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">สินค้าที่ตรวจสอบไม่ผ่านจะไม่ถูกบันทึก</p>
          {result.errors.length ? (
            <div className="table-wrap mt-3">
              <table className="table">
                <thead><tr><th>แถวที่</th><th>สาเหตุ</th></tr></thead>
                <tbody>
                  {result.errors.slice(0, 50).map((e) => (
                    <tr key={e.row}><td>{e.row}</td><td className="!whitespace-normal text-danger">{e.reasons.join(' · ')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Modal open={showRules} onClose={() => setShowRules(false)} title="ข้อควรระวังในการสร้างไฟล์">
        <ul className="list-inside list-disc space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>คอลัมน์ที่มี * เป็นคอลัมน์จำเป็น: Barcode, Category, Product Name, Price, Unit</li>
          <li>สินค้าเดียวกันแต่ต่างขนาด/สี ให้ใช้ <strong>SKUCode</strong> เดียวกัน ระบบจะสร้างเป็นขนาดบรรจุ (PLU) ของสินค้าเดิม</li>
          <li><strong>Barcode ห้ามซ้ำ</strong> ทุกกรณี ทั้งในไฟล์และกับสินค้าที่มีอยู่แล้ว</li>
          <li>Price, Cost และ Ratio ต้องเป็นตัวเลข</li>
          <li>VAT ใส่ V (มีภาษี) หรือ N (ไม่มีภาษี) · Type ใส่ P / BOM / SN / SV</li>
          <li>Category และ Unit ต้องมีอยู่ในระบบแล้ว มิฉะนั้นแถวนั้นจะไม่ผ่านการตรวจสอบ</li>
        </ul>
      </Modal>
    </div>
  )
}
