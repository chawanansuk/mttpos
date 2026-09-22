/** แผนผังเมนูหลังบ้านตามหัวข้อ 6.1 ของสเปก */
export interface MenuItem {
  path: string
  label: string
  badge?: 'new' | 'beta'
}
export interface MenuGroup {
  label: string
  icon: string
  items: MenuItem[]
  /** กลุ่มย่อยภายใน (dropdown ซ้อน) */
  sections?: { label: string; items: MenuItem[] }[]
}

/** เมนูระดับบน (ไม่มีหัวข้อกลุ่ม) */
export const TOP_MENU: MenuItem[] = [
  { path: '/admin/dashboard', label: 'รายงานสรุป' },
  { path: '/admin/report/transaction', label: 'ประวัติการขาย' },
  { path: '/admin/report/currentbill', label: 'บิลที่เปิดอยู่' },
  { path: '/admin/grabdashboard', label: 'รายงาน Grab', badge: 'new' },
  { path: '/admin/promotiondashboard', label: 'รายงานโปรโมชัน', badge: 'new' },
]

export const MENU_GROUPS: MenuGroup[] = [
  {
    label: 'รายงาน',
    icon: '📊',
    items: [],
    sections: [
      {
        label: 'การขาย',
        items: [
          { path: '/admin/report/daily', label: 'ยอดขายสินค้าตามวัน' },
          { path: '/admin/report/bill-items', label: 'ยอดขายตามรายละเอียดบิล' },
          { path: '/admin/report/by-sku', label: 'ยอดขายตามสินค้า' },
          { path: '/admin/report/by-plu', label: 'ยอดขายสินค้าตามขนาดบรรจุ' },
          { path: '/admin/report/unsold', label: 'สินค้าที่ไม่มีการขาย' },
          { path: '/admin/report/by-category', label: 'การขายแยกตามกลุ่มสินค้า' },
          { path: '/admin/report/payments', label: 'การชำระเงิน' },
          { path: '/admin/report/closesell', label: 'ปิดรอบการขาย' },
          { path: '/admin/report/voids', label: 'ยกเลิกการขาย' },
          { path: '/admin/report/options', label: 'ยอดขายตามตัวเลือก' },
          { path: '/admin/report/cash-in-out', label: 'นำเงินเข้า-นำเงินออก' },
          { path: '/admin/report/channels', label: 'ยอดขายตามช่องทางการขาย' },
          { path: '/admin/report/tables', label: 'สถิติการใช้โต๊ะ' },
          { path: '/admin/report/option-cost', label: 'ต้นทุนตามตัวเลือก' },
        ],
      },
      {
        label: 'สินค้าคงคลัง',
        items: [
          { path: '/admin/inventory/sku', label: 'สินค้าคงเหลือตาม SKU' },
          { path: '/admin/inventory/plu', label: 'สินค้าคงเหลือตามขนาดบรรจุ' },
          { path: '/admin/inventory/serial', label: 'สินค้ามี Serial No.' },
          { path: '/admin/inventory/lessStock', label: 'สินค้าเหลือน้อย' },
          { path: '/admin/inventory/outOfStock', label: 'สินค้าหมด' },
          { path: '/admin/report/stock-in-items', label: 'รับสินค้าเข้าแสดงรายการ' },
          { path: '/admin/report/stock-out-items', label: 'จ่ายสินค้าออกแสดงรายการ' },
          { path: '/admin/report/non-adjusted', label: 'สินค้าที่ยังไม่ปรับปรุงสต๊อก' },
          { path: '/admin/report/stock-out-by-type', label: 'สินค้าจ่ายออกตามประเภท' },
          { path: '/admin/report/option-by-date', label: 'การสั่งกลุ่มตัวเลือกตามวัน' },
        ],
      },
      {
        label: 'ภาษี',
        items: [
          { path: '/admin/report/tax-summary', label: 'สรุปภาษีขาย' },
          { path: '/admin/report/tax-invoices', label: 'บิลที่ออกใบกำกับภาษี' },
          { path: '/admin/report/tax-items', label: 'สรุปการขายเฉพาะสินค้ามีภาษี' },
        ],
      },
      {
        label: 'พนักงาน',
        items: [
          { path: '/admin/report/by-cashier', label: 'ยอดขายแยกตามพนักงาน' },
          { path: '/admin/report/timesheet', label: 'ชั่วโมงการทำงาน' },
        ],
      },
    ],
  },
  {
    label: 'จัดการข้อมูล',
    icon: '📦',
    items: [],
    sections: [
      {
        label: 'การจัดการสินค้า',
        items: [
          { path: '/admin/product', label: 'สินค้า' },
          { path: '/admin/product/category', label: 'กลุ่มสินค้า' },
          { path: '/admin/product/unit', label: 'หน่วยบรรจุ' },
          { path: '/admin/product/option', label: 'ตัวเลือกเสริม' },
          { path: '/admin/product/optiongroup', label: 'กลุ่มตัวเลือก' },
          { path: '/admin/product/saleschannels', label: 'ช่องทางการขาย' },
          { path: '/admin/product/mangesaleshours', label: 'ช่วงเวลาการขาย' },
          { path: '/admin/product/managemenuranking', label: 'จัดการเมนูขายหน้าร้าน' },
          { path: '/admin/product/importProduct', label: 'นำเข้ารายการสินค้า' },
        ],
      },
      {
        label: 'การจัดการสต็อกและคลัง',
        items: [
          { path: '/admin/inventory/stockcard', label: 'ความเคลื่อนไหวสินค้า' },
          { path: '/admin/inventory/stock-in', label: 'รับสินค้าเข้า' },
          { path: '/admin/inventory/stock-out', label: 'จ่ายสินค้าออก' },
          { path: '/admin/inventory/adjust-stock', label: 'ปรับปรุงสต๊อก' },
          { path: '/admin/inventory/check-stock', label: 'ตรวจนับสินค้า' },
        ],
      },
      {
        label: 'การโอนและรับระหว่างสาขา',
        items: [
          { path: '/admin/inventory/transferOut', label: 'โอนสินค้าระหว่างสาขา', badge: 'beta' },
          { path: '/admin/inventory/transferIn', label: 'รับสินค้าระหว่างสาขา', badge: 'beta' },
          { path: '/admin/report/transfers', label: 'การโอนและรับสินค้า' },
        ],
      },
    ],
  },
  {
    label: 'สมาชิก',
    icon: '👥',
    items: [
      { path: '/admin/member/data', label: 'สมาชิก' },
      { path: '/admin/report/by-customer', label: 'ยอดใช้จ่ายตามลูกค้า' },
      { path: '/admin/member/import', label: 'นำเข้ารายชื่อสมาชิก', badge: 'new' },
    ],
  },
  {
    label: 'การตั้งค่า',
    icon: '⚙️',
    items: [],
    sections: [
      {
        label: 'การตั้งค่า',
        items: [
          { path: '/admin/setting/shop', label: 'ร้านค้า' },
          { path: '/admin/setting/receipt', label: 'ใบเสร็จรับเงิน' },
          { path: '/admin/setting/payment', label: 'การชำระเงิน' },
          { path: '/admin/setting/cashier', label: 'พนักงาน' },
          { path: '/admin/setting/permission', label: 'สิทธิการเข้าถึง' },
          { path: '/admin/setting/delivery', label: 'รายชื่อผู้ให้บริการเดลิเวอรี่' },
          { path: '/admin/setting/alert', label: 'การแจ้งเตือน', badge: 'new' },
        ],
      },
      {
        label: 'การจัดการร้านค้า',
        items: [
          { path: '/admin/shop', label: 'ร้านค้าและสาขา' },
          { path: '/admin/setting/tools', label: 'เครื่องมือสำหรับผู้ดูแลระบบ' },
        ],
      },
    ],
  },
]

/** path ของ API สิทธิ์ที่คู่กับ route ของหน้าหลังบ้าน */
export function permissionPathOf(adminPath: string): string {
  const map: Record<string, string> = {
    '/admin/dashboard': '/dashboard',
    '/admin/report/transaction': '/report/transaction',
    '/admin/report/currentbill': '/report/currentbill',
    '/admin/grabdashboard': '/grabdashboard',
    '/admin/promotiondashboard': '/promotiondashboard',
    '/admin/report/bill-items': '/report/sell',
    '/admin/report/by-sku': '/report/sku',
    '/admin/report/by-plu': '/report/plu',
    '/admin/report/unsold': '/report/unsell',
    '/admin/report/by-category': '/report/category',
    '/admin/report/payments': '/report/payment',
    '/admin/report/closesell': '/report/closesell',
    '/admin/report/voids': '/report/voidbill',
    '/admin/report/options': '/report/optional',
    '/admin/report/cash-in-out': '/report/cashIn-Out',
    '/admin/report/channels': '/report/salesChannels',
    '/admin/report/tables': '/report/table',
    '/admin/report/option-cost': '/report/optionSalesByCost',
    '/admin/report/option-by-date': '/report/optionSalesByDate',
    '/admin/report/stock-in-items': '/report/stockin',
    '/admin/report/stock-out-items': '/report/stockout',
    '/admin/report/stock-out-by-type': '/report/stockOutbyType',
    '/admin/report/non-adjusted': '/report/nonadjust',
    '/admin/report/tax-summary': '/report/tax',
    '/admin/report/tax-invoices': '/report/newPayment',
    '/admin/report/tax-items': '/report/taxBillSales',
    '/admin/report/by-cashier': '/report/cashier',
    '/admin/report/timesheet': '/report/timesheet',
    '/admin/report/by-customer': '/report/phone',
    '/admin/report/transfers': '/inventory/transfer/transferReport',
    '/admin/member/data': '/member/data',
    '/admin/member/import': '/member/ImportMember',
    '/admin/shop': '/shop',
  }
  if (map[adminPath]) return map[adminPath]!
  // /admin/product/... → /product/... · /admin/setting/... → /setting/... · /admin/inventory/... → /inventory/...
  return adminPath.replace(/^\/admin/, '') || '/dashboard'
}
