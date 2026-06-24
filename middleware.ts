import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'

const ADMIN_PATHS = ['/dashboard', '/reports', '/requisitions', '/inventory', '/zones']

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // ถ้าเข้า /admin ตรงๆ → redirect ไป /[token]/dashboard
  if (pathname === '/admin' || pathname === '/admin/') {
    const token = randomBytes(8).toString('hex') // สุ่มทุกครั้ง
    return NextResponse.redirect(new URL(`/${token}/dashboard`, req.url))
  }

  // ถ้าเข้า /[token]/dashboard → rewrite ไปที่ /admin/dashboard จริงๆ
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0].length === 16) {
    const subPath = '/' + parts.slice(1).join('/')
    if (ADMIN_PATHS.some(p => subPath.startsWith(p))) {
      return NextResponse.rewrite(new URL(`/admin${subPath}`, req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/:token/:path*']
}