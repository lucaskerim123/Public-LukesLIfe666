import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const LOCKDOWN_EXEMPT_PATHS = [
  '/lockdown',
  '/unlock',
  '/banned',
  '/api/lockdown',
  // /login must stay reachable during lockdown so an admin/owner can sign in
  // and bypass. Non-privileged users who sign in are still bounced to /lockdown.
  '/login',
]

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

// Read the `iat` (issued-at, seconds) claim out of a Supabase access token
// without verifying it - getUser() has already validated the token upstream;
// here we only need the timestamp to compare against the session epoch.
function getTokenIssuedAt(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(b64))
    return typeof payload.iat === 'number' ? payload.iat : null
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl
  const isLockdownExempt = LOCKDOWN_EXEMPT_PATHS.some(p => pathname.startsWith(p))

  // Service-role client for system checks (bypasses RLS)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const clientIp = getClientIp(request)
  const now = new Date().toISOString()

  // System config (lockdown state, session epoch, owner id) + IP ban in parallel.
  const [{ data: configRows }, { data: ipBan }] = await Promise.all([
    adminClient.from('site_config').select('key, value')
      .in('key', ['lockdown_mode', 'session_epoch', 'admin_owner_id']),
    clientIp === 'unknown'
      ? Promise.resolve({ data: null })
      : adminClient.from('bans').select('id')
          .eq('type', 'ip').eq('value', clientIp)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .maybeSingle(),
  ])

  const config = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value ?? '']))
  const lockdownActive = config.lockdown_mode === 'true'
  const sessionEpoch = config.session_epoch ? Number(config.session_epoch) : null
  const ownerId = config.admin_owner_id || process.env.HIS_USER_ID || null

  if (ipBan && pathname !== '/banned') {
    return NextResponse.redirect(new URL('/banned', request.url))
  }

  const publicPaths = ['/login', '/join', '/setup', '/api/setup', '/lockdown', '/unlock', '/banned', '/api/lockdown']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !isPublic) {
    const next = encodeURIComponent(pathname)
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url))
  }

  if (user) {
    // Force re-login for any session issued before the last unlock. Skip on
    // public paths (incl. /login) so we never loop while re-authenticating.
    if (!isPublic && sessionEpoch) {
      const { data: { session } } = await supabase.auth.getSession()
      const iat = session?.access_token ? getTokenIssuedAt(session.access_token) : null
      if (iat !== null && iat * 1000 < sessionEpoch) {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        const redirect = NextResponse.redirect(new URL('/login', request.url))
        supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c))
        return redirect
      }
    }

    // Role + user-ban lookups both key on user.id - run them together.
    const [{ data: profile }, { data: userBan }] = await Promise.all([
      adminClient.from('users').select('role').eq('id', user.id).maybeSingle(),
      pathname !== '/banned'
        ? adminClient.from('bans').select('id')
            .eq('type', 'user').eq('value', user.id)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (userBan) {
      if (pathname === '/login') return supabaseResponse
      return NextResponse.redirect(new URL('/banned', request.url))
    }

    // Admins and the owner bypass lockdown; everyone else is sent to /lockdown.
    const canBypass = profile?.role === 'admin' || profile?.role === 'owner' || (!!ownerId && user.id === ownerId)
    if (!canBypass && !isLockdownExempt && lockdownActive) {
      return NextResponse.redirect(new URL('/lockdown', request.url))
    }

    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (!user && !isLockdownExempt && lockdownActive) {
    return NextResponse.redirect(new URL('/lockdown', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api/lockdown/status|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
