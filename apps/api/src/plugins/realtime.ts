import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'
import type { WebSocket } from 'ws'

/** เหตุการณ์ที่ส่งเข้า channel `branch:{id}` (หัวข้อ 9) */
export type RealtimeEvent =
  | 'receipt.created'
  | 'receipt.voided'
  | 'open_bill.updated'
  | 'product.updated'
  | 'stock.updated'
  | 'cash_round.opened'
  | 'cash_round.closed'
  | 'notification'

declare module 'fastify' {
  interface FastifyInstance {
    /** ส่งเหตุการณ์ให้ทุก client ที่เกาะสาขานี้อยู่ */
    broadcast: (branchId: string, event: RealtimeEvent, payload: unknown) => void
  }
}

export default fp(async (app) => {
  await app.register(websocket)

  const channels = new Map<string, Set<WebSocket>>()

  app.decorate('broadcast', (branchId: string, event: RealtimeEvent, payload: unknown) => {
    const peers = channels.get(branchId)
    if (!peers?.size) return
    const message = JSON.stringify({ event, payload, at: new Date().toISOString() })
    for (const socket of peers) {
      if (socket.readyState === socket.OPEN) socket.send(message)
    }
  })

  app.get('/ws', { websocket: true }, (socket, req) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost')
    const branchId = url.searchParams.get('branchId')
    if (!branchId) {
      socket.close(1008, 'ต้องระบุ branchId')
      return
    }

    let peers = channels.get(branchId)
    if (!peers) {
      peers = new Set()
      channels.set(branchId, peers)
    }
    peers.add(socket)
    socket.send(JSON.stringify({ event: 'connected', payload: { branchId } }))

    socket.on('close', () => {
      peers?.delete(socket)
      if (peers && peers.size === 0) channels.delete(branchId)
    })
  })
})

/**
 * ใช้แทน realtime บน serverless (Vercel) ซึ่งถือ WebSocket ค้างไว้ไม่ได้
 * เส้นทางอื่นเรียก app.broadcast() ได้เหมือนเดิม แต่ไม่ส่งอะไรออกไป
 * ฝั่งเว็บจะได้ข้อมูลใหม่จากการ refetch ของ TanStack Query แทน
 */
export const noopRealtime = fp(async (app) => {
  app.decorate('broadcast', () => {})
  app.get('/ws', async (_req, reply) =>
    reply.status(501).send({
      error: 'ระบบนี้ติดตั้งแบบ serverless จึงไม่รองรับการเชื่อมต่อแบบเรียลไทม์',
      code: 'REALTIME_UNAVAILABLE',
    }),
  )
})
