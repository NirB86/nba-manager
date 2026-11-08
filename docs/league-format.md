# League file format (version 2)

A league file is one JSON document that holds everything a new career starts
from. The game ships with a generator for fictional leagues; any other league
(real rosters from an import script, or a hand-made one) uses the same format.
The TypeScript definition is `src/engine/types.ts` and `validateLeague()` in
`src/engine/validate.ts` checks files on import.

## Top level

| Field | Type | Notes |
| --- | --- | --- |
| `format` | `"nbam-league"` | Required, fixed value |
| `version` | number | `2` (version 1 files, without images, still load) |
| `meta` | object | `name`, `season` (year the season starts: 2026 = 2026-27), `source` (`fictional`, `real`, `custom`), `createdAt`, optional `seed` |
| `settings` | object | Cap figures and roster rules, below |
| `conferences` | list | Each `{ id, name, divisions: [{ id, name }] }` |
| `teams` | list | Below |
| `players` | list | Below |
| `staff` | list | Below |
| `draftPicks` | list | Below |

## settings

All money in US dollars.

| Field | Example |
| --- | --- |
| `salaryCap` | 154647000 |
| `luxuryTax` | 187895000 |
| `firstApron` | 195945000 |
| `secondApron` | 207824000 |
| `minimumSalary` | 1272870 |
| `maximumSalaryPct` | 0.35 |
| `rosterMax` / `rosterMin` | 15 / 13 |
| `twoWaySlots` | 3 |
| `capGrowth` | 0.07 (yearly growth used for projections) |

## teams

`{ id, city, name, abbrev, conferenceId, divisionId, market: "small" | "mid" | "large", colors: { primary, secondary }, arena, logo?, wordmark? }`

`logo` and `wordmark` (optional, v2) are image credits: `{ url, credit, license, source, sourceUrl }`. Only free-licensed images belong here; the game shows the credit.

## players

| Field | Notes |
| --- | --- |
| `id` | Unique string |
| `firstName`, `lastName` | |
| `teamId` | Team id, or `null` for a free agent |
| `position` | `PG`, `SG`, `SF`, `PF` or `C` |
| `jersey` | 0-99 |
| `born` | `{ year, country }` |
| `heightCm`, `weightKg` | |
| `attributes` | 1-20 each: `inside`, `midRange`, `three`, `freeThrow`, `finishing`, `passing`, `ballHandling`, `vision`, `iq`, `perimeterD`, `interiorD`, `rebounding`, `steals`, `blocks`, `speed`, `strength`, `vertical`, `stamina`, `durability` |
| `personality` | 1-20 each, hidden in the UI: `workEthic`, `consistency`, `ego`, `loyalty`, `injuryProneness` |
| `potential` | Ceiling on the 1-100 overall scale |
| `contract` | `null` or `{ years: [{ season, salary }], option: null or { season, type: "player" or "team" }, kind: "standard", "rookie", "two-way", "minimum" or "max", noTrade, signedSeason }` |
| `draft` | `null` (undrafted) or `{ season, round, pick, teamId }` |
| `experience` | Seasons played before the current one |
| `photo` | Optional (v2): `{ url, credit, license, source, sourceUrl }` for a free-licensed photo; `url` must be https |

The overall rating is not stored; the game computes it from attributes and position.

## staff

`{ id, firstName, lastName, teamId (or null), role: "HC" | "AC" | "SCOUT" | "MED" | "DEV", born, ratings: { tactics, development, motivation, judgment, medical, scouting } (1-20), contract: null or { salary, endSeason }, photo? }` (`photo` optional, v2, same shape as a player's)

## draftPicks

`{ id, season, round: 1 | 2, originalTeamId, ownerTeamId, protection: null or text such as "Top-10 protected" }`
