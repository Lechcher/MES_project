# MES Prototype — Frontend

A Next.js 16 (App Router) frontend prototype for the MES (project planning, attendance, leave, and performance management) system. It runs entirely on a typed in-memory mock data layer — no backend, no network calls, no real authentication.

## Getting Started

Install dependencies:

```bash
bun install
```

Run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

Available scripts (match `frontend/package.json`):

| Script | Purpose |
|--------|---------|
| `bun run dev` | Start the Next.js dev server |
| `bun run build` | Build for production |
| `bun run start` | Start the production server |
| `bun run lint` | Run Biome lint |
| `bun run format` | Run Biome formatter (write) |

## Mock data only

Every screen is powered by the mock layer under `frontend/src/lib/mock/`. Mutations mutate in-memory state and vanish on reload. Print/export produces a mock result dialog — no real files, no network. This lets every role view and flow be demonstrated immediately, with a typed seam ready for the future GraphQL client.

## Sign in

Without a viewer established, app routes redirect to `/signin`, which offers one demo account per role (`SUPER_ADMIN`, `TECH_LEAD`, `HR_MANAGER`, `DEPT_HEAD`, `EMPLOYEE`). Selecting an account establishes the viewer for the session; reloading clears it.
