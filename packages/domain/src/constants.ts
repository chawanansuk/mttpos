/** ค่าคงที่ที่ใช้ร่วมกันทั้ง POS และหลังบ้าน (ชื่อภาษาไทยตามสเปก) */

export const APP_NAME = 'Medee POS'
export const APP_NAME_TH = 'มีดี พีโอเอส'

/** ประเภทธุรกิจ (branches.business_type) */
export const BUSINESS_TYPES = ['ร้านค้าทั่วไป', 'ร้านอาหาร', 'โฮสเทล'] as const
export type BusinessTypeIndex = 0 | 1 | 2

/** ประเภทออเดอร์ (receipts.order_type) */
export const ORDER_TYPES = ['ทานที่ร้าน', 'กลับบ้าน', 'เดลิเวอรี่'] as const
export type OrderType = (typeof ORDER_TYPES)[number]

/** ช่องทางการขาย (receipts.sales_channel) */
export const SALES_CHANNELS = [
  'ขายหน้าร้าน',
  'Grab',
  'Lineman',
  'Foodpanda',
  'Shopee food',
  'Robinhood',
  'True Food',
] as const

/** วิธีชำระเงิน — ลำดับตามคอลัมน์รายงาน "การชำระเงิน" (หัวข้อ 6.6) */
export const PAYMENT_METHODS = [
  'เงินสด',
  'โอน(พร้อมเพย์)',
  'บัตรเครดิต',
  'KBank',
  'EDC',
  'Quick Pay',
  'คูปอง',
  'Online',
  'Alipay',
  'Delivery',
  'มัดจำ',
  'Line Pay',
  'กำหนดเอง',
  'อื่นๆ',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** สถานะบิล */
export const RECEIPT_STATUSES = ['ปกติ', 'ยกเลิก', 'เปิดอยู่'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

/** ประเภทการจ่ายสินค้าออก (หัวข้อ 6.10.3) */
export const ISSUE_TYPES = [
  'ไม่ระบุประเภท',
  'หมดอายุ',
  'สินค้าสำหรับชิม',
  'สินค้าชำรุด (ในร้าน)',
  'สินค้าชำรุด (ระหว่างขนส่ง)',
  'โอนย้ายสต็อก',
  'สินค้าสูญหาย',
  'สินค้าทดลอง',
] as const
export type IssueType = (typeof ISSUE_TYPES)[number]

/** ความเร่งด่วนในการทำอาหาร (categories.kitchen_priority) */
export const KITCHEN_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const
export const KITCHEN_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'ตํ่า ( LOW )',
  MEDIUM: 'ปานกลาง ( MEDIUM )',
  HIGH: 'สูง ( HIGH )',
}

/** ประเภทสินค้าในฟอร์ม (หัวข้อ 6.9.2) */
export const SKU_TYPE_LABELS: Record<string, string> = {
  P: 'สินค้าทั่วไป',
  BOM: 'สินค้าประกอบ (BOM)',
  SN: 'สินค้ามี Serial',
  SV: 'สินค้าบริการ (สินค้าไม่มีสต๊อก)',
}

/** สถานะโน้ตลูกค้า (หัวข้อ 6.12) */
export const MEMBER_NOTE_STATUSES = [
  'ไม่มีสถานะ',
  'รอดำเนินการ',
  'กำลังดำเนินการ',
  'ปิดเคส',
] as const
export const MEMBER_NOTE_TAGS = [
  'ทั่วไป',
  'VIP',
  'สำคัญ',
  'ข้อร้องเรียน',
  'ข้อเสนอแนะ',
  'รอข้อมูลลูกค้า',
] as const

/** เพศของสมาชิก */
export const GENDERS = ['ชาย', 'หญิง', 'ไม่ระบุ'] as const

/** สถานะเอกสารคลัง */
export const STOCK_DOC_STATUSES = ['ใช้งาน', 'ยกเลิก', 'รออนุมัติ', 'สำเร็จ'] as const

/** สีหลักของระบบ (หัวข้อ 6.0) */
export const THEME = {
  primary: '#2EB88A', // เขียวหลัก — ปุ่ม/active
  warning: '#F5A623', // เหลือง — สร้างเอกสาร
  info: '#3B8BEB', // ฟ้า — ส่งออกไฟล์
  danger: '#F44336', // แดง — ลบ/ยกเลิก/บิลยกเลิก
  background: '#F3F4F7',
} as const

/** จำนวนแถวต่อหน้าเริ่มต้นของตารางหลังบ้าน */
export const DEFAULT_PAGE_SIZE = 50
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50]

/** ผู้ให้บริการเดลิเวอรี่ตั้งต้น 19 ราย (หัวข้อ 6.13) */
export const DEFAULT_DELIVERY_PROVIDERS = [
  'GrabFood', 'LINE MAN', 'foodpanda', 'GET', 'NOW', 'LALAMOVE', 'SKOOTAR', 'honesbee',
  'Thailand Post', 'Kerry', 'DHL', '7-11 Delivery', 'Ninja Van', 'J&T', 'Flash Express',
  'Flash Delivery', 'ShopeeFood', 'Robinhood', 'true food',
]

/** ภาษาที่รองรับในหน้าจัดการแปลภาษา (หัวข้อ 6.9.8) */
export const TRANSLATION_LANGUAGES = [
  { code: 'th', label: 'ไทย' },
  { code: 'en', label: 'English' },
  { code: 'lo', label: 'ລາວ' },
  { code: 'my', label: 'မြန်မာ' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: '日本語' },
  { code: 'km', label: 'ភាសាខ្មែរ' },
  { code: 'ko', label: '한국어' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ar', label: 'العربية' },
]
