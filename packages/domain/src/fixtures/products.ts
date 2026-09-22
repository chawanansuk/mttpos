/**
 * สินค้าจริงของร้านมีดีทวีคูณที่ใช้ใน fixture วันที่ 22/09/2026 (หัวข้อ 10.8, 10.10)
 * ต้นทุนที่มีเครื่องหมาย * คำนวณย้อนจากตาราง "สินค้าขายดี 50 อันดับ" (ยอดขาย ÷ จำนวน, ต้นทุนรวม ÷ จำนวน)
 */
export interface FixtureProduct {
  key: string
  barcode: string
  name: string
  category: string
  unit: string
  price: string
  cost: string
  vatType: 'V' | 'N'
}

export const FIXTURE_PRODUCTS: FixtureProduct[] = [
  // ---- มีด ----
  { key: 'KIWI512', barcode: '8851130050388', name: 'KIWI512 มีด512', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '20.00', vatType: 'N' }, // *580/29
  { key: 'KIWI502', barcode: '8851130050340', name: 'KIWI502 มีด502', category: 'มีด', unit: 'ชิ้น', price: '40.00', cost: '26.00', vatType: 'N' }, // *598/23
  { key: 'KIWI001', barcode: '8851130050012', name: 'KIWI001 มีดคว้าน001', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '17.00', vatType: 'N' }, // *357/21
  { key: 'KIWI850P', barcode: '8851130050586', name: 'KIWI850P มีด850p', category: 'มีด', unit: 'ชิ้น', price: '200.00', cost: '140.00', vatType: 'N' },
  { key: 'KIWI511', barcode: '8851130050401', name: 'KIWI511 มีด511', category: 'มีด', unit: 'ชิ้น', price: '30.00', cost: '20.00', vatType: 'N' }, // *740/37
  { key: 'KIWI477', barcode: '8851130050289', name: 'KIWI477 มีด477', category: 'มีด', unit: 'ชิ้น', price: '50.00', cost: '37.00', vatType: 'N' }, // *1073/29
  { key: 'KIWI474', barcode: '8851130050258', name: 'KIWI474 มีด474', category: 'มีด', unit: 'ชิ้น', price: '25.00', cost: '23.00', vatType: 'N' }, // *667/29
  { key: 'KIWI195', barcode: 'KIWI195', name: 'KIWI195 มีด195', category: 'มีด', unit: 'ชิ้น', price: '50.00', cost: '33.00', vatType: 'N' },
  { key: 'KIWI21', barcode: '8851130050159', name: 'KIWI21 มีด21ไม้', category: 'มีด', unit: 'ชิ้น', price: '120.00', cost: '0.00', vatType: 'N' }, // *ต้นทุน 0 ในระบบเดิม
  { key: 'KIWI172', barcode: '8851130050074', name: 'KIWI172 มึด172', category: 'มีด', unit: 'ชิ้น', price: '90.00', cost: '30.00', vatType: 'N' },
  { key: '5CR13', barcode: '5CR13', name: '5CR13มีดผีเสื้อ', category: 'มีด', unit: 'ชิ้น', price: '180.00', cost: '120.00', vatType: 'N' },
  { key: 'maxpeeler', barcode: 'WMAXP', name: 'maxpeelerขูดส้ม', category: 'มีด', unit: 'ชิ้น', price: '40.00', cost: '10.00', vatType: 'N' }, // *180/18

  // ---- เบ็ดเตล็ด ----
  { key: 'judgas', barcode: '8857124431690', name: 'จุดแก๊สหวานmtt gas', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '13.00', vatType: 'N' }, // *481/37
  { key: 'AntChalk', barcode: 'AntChalk', name: 'ชอล์กไล่แมลงสาปมด ตราเรือกลไฟ', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '5.00', cost: '3.00', vatType: 'N' },
  { key: 'brushwood', barcode: '6852513281179', name: 'แปรงทองเหรียญ(ไม้)', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '65.00', cost: '40.00', vatType: 'N' },
  { key: 'poysian', barcode: '8851447010013', name: 'poysian ยาดมโป้ยเซียน ชิ้นเดียว', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '20.00', cost: '14.08', vatType: 'N' }, // *2562.56/182
  { key: 'elephant', barcode: '8852814000958', name: 'Elephant ลูกเหม็นแบ่ง', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '8.00', cost: '0.00', vatType: 'N' }, // *ต้นทุน 0
  { key: 'firelighter', barcode: '8985634452574', name: 'ไฟฟู่MT013/Box', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '12.00', cost: '0.00', vatType: 'N' }, // *ต้นทุน 0
  { key: 'buga', barcode: '8859233900012', name: 'Buga แก๊สเล็ก', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '20.00', cost: '17.00', vatType: 'N' }, // *272/16
  { key: 'hongthai3cc', barcode: '8859126000768', name: 'hongthai3cc', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '25.00', cost: '20.71', vatType: 'N' }, // *331.36/16
  { key: 'hongthai10g', barcode: '8859126000508', name: 'หงส์ไทย10gHongthai10g', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '40.00', cost: '30.00', vatType: 'N' }, // *4950/165
  { key: 'Hanuman5g', barcode: '18857128671624', name: 'Hanuman5g', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '160.00', cost: '108.00', vatType: 'N' }, // *5616/52
  { key: 'packHanuman', barcode: '18857128671013', name: 'packHanuman', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '140.00', cost: '97.00', vatType: 'N' }, // *4656/48
  { key: 'ExtendableMttGas', barcode: '3955028406317', name: 'ExtendableMttGas', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '15.00', cost: '10.00', vatType: 'N' }, // *390/39
  { key: 'solder', barcode: '8857124431867', name: 'solder132/1 หัวแร้งดี 132/1', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '60.00', cost: '40.00', vatType: 'N' },
  { key: 'bidetset', barcode: '8857124431751', name: 'ชุดชำระเลส304bidetset', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '180.00', cost: '130.00', vatType: 'N' },
  { key: 'bidetsl', barcode: 'MTTBIDETSL', name: 'หัวฉีดชำระสแตนเลส', category: 'เบ็ดเตล็ด', unit: 'ชิ้น', price: '100.00', cost: '70.00', vatType: 'N' },

  // ---- ปุ่มราคาสำเร็จรูป (Uncategory) ----
  { key: 'p5', barcode: '7332744591032', name: '5', category: 'Uncategory', unit: 'ชิ้น', price: '5.00', cost: '3.00', vatType: 'N' },
  { key: 'p10', barcode: '0704831504701', name: '10', category: 'Uncategory', unit: 'ชิ้น', price: '10.00', cost: '5.00', vatType: 'N' },
  { key: 'p30', barcode: '8950759424602', name: '30', category: 'Uncategory', unit: 'ชิ้น', price: '30.00', cost: '18.00', vatType: 'N' },
  { key: 'p60', barcode: '8344400730318', name: '60', category: 'Uncategory', unit: 'ชิ้น', price: '60.00', cost: '36.00', vatType: 'N' },

  // ---- กลุ่มอื่น ----
  { key: 'hook', barcode: 'MTThook', name: 'ตะขอแขวนอเนกประสงค์', category: 'ตะขอ', unit: 'ชิ้น', price: '20.00', cost: '12.00', vatType: 'N' },
  { key: 'w0617', barcode: '6931277634459', name: 'w0617 ดูดตะกั่ว', category: "Wynn's เครื่องมือ", unit: 'item', price: '60.00', cost: '40.00', vatType: 'N' },
  { key: 'w860', barcode: '6931277614659', name: 'w860 ตัดกิ่ง', category: "Wynn's ตัดกิ่ง", unit: 'item', price: '130.00', cost: '90.00', vatType: 'N' }, // *1890/21
  { key: 'sciss', barcode: 'MTTsciss8', name: 'กรรไกรอเนกประสงค์ 8 นิ้ว', category: 'กรรไกร', unit: 'ชิ้น', price: '120.00', cost: '90.18', vatType: 'N' },
  { key: 'scifB5022', barcode: '6941334113735', name: 'scifB5022 กรรไกรพับใหญ่', category: 'กรรไกร', unit: 'ชิ้น', price: '40.00', cost: '25.00', vatType: 'N' },
]

export const FIXTURE_PRODUCT_BY_KEY = new Map(FIXTURE_PRODUCTS.map((p) => [p.key, p]))
