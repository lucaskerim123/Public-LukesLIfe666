import { can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { McpContext } from './context'
import { fail, inputBool, needLogin, ok, type ToolInput, type ToolResult } from './session-shared'

export async function lockdownTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const login = needLogin(context, 'lockdown')
  if (login) return login

  const allowed = context.profile!.role === 'owner'
    || context.profile!.role === 'admin'
    || can(context.profile!, context.permissions, 'admin_lockdown', 'view', context.roleDefaults ?? undefined)
  if (!allowed) return fail('lockdown', 'You do not have permission to manage lockdown.')

  const enabled = inputBool(input, 'enabled', inputBool(input, 'active', inputBool(input, 'value', inputBool(input, 'mode', false))))
  const admin = createAdminClient()
  const { data: pinRows, error: pinError } = await admin.from('site_config').select('key, value').eq('key', 'lockdown_pin_hash').limit(1)
  if (pinError) throw pinError
  if (!pinRows?.[0]?.value) return fail('lockdown', 'No lockdown PIN is set. Set a PIN before activating lockdown.')

  const { error } = await admin.from('site_config').upsert({ key: 'lockdown_mode', value: enabled ? 'true' : 'false' }, { onConflict: 'key' })
  if (error) throw error

  return ok('lockdown', enabled ? 'Lockdown Mode Activated!' : 'Lockdown Mode Disabled.', { lockdown_active: enabled })
}
