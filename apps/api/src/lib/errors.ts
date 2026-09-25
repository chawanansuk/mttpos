/** ข้อผิดพลาดที่มีรหัสสถานะ HTTP และข้อความภาษาไทยสำหรับแสดงบน UI */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, 'BAD_REQUEST', details)

export const unauthorized = (message = 'กรุณาเข้าสู่ระบบอีกครั้ง') =>
  new ApiError(401, message, 'UNAUTHORIZED')

/** หน้า "ไม่สามารถเข้าถึงข้อมูลนี้ได้ / Can't access this information." */
export const forbidden = (message = 'ไม่สามารถเข้าถึงข้อมูลนี้ได้') =>
  new ApiError(403, message, 'FORBIDDEN')

/** ฟีเจอร์ที่ถูกล็อกตามแพ็กเกจ — UI แสดงหน้าโปรโมทแทนหน้า 403 */
export const featureLocked = (message = 'ฟีเจอร์นี้ยังไม่เปิดใช้งานสำหรับร้านของคุณ') =>
  new ApiError(403, message, 'FEATURE_LOCKED')

export const notFound = (message = 'ไม่พบข้อมูลที่ต้องการ') =>
  new ApiError(404, message, 'NOT_FOUND')

export const conflict = (message: string) => new ApiError(409, message, 'CONFLICT')
