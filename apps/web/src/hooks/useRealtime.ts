'use client'

import { useEffect, useRef, useState } from 'react'

export interface RealtimeMessage {
  event: string
  payload: unknown
  at?: string
}

/** จำนวนครั้งที่ยอมให้ต่อไม่ติดก่อนสรุปว่าปลายทางไม่มี WebSocket ให้ใช้ */
const MAX_INITIAL_ATTEMPTS = 3

/**
 * เกาะ channel `branch:{id}` ของ API เพื่อรับเหตุการณ์แบบเรียลไทม์
 * (บิลใหม่ · ยกเลิกบิล · สินค้าเปลี่ยน · สต็อกเปลี่ยน · เปิด/ปิดรอบ)
 *
 * ถ้าต่อไม่ติดตั้งแต่แรกหลายครั้งติดกัน แปลว่าติดตั้งแบบ serverless (เช่น Vercel)
 * ซึ่งถือ connection ค้างไม่ได้ จึงเลิกพยายามและคืน unavailable
 * เพื่อไม่ให้เปิดซ็อกเก็ตรัวทุก 5 วินาทีไปตลอด — ฝั่งเรียกใช้ค่อย refetch ตามรอบแทน
 * แต่ถ้าเคยต่อติดแล้วหลุดทีหลัง (เน็ตร้านสะดุด) จะพยายามต่อใหม่ไม่จำกัด
 */
export function useRealtime(branchId: string | null) {
  const [lastEvent, setLastEvent] = useState<RealtimeMessage | null>(null)
  const [connected, setConnected] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!branchId || typeof window === 'undefined') return

    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let failedAttempts = 0
    let everConnected = false

    setUnavailable(false)

    const scheduleRetry = () => {
      if (closed) return
      if (!everConnected) {
        failedAttempts += 1
        if (failedAttempts >= MAX_INITIAL_ATTEMPTS) {
          setUnavailable(true)
          return
        }
      }
      // ถอยห่างขึ้นเรื่อย ๆ สูงสุด 30 วินาที
      const delay = Math.min(2_000 * 2 ** failedAttempts, 30_000)
      retry = setTimeout(connect, delay)
    }

    const connect = () => {
      if (closed) return
      const base = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin
      const url = `${base.replace(/^http/, 'ws')}/ws?branchId=${branchId}`

      try {
        const socket = new WebSocket(url)
        socketRef.current = socket
        socket.onopen = () => {
          everConnected = true
          failedAttempts = 0
          setConnected(true)
        }
        socket.onmessage = (e) => {
          try { setLastEvent(JSON.parse(e.data as string) as RealtimeMessage) } catch { /* ข้อความไม่ใช่ JSON */ }
        }
        socket.onclose = () => {
          setConnected(false)
          scheduleRetry()
        }
        socket.onerror = () => socket.close()
      } catch {
        scheduleRetry()
      }
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      socketRef.current?.close()
    }
  }, [branchId])

  return { lastEvent, connected, unavailable }
}
