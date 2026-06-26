'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Trash2, Save } from 'lucide-react'
import type { UserProfile, Permission, Resource, Action, Role } from '@/lib/supabase/types'
import { ROLE_DEFAULTS } from '@/lib/supabase/types'

interface Props {
  user: UserProfile
  email: string
  permissions: Permission[]
  currentUserId: string
}

const RESOURCES: Resource[] = ['incidents', 'tracker', 'documents', 'users', 'admin']
const ACTIONS: Action[] = ['view', 'view_sensitive', 'create', 'edit', 'delete', 'manage_users', 'manage_invites']

type PermMap = Record<string, Record<string, boolean | null>>

function buildPermMap(permissions: Permission[]): PermMap {
  const map: PermMap = {}
  for (const p of permissions) {
    if (!map[p.resource]) map[p.resource] = {}
    map[p.resource][p.action] = p.granted
  }
  return map
}

function roleDefault(role: Role, resource: Resource, action: Action): boolean {
  return ROLE_DEFAULTS[role]?.[resource]?.includes(action) ?? false
}

export default function UserDetail({ user: initialUser, email, permissions, currentUserId }: Props) {
  const [user, setUser] = useState(initialUser)
  const [displayName, setDisplayName] = useState(initialUser.display_name)
  const [role, setRole] = useState<Role>(initialUser.role)
  const [permMap, setPermMap] = useState<PermMap>(buildPermMap(permissions))
  const [toggling, setToggling] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const isMe = user.id === currentUserId

  async function saveProfile() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('users')
      .update({ display_name: displayName, role })
      .eq('id', user.id)
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    setUser(u => ({ ...u, display_name: displayName, role }))
    toast.success('Saved.')
  }

  async function deleteUser() {
    if (isMe) { toast.error("Can't delete yourself."); return }
    if (!confirm(`Delete "${user.display_name}"? This removes their account permanently.`)) return
    const res = await fetch('/api/admin/delete-user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Delete failed'); return }
    toast.success('User deleted.')
    router.push('/admin')
  }

  async function togglePermission(resource: Resource, action: Action) {
    const key = `${resource}-${action}`
    setToggling(key)
    const current = permMap[resource]?.[action] ?? null
    const def = roleDefault(user.role, resource, action)

    let next: boolean | null
    if (current === null) next = !def
    else if (current === true) next = false
    else next = null

    const supabase = createClient()
    if (next === null) {
      await supabase.from('permissions').delete()
        .eq('user_id', user.id).eq('resource', resource).eq('action', action)
    } else {
      await supabase.from('permissions').upsert(
        { user_id: user.id, resource, action, granted: next },
        { onConflict: 'user_id,resource,action' }
      )
    }

    setPermMap(prev => {
      const updated = { ...prev }
      if (!updated[resource]) updated[resource] = {}
      if (next === null) delete updated[resource][action]
      else updated[resource][action] = next
      return updated
    })
    setToggling(null)
  }

  const changed = displayName !== user.display_name || role !== user.role

  return (
    <div className="space-y-6">
      {/* Profile */}
      <div className="border border-zinc-800 bg-zinc-950 p-5">
        <p className="text-[10px] tracking-widest uppercase font-mono text-zinc-500 mb-5">Profile</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div className="space-y-1.5">
            <label className="text-[10px] tracking-widest text-zinc-600 uppercase font-mono">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              disabled={isMe}
              className="w-full bg-black border border-zinc-800 text-zinc-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-600 transition-colors disabled:opacity-40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] tracking-widest text-zinc-600 uppercase font-mono">Email</label>
            <input
              type="text"
              value={email}
              readOnly
              className="w-full bg-black border border-zinc-800/50 text-zinc-500 px-3 py-2 text-sm font-mono cursor-default"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] tracking-widest text-zinc-600 uppercase font-mono">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              disabled={isMe}
              className="w-full bg-black border border-zinc-800 text-zinc-200 px-3 py-2 text-sm font-mono focus:outline-none disabled:opacity-40"
            >
              <option value="viewer">viewer</option>
              <option value="counsellor">counsellor</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] tracking-widest text-zinc-600 uppercase font-mono">Joined</label>
            <input
              type="text"
              value={new Date(user.created_at).toLocaleDateString()}
              readOnly
              className="w-full bg-black border border-zinc-800/50 text-zinc-500 px-3 py-2 text-sm font-mono cursor-default"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={saveProfile}
            disabled={!changed || saving || isMe}
            className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-400 hover:border-zinc-500 text-[11px] font-mono tracking-widest uppercase transition-colors disabled:opacity-30"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {!isMe && (
            <button
              onClick={deleteUser}
              className="flex items-center gap-2 px-4 py-2 border border-red-900/40 text-red-800 hover:border-red-700 hover:text-red-600 text-[11px] font-mono tracking-widest uppercase transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete Account
            </button>
          )}
        </div>
      </div>

      {/* Permission Grid */}
      <div className="border border-zinc-800 bg-zinc-950 p-5">
        <p className="text-[10px] tracking-widest uppercase font-mono text-zinc-500 mb-5">Permissions</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr>
                <th className="text-left text-zinc-600 pb-2 pr-4 tracking-widest uppercase w-24">Resource</th>
                {ACTIONS.map(a => (
                  <th key={a} className="text-center text-zinc-600 pb-2 px-1 tracking-widest uppercase whitespace-nowrap">
                    {a.replace('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map(resource => (
                <tr key={resource} className="border-t border-zinc-800/50">
                  <td className="py-2 pr-4 text-zinc-500 tracking-widest uppercase">{resource}</td>
                  {ACTIONS.map(action => {
                    const override = permMap[resource]?.[action] ?? null
                    const def = roleDefault(user.role, resource, action)
                    const effective = override !== null ? override : def
                    const isOverride = override !== null
                    const key = `${resource}-${action}`

                    return (
                      <td key={action} className="py-2 px-1 text-center">
                        {isMe ? (
                          <span className="text-green-800">✓</span>
                        ) : (
                          <button
                            onClick={() => togglePermission(resource, action)}
                            disabled={toggling === key}
                            title={isOverride
                              ? `Override: ${effective ? 'granted' : 'denied'}`
                              : `Role default: ${effective ? 'granted' : 'denied'}`}
                            className={`w-6 h-6 border transition-colors ${
                              effective
                                ? isOverride
                                  ? 'border-green-800 bg-green-950/50 text-green-700'
                                  : 'border-zinc-700 bg-zinc-800/50 text-zinc-500'
                                : isOverride
                                  ? 'border-red-900 bg-red-950/30 text-red-800'
                                  : 'border-zinc-800 text-zinc-700'
                            }`}
                          >
                            {effective ? '✓' : '−'}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] font-mono text-zinc-700 mt-3">
          Bright green = explicit grant · Red = explicit deny · Muted = role default
        </p>
      </div>
    </div>
  )
}
