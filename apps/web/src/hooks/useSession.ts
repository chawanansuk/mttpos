'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { api, session, type StoredAccount } from '@/lib/api'
import { checkPermission, type PermissionAction, type PermissionSet } from '@medee/domain'

export interface BranchOption {
  id: string
  shopName: string
  branchName: string
  label: string
  businessType: number
  plan: string
  expireAt: string | null
  timezone: string
  currency: string
}

interface MeResponse {
  account: StoredAccount
  branches: BranchOption[]
}

/** บัญชีผู้ใช้และรายการสาขาที่เข้าถึงได้ */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
    staleTime: 5 * 60_000,
  })
}

interface PermissionResponse {
  isOwner: boolean
  permissions: PermissionSet | null
}

/** สิทธิ์ของผู้ใช้ในสาขาที่เลือกอยู่ */
export function usePermissions() {
  const branchId = typeof window === 'undefined' ? null : session.branchId
  return useQuery({
    queryKey: ['permissions', branchId],
    queryFn: () => api<PermissionResponse>(`/branches/${branchId}/permissions`),
    enabled: Boolean(branchId),
    staleTime: 5 * 60_000,
  })
}

/** ตัวช่วยเช็คสิทธิ์ในคอมโพเนนต์ — normalize path ให้อัตโนมัติ */
export function useCan() {
  const { data } = usePermissions()
  return (path: string, action: PermissionAction = 'read') =>
    checkPermission(data?.permissions ?? null, path, action, { isOwner: data?.isOwner ?? false })
}

/** บังคับให้ล็อกอินก่อนเข้าหน้า */
export function useRequireAuth(redirectTo = '/login') {
  const router = useRouter()
  useEffect(() => {
    if (!session.token && !session.deviceToken) router.replace(redirectTo)
  }, [router, redirectTo])
}

export function logout() {
  const refreshToken = session.refreshToken
  if (refreshToken) {
    void api('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => undefined)
  }
  session.clear()
  if (typeof window !== 'undefined') window.location.href = '/login'
}
