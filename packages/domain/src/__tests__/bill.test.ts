import { describe, expect, it } from 'vitest'
import {
  allocateProportionally,
  calculateBill,
  calculateChange,
  optionUnitValue,
  outstandingAmount,
  resolveDiscount,
} from '../bill.js'
import { Decimal } from '../money.js'
import type { BillItemInput } from '../types.js'

describe('7.1 โครงสร้างยอดในบิล', () => {
  it('คำนวณรายการเดียวแบบไม่มีส่วนลด/VAT', () => {
    const r = calculateBill({ items: [{ qty: 6, unitPrice: '30.00', cost: '20.00' }] })
    expect(r.subtotal).toBe('180.00')
    expect(r.discountTotal).toBe('0.00')
    expect(r.grandTotal).toBe('180.00')
    expect(r.costTotal).toBe('120.00')
    expect(r.profit).toBe('60.00')
    expect(r.totalQty).toBe('6')
  })

  it('ตรงกับบิลจริง PS002006889 (หัวข้อ 6.3)', () => {
    const items: BillItemInput[] = [
      { barcode: '8851130050388', name: 'KIWI512 มีด512', qty: 6, unitPrice: '30.00', itemDiscount: '60.00' },
      { barcode: '8851130050340', name: 'KIWI502 มีด502', qty: 6, unitPrice: '40.00', itemDiscount: '80.00' },
      { barcode: '8851130050012', name: 'KIWI001 มีดคว้าน001', qty: 5, unitPrice: '30.00', itemDiscount: '50.00' },
      { barcode: '8851130050586', name: 'KIWI850P มีด850p', qty: 2, unitPrice: '200.00', itemDiscount: '100.00' },
    ]
    const r = calculateBill({ items })
    expect(r.subtotal).toBe('970.00')
    expect(r.itemDiscountTotal).toBe('290.00')
    expect(r.billDiscount).toBe('0.00')
    expect(r.discountTotal).toBe('290.00')
    expect(r.grandTotal).toBe('680.00')
    expect(r.totalQty).toBe('19') // ใบเสร็จแสดง "จำนวน 19 ชิ้น"

    // ยอดสุทธิรายบรรทัดตรงกับตาราง expand ในหน้าประวัติการขาย
    expect(r.items.map((i) => i.lineNet)).toEqual(['120.00', '160.00', '100.00', '300.00'])
    expect(r.items.map((i) => i.lineSubtotal)).toEqual(['180.00', '240.00', '150.00', '400.00'])
    // ทุกรายการเป็นสินค้าไม่มีภาษี
    expect(r.nonVatableAmount).toBe('680.00')
    expect(r.vatAmount).toBe('0.00')
  })

  it('ส่วนลดท้ายบิลแบบ % คิดจากยอดหลังหักส่วนลดรายการ', () => {
    const r = calculateBill({
      items: [
        { qty: 1, unitPrice: '100.00', itemDiscount: '20.00' },
        { qty: 1, unitPrice: '100.00' },
      ],
      billDiscount: { type: 'percent', value: 10 },
    })
    expect(r.subtotal).toBe('200.00')
    expect(r.itemDiscountTotal).toBe('20.00')
    expect(r.billDiscount).toBe('18.00') // 10% ของ 180
    expect(r.discountTotal).toBe('38.00')
    expect(r.grandTotal).toBe('162.00')
  })

  it('กระจายส่วนลดท้ายบิลลงรายการตามสัดส่วน และไม่ทำให้ผลรวมเพี้ยน', () => {
    const r = calculateBill({
      items: [
        { qty: 1, unitPrice: '33.33' },
        { qty: 1, unitPrice: '33.33' },
        { qty: 1, unitPrice: '33.34' },
      ],
      billDiscount: { type: 'amount', value: '10.00' },
    })
    const allocated = r.items.map((i) => new Decimal(i.allocatedBillDiscount))
    const total = allocated.reduce((a, b) => a.plus(b), new Decimal(0))
    expect(total.toFixed(2)).toBe('10.00')
    const netSum = r.items.reduce(
      (a, i) => a.plus(new Decimal(i.netAfterBillDiscount)),
      new Decimal(0),
    )
    expect(netSum.toFixed(2)).toBe(r.afterDiscount)
    expect(r.grandTotal).toBe('90.00')
  })

  it('มูลค่าตัวเลือกบวกเข้ายอดและคูณตามจำนวนสินค้า', () => {
    const r = calculateBill({
      items: [
        {
          qty: 2,
          unitPrice: '100.00',
          options: [
            { name: 'แผง', price: '10.00' },
            { name: 'vvip', price: '70.00' },
          ],
        },
      ],
    })
    expect(r.subtotal).toBe('360.00') // (100 + 80) × 2
    expect(r.optionTotal).toBe('160.00')
    expect(r.grandTotal).toBe('360.00')
  })

  it('ส่วนลดรายการแบบ % คิดจาก line_subtotal ไม่รวมมูลค่าตัวเลือก', () => {
    const r = calculateBill({
      items: [
        {
          qty: 1,
          unitPrice: '100.00',
          options: [{ name: 'แผง', price: '50.00' }],
          itemDiscount: 10,
          itemDiscountType: 'percent',
        },
      ],
    })
    expect(r.itemDiscountTotal).toBe('10.00') // 10% ของ 100 ไม่ใช่ของ 150
    expect(r.grandTotal).toBe('140.00')
  })

  it('ส่วนลดต้องไม่ทำให้ยอดสุทธิติดลบ (หัวข้อ 7.2)', () => {
    const r = calculateBill({ items: [{ qty: 1, unitPrice: '50.00', itemDiscount: '999.00' }] })
    expect(r.itemDiscountTotal).toBe('50.00')
    expect(r.grandTotal).toBe('0.00')
    expect(r.items[0]!.lineNet).toBe('0.00')
  })

  it('ขาย PLU ที่ ratio 10 → ตัดสต็อก 10 เท่า และต้นทุนคูณ ratio (หัวข้อ 7.5)', () => {
    const r = calculateBill({
      items: [{ qty: 2, ratio: 10, unitPrice: '250.00', cost: '20.00' }],
    })
    expect(r.items[0]!.baseQty).toBe('20')
    expect(r.costTotal).toBe('400.00') // 20 × 2 × 10
    expect(r.grandTotal).toBe('500.00')
    expect(r.profit).toBe('100.00')
  })

  it('บิลยอด 0 บาท (แจกฟรี) คำนวณได้', () => {
    const r = calculateBill({ items: [{ qty: 1, unitPrice: '0.00' }] })
    expect(r.grandTotal).toBe('0.00')
  })

  it('บิลว่างให้ผลลัพธ์ 0 ทุกช่อง', () => {
    const r = calculateBill({ items: [] })
    expect(r.subtotal).toBe('0.00')
    expect(r.grandTotal).toBe('0.00')
    expect(r.profit).toBe('0.00')
  })
})

describe('7.3 VAT', () => {
  const vatItems: BillItemInput[] = [
    { qty: 1, unitPrice: '107.00', vatType: 'V' },
    { qty: 1, unitPrice: '50.00', vatType: 'N' },
  ]

  it('VAT รวมในราคา (is_vat_included = true)', () => {
    const r = calculateBill({ items: vatItems, config: { vatRate: 7, isVatIncluded: true } })
    expect(r.vatableAmount).toBe('107.00')
    expect(r.nonVatableAmount).toBe('50.00')
    expect(r.vatAmount).toBe('7.00') // 107 × 7/107
    expect(r.amountBeforeVat).toBe('100.00')
    expect(r.grandTotal).toBe('157.00') // ยอดไม่เพิ่ม เพราะ VAT รวมอยู่แล้ว
  })

  it('VAT แยกนอกราคา', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '100.00', vatType: 'V' }],
      config: { vatRate: 7, isVatIncluded: false },
    })
    expect(r.vatAmount).toBe('7.00')
    expect(r.amountBeforeVat).toBe('100.00')
    expect(r.grandTotal).toBe('107.00')
  })

  it('ร้าน VAT = 0 → ทุกยอดภาษีเป็นศูนย์ และสินค้าไม่มีภาษี = ยอดขาย', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '240.00', vatType: 'N' }],
      config: { vatRate: 0 },
    })
    expect(r.vatAmount).toBe('0.00')
    expect(r.nonVatableAmount).toBe('240.00')
    expect(r.vatableAmount).toBe('0.00')
    expect(r.grandTotal).toBe('240.00')
  })

  it('ฐาน VAT คิดจากยอดหลังกระจายส่วนลดท้ายบิล', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '200.00', vatType: 'V' }],
      config: { vatRate: 7, isVatIncluded: false },
      billDiscount: { type: 'amount', value: '100.00' },
    })
    expect(r.vatableAmount).toBe('100.00')
    expect(r.vatAmount).toBe('7.00')
    expect(r.grandTotal).toBe('107.00')
  })

  it('กำไรหักภาษีออกจากยอดขาย', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '100.00', vatType: 'V', cost: '40.00' }],
      config: { vatRate: 7, isVatIncluded: false },
    })
    expect(r.grandTotal).toBe('107.00')
    expect(r.profit).toBe('60.00') // 107 − 7 − 40
  })
})

describe('ค่าบริการ', () => {
  it('คิดค่าบริการเฉพาะสินค้าที่ติ๊ก serviceCharge', () => {
    const r = calculateBill({
      items: [
        { qty: 1, unitPrice: '100.00', serviceCharge: true },
        { qty: 1, unitPrice: '100.00', serviceCharge: false },
      ],
      config: { enabledServiceCharge: true, serviceChargeRate: 10 },
    })
    expect(r.serviceCharge).toBe('10.00')
    expect(r.grandTotal).toBe('210.00')
  })

  it('ค่าบริการถูกคิด VAT ด้วยเมื่อ serviceChargeVatable = true', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '100.00', vatType: 'V', serviceCharge: true }],
      config: {
        vatRate: 7,
        isVatIncluded: false,
        enabledServiceCharge: true,
        serviceChargeRate: 10,
        serviceChargeVatable: true,
      },
    })
    expect(r.serviceCharge).toBe('10.00')
    expect(r.vatAmount).toBe('7.70') // (100 + 10) × 7%
    expect(r.grandTotal).toBe('117.70')
  })

  it('ระบุค่าบริการเป็นจำนวนเงินคงที่ต่อบิลได้', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '100.00' }],
      serviceChargeOverride: '25.50',
    })
    expect(r.serviceCharge).toBe('25.50')
    expect(r.grandTotal).toBe('125.50')
  })
})

describe('ปัดเศษท้ายบิล', () => {
  const items: BillItemInput[] = [{ qty: 1, unitPrice: '101.40' }]

  it('none → ไม่ปัด', () => {
    const r = calculateBill({ items, config: { roundingType: 'none' } })
    expect(r.rounding).toBe('0.00')
    expect(r.grandTotal).toBe('101.40')
  })

  it('up หน่วย 1 บาท', () => {
    const r = calculateBill({ items, config: { roundingType: 'up', roundingAmount: 1 } })
    expect(r.rounding).toBe('0.60')
    expect(r.grandTotal).toBe('102.00')
  })

  it('down หน่วย 1 บาท', () => {
    const r = calculateBill({ items, config: { roundingType: 'down', roundingAmount: 1 } })
    expect(r.rounding).toBe('-0.40')
    expect(r.grandTotal).toBe('101.00')
  })

  it('nearest หน่วย 0.25', () => {
    const r = calculateBill({ items, config: { roundingType: 'nearest', roundingAmount: '0.25' } })
    expect(r.grandTotal).toBe('101.50')
    expect(r.rounding).toBe('0.10')
  })

  it('nearest หน่วย 0.5', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '10.20' }],
      config: { roundingType: 'nearest', roundingAmount: '0.5' },
    })
    expect(r.grandTotal).toBe('10.00')
  })
})

describe('ค่าจัดส่ง และการชำระเงิน', () => {
  it('ค่าจัดส่งบวกท้ายสุด ไม่ถูกปัดเศษ', () => {
    const r = calculateBill({
      items: [{ qty: 1, unitPrice: '100.00' }],
      deliveryFee: '35.00',
    })
    expect(r.deliveryFee).toBe('35.00')
    expect(r.grandTotal).toBe('135.00')
  })

  it('เงินทอน', () => {
    expect(calculateChange('1000', '680')).toBe('320.00')
    expect(calculateChange('680', '680')).toBe('0.00')
    expect(calculateChange('500', '680')).toBe('0.00') // รับไม่พอ → ไม่ติดลบ
  })

  it('ยอดค้างชำระเมื่อชำระหลายช่องทาง', () => {
    expect(outstandingAmount('1000', [{ amount: '400' }, { amount: '300' }])).toBe('300.00')
    expect(outstandingAmount('1000', [{ amount: '1000' }])).toBe('0.00')
  })
})

describe('ฟังก์ชันย่อย', () => {
  it('optionUnitValue คูณจำนวนตัวเลือก', () => {
    expect(optionUnitValue([{ name: 'a', price: '10', qty: 3 }]).toFixed(2)).toBe('30.00')
    expect(optionUnitValue(undefined).toFixed(2)).toBe('0.00')
  })

  it('resolveDiscount ปัดทศนิยม 2 และไม่เกินเพดาน', () => {
    expect(resolveDiscount(new Decimal(33.33), 33.333, 'percent').toFixed(2)).toBe('11.11')
    expect(resolveDiscount(new Decimal(100), 250, 'amount').toFixed(2)).toBe('100.00')
    expect(resolveDiscount(new Decimal(100), -5, 'amount').toFixed(2)).toBe('0.00')
  })

  it('allocateProportionally ยกเศษไปแถวสุดท้ายที่มียอด', () => {
    const out = allocateProportionally(
      [new Decimal(1), new Decimal(1), new Decimal(1)],
      new Decimal(10),
    )
    expect(out.map((d) => d.toFixed(2))).toEqual(['3.33', '3.33', '3.34'])
  })

  it('allocateProportionally ข้ามแถวที่ยอดเป็น 0', () => {
    const out = allocateProportionally(
      [new Decimal(0), new Decimal(50), new Decimal(50)],
      new Decimal(20),
    )
    expect(out.map((d) => d.toFixed(2))).toEqual(['0.00', '10.00', '10.00'])
  })
})
