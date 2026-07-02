import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity'

async function sha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const pin = body?.pin
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin.from('site_config').select('value').eq('key', 'lockdown_pin_hash').single()

  if (!data?.value) return NextResponse.json({ error: 'No PIN configured' }, { status: 400 })

  const hash = await sha256(pin)
  if (hash !== data.value) return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })

  // Advance the session epoch so every session issued before this unlock is
  // treated as stale: the middleware force-signs them out and the client
  // heartbeat bounces open tabs back to /login.
  const now = new Date().toISOString()
  await admin.from('site_config')
    .upsert([
      { key: 'lockdown_mode', value: 'false', updated_at: now },
      { key: 'lockdown_pin_hash', value: null, updated_at: now },
      { key: 'session_epoch', value: Date.now().toString(), updated_at: now },
    ])

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined
  await logActivity({ action: 'lockdown_disable_pin', ipAddress: ip, metadata: { pin_reset: true } })

  return NextResponse.json({ ok: true })
}
