'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'

interface LoginResponse {
  accessToken: string
  refreshToken: string
  account: { id: string; email: string; displayName: string; isOwner: boolean }
  branches: { id: string; label: string }[]
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const data = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password },
      })
      session.token = data.accessToken
      session.refreshToken = data.refreshToken
      session.account = data.account
      if (data.branches[0]) session.branchId = data.branches[0].id
      router.replace('/admin/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 dark:bg-slate-950">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">
            M
          </span>
          <h1 className="text-xl font-semibold">Medee POS</h1>
          <p className="mt-1 text-sm text-slate-500">ระบบขายหน้าร้านและหลังบ้าน · ร้านมีดีทวีคูณ</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">อีเมล</label>
            <input
              id="email" type="email" className="input" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="medeetaweekoon.official@gmail.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">รหัสผ่าน</label>
            <input
              id="password" type="password" className="input" autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-sm dark:border-slate-800">
          <Link href="/pos" className="text-brand hover:underline">เข้าหน้าขาย (POS) →</Link>
        </div>
      </div>
    </div>
  )
}
