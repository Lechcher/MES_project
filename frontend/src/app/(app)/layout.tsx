import { AppNav } from "@/components/shell/app-nav";
import { RequireViewer } from "@/components/shell/require-viewer";
import { MesLiveProvider } from "@/lib/mes/live-provider";

// Every screen in this tree resolves its viewer in the browser from
// `/api/mes/session`, so no prerendered shell can hold the screen's content.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireViewer>
      <MesLiveProvider>
        <div className="flex min-h-screen flex-col bg-background">
          <AppNav />
          <main className="mx-auto w-full max-w-[1312px] flex-1 px-6 py-8">
            {children}
          </main>
        </div>
      </MesLiveProvider>
    </RequireViewer>
  );
}
