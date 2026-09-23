/** ฟังก์ชันจัดรูปแบบที่ใช้ร่วมกันทั้งหลังบ้านและหน้าขาย */

export function baht(value: unknown, withSymbol = false): string {
  const n = Number(value ?? 0)
  const s = (Number.isFinite(n) ? n : 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return withSymbol ? `฿ ${s}` : s
}

/** จำนวนสินค้า — ตัดศูนย์ท้ายทิ้ง */
export function qty(value: unknown): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return Number(n.toFixed(3)).toLocaleString('th-TH', { maximumFractionDigits: 3 })
}

export function intNumber(value: unknown): string {
  const n = Number(value ?? 0)
  return (Number.isFinite(n) ? n : 0).toLocaleString('th-TH')
}

const BKK = 'Asia/Bangkok'

export function dateTH(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BKK, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

export function dateTimeTH(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return String(value)
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: BKK, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: BKK, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d)
  return `${date} ${time}`
}

export function timeTH(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BKK, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BKK, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function startOfMonthISO(iso = todayISO()): string {
  return `${iso.slice(0, 7)}-01`
}

/** รูปแบบที่ input แบบ date-range ของหลังบ้านแสดง: "22/09/2026 - 22/09/2026" */
export function rangeLabel(from: string, to: string): string {
  const fmt = (v: string) => v.split('-').reverse().join('/')
  return `${fmt(from)} - ${fmt(to)}`
}

/** แปลงสตริงตัวเลขให้แสดงแบบตาราง — ถ้าไม่ใช่ตัวเลขคืนค่าเดิม */
export function cellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  const s = String(value)
  if (/^-?\d+\.\d{2}$/.test(s)) return baht(s)
  return s
}

export function isNumericCell(value: unknown): boolean {
  const s = String(value ?? '')
  return /^-?[\d,]+(\.\d+)?$/.test(s)
}

/**
 * ใส่เครื่องหมาย +/− หน้าจำนวนเงินเฉพาะเมื่อไม่ใช่ศูนย์
 * ไม่งั้นส่วนลดหรือเงินออกที่เป็นศูนย์จะขึ้นเป็น "-0.00" ซึ่งดูเหมือนมีรายการ
 */
export function signedBaht(value: unknown, sign: '+' | '-'): string {
  const n = Number(value ?? 0)
  return Number.isFinite(n) && n !== 0 ? `${sign}${baht(Math.abs(n))}` : baht(0)
}
