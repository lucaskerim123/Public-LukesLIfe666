import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Lightweight public endpoint polled by the client heartbeat (LockdownHeartbeat).
// Returns just enough to decide whether an open tab should be bounced to
// /login (session epoch advanced) or /lockdown (lockdown just enabled).
export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_config')
    .select('key, value')
    .in('key', ['lockdown_mode', 'session_epoch'])

  const config = Object.fromEntries((data ?? []).map(row => [row.key, row.value ?? '']))

  return NextResponse.json(
    {
      lockdown: config.lockdown_mode === 'true',
      epoch: config.session_epoch || null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
