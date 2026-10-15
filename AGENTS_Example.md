# MockMate - Agent Guidelines

## App

- **Name**: MockMate
- **Platform**: Mobile (iOS & Android)
- **Directory**: `MockMate/`

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo) |
| CMS / Backend | Sanity |
| AI | AI SDK (Vercel) |
| Payments | RevenueCat |
| Validation | Zod |
| Testing | Jest |
| Linting / Formatting | BiomeJS (replaces Prettier + ESLint) |
| Icons | Lucide React Native |
| Styling | Uniwind (Tailwind CSS v4 for React Native) |
| Authentication | Appwrite (Google OAuth via `react-native-appwrite`) |
| State Management | Zustand + React Query |

## Design

App designs live in **`designs/`** folder (17 PNGs: Home, Explore, Quests, Shop, Profile, Interview Detail, Interview Mode, Text/Voice Interview, Results, History, Saved, VIP, Subscription, Splash, Streak Popup, etc.). Figma source: https://www.figma.com/design/RX73sEuTfKKNh66AzU408Q/AI-Mock-Interviewer?m=auto&t=YqmrJrCQfzCmRK5q-6

For detailed mobile styling rules, screen layouts, design tokens, and color palettes, see [**`DESIGN-MOBILE.md`**](DESIGN-MOBILE.md).

> For Google OAuth setup, see [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md).
> Run `npm run check:native` in `MockMate/` to verify the dev client autolinks any
> remaining native modules (RevenueCat, gesture-handler, etc.).

## Rules

### General

- Plan first, then act. Break work into tasks before writing code.
- Use `openspec` workflow for proposing and implementing changes.
- Keep diffs minimal. Prefer editing existing files over creating new ones.
- Follow existing code conventions and patterns in the codebase.

### Environment Variables

- Write example values in `.env.example` only.
- **Never** read, write, or commit `.env`. It is gitignored.
- Reference env vars via `process.env.EXPO_PUBLIC_*` for client-side or `process.env.*` for server-side.

### Dependencies

- If a new dependency is required, update this file's **Stack** table above.
- Prefer stdlib/native/already-installed packages before adding new ones.
- Use `npm-check-updates` skill to check newest package versions before adding or upgrading dependencies.
- Search source code or official documentation to verify how to use a package before integrating it.

### Styling

- Use **Uniwind** (Tailwind CSS v4) for all styling via `className` props.
- Do not use inline `style` objects unless Uniwind cannot express it.
- Follow Uniwind patterns: `className="flex-1 bg-white p-4"`.

#### Uniwind Setup

- **Global CSS**: `MockMate/global.css` with `@import 'tailwindcss';` and `@import 'uniwind';`
- **Metro Config**: `MockMate/metro.config.js` wrapped with `withUniwindConfig(config, { cssEntryFile: './global.css', dtsFile: './uniwind-types.d.ts' })`
- **Import Location**: `import '../../global.css'` in `MockMate/src/app/_layout.tsx` (NOT in `expo-router/entry`)
- **Type Declarations**: Auto-generated at `MockMate/uniwind-types.d.ts` when Metro runs
- **VSCode IntelliSense**: Configured in `MockMate/.vscode/settings.json` with `tailwindCSS.classAttributes` for React Native props

### Testing

- Write Jest tests for non-trivial logic.
- Test files live next to source: `foo.ts` → `foo.test.ts`.

### Validation

- Use Zod schemas at trust boundaries (API responses, form input, env parsing).

### Linting & Formatting

- BiomeJS formats and lints the codebase. Do not add Prettier or ESLint configs.
- Run `npx @biomejs/biome check --write` from `MockMate/` to format + fix safe lint issues.
- Import order is handled by Biome's `assist.actions.source.organizeImports`. Do not add separate import-sort plugins.
- Leave non-trivial lint suppressions with an inline `// biome-ignore` comment and a one-line reason.

### AI

- Use AI SDK for all LLM interactions.
- Keep prompts in dedicated files, not inline strings.
- Configure OpenAI-compatible endpoint via `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` environment variables.
- Use `createOpenAI` from `@ai-sdk/openai` to create a client with custom base URL.
- AI chat API route is at `/api/chat+api.ts` and uses streaming responses.

#### Text-to-Speech (TTS)
- API route: `/api/tts+api.ts`
- Hook: `useTTS()` from `src/hooks/useTTS.ts`
- Model configured via `OPENAI_TTS_MODEL` environment variable
- Returns base64 audio, plays via Expo AV
- Usage: `const { generateAndPlay, stop, isGenerating } = useTTS()`

#### Speech-to-Text (STT)
- API route: `/api/stt+api.ts`
- Hook: `useSTT()` from `src/hooks/useSTT.ts`
- Model configured via `OPENAI_STT_MODEL` environment variable
- Records audio via Expo AV, transcribes to text
- Usage: `const { startRecording, stopRecording, transcribeAudio, isRecording } = useSTT()`

### Payments

- Use RevenueCat SDK for subscriptions and in-app purchases.
- Never hardcode product IDs; reference from config.

### CMS

- Use Sanity client for content queries.
- Keep GROQ queries co-located with the components that use them.
