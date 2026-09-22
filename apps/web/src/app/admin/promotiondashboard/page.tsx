'use client'

import { FeatureLocked, PageHeader } from '@/components/ui'

export default function PromotionDashboardPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="รายงานโปรโมชัน" />
      <FeatureLocked
        title="ยังไม่ได้เปิดใช้งานโปรโมชัน"
        description="สร้างโปรโมชันซื้อ X แถม Y ลดเป็น % ตามกลุ่มสินค้า หรือโค้ดส่วนลด แล้วดูผลได้ที่หน้านี้ — ระบบเตรียมโครงสร้างข้อมูลไว้แล้ว"
      />
    </div>
  )
}
