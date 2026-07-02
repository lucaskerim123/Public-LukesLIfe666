import { can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { McpContext } from './context'

export type ToolInput = Record<string, unknown> | undefined
export type ToolResult = { ok: boolean; tool: string; data?: Record<string, unknown>; error?: string }

export const mhtToolNames = [
  'startsesh',
  'stopsesh',
  'seshinfo',
  'seshlist',
  'addsleep',
  'moodadd',
  'addnote',
  'loguse',
  'usehistory',
  'createincident',
  'lockdown',
  'help',
] as const

export function ok(tool: string, text: string, data: Record<string, unknown> = {}): ToolResult {
  return { ok: true, tool, data: { message: text.split('\n')[0] ?? '', display_text: text, ...data } }
}

export function fail(tool: string, error: string): ToolResult {
  return { ok: false, tool, error }
}

export function needLogin(context: McpContext, tool: string) {
  if (!context.profile) return fail(tool, 'You must be logged in to use this command.')
  return null
}

export function canTracker(context: McpContext, action: 'view' | 'create' | 'edit') {
  return !!context.profile && can(context.profile, context.permissions, 'tracker', action, context.roleDefaults ?? undefined)
}

export function canIncidents(context: McpContext, action: 'view' | 'create' | 'edit') {
  return !!context.profile && can(context.profile, context.permissions, 'incidents', action, context.roleDefaults ?? undefined)
}

export function nowIso() { return new Date().toISOString() }
export function isoDate(value: string) { return value.slice(0, 10) }

export function parseDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return nowIso()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid datetime ${value}. Use ISO 8601.`)
  return date.toISOString()
}

export function inputString(input: ToolInput, ...keys: string[]) {
  for (const key of keys) {
    const value = input?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function inputNumber(input: ToolInput, ...keys: string[]) {
  for (const key of keys) {
    const value = input?.[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

export function inputBool(input: ToolInput, key: string, fallback = false) {
  const value = input?.[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase()
    if (['true', 'yes', 'y', '1', 'on'].includes(clean)) return true
    if (['false', 'no', 'n', '0', 'off'].includes(clean)) return false
  }
  return fallback
}

export function fmt(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
}

export function duration(start: unknown, end?: unknown) {
  if (typeof start !== 'string') return '—'
  const a = new Date(start).getTime()
  const b = typeof end === 'string' ? new Date(end).getTime() : Date.now()
  if (Number.isNaN(a) || Number.isNaN(b)) return '—'
  let s = Math.max(0, Math.floor((b - a) / 1000))
  const d = Math.floor(s / 86400); s %= 86400
  const h = Math.floor(s / 3600); s %= 3600
  const m = Math.floor(s / 60); s %= 60
  if (d) return `${d}d ${h}h ${m}m`
  if (h) return `${h}h ${m}m ${s}s`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

export async function currentSession(userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('drug_tracker_sessions').select('*').eq('user_id', userId).is('date_end', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function addEvent(sessionId: string, eventType: string, title: string, content: string, occurredAt = nowIso()) {
  const supabase = await createClient()
  await supabase.from('session_events').insert({ session_id: sessionId, event_type: eventType, title, content, entry_type: eventType, visibility: 'viewer+', occurred_at: occurredAt })
}
