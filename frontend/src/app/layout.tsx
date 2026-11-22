import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/mes/i18n/provider";
import { MesSessionProvider } from "@/lib/mes/session";
import { prePaintThemeScript } from "@/lib/mes/theme/pre-paint";
import { ThemeProvider } from "@/lib/mes/theme/provider";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  // The Vietnamese subset carries the diacritics the Vietnamese locale needs;
  // latin alone renders them with fallback glyphs.
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  title: "ERP-MES System",
  description: "ERP-MES System.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
        Runs in <head> as the document parses, so the stored or OS-reported
        theme is already on the document element when the first frame paints —
        a dark viewer never sees a light flash, and the browser runs the script
        before any content is painted. React hydrates too late to do this.
        Inside <head> the script is ordered within the document instead of
        rendering as a child of <html>, which is what the browser warns about.
        The script is a compile-time constant (see `theme/pre-paint.ts`); no
        cookie value or request data is interpolated into it, so it cannot be
        steered into escaping this tag. `suppressHydrationWarning` on <html>
        tells React to accept the class this script writes before hydration
        rather than report it as a mismatch and recover from it.
      */}
      <head>
        <script
          id="mes-theme-pre-paint"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: compile-time constant script body, not request data
          dangerouslySetInnerHTML={{ __html: prePaintThemeScript() }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <LocaleProvider>
              <MesSessionProvider>{children}</MesSessionProvider>
            </LocaleProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
