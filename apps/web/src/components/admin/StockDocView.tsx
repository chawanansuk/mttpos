'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import { ISSUE_TYPES } from '@medee/domain'
import { api, ApiError, downloadExport, session } from '@/lib/api'
import { Badge, Card, ConfirmModal, EmptyState, Modal, NoAccess, PageHeader, Pagination, Spinner } from '@/components/ui'
import { baht, dateTimeTH, qty } from '@/lib/format'
import { useCan } from '@/hooks/useSession'

export type DocKind = 'receive' | 'issue' | 'adjust' | 'count'

interface StockDoc {
  id: string
  docNo: string
  status: string
  docDate: string | null
  supplierName: string | null
  supplierInvoiceNo: string | null
  refDocNo: string | null
  countName: string | null
  issueType: string | null
  adjustDirection: string | null
  total: string
  createdBy: string | null
  createdAt: string
  updatedAt: string
  _count: { items: number }
}

interface DocDetail extends StockDoc {
  items: {
    id: string; barcode: string | null; name: string; unitName: string | null; ratio: string
    qty: string; unitPrice: string; discount: string; lineTotal: string
    countedQty: string | null; systemQty: string | null; diffQty: string | null
  }[]
}

interface ProductPick {
  id: string; name: string; barcode: string | null; stdCost: string; stockQty: string
  category: { name: string } | null
  unit: { name: string } | null
}

interface DraftItem {
  productId: string
  name: string
  barcode: string
  unitName: string
  systemQty: string
  qty: string
  unitPrice: string
  discount: string
  countedQty: string
}

const META: Record<DocKind, { title: string; permission: string; createLabel: string; qtyLabel: string }> = {
  receive: { title: 'รับสินค้าเข้า', permission: '/inventory/stock-in', createLabel: '+ รับสินค้าเข้า', qtyLabel: 'จำนวนรับเข้า' },
  issue: { title: 'จ่ายสินค้าออก', permission: '/inventory/stock-out', createLabel: '+ จ่ายสินค้าออก', qtyLabel: 'จำนวนจ่ายออก' },
  adjust: { title: 'ปรับปรุงสต๊อก', permission: '/inventory/adjust-stock', createLabel: 'ปรับปรุงสต๊อก', qtyLabel: 'ยอดตรวจนับ' },
  count: { title: 'ตรวจนับสินค้า', permission: '/inventory/check-stock', createLabel: 'สร้างเอกสาร', qtyLabel: 'ยอดตรวจนับ' },
}

export function StockDocView({ kind }: { kind: DocKind }) {
  const meta = META[kind]
  const qc = useQueryClient()
  const can = useCan()
  const branchId = typeof window === 'undefined' ? null : session.branchId

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<StockDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ฟอร์มสร้างเอกสาร
  const [header, setHeader] = useState({
    docDate: new Date().toISOString().slice(0, 10),
    supplierName: '', supplierInvoiceNo: '', refDocNo: '', note: '',
    issueType: ISSUE_TYPES[0] as string, countName: '',
    computeAvgCost: false, pricesIncludeVat: false, discount: '0',
  })
  const [items, setItems] = useState<DraftItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const list = useQuery({
    queryKey: ['stock-docs', kind, branchId, page, applied],
    queryFn: () =>
      api<{ data: StockDoc[]; page: number; limit: number; total: number; totalPages: number }>(`/stock-docs/${kind}`, {
        query: { page, limit: 50, search: applied || undefined },
      }),
    enabled: Boolean(branchId),
  })

  const detail = useQuery({
    queryKey: ['stock-doc', detailId],
    queryFn: () => api<DocDetail>(`/stock-docs/${detailId}`),
    enabled: Boolean(detailId),
  })

  const picker = useQuery({
    queryKey: ['doc-products', branchId, pickerSearch],
    queryFn: () => api<{ data: ProductPick[] }>('/products', { query: { search: pickerSearch || undefined, limit: 30 } }),
    enabled: pickerOpen && Boolean(branchId),
  })

  const create = useMutation({
    mutationFn: () =>
      api(`/stock-docs/${kind}`, {
        method: 'POST',
        body: {
          docDate: header.docDate,
          supplierName: header.supplierName || null,
          supplierInvoiceNo: header.supplierInvoiceNo || null,
          refDocNo: header.refDocNo || null,
          note: header.note || null,
          issueType: kind === 'issue' ? header.issueType : null,
          countName: kind === 'count' ? header.countName || null : null,
          discount: header.discount || '0',
          pricesIncludeVat: header.pricesIncludeVat,
          computeAvgCost: header.computeAvgCost,
          items: items.map((i) => ({
            productId: i.productId,
            qty: kind === 'adjust' || kind === 'count' ? '0' : i.qty || '0',
            unitPrice: i.unitPrice || '0',
            discount: i.discount || '0',
            countedQty: kind === 'adjust' || kind === 'count' ? (i.countedQty || '0') : undefined,
          })),
        },
      }),
    onSuccess: () => {
      setCreating(false); setItems([]); setError(null)
      void qc.invalidateQueries({ queryKey: ['stock-docs', kind] })
      void qc.invalidateQueries({ queryKey: ['stock-balance'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'บันทึกเอกสารไม่สำเร็จ'),
  })

  const cancel = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api(`/stock-docs/${input.id}/cancel`, { method: 'POST', body: { reason: input.reason } }),
    onSuccess: () => {
      setCancelTarget(null)
      void qc.invalidateQueries({ queryKey: ['stock-docs', kind] })
      void qc.invalidateQueries({ queryKey: ['stock-balance'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ยกเลิกเอกสารไม่สำเร็จ'),
  })

  if (list.error instanceof ApiError && list.error.isForbidden) return <NoAccess />
  if (list.isLoading) return <Spinner />
  const data = list.data
  if (!data) return <EmptyState />

  const canEdit = can(meta.permission, 'edit').allowed
  const canRemove = can(meta.permission, 'remove').allowed
  const isCountLike = kind === 'adjust' || kind === 'count'

  const addProduct = (p: ProductPick) => {
    if (items.some((i) => i.productId === p.id)) return
    setItems([...items, {
      productId: p.id,
      name: p.name,
      barcode: p.barcode ?? '',
      unitName: p.unit?.name ?? '',
      systemQty: p.stockQty,
      qty: '1',
      unitPrice: p.stdCost,
      discount: '0',
      countedQty: p.stockQty,
    }])
  }

  const grandTotal = items.reduce(
    (a, i) => a + Number(i.qty || 0) * Number(i.unitPrice || 0) - Number(i.discount || 0),
    0,
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title={`เอกสาร${meta.title}`}
        subtitle={`${data.total.toLocaleString()} เอกสาร`}
        actions={
          <>
            <button type="button" className="btn-info" onClick={() => downloadExport(`/stock-docs/${kind}`, {}, meta.title)}>
              ส่งออกไฟล์
            </button>
            {canEdit ? (
              <button type="button" className="btn-warn" onClick={() => { setItems([]); setError(null); setCreating(true) }}>
                {meta.createLabel}
              </button>
            ) : null}
          </>
        }
      />

      {error && !creating ? <p className="rounded-card bg-red-50 px-4 py-2.5 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}

      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(search) }}>
          <div className="min-w-[220px] flex-1">
            <label className="label" htmlFor="doc-search">ค้นหา (เลขที่เอกสาร / เลขที่ในบิลซื้อ / ผู้จำหน่าย)</label>
            <input id="doc-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary">ค้นหา</button>
        </form>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>วันที่สร้าง</th><th>วันที่อัปเดต</th>
                {kind === 'receive' ? <th>วันที่ซื้อในบิล</th> : null}
                <th>เลขที่เอกสาร</th>
                {kind === 'receive' ? <th>เลขที่ในบิลซื้อ</th> : null}
                {kind === 'count' ? <th>ชื่อเอกสารตรวจนับ</th> : null}
                {kind === 'issue' ? <th>ประเภท</th> : null}
                {kind === 'adjust' ? <th>ประเภท</th> : null}
                <th className="text-right">รายการ</th>
                {kind === 'receive' || kind === 'issue' ? <th className="text-right">ยอดรวม</th> : null}
                {kind === 'receive' ? <th>ผู้จำหน่าย</th> : null}
                <th>ชื่อผู้ใช้</th><th>สถานะ</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((d) => (
                <tr key={d.id}>
                  <td>{dateTimeTH(d.createdAt)}</td>
                  <td>{dateTimeTH(d.updatedAt)}</td>
                  {kind === 'receive' ? <td>{d.docDate ? dateTimeTH(d.docDate).slice(0, 10) : '-'}</td> : null}
                  <td>
                    <button type="button" className="font-medium hover:text-brand hover:underline" onClick={() => setDetailId(d.id)}>
                      {d.docNo}
                    </button>
                  </td>
                  {kind === 'receive' ? <td>{d.supplierInvoiceNo ?? '-'}</td> : null}
                  {kind === 'count' ? <td>{d.countName ?? '-'}</td> : null}
                  {kind === 'issue' ? <td>{d.issueType ?? '-'}</td> : null}
                  {kind === 'adjust' ? <td>{d.adjustDirection === 'DEC' ? 'ปรับลด' : 'ปรับเพิ่ม'}</td> : null}
                  <td className="num">{d._count.items}</td>
                  {kind === 'receive' || kind === 'issue' ? <td className="num">{baht(d.total)}</td> : null}
                  {kind === 'receive' ? <td>{d.supplierName ?? '-'}</td> : null}
                  <td>{d.createdBy ?? '-'}</td>
                  <td><Badge tone={d.status === 'ยกเลิก' ? 'red' : d.status === 'รออนุมัติ' ? 'amber' : 'green'}>{d.status}</Badge></td>
                  <td>
                    {canRemove && d.status !== 'ยกเลิก' && kind !== 'count' ? (
                      <button type="button" className="text-danger hover:underline" onClick={() => setCancelTarget(d)}>ยกเลิก</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 ? <EmptyState /> : null}
        </div>

        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
      </Card>

      {/* รายละเอียดเอกสาร */}
      <Modal open={Boolean(detailId)} onClose={() => setDetailId(null)} title={`รายการสินค้า - ${detail.data?.docNo ?? ''}`} size="xl">
        {detail.isLoading || !detail.data ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-slate-500">สถานะ</dt><dd>{detail.data.status}</dd></div>
              <div><dt className="text-slate-500">บันทึกโดย</dt><dd>{detail.data.createdBy ?? '-'}</dd></div>
              <div><dt className="text-slate-500">วันที่สร้าง</dt><dd>{dateTimeTH(detail.data.createdAt)}</dd></div>
              {kind === 'receive' ? <div><dt className="text-slate-500">ผู้จำหน่าย</dt><dd>{detail.data.supplierName ?? '-'}</dd></div> : null}
            </dl>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หน่วยบรรจุ</th>
                    {isCountLike ? <><th className="text-right">คงเหลือในระบบ</th><th className="text-right">ยอดตรวจนับ</th><th className="text-right">ผลต่าง</th></>
                      : <><th className="text-right">{meta.qtyLabel}</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">ส่วนลด</th><th className="text-right">รวมทั้งสิ้น</th></>}
                  </tr>
                </thead>
                <tbody>
                  {detail.data.items.map((item, i) => (
                    <tr key={item.id}>
                      <td>{i + 1}</td>
                      <td>{item.barcode ?? '-'}</td>
                      <td className="max-w-[260px] truncate" title={item.name}>{item.name}</td>
                      <td>{item.unitName ?? '-'} / {qty(item.ratio)}</td>
                      {isCountLike ? (
                        <>
                          <td className="num">{qty(item.systemQty ?? 0)}</td>
                          <td className="num">{qty(item.countedQty ?? 0)}</td>
                          <td className={clsx('num', Number(item.diffQty ?? 0) < 0 && 'text-danger')}>{qty(item.diffQty ?? 0)}</td>
                        </>
                      ) : (
                        <>
                          <td className="num">{qty(item.qty)}</td>
                          <td className="num">{baht(item.unitPrice)}</td>
                          <td className="num">{baht(item.discount)}</td>
                          <td className="num">{baht(item.lineTotal)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* สร้างเอกสาร */}
      <Modal
        open={creating} onClose={() => setCreating(false)} size="xl"
        title={`สร้างเอกสาร${meta.title}`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setCreating(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={() => create.mutate()} disabled={items.length === 0 || create.isPending}>
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {kind === 'receive' ? (
              <>
                <div>
                  <label className="label" htmlFor="d-date">วันที่ซื้อในบิล</label>
                  <input id="d-date" type="date" className="input" value={header.docDate} onChange={(e) => setHeader({ ...header, docDate: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="d-inv">เลขที่ในบิลซื้อ</label>
                  <input id="d-inv" className="input" value={header.supplierInvoiceNo} onChange={(e) => setHeader({ ...header, supplierInvoiceNo: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="d-sup">ผู้จำหน่าย</label>
                  <input id="d-sup" className="input" value={header.supplierName} onChange={(e) => setHeader({ ...header, supplierName: e.target.value })} />
                </div>
              </>
            ) : null}
            {kind === 'issue' ? (
              <div>
                <label className="label" htmlFor="d-issue">ประเภท</label>
                <select id="d-issue" className="input" value={header.issueType} onChange={(e) => setHeader({ ...header, issueType: e.target.value })}>
                  {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ) : null}
            {kind === 'count' ? (
              <div className="sm:col-span-2">
                <label className="label" htmlFor="d-count">ชื่อเอกสารตรวจนับ</label>
                <input id="d-count" className="input" value={header.countName} onChange={(e) => setHeader({ ...header, countName: e.target.value })} />
              </div>
            ) : null}
            <div className={kind === 'receive' ? 'sm:col-span-3' : 'sm:col-span-2'}>
              <label className="label" htmlFor="d-note">หมายเหตุ</label>
              <input id="d-note" className="input" value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">รายการสินค้า ({items.length})</p>
            <button type="button" className="btn-ghost" onClick={() => { setPickerSearch(''); setPickerOpen(true) }}>เพิ่มสินค้า</button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
                  {isCountLike ? <><th className="text-right">คงเหลือในระบบ</th><th className="text-right">ยอดตรวจนับ</th><th className="text-right">ผลต่าง</th></>
                    : <><th className="text-right">{meta.qtyLabel}</th><th className="text-right">ราคา/หน่วย</th><th className="text-right">ส่วนลด</th><th className="text-right">รวม</th></>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.productId}>
                    <td>{i + 1}</td>
                    <td>{item.barcode || '-'}</td>
                    <td className="max-w-[220px] truncate" title={item.name}>{item.name}</td>
                    {isCountLike ? (
                      <>
                        <td className="num">{qty(item.systemQty)}</td>
                        <td>
                          <input
                            className="input h-9 w-24 text-right" inputMode="decimal" value={item.countedQty}
                            aria-label={`ยอดตรวจนับ ${item.name}`}
                            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, countedQty: e.target.value } : x)))}
                          />
                        </td>
                        <td className={clsx('num', Number(item.countedQty || 0) - Number(item.systemQty) < 0 && 'text-danger')}>
                          {qty(Number(item.countedQty || 0) - Number(item.systemQty))}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <input
                            className="input h-9 w-20 text-right" inputMode="decimal" value={item.qty}
                            aria-label={`จำนวน ${item.name}`}
                            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            className="input h-9 w-24 text-right" inputMode="decimal" value={item.unitPrice}
                            aria-label={`ราคาต่อหน่วย ${item.name}`}
                            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))}
                          />
                        </td>
                        <td>
                          <input
                            className="input h-9 w-20 text-right" inputMode="decimal" value={item.discount}
                            aria-label={`ส่วนลด ${item.name}`}
                            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, discount: e.target.value } : x)))}
                          />
                        </td>
                        <td className="num">{baht(Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0))}</td>
                      </>
                    )}
                    <td>
                      <button type="button" className="text-danger hover:underline" onClick={() => setItems(items.filter((_, j) => j !== i))}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 ? <EmptyState message="ยังไม่มีสินค้าในเอกสาร" /> : null}
          </div>

          {kind === 'receive' ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#2EB88A]" checked={header.computeAvgCost} onChange={(e) => setHeader({ ...header, computeAvgCost: e.target.checked })} />
                คำนวนต้นทุนเฉลี่ย (อัปเดตต้นทุนเฉลี่ยของสินค้า)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#2EB88A]" checked={header.pricesIncludeVat} onChange={(e) => setHeader({ ...header, pricesIncludeVat: e.target.checked })} />
                สินค้ารวมภาษีแล้ว
              </label>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-medium dark:border-slate-800">
                <span>ยอดรวมสุทธิ</span>
                <span className="tabular-nums">{baht(grandTotal)}</span>
              </div>
            </div>
          ) : null}

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger dark:bg-red-950/40">{error}</p> : null}
        </div>
      </Modal>

      {/* เลือกสินค้า */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="เลือกสินค้า" size="lg">
        <input
          className="input mb-3" placeholder="ค้นหาด้วยชื่อสินค้า หรือรหัสสินค้า"
          value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
        />
        <div className="table-wrap max-h-80 overflow-y-auto">
          <table className="table">
            <thead><tr><th></th><th>สินค้า</th><th>รหัสสินค้า</th><th>กลุ่มสินค้า</th><th className="text-right">คงเหลือ</th></tr></thead>
            <tbody>
              {(picker.data?.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => addProduct(p)} disabled={items.some((i) => i.productId === p.id)}>
                      {items.some((i) => i.productId === p.id) ? 'เพิ่มแล้ว' : 'เพิ่ม'}
                    </button>
                  </td>
                  <td className="max-w-[240px] truncate">{p.name}</td>
                  <td>{p.barcode ?? '-'}</td>
                  <td>{p.category?.name ?? '-'}</td>
                  <td className="num">{qty(p.stockQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {picker.isLoading ? <Spinner /> : null}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancel.mutate({ id: cancelTarget.id, reason: 'ยกเลิกจากหลังบ้าน' })}
        title="ยกเลิกเอกสาร"
        message={`ต้องการยกเลิกเอกสาร ${cancelTarget?.docNo} หรือไม่ ระบบจะคืนสต็อกกลับตามรายการในเอกสาร`}
        confirmLabel="ยกเลิกเอกสาร" tone="danger" busy={cancel.isPending}
      />
    </div>
  )
}
