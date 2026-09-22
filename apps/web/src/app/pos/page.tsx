'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { session } from '@/lib/api'

/** จุดเข้าแอป POS — พาไปยังขั้นตอนที่ค้างอยู่ (หัวข้อ 5.1) */
export default function PosEntry() {
  const router = useRouter()
  useEffect(() => {
    if (!session.deviceToken) { router.replace('/pos/setup'); return }
    if (!session.cashier) { router.replace('/pos/lock'); return }
    router.replace('/pos/sale')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
    </div>
  )
}
