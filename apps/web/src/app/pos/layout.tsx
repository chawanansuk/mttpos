import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Medee POS — หน้าขาย',
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100 dark:bg-slate-950">{children}</div>
}
