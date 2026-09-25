/**
 * รายการสินค้าจริงของร้านมีดีทวีคูณ (หัวข้อ 10.8)
 * ราคา/ต้นทุนที่ไม่ได้ระบุตรง ๆ ในสเปก คำนวณย้อนจากตาราง "สินค้าขายดี 50 อันดับ"
 * (ราคา = ยอดขาย ÷ จำนวนที่ขาย, ต้นทุน = ต้นทุนรวม ÷ จำนวนที่ขาย) แล้วปัดให้เป็นราคาขายจริง
 *
 * ระบบจริงมี 1,341 SKU — ชุดนี้คือสินค้าที่สเปกบันทึกไว้ (ประมาณ 140 รายการ)
 * ที่เหลือนำเข้าผ่านหน้า "นำเข้ารายการสินค้า" (/product/importProduct) ด้วย CSV
 */

export interface SeedProduct {
  barcode: string
  name: string
  category: string
  unit: string
  price: string
  cost: string
  /** คงเหลือ ณ 22/09/2026 (ก่อนบันทึกธุรกรรมของวัน) */
  stock: number
  vatType?: 'V' | 'N'
  skuCode?: string
  /** ลำดับบนแท็บ "สินค้า-นิยม" (ไม่ใส่ = ไม่อยู่ในกลุ่มนิยม) */
  favoriteIndex?: number
  negotiatePrice?: boolean
  /** ยังไม่เคยมีความเคลื่อนไหว — รายงานแสดง "ยังไม่มีการเคลื่อนไหว" */
  neverMoved?: boolean
  /** ขนาดบรรจุอื่น ๆ (PLU) */
  plus?: { pluCode: string; name: string; unit: string; ratio: number; price: string; cost?: string; stock?: number }[]
  /** ราคาขายส่งสมาชิก (ช่องทาง member_wholesale) */
  memberWholesalePrice?: string
  /** ราคาขายเพิ่มเติม (step price) */
  stepPrices?: { minQty: number; price: string }[]
}

export const PRODUCTS: SeedProduct[] = [
  // ───────── ปุ่มราคาสำเร็จรูป (หน้าแรกของ POS) ─────────
  { barcode: '7332744591032', name: '5', category: 'Uncategory', unit: 'ชิ้น', price: '5.00', cost: '3.00', stock: -564, favoriteIndex: 0 },
  { barcode: '0704831504701', name: '10', category: 'Uncategory', unit: 'ชิ้น', price: '10.00', cost: '5.00', stock: -1665, favoriteIndex: 1 },
  { barcode: '5153106949180', name: '15', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '0', stock: -173, favoriteIndex: 2 },
  { barcode: '6421131697477', name: '20', category: 'Uncategory', unit: 'ชิ้น', price: '20.00', cost: '12.00', stock: -873, favoriteIndex: 3 },
  { barcode: '3523212569461', name: '25', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '25.00', cost: '15.00', stock: -209, favoriteIndex: 4 },
  { barcode: '8950759424602', name: '30', category: 'Uncategory', unit: 'ชิ้น', price: '30.00', cost: '18.00', stock: -539, favoriteIndex: 5 },
  { barcode: '6605981890289', name: '70', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '70.00', cost: '42.00', stock: -82, favoriteIndex: 6 },
  { barcode: '3477639931116', name: '40', category: 'Uncategory', unit: 'ชิ้น', price: '40.00', cost: '24.00', stock: -332, favoriteIndex: 7 },
  { barcode: '9667070139098', name: '35', category: 'Uncategory', unit: 'ชิ้น', price: '35.00', cost: '21.00', stock: -38, vatType: 'V', favoriteIndex: 8 },
  { barcode: '8344400730318', name: '60', category: 'Uncategory', unit: 'ชิ้น', price: '60.00', cost: '36.00', stock: -250, favoriteIndex: 9 },
  { barcode: '1514260818706', name: '50', category: 'Uncategory', unit: 'ชิ้น', price: '50.00', cost: '30.00', stock: -284, favoriteIndex: 10 },
  { barcode: 'MTT0000080', name: '80', category: 'Uncategory', unit: 'ชิ้น', price: '80.00', cost: '48.00', stock: -41, favoriteIndex: 11 },
  { barcode: '9835112514941', name: '90', category: 'Uncategory', unit: 'ชิ้น', price: '90.00', cost: '54.00', stock: -12, favoriteIndex: 12 },
  { barcode: '0642944661580', name: '100', category: 'Uncategory', unit: 'ชิ้น', price: '100.00', cost: '0', stock: -225, favoriteIndex: 13 },
  { barcode: '6425964734088', name: '15', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '0', stock: 0, neverMoved: true, skuCode: 'mtt15b' },

  // ───────── สินค้าขายดี (นิยม) ─────────
  { barcode: '8859126000508', name: 'หงส์ไทย10gHongthai10g', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '40.00', cost: '30.00', stock: 105, favoriteIndex: 14,
    plus: [{ pluCode: '8859126000515', name: '(ยกแพคx10) หงส์ไทย10g', unit: 'แพ็ค', ratio: 10, price: '380.00', cost: '300.00' }] },
  { barcode: '18857128671231', name: 'packหงส์ไทย5gHongthai5g', category: 'เบ็ดเตล็ด', unit: 'แพ็ค', price: '350.00', cost: '245.00', stock: 18, favoriteIndex: 15 },
  { barcode: '18857128671013', name: 'packHanuman', category: 'เบ็ดเตล็ด', unit: 'แพ็ค', price: '140.00', cost: '97.00', stock: 9, favoriteIndex: 16 },
  { barcode: '18857128671624', name: 'Hanuman5g', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '160.00', cost: '108.00', stock: 14, favoriteIndex: 17 },
  { barcode: 'dusters', name: 'dusterS ขนไก่สั้น', category: 'ทำความสะอาด', unit: 'ชิ้น', price: '80.00', cost: '42.00', stock: 23, favoriteIndex: 18 },
  { barcode: 'dusterm', name: 'dusterM ขนไก่กลาง', category: 'ทำความสะอาด', unit: 'ชิ้น', price: '120.00', cost: '70.00', stock: 16, favoriteIndex: 19 },

  { barcode: '8851447010013', name: 'poysian ยาดมโป้ยเซียน ชิ้นเดียว', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '20.00', cost: '14.08', stock: 164 },
  { barcode: '8Fstrap', name: 'สายรัด8F', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '10.00', cost: '7.00', stock: 80 },
  { barcode: '3Fstrap', name: 'สายรัด3F', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '5.00', cost: '5.00', stock: -16 },
  { barcode: '3955028406317', name: 'ExtendableMttGas', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '10.00', stock: 115 },
  { barcode: '8857124431690', name: 'จุดแก๊สหวานmtt gas', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '13.00', stock: 12 },
  { barcode: '8985634452574', name: 'ไฟฟู่MT013/Box', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '12.00', cost: '0', stock: 65 },
  { barcode: '8852814000958', name: 'Elephant ลูกเหม็นแบ่ง', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '8.00', cost: '0', stock: 46 },
  { barcode: '8850195010078', name: 'รอนสันเล็กronson', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '50.00', cost: '0', stock: -15 },
  { barcode: '8851222567114', name: 'raincoatเสื้อกันฝนชุดกันฝน', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '0', stock: 19 },
  { barcode: '8851705001104', name: 'ทวิน5บาทชิ้น', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '5.00', cost: '0', stock: -86 },
  { barcode: '8859126000768', name: 'hongthai3cc', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '30.00', cost: '20.71', stock: 135,
    stepPrices: [{ minQty: 12, price: '300.00' }] },
  { barcode: '8859233900012', name: 'Buga แก๊สเล็ก', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '20.00', cost: '17.00', stock: 53 },
  { barcode: '8859233900036', name: 'buga แก๊สเติมใหญ่กระป๋อง', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '55.00', cost: '0', stock: 16 },
  { barcode: '8851130050760', name: 'KIWIprosliceKiwi218 ขูดกีวี่แผงฟ้า', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '120.00', cost: '87.00', stock: 36 },
  { barcode: '6943913171884', name: '10343 Netto3.5m ตลับเมตร', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '40.00', cost: '33.00', stock: 10 },
  { barcode: '6943913171914', name: '10344 netto5m ตลับเมตร', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '60.00', cost: '48.00', stock: 12 },
  { barcode: 'AntChalk', name: 'ชอล์กไล่แมลงสาปมด ตราเรือกลไฟ', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '5.00', cost: '3.00', stock: 240 },
  { barcode: '6852513281179', name: 'แปรงทองเหรียญ(ไม้)', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '65.00', cost: '40.00', stock: 12 },
  { barcode: '8536276012951', name: 'แปรงทองเหรียญพลาสติก', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '55.00', cost: '35.00', stock: 12 },
  { barcode: '8857124431751', name: 'ชุดชำระเลส304bidetset', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '180.00', cost: '130.00', stock: 8 },
  { barcode: 'MTTBIDETSL', name: 'หัวฉีดชำระสแตนเลส', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '100.00', cost: '70.00', stock: 11 },
  { barcode: '8857124431867', name: 'solder132/1 หัวแร้งดี 132/1', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '60.00', cost: '40.00', stock: 14 },
  { barcode: '8887549084119', name: 'BoxpanasonicAAAดำ ไม่แผง', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '760.00', cost: '600.00', stock: 90,
    plus: [{ pluCode: '8887549084126', name: '(ยกกล่องx30) BoxpanasonicAAAดำ', unit: 'กล่อง', ratio: 30, price: '760.00', cost: '600.00' }] },
  { barcode: '1535271569826', name: 'CB300สีเงิน12นิ้ว', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '320.00', cost: '250.00', stock: 4 },
  { barcode: '6930750001184', name: 'E33l', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '350.00', cost: '270.00', stock: 3 },
  { barcode: 'handheldfan', name: 'Handheld fanพัดลมพกพา', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '280.00', cost: '200.00', stock: 6 },
  { barcode: '8859180040106', name: 'Tonpho15in1', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '480.00', cost: '360.00', stock: 2 },
  { barcode: 'W2673Q', name: 'W2673Q6.0m', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '180.00', cost: '140.00', stock: 5 },
  { barcode: '8859549001014', name: 'ariss/s', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '20.00', cost: '14.00', stock: 30 },
  { barcode: '8858737212218', name: 'bocia40/3', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '700.00', cost: '594.00', stock: 2 },
  { barcode: '8858737212225', name: 'bocia40/4', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '925.00', cost: '792.00', stock: 2 },
  { barcode: '8858737212232', name: 'bocia40/5', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '1150.00', cost: '990.00', stock: 1 },
  { barcode: '8858737211877', name: 'bocia40L', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '245.00', cost: '204.00', stock: 4 },
  { barcode: '8858737211853', name: 'bocia40s', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '230.00', cost: '198.00', stock: 5 },
  { barcode: '6955534600018', name: '616Shaver', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '180.00', cost: '130.00', stock: 0, neverMoved: true },
  { barcode: '3MLubricant', name: '3MLubricant', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '70.00', cost: '50.00', stock: 8 },
  { barcode: '733flamegun', name: '733 flamegun ปืนเป่าไฟ', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '120.00', cost: '85.00', stock: 6 },
  { barcode: 'MTThook', name: 'ตะขอแขวนอเนกประสงค์', category: 'ตะขอ', unit: 'ชิ้น', price: '20.00', cost: '12.00', stock: 58 },

  // ───────── มีด ─────────
  { barcode: '8851130050012', name: 'KIWI001 มีดคว้าน001', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '17.00', stock: 47 },
  { barcode: '8851130050074', name: 'KIWI172 มึด172', category: 'มีด', unit: 'ชิ้น', price: '90.00', cost: '30.00', stock: 85 },
  { barcode: '8851130050104', name: 'KIWI193 มีด193', category: 'มีด', unit: 'ชิ้น', price: '20.00', cost: '17.00', stock: 16 },
  { barcode: '8851130050111', name: 'KIWI194 มีด194', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '22.00', stock: 103 },
  { barcode: 'KIWI195', name: 'KIWI195 มีด195', category: 'มีด', unit: 'ชิ้น', price: '50.00', cost: '33.00', stock: 61 },
  { barcode: '8851130050159', name: 'KIWI21 มีด21ไม้', category: 'มีด', unit: 'ชิ้น', price: '120.00', cost: '0', stock: 41 },
  { barcode: '9602318627553', name: 'KIWI173 มีด173ไม้', category: 'มีด', unit: 'ชิ้น', price: '85.00', cost: '59.00', stock: 39 },
  { barcode: '8851130050258', name: 'KIWI474 มีด474', category: 'มีด', unit: 'ชิ้น', price: '25.00', cost: '23.00', stock: 42 },
  { barcode: '8851130050265', name: 'KIWI475 มีด475', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '25.00', stock: 49 },
  { barcode: '8851130050272', name: 'KIWI476 มีด476', category: 'มีด', unit: 'ชิ้น', price: '40.00', cost: '33.00', stock: 84 },
  { barcode: '8851130050289', name: 'KIWI477 มีด477', category: 'มีด', unit: 'ชิ้น', price: '50.00', cost: '37.00', stock: 86 },
  { barcode: '8851130050340', name: 'KIWI502 มีด502', category: 'มีด', unit: 'ชิ้น', price: '40.00', cost: '26.00', stock: 97 },
  { barcode: '8851130050364', name: 'KIWI503 มีด503', category: 'มีด', unit: 'ชิ้น', price: '45.00', cost: '29.00', stock: 71 },
  { barcode: '8851130050388', name: 'KIWI512 มีด512', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '20.00', stock: 89 },
  { barcode: '8851130050401', name: 'KIWI511 มีด511', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '20.00', stock: 63 },
  { barcode: '8851130050586', name: 'KIWI850P มีด850p', category: 'มีด', unit: 'ชิ้น', price: '200.00', cost: '140.00', stock: 18, memberWholesalePrice: '150.00' },
  { barcode: '6857931633437', name: 'KIWI501 มีด501', category: 'มีด', unit: 'ชิ้น', price: '35.00', cost: '26.00', stock: 61 },
  { barcode: '411BarbarianHead', name: '411BarbarianHeadSuperPeeler ปอก1คมL', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '20.00', stock: 35 },
  { barcode: '412BarbarianHead', name: '412BarbarianHeadSuperPeeler ปอก2คมL', category: 'มีด', unit: 'ชิ้น', price: '40.00', cost: '27.00', stock: 22 },
  { barcode: '118Peeler', name: '118Peeler ปอกเล็ก1คม', category: 'มีด', unit: 'ชิ้น', price: '20.00', cost: '13.00', stock: 44 },
  { barcode: 'WMAXP', name: 'maxpeelerขูดส้ม', category: 'มีด', unit: 'ชิ้น', price: '40.00', cost: '10.00', stock: 30 },
  { barcode: 'diamond414', name: 'diamond414 ขูดมะพร้าวมะละกอ ตราเพชร', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '15.00', stock: 84 },
  { barcode: '5CR13', name: '5CR13มีดผีเสื้อ', category: 'มีด', unit: 'ชิ้น', price: '180.00', cost: '120.00', stock: 12 },
  { barcode: '5537c', name: '5537c เลื่อยโค้งsolo', category: 'มีด', unit: 'ชิ้น', price: '360.00', cost: '280.00', stock: 3 },
  { barcode: '777118', name: '777/118', category: 'มีด', unit: 'ชิ้น', price: '260.00', cost: '200.00', stock: 4 },

  // ───────── มีดสิงโตถูก ─────────
  { barcode: '6975092650065', name: 'rimeiknife5188 coverknife', category: 'มีดสิงโตถูก', unit: 'ชิ้น', price: '20.00', cost: '15.00', stock: 67 },
  { barcode: '6975092650058', name: 'rimeiknife5187 foldingknife', category: 'มีดสิงโตถูก', unit: 'ชิ้น', price: '20.00', cost: '15.00', stock: 80 },

  // ───────── เทป/กาว ─────────
  { barcode: '5754085816880', name: 'Tapeสีแบบหนาคละสีxแถว', category: 'เทป/กาว', unit: 'ชิ้น', price: '30.00', cost: '0', stock: 10 },
  { barcode: '8888299751184', name: 'AltecoGlue กาวช้าง', category: 'เทป/กาว', unit: 'ชิ้น', price: '20.00', cost: '15.00', stock: 10 },
  { barcode: '9289552877194', name: 'NUVOtape เทป45หลา', category: 'เทป/กาว', unit: 'ชิ้น', price: '20.00', cost: '0', stock: 89 },
  { barcode: '2882194926603', name: 'Nuvotape 100หลา หนา', category: 'เทป/กาว', unit: 'ชิ้น', price: '30.00', cost: '1.33', stock: 61 },
  { barcode: '8859705411572', name: '13155 ปืนยิงกาวฟักทอง ptthg50', category: 'เทป/กาว', unit: 'ชิ้น', price: '150.00', cost: '0', stock: 1 },
  { barcode: 'Louistape', name: 'Louistape เทปพันสายไฟ', category: 'เทป/กาว', unit: 'ชิ้น', price: '10.00', cost: '7.00', stock: 0,
    plus: [{ pluCode: '9990448157723', name: '(ยกแพคx10) Louistape เทปพันสายไฟ', unit: 'แพ็ค', ratio: 10, price: '95.00', cost: '70.00' }] },

  // ───────── กรรไกร ─────────
  { barcode: '6941334113735', name: 'scifB5022 กรรไกรพับใหญ่', category: 'กรรไกร', unit: 'ชิ้น', price: '40.00', cost: '25.00', stock: 26 },
  { barcode: 'MTTsciss8', name: 'กรรไกรอเนกประสงค์ 8 นิ้ว', category: 'กรรไกร', unit: 'ชิ้น', price: '120.00', cost: '90.18', stock: 14 },

  // ───────── กุญแจ ─────────
  { barcode: '8852198112094', name: 'solo40/10', category: 'กุญแจ', unit: 'item', price: '3080.00', cost: '2640.00', stock: 2 },
  { barcode: 'HENGiron25', name: '362 HENGiron 25mm ดำ', category: 'กุญแจ', unit: 'ชิ้น', price: '140.00', cost: '105.00', stock: 24,
    plus: [{ pluCode: 'PLU0733832512', name: '362 ยกกล่อง HENGiron 25mm ดำ', unit: 'กล่อง', ratio: 12, price: '1560.00', cost: '1260.00' }] },
  { barcode: 'HENGiron32', name: '363 HENGiron 32mm ดำ', category: 'กุญแจ', unit: 'ชิ้น', price: '160.00', cost: '120.00', stock: 18,
    plus: [{ pluCode: 'PLU0733832524', name: '363 ยกกล่อง HENGiron 32mm ดำ', unit: 'กล่อง', ratio: 12, price: '1800.00', cost: '1440.00' }] },
  { barcode: 'HENGiron32L', name: '363L HENGiron 32mm ยาว', category: 'กุญแจ', unit: 'ชิ้น', price: '170.00', cost: '128.00', stock: 9 },
  { barcode: 'HENGiron38', name: '364 HENGiron 38mm ดำ', category: 'กุญแจ', unit: 'ชิ้น', price: '200.00', cost: '150.00', stock: -1,
    plus: [{ pluCode: 'PLU0733832536', name: '364 ยกกล่อง HENGiron 38mm ดำ', unit: 'กล่อง', ratio: 12, price: '2280.00', cost: '1800.00' }] },
  { barcode: 'HENGiron38L', name: '364L HENGiron 38mm ยาว', category: 'กุญแจ', unit: 'ชิ้น', price: '190.00', cost: '143.00', stock: 7 },
  { barcode: 'HENGiron50', name: '365 HENGiron 50mm ดำ', category: 'กุญแจ', unit: 'ชิ้น', price: '280.00', cost: '210.00', stock: 5 },
  { barcode: 'HENGiron50L', name: '365L HENGiron 50mm ยาว', category: 'กุญแจ', unit: 'ชิ้น', price: '300.00', cost: '225.00', stock: 4, vatType: 'V' },

  // ───────── Wynn's เครื่องมือ ─────────
  { barcode: '6931277603073', name: '0169a ถอดกรอง', category: "Wynn's เครื่องมือ", unit: 'item', price: '180.00', cost: '140.00', stock: 7, skuCode: 'w0169a', memberWholesalePrice: '140.00' },
  { barcode: '+crosswrench14', name: '+crosswrench14 กากบาทเงาสั้น14นิ้ว', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '170.00', cost: '130.00', stock: 1 },
  { barcode: '+crosswrench18', name: '+crosswrench18 กากบาทเงายาว18นิ้ว', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '200.00', cost: '150.00', stock: 2 },
  { barcode: '+foldcrosswrench', name: '+foldcrosswrench กากบาทพับ', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '200.00', cost: '150.00', stock: 2 },
  { barcode: '8857124431942', name: '+goldcrosswrench กากบาททอง', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '155.00', cost: '120.00', stock: 1 },
  { barcode: '+socketcrosswrench', name: '+socketcrosswrench กากบาทบล็อค', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '170.00', cost: '130.00', stock: 2 },
  { barcode: '10-32matte', name: '10-32 แหวนข้าง10-32ด้าน', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '660.00', cost: '550.00', stock: 1 },
  { barcode: '6-32matte', name: '6-32 แหวน6-32ด้าน', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '600.00', cost: '500.00', stock: 0 },
  { barcode: '10796', name: '10796 เลื่อยลังดำ', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '170.00', cost: '125.00', stock: 3 },
  { barcode: '8856273005684', name: '13101 ใบคัตเตอร์ฟักทอง pumpkin blade', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '40.00', cost: '0', stock: 4 },
  { barcode: '6943913196030', name: '196030 PumpkinSaw เลื่อยฟักทอง ptt6042', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '130.00', cost: '90.00', stock: 15 },
  { barcode: '2lb', name: '2lb ค้อน2ปอนด์', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '140.00', cost: '100.00', stock: 6 },
  { barcode: '4lb', name: '4lb ค้อน4ปอนด์', category: "Wynn's เครื่องมือ", unit: 'ชิ้น', price: '260.00', cost: '195.00', stock: 4 },
  { barcode: '6931277643550', name: 'w4355 วัดลมกลม', category: "Wynn's เครื่องมือ", unit: 'item', price: '150.00', cost: '110.00', stock: 4 },
  { barcode: '6931277603301', name: 'WNS105C คีมมินิปากจิ้งจกอเนกประสงค์', category: "Wynn's เครื่องมือ", unit: 'item', price: '130.00', cost: '95.00', stock: -3 },
  { barcode: '6931277634459', name: 'w0617 ดูดตะกั่ว', category: "Wynn's เครื่องมือ", unit: 'item', price: '60.00', cost: '40.00', stock: 24 },
  { barcode: '6931277622425', name: 'w0490b ตะไบชุด', category: "Wynn's เครื่องมือ", unit: 'item', price: '120.00', cost: '88.00', stock: 9 },
  { barcode: '6931277622319', name: 'w0086bb ตะไบท้องปลิง 8นิ้ว', category: "Wynn's เครื่องมือ", unit: 'item', price: '95.00', cost: '70.00', stock: 6 },
  { barcode: '6931277618893', name: 'w0226 ลองไฟ', category: "Wynn's เครื่องมือ", unit: 'item', price: '45.00', cost: '30.00', stock: 15 },
  { barcode: '6931277625266', name: 'w00200 คีม 6นิ้ว แหลม เทา', category: "Wynn's เครื่องมือ", unit: 'item', price: '110.00', cost: '80.00', stock: 8 },
  { barcode: '6931277600683', name: 'w608p คีม 8นิ้ว เฉียง', category: "Wynn's เครื่องมือ", unit: 'item', price: '130.00', cost: '95.00', stock: 7 },
  { barcode: '6931277634381', name: 'ac208 คีม 8นิ้ว จจ. ถูก', category: "Wynn's เครื่องมือ", unit: 'item', price: '90.00', cost: '65.00', stock: 11 },
  { barcode: '6931277614475', name: 'ws708b ตัดเคเบิ้ล 8นิ้ว', category: "Wynn's เครื่องมือ", unit: 'item', price: '150.00', cost: '110.00', stock: 5 },
  { barcode: '6931277621176', name: 'w0300a หัวแร้ง 30 w', category: "Wynn's เครื่องมือ", unit: 'item', price: '140.00', cost: '100.00', stock: 6 },
  { barcode: '6931277603547', name: 'w0302 คีมย้ำโครงซีลาย', category: "Wynn's เครื่องมือ", unit: 'item', price: '180.00', cost: '135.00', stock: 3 },
  { barcode: '6931277627505', name: 'w0441 ต๊าปเกียวเล็ก', category: "Wynn's เครื่องมือ", unit: 'item', price: '120.00', cost: '88.00', stock: 4 },
  { barcode: '6931277627512', name: 'w0442 ต๊าปเกียวใหญ่', category: "Wynn's เครื่องมือ", unit: 'item', price: '150.00', cost: '110.00', stock: 4 },
  { barcode: '6931277612778', name: 'w0476b ลูกดิ่ง 300g', category: "Wynn's เครื่องมือ", unit: 'item', price: '170.00', cost: '125.00', stock: 3 },
  { barcode: '6931277612747', name: 'w0235 ลูกดิ่งแม่เหล็ก 300g', category: "Wynn's เครื่องมือ", unit: 'item', price: '190.00', cost: '140.00', stock: 2 },
  { barcode: '6931277630758', name: 'w3074b ตัดกระจก', category: "Wynn's เครื่องมือ", unit: 'item', price: '85.00', cost: '60.00', stock: 7 },

  // ───────── Wynn's คัตเตอร์ ─────────
  { barcode: '6931277649323', name: 'w602b คัตเตอร์', category: "Wynn's คัตเตอร์", unit: 'item', price: '20.00', cost: '25.00', stock: 56 },
  { barcode: '6931277616561', name: 'w0258 คัตเตอร์', category: "Wynn's คัตเตอร์", unit: 'item', price: '35.00', cost: '25.00', stock: 29 },
  { barcode: '6931277648760', name: 'w604 คัตเตอร์', category: "Wynn's คัตเตอร์", unit: 'item', price: '25.00', cost: '18.00', stock: 33 },
  { barcode: '6931277645004', name: 'w06500 คัตเตอร์', category: "Wynn's คัตเตอร์", unit: 'item', price: '45.00', cost: '32.00', stock: 12 },
  { barcode: '6931277630789', name: 'w3078 มีดพับSL', category: "Wynn's คัตเตอร์", unit: 'item', price: '70.00', cost: '50.00', stock: 2 },
  { barcode: '6931277627727', name: 'ws90 มีดพับไม้', category: "Wynn's คัตเตอร์", unit: 'item', price: '90.00', cost: '65.00', stock: 6 },

  // ───────── Wynn's ไขควง ─────────
  { barcode: '6931277609976', name: 'w0174a หกเหลี่ยมพับใหญ่', category: "Wynn's ไขควง", unit: 'item', price: '120.00', cost: '88.00', stock: 2 },
  { barcode: '6931277610019', name: 'w0199a 6เหลี่ยม', category: "Wynn's ไขควง", unit: 'item', price: '95.00', cost: '70.00', stock: 5 },
  { barcode: '6931277610057', name: 'w0439a 6เหลี่ยมทองแดง', category: "Wynn's ไขควง", unit: 'item', price: '110.00', cost: '80.00', stock: 3 },

  // ───────── Wynn's ตัดกิ่ง ─────────
  { barcode: '6931277614659', name: 'w860 ตัดกิ่ง', category: "Wynn's ตัดกิ่ง", unit: 'item', price: '130.00', cost: '90.00', stock: 11 },
  { barcode: '6931277614642', name: 'w103 ตัดกิ่ง', category: "Wynn's ตัดกิ่ง", unit: 'item', price: '130.00', cost: '120.00', stock: 13 },
  { barcode: '6931277614918', name: 'w0279 ตัดกิ่ง0279', category: "Wynn's ตัดกิ่ง", unit: 'item', price: '70.00', cost: '50.00', stock: 22 },

  // ───────── Uncategory (ของที่ยังไม่จัดกลุ่ม) ─────────
  { barcode: '8809029399643', name: '211/777แบบแผง', category: 'Uncategory', unit: 'ชิ้น', price: '80.00', cost: '55.00', stock: 9 },
]

/** ตัวอย่างรายการสินค้าที่ข้อมูลเสียในระบบเดิม (ไม่มีชื่อ) — ใช้ทดสอบรายงาน "สินค้าที่ไม่มีการขาย" */
export const BROKEN_PRODUCT_BARCODES = ['8854531014249', '8857124431300']
