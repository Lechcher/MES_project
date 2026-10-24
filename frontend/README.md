This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Testing

This project uses [Playwright](https://playwright.dev/) for end-to-end
browser testing and [Sentry](https://sentry.io/) for error tracking and
performance monitoring.

### End-to-End Tests

```bash
# Install Playwright browsers (one-time setup)
bun run test:e2e:install

# Run tests in headless mode
bun run test:e2e

# Run tests in headed browser
bun run test:e2e:headed

# Run tests in CI mode (JUnit reporter)
bun run test:e2e:ci

# Open interactive UI mode
bun run test:e2e:ui
```

Tests live in `frontend/tests/` with page objects under `pages/` and
fixtures under `fixtures/`. See `docs/testing.md` for details.

### Sentry

Sentry is configured for error tracking and performance monitoring.
Environment variables are documented in `frontend/.env.example`.

Required variables:
- `NEXT_PUBLIC_SENTRY_DSN` — Client SDK DSN
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — Source map upload

See `docs/sentry.md` for setup and configuration details.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
