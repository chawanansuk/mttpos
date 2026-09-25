'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { api, ApiError, session } from '@/lib/api'
import { Card, EmptyState, NoAccess, PageHeader, Spinner } from '@/components/ui'
import { baht } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

interface Category { id: string; name: string; bgColor: string; enabled: boolean }
interface Product { id: string; name: string; price: string; color: string; favorite: boolean; favoriteIndex: number; itemSequence: number }

/** จัดการเมนูขายหน้าร้าน (หัวข้อ 6.9.6) — ลากเรียงลำดับสินค้าบนหน้าขาย */
export default function MenuRankingPage() {
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId
  const [scope, setScope] = useState<'favorite' | string>('favorite')
  const [items, setItems] = useState<Product[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  const categories = useQuery({
    queryKey: ['categories', branchId],
    queryFn: () => api<Category[]>('/categories'),
    enabled: Boolean(branchId),
  })

  const products = useQuery({
    queryKey: ['ranking-products', branchId, scope],
    queryFn: () =>
      api<{ data: Product[] }>('/products', {
        query: scope === 'favorite'
          ? { favorite: true, sort: 'name', limit: 200 }
          : { categoryId: scope, sort: 'name', limit: 200 },
      }),
    enabled: Boolean(branchId),
  })

  useEffect(() => {
    if (!products.data) return
    const sorted = [...products.data.data].sort((a, b) =>
      scope === 'favorite' ? a.favoriteIndex - b.favoriteIndex : a.itemSequence - b.itemSequence,
    )
    setItems(sorted)
  }, [products.data, scope])

  const save = useMutation({
    mutationFn: () =>
      api('/products/ranking', {
        method: 'PUT',
        body: {
          scope: scope === 'favorite' ? 'favorite' : 'category',
          categoryId: scope === 'favorite' ? undefined : scope,
          productIds: items.map((p) => p.id),
        },
      }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['ranking-products'] }) },
  })
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(t) }, [saved])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    setItems(next)
  }

  if (categories.error instanceof ApiError && categories.error.isForbidden) return <NoAccess />
  const canEdit = can('/product/managemenuranking', 'edit').allowed

  return (
    <div className="space-y-4">
      <PageHeader
        title="จัดการเมนูขายหน้าร้าน"
        subtitle="ลากหรือกดลูกศรเพื่อจัดลำดับสินค้าที่แสดงบนหน้าขาย"
        actions={canEdit ? <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>บันทึกลำดับ</button> : null}
      />
      {saved ? <p className="rounded-card bg-brand-50 px-4 py-2.5 text-sm text-brand-700 dark:bg-brand-900/30 dark:text-brand-200">บันทึกลำดับเรียบร้อย</p> : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase text-slate-400">กลุ่มสินค้า</p>
          <button
            type="button" onClick={() => setScope('favorite')}
            className={clsx('mb-1 w-full rounded-lg px-3 py-2 text-left text-sm', scope === 'favorite' ? 'bg-brand text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
          >
            ⭐ สินค้า-นิยม
          </button>
          {(categories.data ?? []).filter((c) => c.enabled).map((c) => (
            <button
              key={c.id} type="button" onClick={() => setScope(c.id)}
              className={clsx('mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', scope === c.id ? 'bg-brand text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}
            >
              <span className="h-3 w-3 shrink-0 rounded" style={{ background: c.bgColor }} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </Card>

        <Card>
          {products.isLoading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState message="ไม่มีสินค้าในกลุ่มนี้" />
          ) : (
            <ol className="space-y-1.5">
              {items.map((p, i) => (
                <li
                  key={p.id}
                  draggable={canEdit}
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null) { move(dragIndex, i); setDragIndex(null) } }}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <span className="w-7 text-center text-sm tabular-nums text-slate-400">{i + 1}</span>
                  <span className="h-8 w-8 shrink-0 rounded" style={{ background: p.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <span className="text-sm tabular-nums text-slate-500">{baht(p.price)}</span>
                  {canEdit ? (
                    <span className="flex gap-1">
                      <button type="button" className="btn-ghost h-8 w-8 px-0" aria-label="เลื่อนขึ้น" onClick={() => move(i, i - 1)}>↑</button>
                      <button type="button" className="btn-ghost h-8 w-8 px-0" aria-label="เลื่อนลง" onClick={() => move(i, i + 1)}>↓</button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  )
}
