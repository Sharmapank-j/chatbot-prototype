import { Toaster } from "@/components/ui/sonner"
import { Providers } from "@/components/utility/providers"
import TranslationsProvider from "@/components/utility/translations-provider"
import initTranslations from "@/lib/i18n"
import { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ReactNode } from "react"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })
const APP_NAME = "Indica Anime Us"
const APP_DEFAULT_TITLE = "Indica Anime Us — Comic to Anime Studio"
const APP_TITLE_TEMPLATE = "%s · Indica Anime Us"
const APP_DESCRIPTION = "A local-first workspace for turning authorized comic page batches into editable anime storyboards, Hindi/English dialogue and video."

interface RootLayoutProps {
  children: ReactNode
  params: { locale: string }
}

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_DEFAULT_TITLE, template: APP_TITLE_TEMPLATE },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black", title: APP_NAME },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: { default: APP_DEFAULT_TITLE, template: APP_TITLE_TEMPLATE },
    description: APP_DESCRIPTION
  },
  twitter: {
    card: "summary",
    title: { default: APP_DEFAULT_TITLE, template: APP_TITLE_TEMPLATE },
    description: APP_DESCRIPTION
  }
}

export const viewport: Viewport = { themeColor: "#08090d" }
const i18nNamespaces = ["translation"]

export default async function RootLayout({ children, params: { locale } }: RootLayoutProps) {
  const { t, resources } = await initTranslations(locale, i18nNamespaces)

  return (
    <html lang={locale === "hi" ? "hi" : "en"} suppressHydrationWarning>
      <body className={inter.className}>
        <Providers attribute="class" defaultTheme="dark">
          <TranslationsProvider namespaces={i18nNamespaces} locale={locale} resources={resources}>
            <Toaster richColors position="top-center" duration={3000} />
            <div className="min-h-dvh w-full overflow-x-hidden bg-background text-foreground">
              {children}
            </div>
          </TranslationsProvider>
        </Providers>
      </body>
    </html>
  )
}
