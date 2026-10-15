import { AppNav } from "@/components/shell/app-nav";
import { Footer } from "@/components/shell/footer";
import { RequireViewer } from "@/components/shell/require-viewer";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireViewer>
      <div className="flex min-h-screen flex-col bg-background">
        <AppNav />
        <main className="mx-auto w-full max-w-[1312px] flex-1 px-6 py-8">
          {children}
        </main>
        <Footer />
      </div>
    </RequireViewer>
  );
}
