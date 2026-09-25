'use client'

import { StockBalanceView } from '@/components/admin/StockBalanceView'

/** ความเคลื่อนไหวสินค้า — เลือกสินค้าจากรายการแล้วเข้าไปดูบัตรสินค้า (หัวข้อ 6.10.1) */
export default function StockCardIndexPage() {
  return <StockBalanceView title="ความเคลื่อนไหวสินค้า" by="sku" filter="all" />
}
