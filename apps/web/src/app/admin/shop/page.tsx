'use client'

import { useQuery } from '@tanstack/react-query'
import { api, ApiError, session } from '@/lib/api'
import { useMe } from '@/hooks/useSession'
import { Badge, Card, EmptyState, NoAccess, PageHeader, Spinner } from '@/components/ui'
import { dateTH } from '@/lib/format'
import { BUSINESS_TYPES } from '@medee/domain'

interface Branch {
  id: string
  branchName: string
  businessType: number
  address1: string | null
  address2: string | null
  tel: string | null
  taxId: string
  openTime: string
  closeTime: string
  plan: string
  expireAt: string | null
  shop: { name: string }
}

export default function ShopPage() {
  const me = useMe()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const query = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => api<Branch>(`/branches/${branchId}`),
    enabled: Boolean(branchId),
  })

  if (query.error instanceof ApiError && query.error.isForbidden) return <NoAccess />
  if (query.isLoading) return <Spinner />
  const b = query.data
  if (!b) return <EmptyState />

  return (
    <div className="space-y-4">
      <PageHeader title="ร้านค้าและสาขา" subtitle={`บัญชี ${me.data?.account.email ?? ''}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-semibold">{b.shop.name}</p>
              <p className="text-brand">{b.branchName}</p>
            </div>
            <Badge tone="green">{b.plan}</Badge>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">ประเภทธุรกิจ</dt><dd>{BUSINESS_TYPES[b.businessType]}</dd></div>
            <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">เลขประจำตัวผู้เสียภาษี</dt><dd>{b.taxId || '-'}</dd></div>
            <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">ที่อยู่</dt><dd>{[b.address1, b.address2].filter(Boolean).join(' ') || '-'}</dd></div>
            <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">เบอร์โทรศัพท์</dt><dd>{b.tel || '-'}</dd></div>
            <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">เวลาทำการ</dt><dd>{b.openTime} - {b.closeTime}</dd></div>
            <div className="flex gap-3"><dt className="w-40 shrink-0 text-slate-500">ใช้งานได้ถึง</dt><dd>{b.expireAt ? dateTH(b.expireAt) : '-'}</dd></div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">สาขาทั้งหมดของบัญชีนี้</h2>
          <ul className="space-y-2">
            {(me.data?.branches ?? []).map((br) => (
              <li key={br.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                <span className="text-sm">{br.label}</span>
                {br.id === branchId ? <Badge tone="green">กำลังดู</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
