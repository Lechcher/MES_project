import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <main className="flex flex-col items-center gap-4 py-12 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">MES Prototype</h1>
        <p className="text-muted-foreground">
          Temporary launcher placeholder. Mock-data prototype — no backend yet.
        </p>
        <Link
          href="/signin"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/80"
        >
          Go to sign-in
        </Link>
      </main>
    </div>
  );
}
