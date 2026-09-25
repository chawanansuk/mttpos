'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/** โหมดกลางคืน — จำค่าไว้ในเครื่อง (ปุ่มล่างสุดของ sidebar) */
function useThemeBootstrap() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('medee.theme')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const dark = saved ? saved === 'dark' : prefersDark
      document.documentElement.classList.toggle('dark', dark)
    } catch {
      /* เบราว์เซอร์บล็อก storage */
    }
  }, [])
}

/**
 * ลงทะเบียน service worker (public/sw.js) ให้เปิดหน้าขายได้แม้ไม่มีเน็ต
 * เฉพาะ production — ตอน dev ไฟล์เปลี่ยนตลอด ถ้าแคชไว้จะเห็นหน้าเก่าค้าง
 */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const version = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'
    navigator.serviceWorker.register(`/sw.js?v=${version}`, { scope: '/' }).catch(() => {
      /* เบราว์เซอร์ไม่อนุญาต (เช่นโหมดส่วนตัว) — ใช้งานออนไลน์ได้ตามปกติ */
    })
  }, [])
}

export function Providers({ children }: { children: React.ReactNode }) {
  useThemeBootstrap()
  useServiceWorker()
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (count, error) => {
              // ไม่ต้องลองซ้ำเมื่อไม่มีสิทธิ์หรือหมดอายุ
              const status = (error as { status?: number }).status
              if (status && status >= 400 && status < 500) return false
              return count < 2
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
