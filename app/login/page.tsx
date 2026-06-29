'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronRight, KeyRound, Lock, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [inviteVisible, setInviteVisible] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const router = useRouter()

  function getRedirectPath() {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    if (next && next.startsWith('/') && !next.startsWith('//')) return next
    if (navigator.userAgent.includes('MentalHealthTrackerApp')) return '/mobile'
    return '/dashboard'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('ACCESS DENIED — BAD SEAL')
      setLoading(false)
      return
    }
    router.push(getRedirectPath())
    router.refresh()
  }

  function handleInviteContinue() {
    const code = inviteCode.trim()
    if (!code) return
    router.push(`/join?token=${encodeURIComponent(code)}`)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-zinc-300">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(127,29,29,0.2),transparent_30%),linear-gradient(180deg,#020202_0%,#09090b_50%,#020202_100%)]" />
      <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px)] bg-[length:100%_4px]" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-6xl">
          <div className={`relative mx-auto aspect-[16/9] w-full overflow-hidden border border-zinc-900 bg-zinc-950 shadow-[0_0_90px_rgba(0,0,0,.85)] transition-all duration-700 ${vaultOpen ? 'scale-[1.01]' : 'scale-100'}`}>
            <div className="absolute inset-0 bg-[url('/vault-door.jpg')] bg-cover bg-center opacity-95" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_63%_49%,transparent_0%,transparent_16%,rgba(0,0,0,.28)_30%,rgba(0,0,0,.78)_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/25" />

            {!vaultOpen && (
              <button
                type="button"
                onClick={() => setVaultOpen(true)}
                aria-label="Open login panel"
                className="group absolute left-[55%] top-[25%] h-[50%] w-[18%] rounded-[42%] outline-none"
              >
                <span className="absolute inset-0 rounded-[42%] border border-blue-400/40 bg-blue-950/5 opacity-60 shadow-[0_0_30px_rgba(37,99,235,.22)] transition-all group-hover:border-blue-300/80 group-hover:bg-blue-500/10 group-hover:shadow-[0_0_55px_rgba(37,99,235,.38)]" />
                <span className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-300/50 bg-black/45 shadow-[0_0_24px_rgba(37,99,235,.28)] transition-transform group-hover:scale-110" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-mono uppercase tracking-[0.28em] text-blue-200/70 opacity-0 transition-opacity group-hover:opacity-100">Press</span>
              </button>
            )}

            <div className={`absolute inset-y-0 right-0 flex w-full items-center justify-center bg-black/35 px-4 backdrop-blur-sm transition-all duration-700 sm:w-[48%] ${vaultOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
              <div className="w-full max-w-sm">
                <div className="mb-5 text-center">
                  <p className="text-[10px] font-mono uppercase tracking-[0.48em] text-red-700">Vault Entry</p>
                  <h1 className="mt-3 text-lg font-mono uppercase tracking-[0.35em] text-zinc-200">Restricted Access</h1>
                  <p className="mt-2 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">Identity seal required</p>
                </div>

                <div className="relative border border-zinc-800 bg-black/88 p-1 shadow-[0_0_80px_rgba(0,0,0,.75)]">
                  <div className="absolute -left-px -top-px h-8 w-8 border-l border-t border-red-900/70" />
                  <div className="absolute -right-px -top-px h-8 w-8 border-r border-t border-red-900/70" />
                  <div className="absolute -bottom-px -left-px h-8 w-8 border-b border-l border-red-900/70" />
                  <div className="absolute -bottom-px -right-px h-8 w-8 border-b border-r border-red-900/70" />
                  <div className="border border-zinc-900 bg-zinc-950/72 p-5 sm:p-7">
                    <div className="mb-5 flex items-center justify-between border-b border-zinc-900 pb-4">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-red-800" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-zinc-600">Identity Seal</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInviteVisible(v => !v)}
                        aria-label="Toggle hidden invite entry"
                        title="Hidden entry"
                        className={`group relative flex h-10 w-10 items-center justify-center rounded-full border transition-all ${inviteVisible ? 'border-red-700 text-red-500 shadow-[0_0_24px_rgba(127,29,29,.34)]' : 'border-zinc-900 text-zinc-800 hover:border-red-900/70 hover:text-red-700'}`}
                      >
                        <span className="absolute inset-1 rounded-full border border-zinc-900/80" />
                        <Lock className="relative z-10 h-4 w-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <VaultField label="Access ID">
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="vault-input-red" autoComplete="email" />
                      </VaultField>

                      <VaultField label="Passphrase">
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="vault-input-red" autoComplete="current-password" />
                      </VaultField>

                      {error && <p className="border border-red-900/50 bg-red-950/20 px-3 py-2 text-[11px] font-mono uppercase tracking-widest text-red-600">{error}</p>}

                      <button type="submit" disabled={loading} className="group relative w-full overflow-hidden border border-red-900/70 bg-red-950/70 px-4 py-3 text-[11px] font-mono uppercase tracking-[0.32em] text-red-100 transition-all hover:border-red-700 hover:bg-red-900/70 disabled:opacity-40">
                        <span className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-red-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                        {loading ? 'Checking Seal...' : 'Open Vault'}
                      </button>
                    </form>
                  </div>
                </div>

                <div className={`overflow-hidden transition-all duration-500 ${inviteVisible ? 'max-h-72 opacity-100 mt-4 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2'}`}>
                  <div className="relative border border-red-950/60 bg-black/92 p-4 shadow-[0_0_35px_rgba(127,29,29,.14)]">
                    <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-red-900/70 to-transparent" />
                    <div className="mb-3 flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 text-red-800" />
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-red-800">Hidden Entry</p>
                        <p className="mt-1 text-[10px] font-mono text-zinc-700">Place the key where it belongs.</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInviteContinue()} placeholder="Enter thy code" className="vault-input-red flex-1 text-xs" />
                      <button type="button" onClick={handleInviteContinue} className="border border-zinc-800 px-3 text-zinc-600 transition-colors hover:border-red-900/70 hover:text-red-700">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <p className="mt-5 text-center text-[10px] font-mono uppercase tracking-[0.28em] text-zinc-700">Public Entry Disabled</p>
              </div>
            </div>
          </div>

          {!vaultOpen && <p className="mt-5 text-center text-[10px] font-mono uppercase tracking-[0.34em] text-zinc-600">Press the keypad seal to open the panel</p>}
        </div>
      </section>

      <style jsx global>{`
        .vault-input-red{width:100%;background:#020202;border:1px solid rgb(39 39 42);color:rgb(228 228 231);padding:.7rem .8rem;font-size:.875rem;font-family:monospace;outline:none;transition:border-color .18s,box-shadow .18s,background .18s}.vault-input-red:focus{border-color:rgba(127,29,29,.9);box-shadow:0 0 0 1px rgba(127,29,29,.35),0 0 26px rgba(127,29,29,.13);background:#000}.vault-input-red::placeholder{color:rgb(63 63 70)}
      `}</style>
    </main>
  )
}

function VaultField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><label className="text-[10px] font-mono uppercase tracking-[0.33em] text-zinc-600">{label}</label>{children}</div>
}
