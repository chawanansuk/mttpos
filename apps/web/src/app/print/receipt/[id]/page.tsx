'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { Spinner } from '@/components/ui'
import { baht, qty } from '@/lib/format'

interface PrintData {
  receipt: {
    id: string
    receiptNo: string
    status: string
    soldAt: string
    queueNo: number | null
    tableNo: string | null
    orderType: string
    subtotal: string
    discountTotal: string
    serviceCharge: string
    vatAmount: string
    rounding: string
    grandTotal: string
    totalQty: string
    note: string | null
    pointsEarned: number
    items: {
      id: string; name: string; barcode: string | null; qty: string; unitPrice: string
      itemDiscount: string; net: string; note: string | null
      options: { name: string; price: string }[] | null
      optionGroupNames: string | null
    }[]
    payments: { id: string; method: string; amount: string; change: string }[]
    member: { name: string; pointsBalance: number } | null
    cashier: { name: string } | null
    posDevice: { posNumber: string } | null
  }
  shop: {
    name: string; branchName: string; address1: string | null; address2: string | null
    tel: string | null; taxId: string
  }
  settings: {
    receiptHeader: string; headerShowOnReceipt: boolean
    footer1: string | null; footer2: string | null
    showDetailOnReceipt: boolean; showNoteOnReceipt: boolean; showQueueOnReceipt: boolean
    showBarcodeOnReceipt: boolean; showVatOnReceipt: boolean; showOptionGroupOnReceipt: boolean
    wordingToReplace: string; receiptFormat: string; useBuddhistYear: boolean
    vatRate: string
    promptpayShowOnReceipt: boolean
    promptpayPayload: string | null
  }
}

/** วันที่บนใบเสร็จ — เลือก พ.ศ./ค.ศ. ตามตั้งค่าสาขา */
function receiptDate(iso: string, buddhist: boolean): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const year = Number(get('year')) + (buddhist ? 543 : 0)
  return `${get('day')}/${get('month')}/${year} ${get('hour')}:${get('minute')}`
}

/**
 * หน้าที่จะกลับไปหลังพิมพ์ — รับเฉพาะ path ในเว็บเดียวกัน กันการพาออกไปเว็บอื่น
 * เดิมเปิดหน้านี้เป็นแท็บใหม่แล้วกด "ปิด" แต่บน iPad ที่ติดตั้งเป็นแอป แท็บใหม่จะเด้งไป Safari
 * ซึ่งไม่มีข้อมูลล็อกอินของแอป หน้าใบเสร็จจึงโหลดไม่ขึ้น ตอนนี้จึงเปิดในหน้าต่างเดิมเสมอ
 */
function safeBack(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/pos/sale'
}

export default function PrintReceiptPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const back = safeBack(useSearchParams().get('back'))
  const query = useQuery({
    queryKey: ['receipt-print', params.id],
    queryFn: () => api<PrintData>(`/receipts/${params.id}/print`),
    enabled: Boolean(params.id),
  })

  // เปิดหน้าต่างพิมพ์ให้อัตโนมัติเมื่อข้อมูลพร้อม
  useEffect(() => {
    if (!query.data) return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [query.data])

  if (query.isLoading) return <Spinner />
  if (!query.data) return <p className="p-8 text-center">ไม่พบบิลนี้</p>

  const { receipt: r, shop, settings: s } = query.data
  const voided = r.status === 'ยกเลิก'

  return (
    <div className="receipt-paper mx-auto max-w-[80mm] bg-white p-4 font-mono text-[12px] leading-snug text-black">
      <div className="no-print mb-4 flex justify-center gap-2">
        <button type="button" className="btn-primary" onClick={() => window.print()}>พิมพ์ใบเสร็จ</button>
        <button type="button" className="btn-ghost" onClick={() => router.replace(back)}>← กลับ</button>
      </div>

      {voided ? (
        <p className="mb-2 border-2 border-black py-1 text-center text-base font-bold">*** ยกเลิก ***</p>
      ) : null}

      <p className="text-center text-base font-bold">{shop.name}</p>
      <p className="text-center">สาขา: {shop.branchName}</p>
      {s.headerShowOnReceipt ? <p className="text-center">{s.receiptHeader}</p> : null}
      <p className="mt-1 text-center font-semibold">
        {s.receiptFormat === 'receipt' ? 'ใบเสร็จรับเงิน' : 'ใบกำกับภาษีอย่างย่อ'}
      </p>
      {shop.address1 ? <p className="text-center">{shop.address1}</p> : null}
      {shop.address2 ? <p className="text-center">{shop.address2}</p> : null}
      {shop.taxId ? <p className="text-center">เลขประจำตัวผู้เสียภาษี {shop.taxId}</p> : null}
      {shop.tel ? <p className="text-center">โทร {shop.tel}</p> : null}

      <p className="mt-2">วันที่: {receiptDate(r.soldAt, s.useBuddhistYear)}</p>
      <p>Invoice #: {r.receiptNo}</p>
      <p>POS #: {r.posDevice?.posNumber ?? '-'}   ชื่อพนักงาน: {r.cashier?.name ?? '-'}</p>
      {s.showQueueOnReceipt && r.queueNo ? <p>คิว: {r.queueNo}</p> : null}
      {r.tableNo ? <p>โต๊ะ: {r.tableNo} · {r.orderType}</p> : null}

      <p className="my-1.5 border-t border-dashed border-black" />
      <div className="flex justify-between font-semibold">
        <span>Qty {s.wordingToReplace || 'รายการ'}</span>
        <span>Total</span>
      </div>
      <p className="my-1.5 border-t border-dashed border-black" />

      {s.showDetailOnReceipt ? (
        r.items.map((item) => (
          <div key={item.id} className="mb-1">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 flex-1">{qty(item.qty)}  {item.name}</span>
              <span className="tabular-nums">{baht(item.net)}</span>
            </div>
            {Number(item.itemDiscount) > 0 ? (
              <p className="pl-5 text-[11px]">@{baht(item.unitPrice)}  ส่วนลด -{baht(item.itemDiscount)}</p>
            ) : null}
            {s.showOptionGroupOnReceipt && item.options?.length ? (
              <p className="pl-5 text-[11px]">
                {item.optionGroupNames ? `${item.optionGroupNames}: ` : ''}
                {item.options.map((o) => `${o.name} +${baht(o.price)}`).join(', ')}
              </p>
            ) : null}
            {s.showNoteOnReceipt && item.note ? <p className="pl-5 text-[11px]">* {item.note}</p> : null}
          </div>
        ))
      ) : (
        <div className="flex justify-between">
          <span>{qty(r.totalQty)} รายการ</span>
          <span className="tabular-nums">{baht(r.grandTotal)}</span>
        </div>
      )}

      <p className="my-1.5 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>รวมเป็นเงิน</span><span className="tabular-nums">{baht(r.subtotal)}</span></div>
      {Number(r.discountTotal) > 0 ? (
        <div className="flex justify-between"><span>ส่วนลด</span><span className="tabular-nums">-{baht(r.discountTotal)}</span></div>
      ) : null}
      {Number(r.serviceCharge) > 0 ? (
        <div className="flex justify-between"><span>ค่าบริการ</span><span className="tabular-nums">{baht(r.serviceCharge)}</span></div>
      ) : null}
      {s.showVatOnReceipt ? (
        <div className="flex justify-between"><span>VAT {s.vatRate}%</span><span className="tabular-nums">{baht(r.vatAmount)}</span></div>
      ) : null}
      {Number(r.rounding) !== 0 ? (
        <div className="flex justify-between"><span>ปัดเศษ</span><span className="tabular-nums">{baht(r.rounding)}</span></div>
      ) : null}

      <div className="mt-1 flex justify-between text-base font-bold">
        <span>จำนวน {qty(r.totalQty)} ชิ้น</span>
        <span className="tabular-nums">{baht(r.grandTotal)}</span>
      </div>

      <p className="my-1.5 border-t border-dashed border-black" />
      <p className="font-semibold">การชำระเงิน</p>
      {r.payments.map((p) => (
        <div key={p.id} className="flex justify-between"><span>{p.method}</span><span className="tabular-nums">{baht(p.amount)}</span></div>
      ))}
      <div className="flex justify-between"><span>เงินทอน</span><span className="tabular-nums">{baht(r.payments[0]?.change ?? 0)}</span></div>

      {r.member ? (
        <p className="mt-1">สมาชิก: {r.member.name} · คะแนน +{r.pointsEarned} · สะสม {r.member.pointsBalance}</p>
      ) : null}
      {s.showNoteOnReceipt && r.note ? <p className="mt-1">หมายเหตุ: {r.note}</p> : null}

      {s.promptpayShowOnReceipt && s.promptpayPayload ? (
        <div className="mt-3 text-center">
          <p className="text-[11px]">สแกนจ่ายด้วยพร้อมเพย์</p>
          <p className="mx-auto mt-1 break-all border border-dashed border-black p-1 text-[8px]">{s.promptpayPayload}</p>
        </div>
      ) : null}
      {s.showBarcodeOnReceipt ? (
        <p className="mt-2 text-center tracking-[0.2em]">*{r.receiptNo}*</p>
      ) : null}

      {s.footer1 ? <p className="mt-3 text-center">{s.footer1}</p> : null}
      {s.footer2 ? <p className="text-center">{s.footer2}</p> : null}
      <p className="mt-2 text-center text-[10px]">Powered by Medee POS</p>
    </div>
  )
}
