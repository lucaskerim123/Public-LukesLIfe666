import { can, getProfile, getPermissionContext } from '@/lib/auth'
import type { Action, Permission, Resource, UserProfile } from '@/lib/supabase/types'
import type { RolePermissionsMatrix } from '@/lib/role-permissions'

export interface McpContext {
  profile: UserProfile | null
  permissions: Permission[]
  roleDefaults: RolePermissionsMatrix | null
}

export interface McpActorContext extends McpContext {
  profile: UserProfile
}

export async function createMcpContext(): Promise<McpContext> {
  const profile = await getProfile()

  if (!profile) {
    return {
      profile: null,
      permissions: [],
      roleDefaults: null,
    }
  }

  const { overrides, roleDefaults } = await getPermissionContext(profile.id)

  return {
    profile,
    permissions: overrides,
    roleDefaults,
  }
}

export function assertCan(
  context: McpContext,
  resource: Resource,
  action: Action
): asserts context is McpActorContext {
  if (!context.profile) {
    throw new Error('You must be signed in to run this command')
  }

  if (!context.roleDefaults) {
    throw new Error('Permission context is unavailable')
  }

  if (!can(context.profile, context.permissions, resource, action, context.roleDefaults)) {
    throw new Error(`Permission denied: ${resource}.${action}`)
  }
}
