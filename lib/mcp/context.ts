import { getProfile, getPermissionContext } from '@/lib/auth'
import type { UserProfile, Permission } from '@/lib/supabase/types'
import type { RolePermissionsMatrix } from '@/lib/role-permissions'

export interface McpContext {
  profile: UserProfile | null
  permissions: Permission[]
  roleDefaults: RolePermissionsMatrix | null
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
