'use client'

import { useEffect, useRef, useState } from 'react'

export interface RealtimeMessage {
  event: string
  payload: unknown
  at?: string
}

/**
 * เกาะ channel `branch:{id}` ของ API เพื่อรับเหตุการณ์แบบเรียลไทม์
 * (บิลใหม่ · ยกเลิกบิล · สินค้าเปลี่ยน · สต็อกเปลี่ยน · เปิด/ปิดรอบ)
 */
export function useRealtime(branchId: string | null) {
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!branchId || typeof window === 'undefined') return

    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      const base = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin.replace(/^http/, 'ws')
      const url = base.startsWith('ws')
        ? `${base}/ws?branchId=${branchId}`
        : `${base.replace(/^http/, 'ws')}/ws?branchId=${branchId}`

      try {
        const socket = new WebSocket(url)
        socketRef.current = socket
        socket.onopen = () => setConnected(true)
        socket.onmessage = (e) => {
          try { setLastEvent(JSON.parse(e.data as string) as RealtimeMessage) } catch { /* ข้อความไม่ใช่ JSON */ }
        }
        socket.onclose = () => {
          setConnected(false)
          // เชื่อมต่อใหม่อัตโนมัติเมื่อหลุด (เช่น เน็ตร้านสะดุด)
          if (!closed) retry = setTimeout(connect, 5_000)
        }
        socket.onerror = () => socket.close()
      } catch {
        if (!closed) retry = setTimeout(connect, 5_000)
      }
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socketRef.current?.close()
    }
  }, [branchId])

  return { lastEvent, connected }
}
