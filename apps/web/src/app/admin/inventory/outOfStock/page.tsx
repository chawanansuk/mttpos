'use client'

import { StockBalanceView } from '@/components/admin/StockBalanceView'

export default function Page() {
  return <StockBalanceView title="สินค้าหมด" by="sku" filter="out" />
}
