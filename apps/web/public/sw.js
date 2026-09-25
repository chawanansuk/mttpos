/**
 * Service worker ของ Medee POS
 *
 * หน้าที่เดียวคือให้ "เปิดหน้าขายได้แม้ไม่มีเน็ต" — ข้อมูลสินค้าและบิลที่ขายตอนออฟไลน์
 * เก็บอยู่ใน IndexedDB ของหน้าขายอยู่แล้ว (lib/pos/db.ts) ไฟล์นี้ดูแลแค่ตัวหน้าเว็บ
 *
 * - หน้า /pos/*        network-first (รอเน็ตไม่เกิน 4 วินาที) → ถ้าไม่ได้ใช้ของที่เก็บไว้
 * - /_next/static/*    cache-first (ชื่อไฟล์มี hash เปลี่ยนทุก build จึงเก็บถาวรได้)
 * - /api/*             ไม่แตะเลย — ให้หน้าขายจัดการคิวออฟไลน์เอง
 * - หลังบ้าน /admin    ไม่แตะ — ใช้ออนไลน์เท่านั้น
 *
 * เวอร์ชันมาจาก query string ตอนลงทะเบียน (/sw.js?v=<commit>) deploy ใหม่จึงได้ SW ใหม่เอง
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const PAGES = `medee-pages-${VERSION}`
const ASSETS = 'medee-assets'

const POS_ROUTES = [
  '/pos', '/pos/setup', '/pos/lock', '/pos/sale', '/pos/bills',
  '/pos/cash', '/pos/products', '/pos/settings',
]
const STATIC_FILES = [
  '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png',
  '/icon-maskable-512.png', '/apple-touch-icon.png',
]
const NETWORK_TIMEOUT_MS = 4000

/** ดึงชื่อไฟล์ JS/CSS/ฟอนต์ที่หน้า HTML อ้างถึง ทั้งใน <script>/<link> และใน flight data ของ Next */
function assetUrls(html) {
  const found = new Set()
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+/g)) found.add(m[0])
  for (const m of html.matchAll(/(?<![\w/])static\/(?:chunks|css|media)\/[^"'\s\\)]+/g)) found.add(`/_next/${m[0]}`)
  return [...found]
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES)
    const assets = await caches.open(ASSETS)
    await assets.addAll(STATIC_FILES).catch(() => {})
    // เก็บทีละหน้า — หน้าไหนโหลดไม่ขึ้นก็ข้ามไป ไม่ให้ทั้งการติดตั้งล้ม
    for (const route of POS_ROUTES) {
      try {
        const res = await fetch(route, { credentials: 'same-origin' })
        if (!res.ok) continue
        const html = await res.clone().text()
        await pages.put(route, res)
        const missing = []
        for (const url of assetUrls(html)) {
          if (!(await assets.match(url))) missing.push(url)
        }
        await Promise.all(missing.map((url) => assets.add(url).catch(() => {})))
      } catch { /* ออฟไลน์ตอนติดตั้ง — ไว้เก็บตอนใช้งานจริง */ }
    }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('medee-pages-') && key !== PAGES) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

function isPosNavigation(request, url) {
  return request.mode === 'navigate' && (url.pathname === '/pos' || url.pathname.startsWith('/pos/'))
}

async function networkFirstPage(request, url) {
  const pages = await caches.open(PAGES)
  const fromNetwork = fetch(request).then(async (res) => {
    if (res.ok) await pages.put(url.pathname, res.clone())
    return res
  })
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))
  try {
    const res = await Promise.race([fromNetwork, timeout])
    if (res) return res
  } catch { /* เน็ตหลุด — ใช้ของที่เก็บไว้ */ }
  const cached = (await pages.match(url.pathname)) || (await pages.match('/pos'))
  if (cached) return cached
  return fromNetwork // ไม่มีของเก็บไว้เลย — ปล่อยให้เบราว์เซอร์แสดงข้อผิดพลาดตามปกติ
}

async function cacheFirstAsset(request) {
  const assets = await caches.open(ASSETS)
  const cached = await assets.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) await assets.put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (isPosNavigation(request, url)) {
    event.respondWith(networkFirstPage(request, url))
    return
  }
  if (url.pathname.startsWith('/_next/static/') || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirstAsset(request))
  }
})
