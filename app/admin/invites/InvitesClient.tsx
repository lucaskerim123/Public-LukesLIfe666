'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import { Copy, Trash2, Plus } from 'lucide-react'
import type { Invite, Role } from '@/lib/supabase/types'

interface Props {
  invites: Invite[]
  adminId: string
}

function generateToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

function inviteMessage(url: string, token: string) {
  const siteUrl = window.location.origin

  return `"Not all doors are seen-only found by those who know where not to look."

A door stands ajar. It was not meant for all eyes.
Seek Luke's tracker: ${siteUrl} - but do not approach as others would.
The front is watched.

Where iron sleeps, a lock awaits. When it whispers for its key, answer in the place carved for it.

Thy code: ${token}

This passage is fleeting. Speak of it to none.

Should the path collapse, fall back to this:
${url}`
}

export default function InvitesClient({ invites: initialInvites, adminId }: Props) {
  const [invites, setInvites] = useState(initialInvites)
  const [role, setRole] = useState<Role>('viewer')
  const [expiryDays, setExpiryDays] = useState(7)
  const [creating, setCreating] = useState(false)

  async function createInvite() {
    setCreating(true)
    const token = generateToken()
    const expires_at = new Date(Date.now() + expiryDays * 86400000).toISOString()
    const supabase = createClient()
    const { error, data } = await supabase.from('invites').insert({
      token, created_by: adminId, role_to_assign: role, expires_at,
    }).select().single()
    if (error) {
      toast.error('Failed: ' + error.message)
    } else {
      setInvites(prev => [data, ...prev])
      toast.success('Invite created.')
    }
    setCreating(false)
  }

  async function deleteInvite(invite: Invite) {
    if (!confirm('Revoke this invite?')) return
    const supabase = createClient()
    await supabase.from('invites').delete().eq('id', invite.id)
    setInvites(prev => prev.filter(i => i.id !== invite.id))
    toast.success('Revoked.')
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/join?token=${token}`
    navigator.clipboard.writeText(inviteMessage(url, token))
    toast.success('Invite message copied.')
  }

  return (
    <div>
      <div className="mb-6 border border-zinc-800 bg-zinc-950 p-5">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-zinc-500">New Invite</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as Role)}
              className="border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-300 focus:outline-none"
            >
              <option value="viewer">viewer</option>
              <option value="lawyer">lawyer</option>
              <option value="counsellor">counsellor</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Expires in</label>
            <select
              value={expiryDays}
              onChange={e => setExpiryDays(Number(e.target.value))}
              className="border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-300 focus:outline-none"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
          <button
            onClick={createInvite}
            disabled={creating}
            className="mt-5 flex items-center gap-2 border border-zinc-700 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:border-zinc-500 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            {creating ? 'Creating...' : 'Generate Link'}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {invites.map(invite => {
          const expired = new Date(invite.expires_at) < new Date()
          const used = !!invite.used_by
          return (
            <div
              key={invite.id}
              className={`border px-4 py-3 flex items-center justify-between ${used ? 'border-zinc-800/50 opacity-50' : expired ? 'border-red-900/20' : 'border-zinc-800'} bg-zinc-950`}
            >
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-400">{invite.role_to_assign}</span>
                  {used && <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Used</span>}
                  {expired && !used && <span className="font-mono text-[9px] uppercase tracking-widest text-red-800">Expired</span>}
                </div>
                <p className="font-mono text-[10px] text-zinc-600">
                  Expires {formatDateTime(invite.expires_at)} - {invite.token.slice(0, 12)}...
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!used && !expired && (
                  <button
                    onClick={() => copyLink(invite.token)}
                    className="p-2 text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => deleteInvite(invite)}
                  className="p-2 text-red-900 transition-colors hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
        {!invites.length && <p className="py-8 text-center font-mono text-sm text-zinc-700">No invites.</p>}
      </div>
    </div>
  )
}
