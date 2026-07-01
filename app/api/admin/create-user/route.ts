import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity'
import { isAdminOwner } from '@/lib/admin-owner'
import type { Role } from '@/lib/supabase/types'

const ADMIN_CREATABLE_ROLES: Role[] = ['viewer', 'lawyer', 'counsellor']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role, display_name').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, display_name, password, role } = await req.json() as { email?: string; display_name?: string; password?: string; role?: Role }
  if (!email || !display_name || !password || !role) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  }

  const currentUserIsOwner = await isAdminOwner(user.id)
  if (!currentUserIsOwner && !ADMIN_CREATABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Admins can only create viewer, lawyer or counsellor accounts' }, { status: 403 })
  }
  if (role === 'owner' && !currentUserIsOwner) {
    return NextResponse.json({ error: 'Only the owner can create owner accounts' }, { status: 403 })
  }
  if (role === 'admin' && !currentUserIsOwner) {
    return NextResponse.json({ error: 'Only the owner can create admin accounts' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const uid = authData.user.id
  const { error: profileError } = await admin
    .from('users')
    .upsert({ id: uid, display_name, role }, { onConflict: 'id' })

  if (profileError) {
    await admin.auth.admin.deleteUser(uid)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  await logActivity({
    userId: user.id,
    displayName: profile?.display_name ?? undefined,
    action: 'create_user',
    resourceType: 'user',
    resourceId: uid,
    metadata: { email, display_name, role },
    request: req,
  })

  return NextResponse.json({ id: uid, display_name, role, email, created_at: new Date().toISOString() })
}
