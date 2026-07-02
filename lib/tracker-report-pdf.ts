import { daysUp, formatDate, formatDateTime } from '@/lib/utils'
import { incidentLabel, visibleIncidentText } from '@/lib/incidents'
import { sessionLabel, visibleSessionText } from '@/lib/sessions'
import type { getTrackerReportData } from '@/lib/tracker-report'
import type { MentalHealthIncident } from '@/lib/supabase/types'

type TrackerReportData = NonNullable<Awaited<ReturnType<typeof getTrackerReportData>>>
type AnyRow = Record<string, any>

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None recorded'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function asIncident(row: AnyRow): MentalHealthIncident {
  return row as MentalHealthIncident
}

function eventLabel(event: AnyRow) {
  const original = event.event_type || event.entry_type || event.title || event.content || ''
  const raw = String(original).trim().toLowerCase()
  if (raw === 'start' || raw === 'session_start' || raw === 'sesh_start' || raw === 'start_session') return 'Sesh started'
  if (raw === 'stop' || raw === 'session_stop' || raw === 'sesh_stop' || raw === 'end' || raw === 'end_session' || raw === 'close_session') return 'Sesh stopped'
  if (raw.includes('mood')) return 'Mood entry'
  if (raw.includes('sleep')) return 'Sleep'
  if (raw.includes('note')) return 'Note'
  if (raw.includes('usage') || raw.includes('drug')) return 'Usage log'
  if (raw.includes('incident')) return 'Incident link'
  if (raw.includes('document') || raw.includes('attachment')) return 'Document link'
  if (raw.includes('edit') || raw.includes('update')) return 'Edited entry'
  if (raw.includes('link')) return 'Linked record'
  if (raw.includes('summary') || raw.includes('summarise') || raw.includes('summarize')) return 'Summary command'
  if (raw.includes('status') || raw.includes('check')) return 'Status check'
  return original || 'Session event'
}

function addSection(lines: string[], title: string) {
  if (lines.length) lines.push('')
  lines.push(title.toUpperCase())
  lines.push(''.padEnd(Math.min(title.length, 72), '-'))
}

function addKv(lines: string[], label: string, value: unknown) {
  lines.push(`${label}: ${valueText(value)}`)
}

export function renderTrackerReportText(report: TrackerReportData) {
  const { session, sleepLog, drugUseLog, linkedIncidents, entries, sessionEvents, sessionMoods, sessionNotes, role } = report
  const lines: string[] = []

  lines.push('Mental Health Tracker')
  lines.push(`${sessionLabel(session)} - Full Session Report`)
  lines.push(`Generated ${formatDateTime(new Date().toISOString())}`)

  addSection(lines, 'Session Summary')
  addKv(lines, 'Session', sessionLabel(session))
  addKv(lines, 'Session ID', session.id)
  addKv(lines, 'Started', formatDate(session.date_start))
  addKv(lines, 'Ended', session.date_end ? formatDate(session.date_end) : 'Open / ongoing')
  addKv(lines, 'Total days', `Day ${daysUp(session.date_start, session.date_end)}`)
  addKv(lines, 'Total sleep recorded', `${session.sleep_hours ?? 0}h`)
  addKv(lines, 'Linked incidents', linkedIncidents.length)
  addKv(lines, 'Sensitive session', session.is_sensitive)

  addSection(lines, 'Main Session Notes')
  addKv(lines, 'Brief notes', visibleSessionText(role, session, 'brief_notes', session.brief_notes))
  addKv(lines, 'General notes', visibleSessionText(role, session, 'notes', session.notes))
  addKv(lines, 'Personal reflection', visibleSessionText(role, session, 'private_notes', session.personal_reflection))
  addKv(lines, 'Counsellor notes', visibleSessionText(role, session, 'counsellor_notes', session.counsellor_notes))
  addKv(lines, 'Lawyer notes', visibleSessionText(role, session, 'lawyer_notes', session.lawyer_notes))

  addSection(lines, 'Sleep Log')
  if (sleepLog.length) {
    sleepLog.forEach((log: AnyRow) => lines.push(`${formatDateTime(log.logged_at)} - +${valueText(log.hours_added)}h`))
  } else {
    lines.push('No sleep log entries recorded.')
  }

  addSection(lines, 'Mood Entries')
  if (sessionMoods.length) {
    sessionMoods.forEach((mood: AnyRow) => lines.push(`${formatDateTime(mood.occurred_at)} - ${valueText(mood.mood)} - ${valueText(mood.notes)}`))
  } else {
    lines.push('No mood entries recorded.')
  }

  addSection(lines, 'Usage Log')
  if (drugUseLog.length) {
    drugUseLog.forEach((log: AnyRow) => {
      const amount = log.amount != null ? `${log.amount} ${log.unit ?? ''}`.trim() : 'Not recorded'
      lines.push(`${formatDateTime(log.logged_at)} - ${valueText(log.substance)} - ${amount} - ${valueText(log.notes)}`)
    })
  } else {
    lines.push('No usage entries recorded.')
  }

  addSection(lines, 'Note Entries')
  if (sessionNotes.length) {
    sessionNotes.forEach((note: AnyRow) => lines.push(`${formatDateTime(note.occurred_at)} - ${valueText(note.content ?? note.note)} (${valueText(note.visibility ?? 'viewer+')})`))
  } else {
    lines.push('No visible note entries recorded.')
  }

  addSection(lines, 'Connected Incidents')
  if (linkedIncidents.length) {
    linkedIncidents.forEach((incident: AnyRow) => {
      const inc = asIncident(incident)
      lines.push(`${incidentLabel(inc)} - ${formatDateTime(incident.occurred_at)} - Severity ${valueText(incident.severity)}`)
      lines.push(`Description: ${valueText(visibleIncidentText(role, inc, 'description', incident.description))}`)
      lines.push(`Police called: ${valueText(incident.police_called)} | Ambulance called: ${valueText(incident.ambulance_called)} | Arrested: ${valueText(incident.was_arrested)} | Sectioned: ${valueText(incident.was_sectioned)}`)
    })
  } else {
    lines.push('No incidents linked to this session.')
  }

  addSection(lines, 'Tracker Entries')
  if (entries.length) {
    entries.forEach((entry: AnyRow) => lines.push(`${formatDateTime(entry.created_at)} - ${valueText(entry.entry_type ?? 'entry')} - ${valueText(entry.content)}`))
  } else {
    lines.push('No tracker entries recorded.')
  }

  addSection(lines, 'Session Timeline / Events')
  if (sessionEvents.length) {
    sessionEvents.forEach((event: AnyRow) => lines.push(`${formatDateTime(event.occurred_at)} - ${eventLabel(event)} - ${valueText(event.content ?? event.title ?? event.entry_type ?? event.event_type)}`))
  } else {
    lines.push('No session events recorded.')
  }

  return lines.join('\n')
}

function escapePdfString(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
}

function wrapLine(line: string, maxChars = 92) {
  const source = line.trimEnd()
  if (!source) return ['']
  const out: string[] = []
  let current = ''
  for (const word of source.split(/\s+/)) {
    if (!current) {
      current = word
    } else if ((current.length + word.length + 1) <= maxChars) {
      current += ` ${word}`
    } else {
      out.push(current)
      current = word
    }
  }
  if (current) out.push(current)
  return out
}

function buildContent(lines: string[]) {
  const body = lines.map(line => `(${escapePdfString(line)}) Tj T*`).join('\n')
  return `BT\n/F1 10 Tf\n14 TL\n50 790 Td\n${body}\nET`
}

export function createSimplePdfBuffer(title: string, textBody: string) {
  const wrapped = textBody
    .split(/\r?\n/)
    .flatMap(line => wrapLine(line))

  const linesPerPage = 52
  const pages: string[][] = []
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage))
  }
  if (!pages.length) pages.push([title])

  const objects: string[] = []
  const pageObjectIds: number[] = []
  const fontObjectId = 3

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pages.forEach((pageLines, index) => {
    const pageObjectId = 4 + (index * 2)
    const contentObjectId = pageObjectId + 1
    pageObjectIds.push(pageObjectId)
    const stream = buildContent(pageLines)
    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  })

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue
    offsets[id] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  const maxObjectId = objects.length - 1
  pdf += `xref\n0 ${maxObjectId + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let id = 1; id <= maxObjectId; id += 1) {
    const offset = offsets[id] ?? 0
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

export function renderTrackerReportPdf(report: TrackerReportData) {
  const title = `${sessionLabel(report.session)} - Full Session Report`
  return createSimplePdfBuffer(title, renderTrackerReportText(report))
}
