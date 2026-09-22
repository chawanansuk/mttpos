import { describe, expect, it } from 'vitest'
import { calculateBill } from '../bill.js'
import { Decimal } from '../money.js'
import { averagePerBill } from '../points.js'
import {
  DAY_BILLS_ALL,
  DAY_BILLS_SNAPSHOT,
  FIXTURE_PRODUCT_BY_KEY,
  fixtureLineToItem,
  type FixtureBill,
} from '../fixtures/index.js'

const VAT_FREE_SHOP = { vatRate: 0, roundingType: 'none' as const }

function totalsFor(bill: FixtureBill) {
  return calculateBill({ items: bill.lines.map(fixtureLineToItem), config: VAT_FREE_SHOP })
}

function aggregate(bills: FixtureBill[]) {
  let subtotal = new Decimal(0)
  let discount = new Decimal(0)
  let sales = new Decimal(0)
  let profit = new Decimal(0)
  let cost = new Decimal(0)
  let qty = new Decimal(0)
  let billCount = 0
  let voidCount = 0
  let voidValue = new Decimal(0)

  for (const bill of bills) {
    const t = totalsFor(bill)
    if (bill.status === 'ยกเลิก') {
      // บิลยกเลิกไม่นับในยอดขาย/กำไร แต่แสดงใน "ยกเลิก N บิล / มูลค่าการยกเลิก" (หัวข้อ 7.1)
      voidCount += 1
      voidValue = voidValue.plus(t.grandTotal)
      continue
    }
    billCount += 1
    subtotal = subtotal.plus(t.subtotal)
    discount = discount.plus(t.discountTotal)
    sales = sales.plus(t.grandTotal)
    profit = profit.plus(t.profit)
    cost = cost.plus(t.costTotal)
    qty = qty.plus(t.totalQty)
  }
  return { subtotal, discount, sales, profit, cost, qty, billCount, voidCount, voidValue }
}

describe('Fixture วันขาย 22/09/2026 (หัวข้อ 10.10 / ข้อยอมรับ 12.13)', () => {
  const snap = aggregate(DAY_BILLS_SNAPSHOT)

  it('ยอดขาย 4,755.00', () => {
    expect(snap.sales.toFixed(2)).toBe('4755.00')
  })

  it('กำไร 1,625.02', () => {
    expect(snap.profit.toFixed(2)).toBe('1625.02')
  })

  it('ส่วนลด 305.00', () => {
    expect(snap.discount.toFixed(2)).toBe('305.00')
  })

  it('รวมก่อนลด 5,060.00', () => {
    expect(snap.subtotal.toFixed(2)).toBe('5060.00')
  })

  it('20 บิล และเฉลี่ย/บิล 237.75', () => {
    expect(snap.billCount).toBe(20)
    expect(averagePerBill(snap.sales, snap.billCount)).toBe('237.75')
  })

  it('ยกเลิก 1 บิล มูลค่า 195.00', () => {
    expect(snap.voidCount).toBe(1)
    expect(snap.voidValue.toFixed(2)).toBe('195.00')
  })

  it('ต้นทุนรวม 3,129.98 (ยอดขาย − กำไร)', () => {
    expect(snap.cost.toFixed(2)).toBe('3129.98')
  })

  it('จำนวนชิ้นรวม 117 ชิ้น (ตรงกับรายงานการขายแยกตามกลุ่มสินค้า)', () => {
    expect(snap.qty.toNumber()).toBe(117)
  })

  it('ทั้งวัน (24 บิล) ยอดขาย 5,155.00 / รวมก่อนลด 5,460.00 (หัวข้อ 6.6)', () => {
    const all = aggregate(DAY_BILLS_ALL)
    expect(all.sales.toFixed(2)).toBe('5155.00')
    expect(all.subtotal.toFixed(2)).toBe('5460.00')
    expect(all.billCount).toBe(23)
  })
})

describe('ยอดรายบิลตรงกับประวัติการขายจริง (หัวข้อ 6.3)', () => {
  const expected: Record<string, string> = {
    PS002006881: '240.00', PS002006882: '280.00', PS002006883: '120.00', PS002006884: '180.00',
    PS002006885: '195.00', PS002006886: '195.00', PS002006887: '130.00', PS002006888: '130.00',
    PS002006889: '680.00', PS002006890: '220.00', PS002006891: '20.00', PS002006892: '500.00',
    PS002006893: '60.00', PS002006894: '130.00', PS002006895: '160.00', PS002006896: '400.00',
    PS002006897: '150.00', PS002006898: '70.00', PS002006899: '20.00', PS002006900: '950.00',
    PS002006901: '120.00', PS002006902: '80.00', PS002006903: '280.00', PS002006904: '40.00',
  }

  for (const bill of DAY_BILLS_ALL) {
    it(`${bill.receiptNo} = ${expected[bill.receiptNo]}`, () => {
      expect(totalsFor(bill).grandTotal).toBe(expected[bill.receiptNo])
    })
  }
})

describe('รายงานการขายแยกตามกลุ่มสินค้า 22/09/2026 (หัวข้อ 6.2)', () => {
  it('ยอดขายและจำนวนต่อกลุ่มตรงกับหน้ารายงานสรุป', () => {
    const byCategory = new Map<string, { sales: Decimal; qty: number }>()
    for (const bill of DAY_BILLS_SNAPSHOT) {
      if (bill.status === 'ยกเลิก') continue
      const t = totalsFor(bill)
      bill.lines.forEach((line, i) => {
        const product = FIXTURE_PRODUCT_BY_KEY.get(line.product)!
        const row = byCategory.get(product.category) ?? { sales: new Decimal(0), qty: 0 }
        row.sales = row.sales.plus(t.items[i]!.netAfterBillDiscount)
        row.qty += line.qty
        byCategory.set(product.category, row)
      })
    }

    const actual = Object.fromEntries(
      [...byCategory].map(([k, v]) => [k, { sales: v.sales.toFixed(2), qty: v.qty }]),
    )
    expect(actual).toEqual({
      'เบ็ดเตล็ด': { sales: '1925.00', qty: 66 },
      'มีด': { sales: '2110.00', qty: 40 },
      'Uncategory': { sales: '50.00', qty: 3 },
      "Wynn's ตัดกิ่ง": { sales: '390.00', qty: 3 },
      'ตะขอ': { sales: '40.00', qty: 2 },
      "Wynn's เครื่องมือ": { sales: '120.00', qty: 2 },
      'กรรไกร': { sales: '120.00', qty: 1 },
    })
  })
})

describe('สินค้าขายดี 22/09/2026 (หัวข้อ 6.2)', () => {
  it('จำนวนและยอดขายของสินค้า top 10 ตรงกับรายงานสรุป', () => {
    const byProduct = new Map<string, { sales: Decimal; qty: number }>()
    for (const bill of DAY_BILLS_SNAPSHOT) {
      if (bill.status === 'ยกเลิก') continue
      const t = totalsFor(bill)
      bill.lines.forEach((line, i) => {
        const row = byProduct.get(line.product) ?? { sales: new Decimal(0), qty: 0 }
        row.sales = row.sales.plus(t.items[i]!.netAfterBillDiscount)
        row.qty += line.qty
        byProduct.set(line.product, row)
      })
    }
    const check = (key: string, qty: number, sales: string) => {
      const row = byProduct.get(key)
      expect(row, `ไม่พบสินค้า ${key}`).toBeTruthy()
      expect([row!.qty, row!.sales.toFixed(2)], key).toEqual([qty, sales])
    }
    check('judgas', 12, '180.00')      // จุดแก๊สหวานmtt gas 12 / 180.00
    check('KIWI512', 8, '180.00')      // KIWI512 มีด512 8 / 180.00
    check('KIWI502', 6, '160.00')      // KIWI502 มีด502 6 / 160.00
    check('KIWI001', 5, '100.00')      // KIWI001 มีดคว้าน001 5 / 100.00
    check('KIWI511', 4, '120.00')      // KIWI511 มีด511 4 / 120.00
    check('AntChalk', 4, '20.00')      // ชอล์กไล่แมลงสาปมด 4 / 20.00
    check('KIWI21', 3, '360.00')       // KIWI21 มีด21ไม้ 3 / 360.00
    check('brushwood', 3, '195.00')    // แปรงทองเหรียญ(ไม้) 3 / 195.00
    check('w860', 3, '390.00')         // w860 ตัดกิ่ง 3 / 390.00
    check('KIWI195', 3, '150.00')      // KIWI195 มีด195 3 / 150.00
  })
})
