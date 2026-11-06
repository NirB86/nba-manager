# Real NBA league import (personal use only)

Builds a league file with the current NBA teams, players, contracts and head
coaches, which you load in the game with **New career → Load a league file**.

Real player names and likenesses, and team names and logos, belong to their
owners. Use the output for personal play only: never commit it, host it, or
share it publicly. `.gitignore` already excludes `*.league.json`.

## Run

```bash
npm run import:fetch -- .bref-cache 2027
```

```bash
npm run import:build -- .bref-cache nba-2026-27.league.json 2027
```

`2027` is the Basketball-Reference season label for 2026-27 (the year the
season ends). The fetch step downloads about 77 pages, one every 3.5 seconds
(Basketball-Reference allows 20 requests a minute), and skips pages already in
the cache. Delete the cache folder to refresh after trades.

## Sources

All from Basketball-Reference: team rosters (bio, height, weight, birth date,
country, experience, head coach, arena), team contract pages (salary by year,
player and team options), league per-game, advanced and shooting stats for the
last two seasons, draft pages for the last 11 drafts, and the salary cap
history.

## How ratings are made

Our own model; nothing is copied from other games.

1. Stats from last season and this one are blended by minutes, and noisy
   rates are shrunk toward a replacement-level prior based on sample size.
2. Each 1-20 attribute is a recipe of stats (for example three-point =
   3P% 60% + 3PA per 36 minutes 40%), turned into a percentile among rotation
   players (400+ minutes).
3. The overall level is anchored to on-court impact: box plus-minus plus a
   minutes term, mapped onto the game's overall scale. Attributes keep their
   shape and shift together to reach it.
4. Players with under 300 minutes lean on their draft position instead.
5. Potential comes from age; personality traits are random but stable per player.

Debug one player's numbers with `DEBUG_PLAYER=<bref id>`, e.g.
`DEBUG_PLAYER=curryst01 npm run import:build -- ...`.

## Known gaps

- Traded future draft picks are not imported: every team starts with its own.
- Dead money (salary owed to waived players) is not counted in payroll.
- Assistant coaches, scouts and medical staff are generated, not real.
- Speed and vertical have no tracking data behind them and are estimated from
  height, weight, age, steals, blocks and dunks.
