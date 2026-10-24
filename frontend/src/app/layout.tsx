import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/mes/i18n/provider";
import { MesSessionProvider } from "@/lib/mes/session";
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
    <html lang="en" className={`${ibmPlexSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <LocaleProvider>
            <MesSessionProvider>{children}</MesSessionProvider>
          </LocaleProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
