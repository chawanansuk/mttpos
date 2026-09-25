/**
 * Acceptance checklist — หัวข้อ 12 ของสเปก
 * รันด้วย `node scripts/acceptance.mjs` โดยต้องเปิด API (พอร์ต 4000) และ seed ข้อมูลแล้ว
 */
const API = process.env.API_BASE ?? 'http://localhost:4000/api/v1'
const OWNER = { email: 'medeetaweekoon.official@gmail.com', password: 'Medee@2026' }
const MANAGER = { email: 'medeesystem1@gmail.com', password: 'Medee@2026' }

let passed = 0
let failed = 0
const results = []

function check(name, ok, detail = '') {
  if (ok) passed += 1
  else failed += 1
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
  return ok
}

async function call(path, { token, branchId, method = 'GET', body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (branchId) headers['X-Branch-Id'] = branchId
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

async function login(creds) {
  const res = await call('/auth/login', { method: 'POST', body: creds })
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.data)}`)
  return { token: res.data.accessToken, branchId: res.data.branches[0].id, account: res.data.account }
}

const money = (v) => Number(v ?? 0).toFixed(2)

console.log('\n═══ Medee POS — Acceptance checklist (หัวข้อ 12) ═══')
console.log('หมายเหตุ: สคริปต์สร้างบิลทดสอบจริง 1 ใบแล้วยกเลิก — ให้รัน `pnpm db:seed` ก่อนทุกครั้ง\n')

// ── 1. ล็อกอิน + สิทธิ์ ──
console.log('1. สิทธิ์การเข้าถึง')
const owner = await login(OWNER)
const manager = await login(MANAGER)
const auth = { token: owner.token, branchId: owner.branchId }
const mgr = { token: manager.token, branchId: owner.branchId }

check('owner เห็นเมนูครบ', (await call('/branches/' + owner.branchId + '/permissions', auth)).data.isOwner === true)
check('medeesystem1 เข้ารายงานสรุปได้', (await call('/reports/dashboard', mgr)).status === 200)
check('medeesystem1 เข้าหน้าสินค้าไม่ได้ (403)', (await call('/products', mgr)).status === 403)
check('medeesystem1 เข้าหน้าสมาชิกไม่ได้ (403)', (await call('/members', mgr)).status === 403)
check('medeesystem1 แก้ไขรับสินค้าเข้าได้', (await call('/stock-docs/receive', mgr)).status === 200)
{
  // บั๊กต้นฉบับ: path ที่มี "/" ต่อท้ายต้องไม่ถูกล็อกผิด
  const a = await call('/products?limit=1', auth)
  const b = await call('/products/?limit=1', auth)
  check('เปิด URL ที่มี "/" ต่อท้ายไม่ถูกล็อกผิด', a.status === 200 && b.status === 200, `${a.status} / ${b.status}`)
}

// ── 13. สูตรคำนวณ + fixture 22/09/2026 ──
console.log('\n13. ตัวเลขรายงานของวันที่ 22/09/2026')
{
  const r = await call('/reports/dashboard?from=2026-09-22&to=2026-09-22', auth)
  const d = r.data
  check('ยอดขายทั้งวัน 5,155.00', money(d.cards.sales) === '5155.00', money(d.cards.sales))
  check('ส่วนลด 305.00', money(d.cards.discount) === '305.00', money(d.cards.discount))
  check('ยกเลิก 1 บิล มูลค่า 195.00', d.bills.voidCount === 1 && money(d.bills.voidAmount) === '195.00',
    `${d.bills.voidCount} บิล / ${money(d.bills.voidAmount)}`)
  check('รวมก่อนลด 5,460.00', money(d.summary.subtotal) === '5460.00', money(d.summary.subtotal))
  check('สินค้าไม่มีภาษี = ยอดขาย (ร้าน VAT 0)', money(d.summary.nonVatableAmount) === money(d.cards.sales))
}
{
  // ชุด 21 บิลแรกตามสเปก
  const r = await call('/receipts?from=2026-09-22&to=2026-09-22&limit=100', auth)
  const first21 = r.data.data.filter((x) => x.receiptNo <= 'PS002006901')
  const valid = first21.filter((x) => x.status === 'ปกติ')
  const sales = valid.reduce((a, x) => a + Number(x.grandTotal), 0)
  const profit = valid.reduce((a, x) => a + Number(x.profit), 0)
  const discount = valid.reduce((a, x) => a + Number(x.discountTotal), 0)
  const subtotal = valid.reduce((a, x) => a + Number(x.subtotal), 0)
  check('21 บิลแรก: 20 บิลปกติ', valid.length === 20, String(valid.length))
  check('21 บิลแรก: ยอดขาย 4,755.00', sales.toFixed(2) === '4755.00', sales.toFixed(2))
  check('21 บิลแรก: กำไร 1,625.02', profit.toFixed(2) === '1625.02', profit.toFixed(2))
  check('21 บิลแรก: ส่วนลด 305.00', discount.toFixed(2) === '305.00', discount.toFixed(2))
  check('21 บิลแรก: รวมก่อนลด 5,060.00', subtotal.toFixed(2) === '5060.00', subtotal.toFixed(2))
  check('21 บิลแรก: เฉลี่ย/บิล 237.75', (sales / valid.length).toFixed(2) === '237.75')
}
{
  const r = await call('/reports/by-category?from=2026-09-22&to=2026-09-22', auth)
  const knife = r.data.data.find((x) => x.categoryName === 'มีด')
  check('กลุ่ม "มีด" ทั้งวัน 40 ชิ้น 2,110.00', Number(knife.qty) === 40 && money(knife.sales) === '2110.00',
    `${knife.qty} / ${money(knife.sales)}`)
}

// ── 2. บิลตัวอย่าง PS002006889 ──
console.log('\n2. บิลตัวอย่าง PS002006889 (หัวข้อ 6.3)')
{
  const list = await call('/receipts?from=2026-09-22&to=2026-09-22&search=PS002006889', auth)
  const row = list.data.data[0]
  const full = await call(`/receipts/${row.id}`, auth)
  const r = full.data
  check('รวมก่อนลด 970.00', money(r.subtotal) === '970.00', money(r.subtotal))
  check('ส่วนลดรายการ 290.00', money(r.itemDiscountTotal) === '290.00', money(r.itemDiscountTotal))
  check('ยอดขาย 680.00', money(r.grandTotal) === '680.00', money(r.grandTotal))
  check('จำนวน 19 ชิ้น', Number(r.totalQty) === 19, r.totalQty)
  check('มี 4 รายการตามสเปก', r.items.length === 4)
  check('ยอดสุทธิรายบรรทัด 120/160/100/300',
    r.items.map((i) => money(i.net)).join('/') === '120.00/160.00/100.00/300.00',
    r.items.map((i) => money(i.net)).join('/'))
  check('ชำระเงินสด 680.00', r.payments[0]?.method === 'เงินสด' && money(r.payments[0].amount) === '680.00')
  const print = await call(`/receipts/${row.id}/print`, auth)
  check('ดึงข้อมูลพิมพ์ใบเสร็จได้', print.status === 200 && print.data.shop.name === 'ร้านมีดีทวีคูณ')
}

// ── 3. ยกเลิกบิล ──
console.log('\n3. ยกเลิกการขาย')
{
  const r = await call('/reports/voids?from=2026-09-22&to=2026-09-22', auth)
  const row = r.data.data[0]
  check('รายงานยกเลิก 22/09: 1 บิล 195.00', Number(row.billCount) === 1 && money(row.sales) === '195.00',
    `${row.billCount} บิล / ${money(row.sales)}`)
  const detail = await call('/reports/voids/2026-09-22', auth)
  const seeded = detail.data.filter((x) => x.receiptNo === 'PS002006885')
  check('ขยายดูรายการบิลที่ยกเลิกได้', seeded.length === 2, `${seeded.length} รายการของ PS002006885`)
  check('บันทึกผู้ยกเลิกและเหตุผล', Boolean(seeded[0]?.voidedBy && seeded[0]?.voidReason))
}

// ── 4. ปิดรอบการขาย ──
console.log('\n4. ปิดรอบการขาย')
{
  const r = await call('/cash-rounds?from=2026-08-23&to=2026-09-22&limit=100', auth)
  const closed = r.data.data.filter((x) => x.status === 'closed')
  const sample = closed[0]
  const expected = (
    Number(sample.openingCash) + Number(sample.cashSales) + Number(sample.cashIn) - Number(sample.cashOut)
  ).toFixed(2)
  check('expected = เงินทอนเริ่มต้น + ขายเงินสด + เข้า − ออก', money(sample.expectedCash) === expected,
    `${money(sample.expectedCash)} vs ${expected}`)
  check('ส่วนต่างคำนวณถูก', money(sample.difference) === (Number(sample.countedCash) - Number(sample.expectedCash)).toFixed(2))
  check('รอบที่ยังไม่ปิดแสดง "-"', r.data.data.some((x) => x.status === 'open' && x.countedCash === null))
  check('รายงานมีครบ 12 คอลัมน์', ['openedAt','posNumber','roundNo','closedAt','openedByName','cashSales','openingCash','cashIn','cashOut','countedCash','expectedCash','difference'].every((k) => k in sample))
}

// ── 5. รายงานทั้งหมด ──
console.log('\n5. รายงานทุกหน้า')
{
  const list = await call('/reports', auth)
  const keys = list.data.map((r) => r.key)
  check(`มีรายงาน ${keys.length} หน้า`, keys.length >= 22, keys.length + ' หน้า')
  let ok = 0
  const broken = []
  for (const key of keys) {
    const r = await call(`/reports/${key}?from=2026-08-23&to=2026-09-22&limit=5`, auth)
    if (r.status === 200 && Array.isArray(r.data.data)) ok += 1
    else broken.push(`${key}(${r.status})`)
  }
  check('ทุกรายงานเปิดได้', broken.length === 0, broken.length ? broken.join(', ') : `${ok}/${keys.length}`)

  const xlsx = await fetch(`${API}/reports/daily?from=2026-09-22&to=2026-09-22&export=xlsx`, {
    headers: { Authorization: `Bearer ${owner.token}`, 'X-Branch-Id': owner.branchId },
  })
  const buf = Buffer.from(await xlsx.arrayBuffer())
  check('ส่งออก xlsx ได้', xlsx.status === 200 && buf.subarray(0, 2).toString() === 'PK', `${buf.length} bytes`)
}

// ── 6. สินค้า / PLU / step price / ราคาสมาชิก ──
console.log('\n6. สินค้า')
{
  const search = await call('/products?search=0169a&limit=5', auth)
  const product = search.data.data[0]
  const detail = await call(`/products/${product.id}`, auth)
  check('0169a ถอดกรอง ราคา 180', money(detail.data.price) === '180.00')
  const wholesale = detail.data.channelPrices.find((c) => c.channel === 'member_wholesale')
  check('ราคาขายส่งสมาชิก 140', wholesale && money(wholesale.price) === '140.00', money(wholesale?.price))

  const packSearch = await call('/products?search=Louistape&limit=5', auth)
  const pack = await call(`/products/${packSearch.data.data[0].id}`, auth)
  const bulk = pack.data.plus.find((p) => !p.isDefault)
  check('PLU ยกแพ็คมี ratio 10', bulk && Number(bulk.skuRatio) === 10, bulk?.skuRatio)

  const step = await call('/products?search=hongthai3cc&limit=5', auth)
  const stepDetail = await call(`/products/${step.data.data[0].id}`, auth)
  check('hongthai3cc มี step price 12 ชิ้น 300', stepDetail.data.stepPrices.some((s) => Number(s.minQty) === 12 && money(s.price) === '300.00'))
}

// ── 7. คลังสินค้า ──
console.log('\n7. คลังสินค้า')
{
  const sku = await call('/stock/balance?by=sku&limit=500', auth)
  const find = (code) => sku.data.data.find((r) => r.barcode === code)
  check('0169a ถอดกรอง คงเหลือ 7', Number(find('6931277603073')?.balance) === 7, find('6931277603073')?.balance)
  check('solo40/10 คงเหลือ 2', Number(find('8852198112094')?.balance) === 2)
  check('สินค้า "10" คงเหลือ -1,665 (อนุญาตติดลบ)', Number(find('0704831504701')?.balance) === -1665)

  const out = await call('/stock/balance?by=sku&filter=out&limit=500', auth)
  check('รายงานสินค้าหมดมีรายการติดลบ', out.data.data.length > 0 && out.data.data.every((r) => Number(r.balance) <= 0),
    `${out.data.total} รายการ`)

  const never = await call('/stock/balance?by=sku&filter=never&limit=50', auth)
  check('มีสินค้า "ยังไม่มีการเคลื่อนไหว"', never.data.data.length > 0, `${never.data.total} รายการ`)

  const prod = await call('/products?search=6931277603073&limit=1', auth)
  const card = await call(`/stock/movements/${prod.data.data[0].id}`, auth)
  const chronological = [...card.data.data].reverse()
  let running = 0
  let walkOk = true
  for (const m of chronological) {
    running += Number(m.qty)
    if (Math.abs(running - Number(m.balanceAfter)) > 0.001) walkOk = false
  }
  check('บัตรสินค้าเดินยอดคงเหลือถูกต้อง', walkOk && running === 7, `ยอดสุดท้าย ${running}`)

  const docs = await call('/stock-docs/receive?limit=5', auth)
  check('มีเอกสารรับเข้า RCV0000756', docs.data.data.some((d) => d.docNo === 'RCV0000756'))
}

// ── 8. ขายผ่าน API + idempotency + ตัดสต็อก ──
console.log('\n8. ขายสินค้าและซิงค์ (idempotency)')
{
  const devices = await call(`/branches/${owner.branchId}/pos-devices`, auth)
  const device = devices.data.find((d) => d.posNumber === '001')
  const cashiers = await call(`/branches/${owner.branchId}/cashiers`, auth)
  const cashier = cashiers.data.find((c) => c.name === 'cashier1')
  const products = await call('/products?search=KIWI512&limit=1', auth)
  const product = products.data.data[0]

  const before = await call('/stock/balance?by=sku&search=8851130050388', auth)
  const beforeQty = Number(before.data.data[0].balance)

  const clientId = `acceptance-${Date.now()}`
  const payload = {
    clientId,
    posDeviceId: device.id,
    cashierId: cashier.id,
    items: [{ productId: product.id, qty: 3, unitPrice: '30.00', itemDiscount: '10.00' }],
    payments: [{ method: 'เงินสด', amount: '80.00', received: '100.00' }],
  }
  const first = await call('/receipts', { ...auth, method: 'POST', body: payload })
  check('สร้างบิลได้ (201)', first.status === 201, `${first.status} ${first.data?.receiptNo ?? JSON.stringify(first.data).slice(0,120)}`)
  check('ยอดสุทธิ 80.00 (90 − 10)', money(first.data.grandTotal) === '80.00', money(first.data.grandTotal))
  check('เงินทอน 20.00', money(first.data.change) === '20.00', money(first.data.change))
  check('เลขบิลรูปแบบ PS001xxxxxx', /^PS001\d{6}$/.test(first.data.receiptNo), first.data.receiptNo)

  const again = await call('/receipts', { ...auth, method: 'POST', body: payload })
  check('ส่งซ้ำด้วย clientId เดิมไม่สร้างบิลซ้ำ', again.data.receiptNo === first.data.receiptNo && again.data.duplicated === true)

  const after = await call('/stock/balance?by=sku&search=8851130050388', auth)
  check('ตัดสต็อก 3 ชิ้น', Number(after.data.data[0].balance) === beforeQty - 3,
    `${beforeQty} → ${after.data.data[0].balance}`)

  const voided = await call(`/receipts/${first.data.id}/void`, { ...auth, method: 'POST', body: { reason: 'ทดสอบ acceptance' } })
  check('ยกเลิกบิลได้', voided.status === 200 && voided.data.status === 'ยกเลิก')
  const restored = await call('/stock/balance?by=sku&search=8851130050388', auth)
  check('ยกเลิกแล้วคืนสต็อก', Number(restored.data.data[0].balance) === beforeQty,
    `กลับเป็น ${restored.data.data[0].balance}`)
  const twice = await call(`/receipts/${first.data.id}/void`, { ...auth, method: 'POST', body: { reason: 'ซ้ำ' } })
  check('ยกเลิกซ้ำถูกปฏิเสธ (409)', twice.status === 409)
}

// ── 11. สมาชิก ──
console.log('\n11. สมาชิก')
{
  const members = await call('/members?search=vip', auth)
  const vip = members.data.data[0]
  check('มีสมาชิก vip p', vip?.name === 'vip p')
  check('ใช้จ่ายสะสม 73,924.00', money(vip.totalSpent) === '73924.00', money(vip.totalSpent))
  const summary = await call(`/members/${vip.id}/summary`, auth)
  check('หน้าสรุปสมาชิกมีสินค้าที่ซื้อบ่อย/การซื้อล่าสุด',
    Array.isArray(summary.data.frequentProducts) && Array.isArray(summary.data.recentReceipts))
  check('มีบันทึกของร้านค้า', summary.data.notes.length > 0)
}

// ── PromptPay QR ──
console.log('\nเพิ่มเติม: PromptPay QR')
{
  const qr = await call('/payments/promptpay-qr?amount=680.00', auth)
  check('สร้าง payload พร้อมเพย์ได้', qr.status === 200 && qr.data.payload.startsWith('000201010212'),
    qr.data?.payload?.slice(0, 24))
  check('payload มียอดเงิน 680.00', qr.data.payload.includes('5406680.00'))
}

console.log(`\n═══ ผลรวม: ผ่าน ${passed} / ${passed + failed} ═══`)
if (failed > 0) {
  console.log('\nรายการที่ไม่ผ่าน:')
  for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ ${r.name} — ${r.detail}`)
  process.exit(1)
}
