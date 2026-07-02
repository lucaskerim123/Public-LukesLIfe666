import { createClient } from '@/lib/supabase/server'
import { sessionLabel } from '@/lib/sessions'
import type { McpContext } from './context'
import { addEvent, canTracker, currentSession, duration, fail, fmt, inputBool, isoDate, needLogin, ok, parseDateTime, type ToolInput, type ToolResult } from './session-shared'

export async function startSeshTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const login = needLogin(context, 'startsesh')
  if (login) return login
  if (!canTracker(context, 'create')) return fail('startsesh', 'You do not have permission to create tracker sessions.')

  const existing = await currentSession(context.profile!.id)
  if (existing) {
    const text = ['Session already active.', `Session: ${sessionLabel(existing)}`, `Session ID: ${existing.id}`, `Started: ${fmt(existing.created_at ?? existing.date_start)}`, `Duration: ${duration(existing.created_at ?? `${existing.date_start}T00:00:00Z`)}`, '', 'Use /stopsesh to end it first.'].join('\n')
    return ok('startsesh', text, { session_id: existing.id })
  }

  const at = parseDateTime(input?.at ?? input?.started_at)
  const supabase = await createClient()
  const { data, error } = await supabase.from('drug_tracker_sessions').insert({ user_id: context.profile!.id, date_start: isoDate(at), sleep_hours: 0, notes: 'Session started.', is_sensitive: false, sensitive_fields: [], field_visibility: {} }).select('*').single()
  if (error) throw error
  await addEvent(data.id, '/startsesh', '/startsesh', '/startsesh', at)
  return ok('startsesh', ['Session started.', `Session: ${sessionLabel(data)}`, `Session ID: ${data.id}`, `Started: ${fmt(at)}`].join('\n'), { session_id: data.id })
}

export async function stopSeshTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const login = needLogin(context, 'stopsesh')
  if (login) return login
  if (!canTracker(context, 'edit')) return fail('stopsesh', 'You do not have permission to edit tracker sessions.')

  const session = await currentSession(context.profile!.id)
  if (!session) return fail('stopsesh', 'No active session found. Use /startsesh to begin one.')

  const summary = [`Session: ${sessionLabel(session)}`, `Session ID: ${session.id}`, `Started: ${fmt(session.created_at ?? session.date_start)}`, `Duration: ${duration(session.created_at ?? `${session.date_start}T00:00:00Z`)}`, `Sleep logged: ${session.sleep_hours ?? 0}h`].join('\n')
  if (!inputBool(input, 'confirm')) return ok('stopsesh', ['About to stop and save this session.', '', summary, '', 'Call /stopsesh confirm=true to commit.'].join('\n'), { preview: true, session_id: session.id })

  const at = parseDateTime(input?.at ?? input?.stopped_at)
  const supabase = await createClient()
  const { data, error } = await supabase.from('drug_tracker_sessions').update({ date_end: isoDate(at) }).eq('id', session.id).eq('user_id', context.profile!.id).select('*').single()
  if (error) throw error
  await addEvent(session.id, '/stopsesh', '/stopsesh', '/stopsesh', at)
  return ok('stopsesh', ['Session stopped and saved.', '', summary, `Stopped: ${fmt(at)}`].join('\n'), { session_id: data.id })
}
