/** ข้อมูลร้าน/สาขา/ตั้งค่า ตามหัวข้อ 10.1 ของสเปก (ข้อมูลจริงของร้าน) */
export const SHOP = { name: 'ร้านมีดีทวีคูณ' }

export const BRANCH = {
  storeId: 'STR0095757',
  branchName: 'สำเพ็ง',
  businessType: 0, // ร้านค้าทั่วไป
  address1: 'ตลาดเก่า สำเพ็ง',
  address2: 'Chinatown , Bangkok',
  tel: '0616629659',
  taxId: '',
  timezone: 'Asia/Bangkok',
  language: 'th',
  currency: 'THB',
  openTime: '00:00',
  closeTime: '23:59',
  plan: 'SMART+',
  expireAt: new Date('2027-08-20T16:59:59Z'),

  // ภาษี / ค่าบริการ / ปัดเศษ — ร้านนี้ไม่คิด VAT และไม่ปัดเศษ
  vatRate: '0',
  isVatIncluded: false,
  enabledServiceCharge: false,
  serviceChargeRate: '0',
  roundingType: 'none',
  roundingAmount: '1',
  isAvgCost: false,

  // พฤติกรรมหน้าขาย
  fastInput: '20,50,100,500,1000',
  isSoldByWeight: false,
  isMultiplePayment: false,
  editableItem: true,
  enabledAutoAddProduct: false,
  enabledCustomPayment: false,
  enabledDelivery: false,
  cashManagement: true,
  isCustomerDisplayEnable: false,
  bahtPerPoint: '100',

  // ช่องทางชำระเงิน
  paymentCredit: false,
  paymentPromptpay: true,
  promptpayId: '0616629659', // ต้นฉบับซ่อนเลขไว้ — ใช้เบอร์ร้านเป็นค่าตั้งต้น เปลี่ยนได้ที่ /setting/payment
  promptpayAccName: 'มีดีทวีคูณ',
  promptpayShowOnReceipt: true,
  paymentCoupon: false,
  paymentDeposit: false,
  paymentQp: false,
  paymentAlipay: false,
  enabledLinepay: false,

  // ใบเสร็จ
  receiptHeader: 'Receipt/Tax Invoice(ABB)',
  headerShowOnReceipt: false,
  footer1: 'สินค้าซื้อแล้วไม่รับเปลี่ยนคืน THANK YOU FOR YOUR SHOPPING',
  footer2: 'หยุดวันอาทิตย์และวันหยุดทั่วไป โทร 0616629659',
  showDetailOnReceipt: true,
  showNoteOnReceipt: true,
  showQueueOnReceipt: false,
  showBarcodeOnReceipt: false,
  showVatOnReceipt: false,
  showOptionGroupOnReceipt: true,
  wordingToReplace: 'FOOD & BEVERAGE',
  receiptFormat: 'abb',
  receiptUseBuddhistYear: true,

  // แจ้งเตือน
  notifyEnabled: false,
  notifySales: false,
  notifyCashRound: false,
  notifyCloseShopReport: false,
  notifyTimeAttendance: false,

  // เลขรันเอกสารต่อสาขา (ค่าปัจจุบันของร้าน ณ 22/09/2026)
  stockInRunNumber: 757,
  stockOutRunNumber: 130,
  adjIncRunNumber: 65,
  adjDecRunNumber: 37,
  checkStockRunNumber: 0,
  transferOutRunNumber: 0,
  transferInRunNumber: 0,
  returnRunNumber: 0,
  taxInvoiceRunNumber: 0,
  runningQueue: 23,
  runningQueueDate: '2026-09-22',
}

/** เครื่อง POS 3 เครื่อง ตามหัวข้อ 10.2 */
export const POS_DEVICES = [
  {
    posNumber: '001', deviceName: 'Medee Ipad mini', deviceType: 'iOS', posType: 'POS',
    deviceInfo: { model: 'iPad mini', systemName: 'iPadOS', systemVersion: '15.8.4' },
    appVersion: '4.18.11 (5091)', lastUsedAt: new Date('2026-01-07T13:44:00Z'),
    invoiceRunNumber: 5694, printReceipt: false, scan: true, itemSize: 'SMALL', receiptType: 1,
    status: 'กำลังถูกใช้งาน',
  },
  {
    posNumber: '002', deviceName: 'iPad', deviceType: 'iOS', posType: 'POS',
    deviceInfo: { model: 'iPad', systemName: 'iPadOS', systemVersion: '17.6' },
    appVersion: '4.21.3 (5234)', lastUsedAt: new Date('2026-09-22T03:22:00Z'),
    // เลขบิลล่าสุดของเครื่องนี้คือ PS002006904 → ตัวนับถัดไป 6905 (seed ตั้งไว้ก่อนออกบิลของวัน)
    invoiceRunNumber: 6880, printReceipt: true, scan: true, itemSize: 'SMALL', receiptType: 1,
    status: 'กำลังถูกใช้งาน',
  },
  {
    posNumber: '003', deviceName: 'iPhone', deviceType: 'iOS', posType: 'POS',
    deviceInfo: { model: 'iPhone', systemName: 'iOS', systemVersion: '17.6' },
    appVersion: '4.21.3 (5234)', lastUsedAt: new Date('2026-09-22T04:48:00Z'),
    invoiceRunNumber: 0, printReceipt: false, scan: true, itemSize: 'SMALL', receiptType: 1,
    status: 'กำลังถูกใช้งาน',
  },
]

/** กลุ่มสินค้า 16 กลุ่ม ตามหัวข้อ 10.4 (ทุกกลุ่ม kitchenPriority = MEDIUM) */
export const CATEGORIES: { name: string; enabled: boolean; bgColor: string; isSystem?: boolean }[] = [
  { name: 'กรรไกร', enabled: true, bgColor: '#4CAF50' },
  { name: 'เทป/กาว', enabled: true, bgColor: '#FF9800' },
  { name: 'ปลั๊ก', enabled: true, bgColor: '#9C27B0' },
  { name: 'มีด', enabled: true, bgColor: '#F44336' },
  { name: 'มีดสิงโตถูก', enabled: true, bgColor: '#E91E63' },
  { name: 'ทำความสะอาด', enabled: true, bgColor: '#00BCD4' },
  { name: 'ตะขอ', enabled: true, bgColor: '#795548' },
  { name: 'กุญแจ', enabled: true, bgColor: '#607D8B' },
  { name: 'เบ็ดเตล็ด', enabled: true, bgColor: '#8BC34A' },
  { name: "Wynn's เครื่องมือ", enabled: true, bgColor: '#3F51B5' },
  { name: "Wynn's คัตเตอร์", enabled: true, bgColor: '#2196F3' },
  { name: "Wynn's ไขควง", enabled: true, bgColor: '#009688' },
  { name: "Wynn's กรรไกรตัด", enabled: true, bgColor: '#CDDC39' },
  { name: "Wynn's ตัดกิ่ง", enabled: true, bgColor: '#FFC107' },
  { name: 'xx', enabled: true, bgColor: '#9E9E9E' },
  { name: 'Uncategory', enabled: false, bgColor: '#BDBDBD', isSystem: true },
]

/** หน่วยบรรจุ 7 หน่วย ตามหัวข้อ 10.5 */
export const UNITS = ['item', 'กระสอบ', 'กล่อง', 'ชิ้น', 'ลัง', 'แพ็ค', 'ใบ']

/** ตัวเลือกเสริม 3 รายการ ตามหัวข้อ 10.6 */
export const OPTIONS = [
  { name: 'แผง', price: '10.00', cost: '0' },
  { name: 'มีแผง ใส่ตามจำนวนของ', price: '10.00', cost: '0' },
  { name: 'vvip', price: '70.00', cost: '0' },
]

/** ช่องทางการขาย/GP ตามหัวข้อ 10.7 (ทั้งหมดปิดอยู่) */
export const SALES_CHANNEL_CONFIGS = [
  { channel: 'grab', label: 'Grab', enabled: false, gpPercent: '30' },
  { channel: 'lineman', label: 'Lineman', enabled: false, gpPercent: '30' },
  { channel: 'foodpanda', label: 'Foodpanda', enabled: false, gpPercent: '32' },
  { channel: 'shopeefood', label: 'Shopee food', enabled: false, gpPercent: '30' },
  { channel: 'robinhood', label: 'Robinhood', enabled: false, gpPercent: '0' },
  { channel: 'truefood', label: 'True Food', enabled: false, gpPercent: '0' },
]
