import { sessionLabel } from '@/lib/sessions'
import type { McpContext } from './context'
import { canTracker, currentSession, duration, fail, fmt, needLogin, ok, type ToolResult } from './session-shared'

export async function seshInfoTool(context: McpContext): Promise<ToolResult> {
  const login = needLogin(context, 'seshinfo')
  if (login) return login
  if (!canTracker(context, 'view')) return fail('seshinfo', 'You do not have permission to view tracker sessions.')

  const session = await currentSession(context.profile!.id)
  if (!session) return fail('seshinfo', 'No active session. Use /startsesh to begin one.')

  const text = [
    'Session report',
    `Session: ${sessionLabel(session)}`,
    `ID: ${session.id}`,
    'Status: active',
    `Started: ${fmt(session.created_at ?? session.date_start)}`,
    `Duration: ${duration(session.created_at ?? `${session.date_start}T00:00:00Z`)}`,
    `Sleep total: ${session.sleep_hours ?? 0}h`,
    `Date start: ${session.date_start}`,
    `Date end: ${session.date_end ?? 'ongoing'}`,
  ].join('\n')

  return ok('seshinfo', text, { session_id: session.id, session: sessionLabel(session) })
}
