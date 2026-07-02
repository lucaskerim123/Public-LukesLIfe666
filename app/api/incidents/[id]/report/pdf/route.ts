import { notFound, redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { getIncidentReportData } from '@/lib/incident-report'
import { renderIncidentReportPdf } from '@/lib/incident-report-pdf'
import { incidentLabel } from '@/lib/incidents'

export const runtime = 'nodejs'

function safeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const reportData = await getIncidentReportData(id, profile.role, profile.id)
  if (!reportData) notFound()

  const pdf = renderIncidentReportPdf(reportData)
  const filename = `${safeFilename(incidentLabel(reportData.incident)) || 'incident'}-report.pdf`

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
