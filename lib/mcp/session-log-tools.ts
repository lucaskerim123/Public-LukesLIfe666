import { createClient } from '@/lib/supabase/server'
import { sessionLabel } from '@/lib/sessions'
import type { McpContext } from './context'
import { addEvent, canTracker, currentSession, fail, fmt, inputBool, inputNumber, inputString, needLogin, ok, parseDateTime, type ToolInput, type ToolResult } from './session-shared'

async function requireActiveSession(context: McpContext, tool: string) {
  const login = needLogin(context, tool)
  if (login) return { result: login as ToolResult, session: null }
  if (!canTracker(context, 'edit')) return { result: fail(tool, 'You do not have permission to edit tracker sessions.'), session: null }
  const session = await currentSession(context.profile!.id)
  if (!session) return { result: fail(tool, 'No active session. Use /startsesh first.'), session: null }
  return { result: null, session }
}

async function logCommand(sessionId: string, command: string, occurredAt?: string) {
  await addEvent(sessionId, command, command, command, occurredAt)
}

export async function addSleepTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const { result, session } = await requireActiveSession(context, 'addsleep')
  if (result) return result

  const hours = inputNumber(input, 'hours', 'amount')
  if (hours === null || hours <= 0 || hours > 24) return fail('addsleep', 'Sleep hours must be between 0 and 24.')

  const supabase = await createClient()
  const total = Number(session!.sleep_hours ?? 0) + hours
  await supabase.from('drug_tracker_sessions').update({ sleep_hours: total }).eq('id', session!.id)
  const { data, error } = await supabase.from('sleep_log').insert({ session_id: session!.id, hours_added: hours, source: 'mcp', entry_type: 'sleep', visibility: 'viewer+' }).select('*').single()
  if (error) throw error
  await logCommand(session!.id, '/addsleep', data?.logged_at)

  return ok('addsleep', ['Sleep logged.', `Added: ${hours} hrs`, `Session total: ${total} hrs`, `Session: ${sessionLabel(session!)}`].join('\n'), { session_id: session!.id, hours_added: hours, sleep_total: total })
}

export async function moodAddTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const { result, session } = await requireActiveSession(context, 'moodadd')
  if (result) return result

  const mood = inputString(input, 'mood', 'text')
  if (!mood) return fail('moodadd', 'Mood text is required.')
  const notes = inputString(input, 'notes', 'note') || null
  const at = parseDateTime(input?.occurred_at ?? input?.at)

  const supabase = await createClient()
  const { error } = await supabase.from('session_moods').insert({ session_id: session!.id, mood, notes, source: 'mcp', entry_type: 'mood', visibility: 'viewer+', occurred_at: at })
  if (error) throw error
  await logCommand(session!.id, '/moodadd', at)

  return ok('moodadd', ['Mood logged.', `Mood: ${mood}`, notes ? `Notes: ${notes}` : '', `Session: ${sessionLabel(session!)}`].filter(Boolean).join('\n'), { session_id: session!.id, mood })
}

export async function addNoteTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const { result, session } = await requireActiveSession(context, 'addnote')
  if (result) return result

  const content = inputString(input, 'content', 'text', 'note')
  if (!content) return fail('addnote', 'Note text is required.')
  const sensitive = inputBool(input, 'is_sensitive')
  const visibility = inputString(input, 'visibility') || (sensitive ? 'admin only' : 'viewer+')
  const at = parseDateTime(input?.occurred_at ?? input?.at)

  const supabase = await createClient()
  const { error } = await supabase.from('session_notes').insert({ session_id: session!.id, note: content, content, source: 'mcp', entry_type: 'note', visibility, is_sensitive: sensitive, occurred_at: at })
  if (error) throw error
  await logCommand(session!.id, '/addnote', at)

  return ok('addnote', ['Note added.', `Note: ${content}`, `Session: ${sessionLabel(session!)}`].join('\n'), { session_id: session!.id })
}

export async function logUseTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const { result, session } = await requireActiveSession(context, 'loguse')
  if (result) return result

  const substance = inputString(input, 'substance', 'sub')
  if (!substance) return fail('loguse', 'Substance is required.')
  const amount = inputNumber(input, 'amount', 'amt')
  const unit = inputString(input, 'unit') || null
  const notes = inputString(input, 'notes', 'note') || null

  const supabase = await createClient()
  const { data, error } = await supabase.from('drug_use_log').insert({ session_id: session!.id, substance, amount, unit, notes, source: 'mcp', entry_type: 'usage', visibility: 'viewer+' }).select('*').single()
  if (error) throw error
  const amountText = amount !== null ? `${amount} ${unit ?? ''}`.trim() : 'not recorded'
  await logCommand(session!.id, '/loguse', data?.logged_at)

  return ok('loguse', ['Use logged.', `Substance: ${substance}`, `Amount: ${amountText}`, notes ? `Notes: ${notes}` : '', `Logged at: ${fmt(data?.logged_at)}`].filter(Boolean).join('\n'), { session_id: session!.id, log_id: data?.id })
}

export async function useHistoryTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const login = needLogin(context, 'usehistory')
  if (login) return login
  if (!canTracker(context, 'view')) return fail('usehistory', 'You do not have permission to view tracker sessions.')

  const supabase = await createClient()
  const { data: session } = await supabase.from('drug_tracker_sessions').select('*').eq('user_id', context.profile!.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!session) return fail('usehistory', 'No session found.')

  await logCommand(session.id, '/usehistory')

  const limit = inputNumber(input, 'limit') ?? 20
  const { data, error } = await supabase.from('drug_use_log').select('*').eq('session_id', session.id).order('logged_at', { ascending: false }).limit(limit)
  if (error) throw error
  const rows = data ?? []
  if (!rows.length) return ok('usehistory', `No use entries for ${sessionLabel(session)}.`, { session_id: session.id, entries: [] })

  const lines = [`USE HISTORY — ${sessionLabel(session)}`, '']
  for (const row of rows) {
    const amount = row.amount !== null && row.amount !== undefined ? `${row.amount} ${row.unit ?? ''}`.trim() : 'not recorded'
    lines.push(`${fmt(row.logged_at)} — ${row.substance} — ${amount}${row.notes ? ` — ${row.notes}` : ''}`)
  }
  return ok('usehistory', lines.join('\n'), { session_id: session.id, entries: rows })
}
