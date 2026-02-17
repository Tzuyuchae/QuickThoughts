import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { MemoProvider } from "@/app/context/MemoContext"
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter" 
});

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"], 
  variable: "--font-space-grotesk" 
});

export const metadata: Metadata = {
  title: 'Quick Thoughts - Voice Memo Transcription',
  description: 'Capture your thoughts with voice, transcribe instantly, and organize into folders. Quick Thoughts makes note-taking effortless.',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#191919',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className={`${inter.className} font-sans antialiased min-h-screen bg-background text-foreground`}>
        {/* MemoProvider wraps everything to share data across all routes */}
        <MemoProvider>
          {children}
        </MemoProvider>
        
        {/* Global UI Components */}
        <Toaster richColors closeButton />
        <Analytics />
      </body>
    </html>
  )
}