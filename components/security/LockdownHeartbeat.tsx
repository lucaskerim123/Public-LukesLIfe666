'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const POLL_MS = 10_000

/**
 * Polls the public lockdown status endpoint so open/idle tabs react to state
 * changes without waiting for a navigation:
 *  - session epoch advanced (site was unlocked) -> sign out + return to /login,
 *    for every session including admins/owners who used the bypass.
 *  - lockdown just enabled -> non-privileged users are sent to /lockdown.
 * The middleware remains the authoritative enforcer; this is the live-refresh UX.
 */
export default function LockdownHeartbeat({
  epoch,
  canBypass,
}: {
  epoch: string | null
  canBypass: boolean
}) {
  const router = useRouter()
  const actingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (cancelled || actingRef.current) return
      try {
        const res = await fetch('/api/lockdown/status', { cache: 'no-store' })
        if (!res.ok) return
        const data: { lockdown: boolean; epoch: string | null } = await res.json()
        if (cancelled || actingRef.current) return

        // Site was unlocked after this tab loaded -> force re-login everywhere.
        if ((data.epoch ?? null) !== (epoch ?? null)) {
          actingRef.current = true
          const supabase = createClient()
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          router.replace('/login')
          return
        }

        // Lockdown was enabled -> bounce non-privileged users to the lock screen.
        if (data.lockdown && !canBypass) {
          actingRef.current = true
          router.replace('/lockdown')
        }
      } catch {
        // Network hiccup - ignore and retry on the next tick.
      }
    }

    const id = setInterval(check, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [epoch, canBypass, router])

  return null
}
