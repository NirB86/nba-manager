# Project notes for Claude

- Basketball franchise management game, web app + PWA. Working title "NBA Manager";
  the default league must stay fictional (no real NBA team names, logos or players).
- Keep `src/engine/` free of UI, DOM and browser APIs so it can run in a Web Worker,
  in tests, and in a desktop wrapper.
- Every UI screen must work at phone width (iPhone, 390px) and desktop. Wide tables
  hide secondary columns with the `hide-sm` class.
- Potential is never shown exactly in the UI: use `potentialRange()` (scout estimate).
- Changing the league file shape means bumping `LEAGUE_FORMAT_VERSION` and updating
  `docs/league-format.md` and `validateLeague()`.
- Run `npm test` and `npm run build` before committing.
- Real NBA data only via `tools/import-real/` into a local `*.league.json`; never commit
  real-league output or page caches (the repo is public).
