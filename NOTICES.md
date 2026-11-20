# Notices

## Bundled Telegram Web client (telegram-tt)

`frontend/public/telegram-web/` contains a production build of
**telegram-tt** — the Telegram Web A client by Alexander Zinchuk
(<https://github.com/Ajaxy/telegram-tt>).

- **Bundled version:** 13.0.1 (recorded at vendoring time; refresh with
  `bun run vendor:telegram-web`, see `docs/DEVELOPMENT.md` §15)
- **License:** GPL-3.0-or-later (see the upstream repository's `LICENSE`)
- **Use:** private, internal, non-commercial deployment of this system. The
  bundled client provides the complete Telegram chat surface for viewers'
  own accounts; MES wraps it with an account rail and a session-backup
  bridge and implements no Telegram protocol code itself.
- **Excluded from the bundle:** JavaScript source maps (`*.map`), the
  bundle-size report (`build-stats.json`, `statoscope-report.html`), and the
  `img-apple-160/`/`img-apple-64/` emoji tiles used only for generating
  home-screen icons (not used by the embedded workspace). Refresh the bundle
  from the same exclusions with the vendor script.

The rest of this repository's code is the MES project's own.