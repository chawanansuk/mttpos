/**
 * วันขาย (business day) — หัวข้อ 7.6
 * วันขายตัดตามเวลาเปิด–ปิดของสาขา ถ้าร้านปิดหลังเที่ยงคืน
 * บิลที่เกิดหลังเที่ยงคืนแต่ก่อนเวลาปิด จะถูกนับเป็นวันขายของวันก่อนหน้า
 */

const MINUTES_PER_DAY = 24 * 60

function parseHHmm(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return fallback
  return Math.min(MINUTES_PER_DAY, h * 60 + min)
}

/** แปลง Date เป็นเวลาท้องถิ่นของสาขา (timezone ของร้าน) */
export function toZoned(date: Date, timeZone = 'Asia/Bangkok'): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** YYYY-MM-DD ของเวลาท้องถิ่นสาขา */
export function zonedDateString(date: Date, timeZone = 'Asia/Bangkok'): string {
  const z = toZoned(date, timeZone)
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`
}

export interface BusinessDayOptions {
  openTime?: string | null
  closeTime?: string | null
  timeZone?: string
}

/**
 * คืน "วันขาย" (YYYY-MM-DD) ของเวลาที่กำหนด
 * ร้านมีดีทวีคูณตั้ง 00:00–23:59 → วันขาย = วันปฏิทิน
 * ร้านที่ปิดหลังเที่ยงคืน (เช่น 18:00–02:00) → บิลเวลา 01:00 นับเป็นวันก่อนหน้า
 */
export function businessDay(at: Date, options: BusinessDayOptions = {}): string {
  const tz = options.timeZone ?? 'Asia/Bangkok'
  const open = parseHHmm(options.openTime, 0)
  const close = parseHHmm(options.closeTime, MINUTES_PER_DAY)

  const z = toZoned(at, tz)
  const minutes = z.hour * 60 + z.minute

  // ร้านที่ปิดข้ามเที่ยงคืน (close ≤ open) และเวลาปัจจุบันยังไม่ถึงเวลาเปิด → วันก่อนหน้า
  const crossesMidnight = close <= open && close < MINUTES_PER_DAY
  if (crossesMidnight && minutes < open) {
    const d = new Date(Date.UTC(z.year, z.month - 1, z.day))
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`
}

/** ช่วงเวลา UTC ที่ครอบคลุมวันขายที่กำหนด — ใช้เป็น where clause ของรายงาน */
export function businessDayRange(
  fromDate: string,
  toDate: string,
  options: BusinessDayOptions = {},
): { start: Date; end: Date } {
  const tz = options.timeZone ?? 'Asia/Bangkok'
  const open = parseHHmm(options.openTime, 0)
  const close = parseHHmm(options.closeTime, MINUTES_PER_DAY)
  const crossesMidnight = close <= open && close < MINUTES_PER_DAY

  const offsetMinutes = zoneOffsetMinutes(new Date(`${fromDate}T00:00:00Z`), tz)
  const startLocal = Date.parse(`${fromDate}T00:00:00Z`) + (crossesMidnight ? open : 0) * 60_000
  const endLocalBase = Date.parse(`${toDate}T00:00:00Z`) + 24 * 60 * 60_000
  const endLocal = endLocalBase + (crossesMidnight ? open : 0) * 60_000

  return {
    start: new Date(startLocal - offsetMinutes * 60_000),
    end: new Date(endLocal - offsetMinutes * 60_000),
  }
}

/** ระยะห่างจาก UTC ของโซนเวลา ณ เวลาที่กำหนด (นาที) */
export function zoneOffsetMinutes(at: Date, timeZone = 'Asia/Bangkok'): number {
  const z = toZoned(at, timeZone)
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second)
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/** รูปแบบวันที่บนหลังบ้าน: DD/MM/YYYY (ค.ศ.) */
export function formatDateTH(date: Date, timeZone = 'Asia/Bangkok'): string {
  const z = toZoned(date, timeZone)
  return `${String(z.day).padStart(2, '0')}/${String(z.month).padStart(2, '0')}/${z.year}`
}

/** DD/MM/YYYY HH:mm:ss */
export function formatDateTimeTH(date: Date, timeZone = 'Asia/Bangkok'): string {
  const z = toZoned(date, timeZone)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(z.day)}/${p(z.month)}/${z.year} ${p(z.hour)}:${p(z.minute)}:${p(z.second)}`
}

/** วันที่แบบพุทธศักราชสำหรับใบเสร็จ: 22/09/2569 */
export function formatDateBE(date: Date, timeZone = 'Asia/Bangkok'): string {
  const z = toZoned(date, timeZone)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(z.day)}/${p(z.month)}/${z.year + 543}`
}

export const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** บรรทัดช่วงวันที่บนหัวการ์ด: "วันที่ 22 กันยายน 2026" / "วันที่ 23 สิงหาคม 2026 ถึง 22 กันยายน 2026" */
export function formatDateRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return `${d} ${TH_MONTHS[(m ?? 1) - 1]} ${y}`
  }
  return from === to ? `วันที่ ${fmt(from)}` : `วันที่ ${fmt(from)} ถึง ${fmt(to)}`
}
