import type { Metadata, Viewport } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'

const thai = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Medee POS',
  description: 'ระบบขายหน้าร้านและหลังบ้าน — ร้านมีดีทวีคูณ',
  manifest: '/manifest.json',
  // ประกาศไอคอนให้ชัด ไม่งั้นเบราว์เซอร์จะไปขอ /favicon.ico เองแล้วได้ 404
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Medee POS', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2EB88A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
