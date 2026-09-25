'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { pullMaster } from '@/lib/pos/sync'

interface LoginResponse {
  accessToken: string
  refreshToken: string
  account: { id: string; email: string; displayName: string; isOwner: boolean }
  branches: { id: string; label: string }[]
}
interface Device { id: string; posNumber: string; deviceName: string | null; status: string }

/** ตั้งค่าเครื่องขายใหม่: ล็อกอินบัญชีร้าน → เลือกสาขา → เลือกหมายเลขเครื่อง → ดาวน์โหลดข้อมูล */
export default function PosSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'login' | 'branch' | 'device' | 'sync'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branches, setBranches] = useState<{ id: string; label: string }[]>([])
  const [branchId, setBranchId] = useState('')
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const data = await api<LoginResponse>('/auth/login', { method: 'POST', anonymous: true, body: { email, password } })
      session.token = data.accessToken
      session.refreshToken = data.refreshToken
      session.account = data.account
      setBranches(data.branches)
      if (data.branches.length === 1) {
        await chooseBranch(data.branches[0]!.id)
      } else {
        setStep('branch')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const chooseBranch = async (id: string) => {
    setBusy(true); setError(null)
    try {
      session.branchId = id
      setBranchId(id)
      const list = await api<Device[]>(`/branches/${id}/pos-devices`)
      setDevices(list.filter((d) => d.status !== 'ปลดแล้ว' || true))
      setStep('device')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดรายการเครื่องไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const bindDevice = async (device: Device) => {
    setBusy(true); setError(null)
    try {
      // สร้าง fingerprint ของอุปกรณ์แล้วเก็บไว้ เพื่อผูกเครื่องนี้กับหมายเลข POS
      let deviceUuid = localStorage.getItem('medee.deviceUuid')
      if (!deviceUuid) {
        deviceUuid = crypto.randomUUID()
        localStorage.setItem('medee.deviceUuid', deviceUuid)
      }
      const res = await api<{ deviceToken: string }>('/auth/device/register', {
        method: 'POST',
        body: {
          branchId,
          posNumber: device.posNumber,
          deviceUuid,
          deviceName: device.deviceName ?? navigator.platform,
          deviceType: 'Web',
          appVersion: 'Medee POS 1.0.0',
        },
      })
      session.deviceToken = res.deviceToken

      setStep('sync')
      setProgress('กำลังดาวน์โหลดข้อมูลสินค้า…')
      const result = await pullMaster(true)
      setProgress(`ดาวน์โหลดสินค้า ${result.products} รายการเรียบร้อย`)
      setTimeout(() => router.replace('/pos/lock'), 600)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ผูกเครื่องไม่สำเร็จ')
      setStep('device')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">M</span>
          <h1 className="text-xl font-semibold">ตั้งค่าเครื่องขายใหม่</h1>
          <p className="mt-1 text-sm text-slate-500">Medee POS · หน้าขาย</p>
        </div>

        {error ? <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

        {step === 'login' ? (
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="label" htmlFor="pos-email">อีเมลบัญชีร้าน</label>
              <input id="pos-email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pos-pass">รหัสผ่าน</label>
              <input id="pos-pass" type="password" className="input" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        ) : null}

        {step === 'branch' ? (
          <div className="space-y-2">
            <p className="label">เลือกสาขา</p>
            {branches.map((b) => (
              <button key={b.id} type="button" className="btn-ghost w-full justify-start" onClick={() => chooseBranch(b.id)} disabled={busy}>
                {b.label}
              </button>
            ))}
          </div>
        ) : null}

        {step === 'device' ? (
          <div className="space-y-2">
            <p className="label">เลือกหมายเลขเครื่อง POS</p>
            {devices.map((d) => (
              <button
                key={d.id} type="button"
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-brand disabled:opacity-50 dark:border-slate-700"
                onClick={() => bindDevice(d)}
                disabled={busy}
              >
                <span>
                  <span className="block font-semibold">เครื่อง {d.posNumber}</span>
                  <span className="block text-xs text-slate-400">{d.deviceName ?? '-'}</span>
                </span>
                <span className={`text-xs ${d.status === 'กำลังถูกใช้งาน' ? 'text-amber-600' : 'text-brand'}`}>{d.status}</span>
              </button>
            ))}
            {devices.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">ไม่พบเครื่อง POS ในสาขานี้</p> : null}
          </div>
        ) : null}

        {step === 'sync' ? (
          <div className="py-10 text-center">
            <span className="mx-auto mb-4 block h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            <p className="text-sm text-slate-600 dark:text-slate-300">{progress}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
