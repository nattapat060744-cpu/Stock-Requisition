import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_PATHS = ['/dashboard', '/reports', '/requisitions', '/inventory', '/zones']

function randomToken() {
  return Math.random().toString(36).substring(2, 10) + 
         Math.random().toString(36).substring(2, 10)
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  if (pathname === '/admin' || pathname === '/admin/') {
    const token = randomToken()
    return NextResponse.redirect(new URL(`/${token}/dashboard`, req.url))
  }

  const parts = pathname.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0].length >= 14) {
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