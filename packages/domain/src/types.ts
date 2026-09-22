import type { MoneyInput } from './money.js'

/** ประเภทภาษีระดับสินค้า: V = สินค้ามีภาษี, N = สินค้าไม่มีภาษี */
export type VatType = 'V' | 'N'

/** ประเภทสินค้า: ทั่วไป / ประกอบ / มี Serial / บริการ (ไม่มีสต๊อก) */
export type SkuType = 'P' | 'BOM' | 'SN' | 'SV'

export type DiscountType = 'amount' | 'percent'

/** วิธีปัดเศษท้ายบิล (ตั้งค่าที่สาขา) */
export type RoundingType = 'none' | 'up' | 'down' | 'nearest'

/** ช่องทางราคา — retail คือราคาขายปกติหน้าร้าน */
export type PriceChannel =
  | 'retail'
  | 'promotion'
  | 'member_wholesale'
  | 'grab'
  | 'lineman'
  | 'foodpanda'
  | 'shopeefood'
  | 'robinhood'
  | 'truefood'

export const PRICE_CHANNELS: PriceChannel[] = [
  'retail',
  'promotion',
  'member_wholesale',
  'grab',
  'lineman',
  'foodpanda',
  'shopeefood',
  'robinhood',
  'truefood',
]

/** ชื่อช่องทางที่แสดงบนหน้าจอ (หัวข้อ 6.9.2) */
export const PRICE_CHANNEL_LABELS: Record<PriceChannel, string> = {
  retail: 'ราคาขายปกติหน้าร้าน',
  promotion: 'ราคาขายโปรโมชั่น',
  member_wholesale: 'ราคาขายส่งสมาชิก',
  grab: 'Grab',
  lineman: 'Lineman',
  foodpanda: 'Foodpanda',
  shopeefood: 'Shopee food',
  robinhood: 'Robinhood',
  truefood: 'True Food',
}

/** ตัวเลือกเสริมที่ติดมากับรายการในตะกร้า */
export interface BillItemOption {
  optionId?: string
  name: string
  price: MoneyInput
  qty?: MoneyInput // จำนวนตัวเลือกต่อ 1 หน่วยสินค้า (default 1)
  cost?: MoneyInput
  groupName?: string
}

/** หนึ่งรายการในตะกร้า/บิล */
export interface BillItemInput {
  /** อ้างอิงกลับไปยังรายการต้นทาง (ใช้จับคู่ผลลัพธ์) */
  key?: string
  productId?: string
  pluId?: string
  barcode?: string
  name?: string
  unitName?: string
  /** 1 หน่วยของ PLU นี้ = กี่หน่วยฐาน (SKU) — ใช้ตัดสต็อกและคิดต้นทุน */
  ratio?: MoneyInput
  qty: MoneyInput
  unitPrice: MoneyInput
  /** ต้นทุนต่อ "หน่วยฐาน" (std_cost หรือ avg_cost ตามตั้งค่าสาขา) */
  cost?: MoneyInput
  itemDiscount?: MoneyInput
  itemDiscountType?: DiscountType
  vatType?: VatType
  /** สินค้านี้คิดค่าบริการหรือไม่ */
  serviceCharge?: boolean
  options?: BillItemOption[]
  note?: string
  serialNo?: string
}

/** ตั้งค่าระดับสาขาที่มีผลต่อการคำนวณบิล (หัวข้อ 4.1) */
export interface BillConfig {
  /** อัตรา VAT ของร้าน (ร้านมีดีทวีคูณ = 0) */
  vatRate?: MoneyInput
  /** true = ราคาสินค้ารวม VAT แล้ว */
  isVatIncluded?: boolean
  enabledServiceCharge?: boolean
  serviceChargeRate?: MoneyInput
  /** ค่าบริการถูกคิด VAT ด้วยหรือไม่ (default: true เมื่อร้านคิด VAT) */
  serviceChargeVatable?: boolean
  roundingType?: RoundingType
  /** หน่วยการปัดเศษ เช่น 0.25 / 0.5 / 1 */
  roundingAmount?: MoneyInput
}

export interface BillDiscountInput {
  type: DiscountType
  value: MoneyInput
}

export interface CalculateBillInput {
  items: BillItemInput[]
  config?: BillConfig
  billDiscount?: BillDiscountInput | null
  /** ส่วนลดจากโปรโมชัน (คำนวณมาแล้วจากภายนอก) */
  promotionDiscount?: MoneyInput
  /** บังคับค่าบริการเป็นจำนวนเงินคงที่ (แทนการคิด %) */
  serviceChargeOverride?: MoneyInput | null
  deliveryFee?: MoneyInput
}

/** ผลคำนวณรายบรรทัด — ตรงกับคอลัมน์รายงาน "ยอดขายตามรายละเอียดบิล" */
export interface BillItemResult {
  key: string
  index: number
  qty: string
  ratio: string
  unitPrice: string
  /** "รวมก่อนลด" ของรายการ = unit_price × qty */
  lineSubtotal: string
  /** "มูลค่าตัวเลือก" = Σ(ราคาตัวเลือก × จำนวน) × qty */
  optionTotal: string
  /** "ส่วนลดรายการ" */
  itemDiscount: string
  /** "ยอดสุทธิ" ของรายการ ก่อนกระจายส่วนลดท้ายบิล */
  lineNet: string
  /** ส่วนลดท้ายบิล+โปรโมชัน ที่ถูกกระจายลงรายการนี้ */
  allocatedBillDiscount: string
  /** ยอดสุทธิหลังกระจายส่วนลดท้ายบิล — ฐานของ VAT และรายงานต่อสินค้า */
  netAfterBillDiscount: string
  /** ต้นทุนรวมของรายการ = cost × qty × ratio */
  cost: string
  vatType: VatType
  /** จำนวนหน่วยฐานที่ต้องตัดสต็อก = qty × ratio */
  baseQty: string
}

/** ผลคำนวณทั้งบิล — ชื่อฟิลด์ตรงกับคอลัมน์รายงานประวัติการขาย (หัวข้อ 6.3) */
export interface BillTotals {
  items: BillItemResult[]
  /** "รวมก่อนลด" */
  subtotal: string
  /** "มูลค่าตัวเลือก" รวมทั้งบิล */
  optionTotal: string
  /** ส่วนลดในรายการรวม */
  itemDiscountTotal: string
  /** "ส่วนลดท้ายบิล" */
  billDiscount: string
  /** "ส่วนลดโปรโมชัน" */
  promotionDiscount: string
  /** คอลัมน์ "ส่วนลด" = รายการ + ท้ายบิล + โปรโมชัน */
  discountTotal: string
  afterDiscount: string
  /** "ค่าบริการ" */
  serviceCharge: string
  /** "สินค้ามีภาษี" */
  vatableAmount: string
  /** "สินค้าไม่มีภาษี" */
  nonVatableAmount: string
  /** "มูลค่าก่อน VAT" */
  amountBeforeVat: string
  /** "คิดเป็นมูลค่าภาษี" */
  vatAmount: string
  /** "ปัดเศษ" */
  rounding: string
  /** "ค่าจัดส่ง" */
  deliveryFee: string
  /** "ยอดขาย" (ยอดสุทธิที่ลูกค้าต้องจ่าย) */
  grandTotal: string
  /** ต้นทุนรวม */
  costTotal: string
  /** "กำไร" = ยอดขาย − ภาษี − ต้นทุน */
  profit: string
  /** จำนวนชิ้นรวม (แสดงบนใบเสร็จ "จำนวน N ชิ้น") */
  totalQty: string
}
