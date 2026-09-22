/**
 * สร้างตารางและใส่ข้อมูลตั้งต้นระหว่างขั้นตอน build ของ Vercel
 *
 * เครื่องที่รัน agent ต่อ Postgres ออกภายนอกไม่ได้ (เปิดเฉพาะพอร์ต 443)
 * แต่ build machine ของ Vercel ต่อได้ จึงยืมขั้นตอน build มาทำงานนี้แทน
 * ทำงานเฉพาะเมื่อตั้ง SEED_DATABASE=yes-wipe-and-seed เท่านั้น
 *
 * ⚠️ ล้างข้อมูลเดิมทั้งหมด — ต้องลบตัวแปรนี้ออกทันทีที่ seed เสร็จ
 *    มิฉะนั้น deploy ครั้งต่อไปจะล้างข้อมูลจริงของร้านทิ้ง
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const CONFIRM = 'yes-wipe-and-seed'
const dbDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'db')

if (process.env.SEED_DATABASE !== CONFIRM) {
  console.log('• ข้าม bootstrap ฐานข้อมูล (ไม่ได้ตั้ง SEED_DATABASE)')
  process.exit(0)
}

/**
 * pooler แบบ transaction (Supabase พอร์ต 6543, PgBouncer) ใช้กับ DDL และ seed ไม่ได้
 * เพราะ Prisma ต้องใช้ prepared statement และ advisory lock
 * ตอน build จึงต้องต่อผ่าน DIRECT_DATABASE_URL (session pooler / ต่อตรง พอร์ต 5432)
 */
const directUrl = process.env.DIRECT_DATABASE_URL
if (!directUrl) {
  console.error('✗ ต้องตั้ง DIRECT_DATABASE_URL (การต่อแบบ session/ตรง) ก่อนจึงจะ seed ได้')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: directUrl }

function run(label, command, args) {
  console.log(`\n▶ ${label}`)
  const result = spawnSync(command, args, { cwd: dbDir, env, stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    console.error(`✗ ${label} ไม่สำเร็จ (exit ${result.status})`)
    process.exit(result.status ?? 1)
  }
}

run('สร้าง/ปรับตารางตาม schema', 'pnpm', ['exec', 'prisma', 'db', 'push', '--force-reset', '--accept-data-loss', '--skip-generate'])
run('ใส่ข้อมูลตั้งต้นของร้าน', 'pnpm', ['exec', 'tsx', 'seed/index.ts'])

console.log('\n✅ bootstrap ฐานข้อมูลเสร็จแล้ว — อย่าลืมลบ SEED_DATABASE ออกจาก environment variables')
