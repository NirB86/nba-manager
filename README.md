# NBA Manager (working title)

A basketball franchise management game in the spirit of Football Manager: run a
team as its GM (and optionally its head coach), build the roster, manage the
salary cap, trade, draft and hire staff across many seasons.

It is a web app that installs like a native app (PWA): open it in Safari on an
iPhone and tap **Share → Add to Home Screen**. It works offline; saves live on
the device and can be exported and imported as files.

The design document lives in Claude Docs and is the source of truth for scope
and decisions.

## Status

Phase 0 (foundation) is done:

- Fictional league generator: 30 teams, about 510 players with attributes,
  personalities, contracts and draft history, 7 years of draft picks, staff.
- League file format (`docs/league-format.md`) with validation, so any league
  (including real rosters from a future import script) can be loaded.
- Multiple career save slots in IndexedDB, with export and import.
- Screens: main menu, new career (league, team, role), home and inbox, roster,
  player profile, league, team pages, finances and cap sheet, staff, settings.
- Phone layout with a bottom tab bar, desktop layout with a sidebar, dark mode.

Next is Phase 1: the possession-based simulation engine and a playable season.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # engine tests
npm run build      # production build in dist/
```

## Layout

- `src/engine/` — pure TypeScript game engine (no UI or browser code):
  league format types, ratings model, contracts and CBA, generator, validation.
- `src/game/` — game rules that sit between engine and UI (careers, scouting).
- `src/storage/` — save slots in IndexedDB, export and import.
- `src/ui/` — React screens and components.
- `public/icons/` — app icons.

## Deployment

`.github/workflows/deploy.yml` runs the tests, builds, and publishes `dist/` to
GitHub Pages on every push to `main`. GitHub Pages must be enabled with
**Settings → Pages → Source: GitHub Actions**.

All teams, players and staff in the default league are fictional.
