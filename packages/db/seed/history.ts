/**
 * สร้างประวัติการขายย้อนหลัง 23/08–21/09/2026 เพื่อให้ทุกหน้ารายงานมีข้อมูลใช้งานจริง
 *
 * เป้าหมายรวมของช่วง 23/08–22/09/2026 ตามระบบเดิม (หัวข้อ 1.1 / 6.6):
 *   ยอดขาย 123,599.00 · 773 บิล · เฉลี่ย 159.90 บาท/บิล
 *   ส่วนลดรวม 7,806.00 จาก 48 บิลที่ทำส่วนลด · ยกเลิก 11 บิล มูลค่า 2,560.00
 * ร้านหยุดวันอาทิตย์ → 26 วันทำการ (วันที่ 22/09 ถูก seed แยกจาก fixture จริง)
 *
 * ยอดรายวันที่สเปกระบุไว้ถูกใช้เป็นเป้าหมายตรงตัว ส่วนวันอื่นกระจายให้ผลรวมลงตัวพอดี
 * รายการสินค้าในแต่ละบิลเป็นการสุ่มจากแคตตาล็อกจริงของร้าน (ระบบเดิมไม่ได้เปิดเผยรายบิล)
 */
import type { ProductRef } from './lib.js'

/** ยอดขายสุทธิรายวันที่สเปกระบุไว้ตรง ๆ (หัวข้อ 6.6 / 6.7) */
export const KNOWN_DAILY_SALES: Record<string, number> = {
  '2026-08-24': 4090,
  '2026-08-29': 5090,
  '2026-09-08': 11125,
  '2026-09-17': 3754,
  '2026-09-18': 5430,
  '2026-09-19': 4275,
  '2026-09-21': 5650,
}

export const MONTH_TOTAL_SALES = 123599
export const DAY_22_SALES = 5155
export const MONTH_TOTAL_BILLS = 773
export const DAY_22_BILLS = 23
export const MONTH_DISCOUNT_TOTAL = 7806
export const DAY_22_DISCOUNT = 305
export const MONTH_DISCOUNT_BILLS = 48
export const MONTH_VOID_COUNT = 11
export const MONTH_VOID_VALUE = 2560
export const DAY_22_VOID_VALUE = 195

export interface GeneratedLine {
  ref: ProductRef
  qty: number
  discount?: string
}
export interface GeneratedBill {
  soldAt: Date
  businessDay: string
  lines: GeneratedLine[]
  status: 'ปกติ' | 'ยกเลิก'
  voidedAt?: Date
}

/** ตัวสุ่มแบบกำหนด seed ได้ เพื่อให้ผล seed เหมือนเดิมทุกครั้ง */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** วันทำการของช่วง (ร้านหยุดวันอาทิตย์) */
export function workingDays(fromISO: string, toISO: string): string[] {
  const out: string[] = []
  const d = new Date(`${fromISO}T00:00:00Z`)
  const end = new Date(`${toISO}T00:00:00Z`)
  while (d <= end) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** กระจายยอดรวมลงแต่ละวัน โดยคงยอดของวันที่สเปกระบุไว้ และผลรวมตรงเป๊ะ */
export function planDailyTargets(days: string[], totalSales: number): Record<string, number> {
  const plan: Record<string, number> = {}
  let remaining = totalSales
  const freeDays: string[] = []

  for (const day of days) {
    const known = KNOWN_DAILY_SALES[day]
    if (known !== undefined) {
      plan[day] = known
      remaining -= known
    } else {
      freeDays.push(day)
    }
  }

  const rng = mulberry32(20260922)
  const weights = freeDays.map(() => 0.6 + rng() * 0.9)
  const weightSum = weights.reduce((a, b) => a + b, 0)

  let allocated = 0
  freeDays.forEach((day, i) => {
    if (i === freeDays.length - 1) return
    const value = Math.max(200, Math.round((remaining * weights[i]!) / weightSum))
    plan[day] = value
    allocated += value
  })
  const last = freeDays[freeDays.length - 1]
  if (last) plan[last] = Math.max(200, remaining - allocated)
  return plan
}

/** ราคาสินค้าที่ใช้ "เติมเศษ" ให้ยอดบิลลงตัว (ปุ่มราคาสำเร็จรูปของร้าน) */
const FILLER_PRICES = [100, 90, 80, 70, 60, 50, 40, 35, 30, 25, 20, 15, 10, 5]

export interface GenerateOptions {
  days: string[]
  targets: Record<string, number>
  catalog: ProductRef[]
  /** สินค้าปุ่มราคาสำเร็จรูป (ชื่อ = ราคา) สำหรับเติมเศษ */
  fillers: Map<number, ProductRef>
  /** จำนวนบิลทั้งช่วง (ไม่รวมบิลยกเลิก) */
  billCount: number
  /** ส่วนลดรวมที่ต้องการ และจำนวนบิลที่ทำส่วนลด */
  discountBudget: number
  discountBills: number
  /** บิลที่ถูกยกเลิก */
  voidCount: number
  voidValue: number
}

/**
 * สร้างบิลทั้งช่วง — ยอดรายวันตรงกับเป้าหมายทุกบาท
 * แต่ละบิลประกอบจากสินค้าจริง 1–4 รายการ แล้วเติมเศษด้วยปุ่มราคาสำเร็จรูป
 * ถ้ายังไม่ลงตัวจะปิดส่วนต่างด้วยส่วนลดรายการ (วิธีเดียวกับที่ร้านใช้จริง)
 */
export function generateHistory(options: GenerateOptions): GeneratedBill[] {
  const rng = mulberry32(915341)
  const sellable = options.catalog.filter((p) => {
    const price = Number(p.price)
    // เลือกเฉพาะราคาที่ลงตัวหลัก 5 บาท เพื่อให้ยอดบิลประกอบได้พอดีโดยไม่ต้องปิดเศษด้วยส่วนลด
    return price >= 5 && price <= 400 && Number.isInteger(price) && price % 5 === 0
  })

  const totalTarget = options.days.reduce((a, d) => a + (options.targets[d] ?? 0), 0)

  // ── รอบที่ 1: วางแผนยอดสุทธิของทุกบิล ให้ยอดรายวันตรงเป๊ะ ──
  interface PlannedBill { day: string; index: number; ofDay: number; net: number; discount: number }
  const planned: PlannedBill[] = []

  // แจกจำนวนบิลให้แต่ละวันตามสัดส่วนยอดขาย แล้วปรับเศษให้ผลรวมเท่ากับ billCount พอดี
  const dayBillCounts = new Map<string, number>()
  let assigned = 0
  for (const day of options.days) {
    const dayTarget = options.targets[day] ?? 0
    const n = Math.max(1, Math.round((options.billCount * dayTarget) / totalTarget))
    dayBillCounts.set(day, n)
    assigned += n
  }
  let drift = options.billCount - assigned
  for (const day of options.days) {
    if (drift === 0) break
    const n = dayBillCounts.get(day)!
    if (drift > 0) { dayBillCounts.set(day, n + 1); drift -= 1 }
    else if (n > 1) { dayBillCounts.set(day, n - 1); drift += 1 }
  }

  for (const day of options.days) {
    const dayTarget = options.targets[day] ?? 0
    if (dayTarget <= 0) continue
    const dayBills = dayBillCounts.get(day) ?? 1
    let remaining = dayTarget
    for (let i = 0; i < dayBills; i++) {
      const isLast = i === dayBills - 1
      const billsLeft = dayBills - i
      let net = isLast ? remaining : pickBillAmount(rng, remaining, billsLeft)
      if (net < 5) net = Math.min(remaining, 5)
      if (net <= 0) continue
      planned.push({ day, index: i, ofDay: dayBills, net, discount: 0 })
      remaining -= net
    }
  }

  // ── รอบที่ 2: เลือกบิลที่ทำส่วนลด (เลือกจากบิลยอดสูง เหมือนที่ร้านลดให้ลูกค้าขายส่ง) ──
  const candidates = [...planned]
    .filter((b) => b.net >= 100)
    .sort((a, b) => b.net - a.net)
    .slice(0, options.discountBills)
  let discountLeft = options.discountBudget
  for (const [i, bill] of candidates.entries()) {
    const left = candidates.length - i
    const share = Math.round(discountLeft / left / 5) * 5
    // ส่วนลดต้องไม่เกิน 40% ของยอดบิล เพื่อให้ยังดูสมจริง
    const cap = Math.floor((bill.net * 0.4) / 5) * 5
    const value = Math.max(5, Math.min(share, cap, discountLeft))
    bill.discount = value
    discountLeft -= value
  }
  // เศษงบส่วนลดที่เหลือ ยกไปบิลที่ใหญ่ที่สุด
  if (discountLeft > 0 && candidates[0]) candidates[0].discount += discountLeft

  // ── รอบที่ 3: ประกอบรายการสินค้าของแต่ละบิล ──
  const bills: GeneratedBill[] = []
  const startMinute = 8 * 60
  const endMinute = 15 * 60 + 30
  for (const bill of planned) {
    const built = buildBill(rng, bill.net, bill.discount, sellable, options.fillers)
    if (!built) continue
    const span = endMinute - startMinute
    const m = startMinute + Math.floor((span * bill.index) / Math.max(1, bill.ofDay)) + Math.floor(rng() * 6)
    const h = Math.min(23, Math.floor(m / 60))
    const mm = Math.floor(m % 60)
    const ss = Math.floor(rng() * 60)
    bills.push({
      soldAt: new Date(
        `${bill.day}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+07:00`,
      ),
      businessDay: bill.day,
      lines: built.lines,
      status: 'ปกติ',
    })
  }

  // ── บิลที่ถูกยกเลิก — ไม่นับในยอดขาย แต่ต้องมีในรายงาน "ยกเลิกการขาย" ──
  const step = Math.max(1, Math.floor(options.days.length / options.voidCount))
  const voidDays = options.days.filter((_, i) => i % step === 0).slice(0, options.voidCount)
  const perVoid = Math.floor(options.voidValue / Math.max(1, voidDays.length))
  let voidLeft = options.voidValue
  for (const [i, day] of voidDays.entries()) {
    const amount = i === voidDays.length - 1 ? voidLeft : perVoid
    voidLeft -= amount
    const built = buildBill(rng, amount, 0, sellable, options.fillers)
    if (!built) continue
    const soldAt = new Date(`${day}T11:05:00+07:00`)
    bills.push({
      soldAt, businessDay: day, lines: built.lines, status: 'ยกเลิก',
      voidedAt: new Date(soldAt.getTime() + 9 * 60_000),
    })
  }

  return bills.sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime())
}

/** สุ่มยอดบิลรอบ ๆ ค่าเฉลี่ยที่เหลือ โดยไม่ให้บิลถัดไปเหลือน้อยเกินไป */
function pickBillAmount(rng: () => number, remaining: number, billsLeft: number): number {
  const avg = remaining / billsLeft
  // ยอดบิลจริงของร้านกระจายกว้าง (20 บาทถึงหลักพัน) — ใช้การกระจายแบบเบ้ขวา
  const factor = 0.25 + rng() * rng() * 2.4
  // ปัดเป็นพหุคูณของ 5 เพื่อให้ประกอบบิลจากราคาสินค้าจริงได้ลงตัวโดยไม่ต้องเพิ่มส่วนลดปิดเศษ
  const raw = Math.max(5, Math.round((avg * factor) / 5) * 5)
  const maxAllowed = remaining - (billsLeft - 1) * 5
  return Math.max(5, Math.min(raw, Math.max(5, maxAllowed)))
}

/**
 * ประกอบบิลให้ได้ยอดสุทธิตรงเป๊ะ
 * gross = netTarget + discount → เลือกสินค้าจริงก่อน แล้วเติมเศษด้วยปุ่มราคา
 * เศษที่เติมไม่ลงจะถูกปิดด้วยส่วนลดรายการเพิ่ม
 */
function buildBill(
  rng: () => number,
  netTarget: number,
  plannedDiscount: number,
  sellable: ProductRef[],
  fillers: Map<number, ProductRef>,
): { lines: GeneratedLine[]; discount: number } | null {
  let discount = plannedDiscount
  if (discount >= netTarget) discount = 0
  let gross = netTarget + discount

  const lines: GeneratedLine[] = []
  let placed = 0
  const wanted = 1 + Math.floor(rng() * 3)
  for (let i = 0; i < wanted && sellable.length; i++) {
    const ref = sellable[Math.floor(rng() * sellable.length)]!
    const price = Number(ref.price)
    const room = gross - placed
    if (price <= 0 || price > room) continue
    const qty = 1 + Math.floor(rng() * Math.min(5, Math.floor(room / price)))
    lines.push({ ref, qty })
    placed += price * qty
  }

  // เติมเศษที่เหลือด้วยปุ่มราคาสำเร็จรูป
  let rest = gross - placed
  for (const price of FILLER_PRICES) {
    if (rest <= 0) break
    const ref = fillers.get(price)
    if (!ref) continue
    const qty = Math.min(20, Math.floor(rest / price))
    if (qty > 0) {
      lines.push({ ref, qty })
      rest -= qty * price
    }
  }

  if (!lines.length) return null

  // เศษที่ยังเหลือ (น้อยกว่า 5 บาท) ปิดด้วยส่วนลดรายการ
  if (rest > 0) {
    gross -= rest
    const excess = rest
    // ลดจำนวนของบรรทัดสุดท้ายแทน ถ้าทำได้
    const last = lines[lines.length - 1]!
    void last
    // ปิดด้วยการเพิ่มสินค้าราคา 5 แล้วหักส่วนลด
    const five = fillers.get(5)
    if (five) {
      const units = Math.ceil(excess / 5)
      lines.push({ ref: five, qty: units })
      discount += units * 5 - excess
      gross += units * 5
    } else {
      return null
    }
  }

  if (discount > 0) {
    // ใส่ส่วนลดที่บรรทัดที่รองรับได้ (ส่วนลดต้องไม่เกินยอดของบรรทัด)
    const target = lines.find((l) => Number(l.ref.price) * l.qty >= discount)
    if (target) {
      target.discount = discount.toFixed(2)
    } else {
      // กระจายส่วนลดไปหลายบรรทัด
      let left = discount
      for (const l of lines) {
        if (left <= 0) break
        const cap = Number(l.ref.price) * l.qty
        const take = Math.min(cap, left)
        if (take > 0) {
          l.discount = take.toFixed(2)
          left -= take
        }
      }
      if (left > 0) return null
    }
  }

  return { lines, discount }
}
