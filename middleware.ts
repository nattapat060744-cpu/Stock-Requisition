import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function randomToken() {
  return Math.random().toString(36).substring(2, 10) +
         Math.random().toString(36).substring(2, 10)
}

// หน้าทั้งหมดในโปรเจค
const ALL_PATHS = [
  '/admin/dashboard',
  '/admin/reports', 
  '/admin/requisitions',
  '/admin/inventory',
  '/admin/zones',
  '/user',        // ← เพิ่มหน้า user ของคุณตรงนี้
  '/',
]

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const parts = pathname.split('/').filter(Boolean)

  // ถ้า URL ยังไม่มี token นำหน้า → redirect ใส่ token
  // token จะมีความยาว 14-16 ตัว
  const hasToken = parts.length > 0 && parts[0].length >= 14

  if (!hasToken) {
    const token = randomToken()
    const newPath = `/${token}${pathname === '/' ? '' : pathname}`
    return NextResponse.redirect(new URL(newPath, req.url))
  }

  // มี token แล้ว → rewrite ตัด token ออกแล้วส่งไปหน้าจริง
  const realPath = '/' + parts.slice(1).join('/')
  return NextResponse.rewrite(new URL(realPath || '/', req.url))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fonts|Logo.png).*)',
  ]
}