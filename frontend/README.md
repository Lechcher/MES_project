# MES Prototype — Frontend

The web client for the **MES Prototype**: project planning, attendance, leave, and
performance management. It is a [Next.js](https://nextjs.org) App Router
application (Next.js 16, React 19) styled with Tailwind CSS v4 and built from
shadcn + Base UI primitives.

## Running locally

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

Other scripts:

| Script | Purpose |
| --- | --- |
| `bun run dev` | Start the development server. |
| `bun run build` | Production build. |
| `bun run start` | Serve the production build. |
| `bun run lint` | Biome check (lint + format + import order). |
| `bun run format` | Biome format, writing changes. |

## Mock data only

This frontend runs on a **typed, in-memory mock data layer** under
`src/lib/mock/`. There is no backend integration: every screen reads from
fixtures shaped by the GraphQL contract in
[`../API_CONTACT_SPECIFICATION.md`](../API_CONTACT_SPECIFICATION.md), write
actions mutate in-memory state only, and Print/Export produce mock results
without generating real files. No network requests are made, and a page reload
restores the seed data.

The mock layer is the seam where the real GraphQL client will plug in later: the
per-module service functions (`src/lib/mock/services/*`) are the swap point, and
the screens do not depend on the transport.

## Theme

The visual theme follows [`../DESIGN.md`](../DESIGN.md) — a light IBM
Carbon-inspired system: white canvas, IBM Blue `#0f62fe` accent, flat-square 0px
corners, IBM Plex Sans, and hairline borders.
