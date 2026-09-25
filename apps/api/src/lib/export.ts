import ExcelJS from 'exceljs'
import type { FastifyReply } from 'fastify'

export interface ExportColumn {
  key: string
  /** หัวคอลัมน์ภาษาไทยตามสเปก */
  header: string
  width?: number
}

/** ส่งออกตารางเป็น .xlsx (ปุ่ม "ส่งออกไฟล์" สีฟ้าในทุกหน้ารายงาน) */
export async function sendXlsx(
  reply: FastifyReply,
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: { title?: string; subtitle?: string },
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Medee POS'
  wb.created = new Date()
  const ws = wb.addWorksheet(meta?.title?.slice(0, 30) || 'รายงาน')

  let headerRowIndex = 1
  if (meta?.title) {
    ws.addRow([meta.title])
    ws.getRow(1).font = { bold: true, size: 14 }
    headerRowIndex += 1
  }
  if (meta?.subtitle) {
    ws.addRow([meta.subtitle])
    headerRowIndex += 1
  }
  if (meta?.title || meta?.subtitle) {
    ws.addRow([])
    headerRowIndex += 1
  }

  ws.addRow(columns.map((c) => c.header))
  const header = ws.getRow(headerRowIndex)
  header.font = { bold: true }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECF1' } }
  header.alignment = { vertical: 'middle' }

  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 4)
  })

  for (const row of rows) {
    ws.addRow(columns.map((c) => row[c.key] ?? ''))
  }

  const buffer = await wb.xlsx.writeBuffer()
  reply
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.xlsx"`)
    .send(Buffer.from(buffer))
}

/** ส่งออกเป็น CSV (UTF-8 BOM เพื่อให้ Excel อ่านภาษาไทยได้) */
export function sendCsv(
  reply: FastifyReply,
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
) {
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    columns.map((c) => escape(c.header)).join(','),
    ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')),
  ]
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.csv"`)
    .send(`﻿${lines.join('\r\n')}`)
}

/** เลือกรูปแบบไฟล์ตาม query `?export=xlsx|csv` */
export async function sendExport(
  reply: FastifyReply,
  format: 'xlsx' | 'csv',
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  meta?: { title?: string; subtitle?: string },
) {
  if (format === 'csv') return sendCsv(reply, filename, columns, rows)
  return sendXlsx(reply, filename, columns, rows, meta)
}
