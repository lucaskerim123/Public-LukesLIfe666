import { createClient } from '@/lib/supabase/server'
import { incidentLabel, visibleIncidentText } from '@/lib/incidents'
import { sessionLabel, visibleSessionText } from '@/lib/sessions'
import type { MentalHealthIncident } from '@/lib/supabase/types'
import type { McpContext } from './context'
import { canTracker, currentSession, duration, fail, fmt, needLogin, ok, type ToolResult } from './session-shared'

type Row = Record<string, any>

function sleepLine(row: Row | null | undefined) {
  if (!row) return 'none'
  const hours = row.hours_added ?? row.hours ?? row.sleep_hours ?? 'unknown'
  const time = row.logged_at ?? row.created_at ?? row.sleep_end ?? row.sleep_start
  return `+${hours} hrs${time ? ` at ${fmt(time)}` : ''}`
}

function moodLine(row: Row) {
  return [row.mood, row.notes].filter(Boolean).join(' — ')
}

function incidentLine(role: string, row: MentalHealthIncident) {
  const text = visibleIncidentText(role as any, row, 'brief_summary', row.brief_summary)
    ?? visibleIncidentText(role as any, row, 'description', row.description)
    ?? 'Untitled incident'
  return `${incidentLabel(row)} — ${text}`
}

export async function seshInfoTool(context: McpContext): Promise<ToolResult> {
  const login = needLogin(context, 'seshinfo')
  if (login) return login
  if (!canTracker(context, 'view')) return fail('seshinfo', 'You do not have permission to view tracker sessions.')

  const session = await currentSession(context.profile!.id)
  if (!session) return fail('seshinfo', 'No active session. Use /startsesh to begin one.')

  const supabase = await createClient()
  const role = context.profile!.role
  const [sleepResult, moodResult, incidentResult] = await Promise.all([
    supabase.from('sleep_log').select('*').eq('session_id', session.id).order('logged_at', { ascending: false }).limit(1),
    supabase.from('session_moods').select('*').eq('session_id', session.id).order('occurred_at', { ascending: false }).limit(5),
    supabase.from('mental_health_incidents').select('*').eq('tracker_session_id', session.id).order('occurred_at', { ascending: true }).limit(10),
  ])

  const status = session.date_end ? 'STOPPED' : 'ACTIVE'
  const moods = (moodResult.data ?? []).map(moodLine).filter(Boolean)
  const incidents = ((incidentResult.data ?? []) as MentalHealthIncident[]).map(row => incidentLine(role, row))
  const generalNote = visibleSessionText(role, session, 'notes', session.notes)

  const text = [
    'SESSION INFO',
    '',
    `Session: ${sessionLabel(session)}`,
    `Status: ${status}`,
    `Started: ${session.date_start ?? session.created_at}`,
    `Ended: ${session.date_end ?? 'ongoing'}`,
    `Duration: ${duration(session.created_at ?? `${session.date_start}T00:00:00Z`, session.date_end ? `${session.date_end}T23:59:59Z` : undefined)}`,
    `Sleep logged: ${session.sleep_hours ?? 0} hrs`,
    `Last logged sleep: ${sleepLine(sleepResult.data?.[0])}`,
    '',
    'Moods:',
    ...(moods.length ? moods : ['No moods recorded.']),
    '',
    'Notes:',
    '',
    generalNote ? `1. ${generalNote}` : 'No notes recorded.',
    '',
    'Incidents linked:',
    ...(incidents.length ? incidents : ['No incidents linked.']),
  ].join('\n')

  return ok('seshinfo', text, {
    session_id: session.id,
    session: sessionLabel(session),
    status,
    sleep_total: session.sleep_hours ?? 0,
    moods: moodResult.data ?? [],
    incidents: incidentResult.data ?? [],
  })
}
