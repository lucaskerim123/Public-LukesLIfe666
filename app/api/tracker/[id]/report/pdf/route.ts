import { notFound, redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { getTrackerReportData } from '@/lib/tracker-report'
import { renderTrackerReportPdf } from '@/lib/tracker-report-pdf'
import { sessionLabel } from '@/lib/sessions'

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

  const reportData = await getTrackerReportData(id, profile.role)
  if (!reportData) notFound()

  const pdf = renderTrackerReportPdf(reportData)
  const filename = `${safeFilename(sessionLabel(reportData.session)) || 'session'}-full-report.pdf`

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
