import { createClient } from '@/lib/supabase/server'
import { sessionLabel } from '@/lib/sessions'
import type { McpContext } from './context'
import { canTracker, fail, inputNumber, needLogin, ok, type ToolInput, type ToolResult } from './session-shared'

export async function seshListTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const login = needLogin(context, 'seshlist')
  if (login) return login
  if (!canTracker(context, 'view')) return fail('seshlist', 'You do not have permission to view tracker sessions.')

  const limit = inputNumber(input, 'limit') ?? 5
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('drug_tracker_sessions')
    .select('*')
    .eq('user_id', context.profile!.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  if (!data?.length) return ok('seshlist', 'No sessions found.', { sessions: [] })

  const lines = ['SESSION LIST', '']
  for (const session of data) {
    const status = session.date_end ? 'STOPPED' : 'ACTIVE'
    lines.push(`${sessionLabel(session)} — ${status} — ${session.date_start} to ${session.date_end ?? 'ongoing'} — ${session.sleep_hours ?? 0} hrs sleep`)
  }

  return ok('seshlist', lines.join('\n'), { sessions: data })
}
