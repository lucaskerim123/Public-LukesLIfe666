'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  hasPin: boolean
  active: boolean
}

export default function LockdownShortcut({ hasPin, active }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function enableLockdown() {
    if (!hasPin) {
      toast.error('Set an emergency PIN first.')
      return
    }
    if (!confirm('Enable lockdown now? The emergency PIN must exist to unlock the site later.')) return

    setLoading(true)
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'lockdown_mode', value: 'true' }),
    })
    setLoading(false)

    if (!res.ok) {
      toast.error('Failed to enable lockdown.')
      return
    }

    toast.success('Lockdown enabled.')
    router.refresh()
  }

  return (
    <div className={`border p-4 ${active ? 'border-red-900 bg-red-950/20' : 'border-zinc-800 bg-zinc-950'}`}>
      <div className="flex items-center gap-3 justify-between">
        <div className="min-w-0">
          <p className={`text-[10px] font-mono tracking-widest uppercase ${active ? 'text-red-500' : 'text-zinc-500'}`}>Lockdown</p>
          <p className="mt-1 text-xs font-mono text-zinc-600">
            {active ? 'Lockdown is active.' : 'Enable lockdown from here.'}
          </p>
        </div>
        <button
          type="button"
          onClick={enableLockdown}
          disabled={loading || active || !hasPin}
          className="flex shrink-0 items-center gap-2 border border-red-900/50 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-red-700 transition-colors hover:border-red-700 hover:text-red-500 disabled:opacity-40"
        >
          <AlertTriangle className="h-3 w-3" />
          {loading ? 'Enabling...' : active ? 'Enabled' : 'Enable'}
        </button>
      </div>
      {!hasPin && <p className="mt-3 text-[10px] font-mono text-red-800">Emergency PIN is not set yet.</p>}
    </div>
  )
}
