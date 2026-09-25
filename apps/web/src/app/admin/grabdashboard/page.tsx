'use client'

import { FeatureLocked, PageHeader } from '@/components/ui'

export default function GrabDashboardPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="รายงาน Grab" />
      <FeatureLocked
        title="ยังไม่ได้เชื่อมต่อกับ Grab"
        description="เชื่อมต่อร้านของคุณกับ Grab เพื่อดูยอดขาย ค่า GP และออเดอร์จากแพลตฟอร์มในหน้าเดียว — ระบบเตรียมโครงสร้างข้อมูลไว้แล้ว เปิดใช้งานได้เมื่อพร้อม"
      />
    </div>
  )
}
