# League file format (version 7)

A league file is one JSON document that holds everything a new career starts
from. The game ships with a generator for fictional leagues; any other league
(real rosters from an import script, or a hand-made one) uses the same format.
The TypeScript definition is `src/engine/types.ts` and `validateLeague()` in
`src/engine/validate.ts` checks files on import.

## Top level

| Field | Type | Notes |
| --- | --- | --- |
| `format` | `"nbam-league"` | Required, fixed value |
| `version` | number | `7` (versions 1 to 6 still load) |
| `meta` | object | `name`, `season` (year the season starts: 2026 = 2026-27), `source` (`fictional`, `real`, `custom`), `createdAt`, optional `seed`, optional `logo` and `draftLogo` (images, same shape as a player photo; version 3) |
| `deadMoney` | list | Optional (v7): salary still owed to waived players, `{ teamId, playerId, name, years: [{ season, salary }] }`; counts on that team's payroll |
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

`{ id, city, name, abbrev, conferenceId, divisionId, market: "small" | "mid" | "large", colors: { primary, secondary }, arena, logo?, wordmark?, arenaPhoto?, cityPhoto? }`

`arenaPhoto` (optional, v4) is a photo of the home arena, shown on page covers. `cityPhoto` (optional, v6) is a skyline or landmark of the team's city, shown when choosing a team. `logo` and `wordmark` (optional, v2) are image credits: `{ url, credit, license, source, sourceUrl }`. Shared league files should use free-licensed images only; the game shows the credit. A private, personal-use league file may link to official images (never commit or share it).

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
| `photo` | Optional (v2): `{ url, credit, license, source, sourceUrl, focus?, nonCommercial? }` for a free-licensed photo; `url` must be https. `focus` = `{ x, y, w, aspect }`: eye-line centre and face width as fractions of the image, and image height/width, used to frame headshots |
| `college` | Optional (v5): college(s) attended as text, e.g. `"Duke"` or `"Kentucky, UCLA"` |

The overall rating is not stored; the game computes it from attributes and position.

## staff

`{ id, firstName, lastName, teamId (or null), role: "HC" | "AC" | "SCOUT" | "MED" | "DEV", born, ratings: { tactics, development, motivation, judgment, medical, scouting } (1-20), contract: null or { salary, endSeason }, photo? }` (`photo` optional, v2, same shape as a player's)

## draftPicks

`{ id, season, round: 1 | 2, originalTeamId, ownerTeamId, protection: null or text such as "Top-10 protected" }`
