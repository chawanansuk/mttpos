import type { Config } from 'tailwindcss'

/** สีและโทนตามหัวข้อ 6.0 ของสเปก */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2EB88A', // เขียวหลัก — ปุ่ม/active
          50: '#E8F8F2', 100: '#C7EEE1', 200: '#95E0C7', 300: '#63D1AD',
          400: '#3FC59A', 500: '#2EB88A', 600: '#249472', 700: '#1B7058',
          800: '#134C3D', 900: '#0A2822',
        },
        warn: '#F5A623',   // เหลือง — สร้างเอกสาร
        info: '#3B8BEB',   // ฟ้า — ส่งออกไฟล์
        danger: '#F44336', // แดง — ลบ/ยกเลิก
        canvas: '#F3F4F7',
      },
      fontFamily: {
        sans: ['var(--font-thai)', 'Sarabun', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '8px' },
      boxShadow: { card: '0 1px 3px rgba(16, 24, 40, 0.08)' },
    },
  },
  plugins: [],
}
export default config
