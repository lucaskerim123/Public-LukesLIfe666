import { Lock } from 'lucide-react'
import Sidebar from './Sidebar'
import CaptureGuard from '@/components/security/CaptureGuard'
import FancyRedactedHydrator from '@/components/permissions/FancyRedactedHydrator'
import LockdownHeartbeat from '@/components/security/LockdownHeartbeat'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPermissionContext, can } from '@/lib/auth'
import type { Resource } from '@/lib/supabase/types'
import { ADMIN_SECTIONS } from '@/lib/navigation'

interface AppShellProps {
  userId: string
  role: string
  displayName: string
  children: React.ReactNode
}

export default async function AppShell({ userId, role, displayName, children }: AppShellProps) {
  let lockdownActive = false
  let hasPin = false
  let canViewAdmin = false
  let allowedAdminSections: Resource[] = []

  // session_epoch is needed by the heartbeat for every user; lockdown_mode /
  // lockdown_pin_hash only feed the admin sidebar controls.
  const admin = createAdminClient()
  const { data: configRows } = await admin
    .from('site_config')
    .select('key, value')
    .in('key', ['lockdown_mode', 'lockdown_pin_hash', 'session_epoch'])
  const config = Object.fromEntries((configRows ?? []).map(row => [row.key, row.value ?? '']))
  const sessionEpoch = config.session_epoch || null
  const canBypass = role === 'admin' || role === 'owner'
  if (canBypass) {
    lockdownActive = config.lockdown_mode === 'true'
    hasPin = !!config.lockdown_pin_hash
  }

  const { overrides, roleDefaults } = await getPermissionContext(userId)
  const profile = { id: userId, role: role as AppShellProps['role'], display_name: displayName, created_at: '' }
  canViewAdmin = can(profile as never, overrides, 'admin', 'view', roleDefaults)
  allowedAdminSections = ADMIN_SECTIONS
    .filter(section => can(profile as never, overrides, section.id, 'view', roleDefaults))
    .map(section => section.id)

  return (
    <div className="flex min-h-screen bg-background">
      <CaptureGuard enabled={role !== 'admin' && role !== 'owner'} />
      <FancyRedactedHydrator />
      <LockdownHeartbeat epoch={sessionEpoch} canBypass={canBypass} />
      <Sidebar role={role} displayName={displayName} lockdownActive={lockdownActive} hasPin={hasPin} canViewAdmin={canViewAdmin} allowedAdminSections={allowedAdminSections} />
      {/* Offset for desktop sidebar; offset top for mobile header */}
      <div className="flex-1 min-w-0 md:ml-[220px] pt-12 md:pt-0">
        {/* Quiet, persistent reminder that lockdown is on for admins who bypassed. */}
        {lockdownActive && (
          <div className="sticky top-12 z-30 flex items-center justify-center gap-2 border-b border-red-900/50 bg-red-950/30 px-4 py-1.5 backdrop-blur-sm md:top-0">
            <Lock className="h-3 w-3 shrink-0 text-red-600/80" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-500/90">Lockdown active</span>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
