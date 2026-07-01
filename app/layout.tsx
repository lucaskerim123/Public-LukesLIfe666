import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import InactivityLogout from '@/components/auth/InactivityLogout'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mental Health Tracker',
  description: 'Private incident and session tracker',
  robots: 'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.className} antialiased min-h-screen bg-background`}>
        <style>{`
          .tracker-detail-page p.text-sm.font-mono.text-zinc-400::after {
            content: 'REDACTED' !important;
            text-shadow: none !important;
            letter-spacing: 0.35em !important;
          }
        `}</style>
        <InactivityLogout />
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  )
}
