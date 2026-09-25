'use client'

/** ที่อยู่ API — ใช้ rewrite ของ Next เป็นค่าเริ่มต้น เพื่อไม่ต้องตั้ง CORS ตอน dev */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : '/api/v1'

const TOKEN_KEY = 'medee.accessToken'
const REFRESH_KEY = 'medee.refreshToken'
const BRANCH_KEY = 'medee.branchId'
const ACCOUNT_KEY = 'medee.account'
const DEVICE_KEY = 'medee.deviceToken'
const CASHIER_KEY = 'medee.cashier'

export interface StoredAccount {
  id: string
  email: string
  displayName: string
  isOwner: boolean
}

function read(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* โหมดส่วนตัวของเบราว์เซอร์อาจเขียนไม่ได้ */
  }
}

export const session = {
  get token() { return read(TOKEN_KEY) },
  set token(value: string | null) { write(TOKEN_KEY, value) },
  get refreshToken() { return read(REFRESH_KEY) },
  set refreshToken(value: string | null) { write(REFRESH_KEY, value) },
  get branchId() { return read(BRANCH_KEY) },
  set branchId(value: string | null) { write(BRANCH_KEY, value) },
  get deviceToken() { return read(DEVICE_KEY) },
  set deviceToken(value: string | null) { write(DEVICE_KEY, value) },
  get account(): StoredAccount | null {
    const raw = read(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as StoredAccount) : null
  },
  set account(value: StoredAccount | null) {
    write(ACCOUNT_KEY, value ? JSON.stringify(value) : null)
  },
  get cashier(): { id: string; name: string; permissions: Record<string, unknown> } | null {
    const raw = read(CASHIER_KEY)
    return raw ? JSON.parse(raw) : null
  },
  set cashier(value: { id: string; name: string; permissions: Record<string, unknown> } | null) {
    write(CASHIER_KEY, value ? JSON.stringify(value) : null)
  },
  clear() {
    for (const key of [TOKEN_KEY, REFRESH_KEY, BRANCH_KEY, ACCOUNT_KEY, DEVICE_KEY, CASHIER_KEY]) {
      write(key, null)
    }
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
  }
  /** ฟีเจอร์ถูกล็อกตามแพ็กเกจ — แสดงหน้าโปรโมทแทนหน้า "ไม่มีสิทธิ์" */
  get isLocked() { return this.code === 'FEATURE_LOCKED' }
  get isForbidden() { return this.status === 403 }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** ไม่แนบโทเค็น (ใช้กับ login) */
  anonymous?: boolean
  query?: Record<string, string | number | boolean | undefined | null>
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

let refreshing: Promise<boolean> | null = null

/** ต่ออายุ access token อัตโนมัติเมื่อหมดอายุ (เรียกซ้อนกันได้ จะรวมเป็นคำขอเดียว) */
async function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing
  const refreshToken = session.refreshToken
  if (!refreshToken) return false

  refreshing = (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { accessToken: string; refreshToken: string }
      session.token = data.accessToken
      session.refreshToken = data.refreshToken
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, query, headers, ...rest } = options

  const send = async (): Promise<Response> => {
    const finalHeaders = new Headers(headers)
    if (body !== undefined && !(body instanceof FormData)) {
      finalHeaders.set('Content-Type', 'application/json')
    }
    if (!anonymous) {
      const token = session.deviceToken ?? session.token
      if (token) finalHeaders.set('Authorization', `Bearer ${token}`)
      const branchId = session.branchId
      if (branchId) finalHeaders.set('X-Branch-Id', branchId)
    }
    return fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
  }

  let res = await send()
  if (res.status === 401 && !anonymous && (await refreshSession())) {
    res = await send()
  }

  if (!res.ok) {
    let message = 'เกิดข้อผิดพลาดในการเชื่อมต่อ'
    let code: string | undefined
    let details: unknown
    try {
      const data = (await res.json()) as { error?: string; code?: string; details?: unknown }
      message = data.error ?? message
      code = data.code
      details = data.details
    } catch {
      /* ตอบกลับไม่ใช่ JSON */
    }
    throw new ApiError(res.status, message, code, details)
  }

  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return (await res.text()) as T
  return (await res.json()) as T
}

/** ดาวน์โหลดไฟล์ส่งออก (ปุ่ม "ส่งออกไฟล์") */
export async function downloadExport(
  path: string,
  query: Record<string, string | number | undefined>,
  filename: string,
) {
  const headers = new Headers()
  const token = session.deviceToken ?? session.token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const branchId = session.branchId
  if (branchId) headers.set('X-Branch-Id', branchId)

  const res = await fetch(buildUrl(path, { ...query, export: 'xlsx' }), { headers })
  if (!res.ok) throw new ApiError(res.status, 'ส่งออกไฟล์ไม่สำเร็จ')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
