import { ok, type ToolResult } from './session-shared'

export function helpTool(): ToolResult {
  const text = [
    'MHT commands',
    '',
    'Session: startsesh, stopsesh, seshinfo, seshlist, seshexport',
    'Logging: addsleep, moodadd, addnote, loguse, usehistory',
    'Incidents: createincident, exportincident',
    'Security: lockdown',
  ].join('\n')
  return ok('help', text)
}
