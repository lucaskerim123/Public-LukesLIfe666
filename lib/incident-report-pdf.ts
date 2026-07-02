import { formatDateTime } from '@/lib/utils'
import { incidentLabel, visibleIncidentList, visibleIncidentText } from '@/lib/incidents'
import { sessionLabel } from '@/lib/sessions'
import type { Document } from '@/lib/supabase/types'
import type { getIncidentReportData } from '@/lib/incident-report'

type IncidentReportData = NonNullable<Awaited<ReturnType<typeof getIncidentReportData>>>

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None recorded'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function canViewDocument(doc: Document, role: IncidentReportData['role'], userId: string) {
  return role === 'admin' || role === 'owner' || (!doc.is_sensitive && (!doc.allowed_user_ids.length || doc.allowed_user_ids.includes(userId)))
}

function addSection(lines: string[], title: string) {
  if (lines.length) lines.push('')
  lines.push(title.toUpperCase())
  lines.push(''.padEnd(Math.min(title.length, 72), '-'))
}

function addKv(lines: string[], label: string, value: unknown) {
  lines.push(`${label}: ${valueText(value)}`)
}

export function renderIncidentReportText(report: IncidentReportData) {
  const { incident, trackerSession, documents, role, userId } = report
  const lines: string[] = []
  const visiblePeople = visibleIncidentList(role, incident, 'people_involved', incident.people_involved)

  lines.push('Mental Health Incidents')
  lines.push(`${incidentLabel(incident)} - Incident Report`)
  lines.push(`Generated ${formatDateTime(new Date().toISOString())}`)

  addSection(lines, 'Incident Summary')
  addKv(lines, 'Incident #', incidentLabel(incident))
  addKv(lines, 'Occurred', formatDateTime(incident.occurred_at))
  addKv(lines, 'Severity', incident.severity)
  addKv(lines, 'Substance use', incident.substance_use ?? 'Not recorded')
  addKv(lines, 'Police called', incident.police_called)
  addKv(lines, 'Arrested', incident.was_arrested)
  addKv(lines, 'Ambulance called', incident.ambulance_called)
  addKv(lines, 'Sectioned', incident.was_sectioned)
  addKv(lines, 'Linked Session #', trackerSession ? sessionLabel(trackerSession) : 'None')
  addKv(lines, 'Front card summary', visibleIncidentText(role, incident, 'brief_summary', incident.brief_summary))

  addSection(lines, 'Detailed Incident Details')
  addKv(lines, 'Detailed Incident Details', visibleIncidentText(role, incident, 'description', incident.description))
  addKv(lines, 'Location', visibleIncidentText(role, incident, 'location', incident.location))
  addKv(lines, 'Who was involved', visiblePeople)
  addKv(lines, 'Notes', visibleIncidentText(role, incident, 'notes', incident.notes))
  addKv(lines, "What's outcome", visibleIncidentText(role, incident, 'outcome', incident.outcome))

  addSection(lines, 'Professional / Private Notes')
  addKv(lines, 'Note for counsellor and Lawyer', visibleIncidentText(role, incident, 'professional_note', incident.professional_note))
  addKv(lines, 'Private Notes', visibleIncidentText(role, incident, 'personal_notes', incident.personal_notes))

  addSection(lines, 'Attached Documents')
  if (documents.length) {
    ;(documents as Document[]).forEach((doc, index) => {
      const visible = canViewDocument(doc, role, userId)
      const label = `Document #${index + 1}`
      if (!visible || doc.is_sensitive) lines.push(`${label}: REDACTED - ${formatDateTime(doc.created_at)}`)
      else lines.push(`${label}: ${doc.filename} - ${formatDateTime(doc.created_at)}`)
    })
  } else {
    lines.push('No attached documents.')
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
    if (!current) current = word
    else if (current.length + word.length + 1 <= maxChars) current += ` ${word}`
    else {
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

function createSimplePdfBuffer(title: string, textBody: string) {
  const wrapped = textBody.split(/\r?\n/).flatMap(line => wrapLine(line))
  const linesPerPage = 52
  const pages: string[][] = []
  for (let i = 0; i < wrapped.length; i += linesPerPage) pages.push(wrapped.slice(i, i + linesPerPage))
  if (!pages.length) pages.push([title])

  const objects: string[] = []
  const pageObjectIds: number[] = []
  const fontObjectId = 3

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pages.forEach((pageLines, index) => {
    const pageObjectId = 4 + index * 2
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

export function renderIncidentReportPdf(report: IncidentReportData) {
  const title = `${incidentLabel(report.incident)} - Incident Report`
  return createSimplePdfBuffer(title, renderIncidentReportText(report))
}
