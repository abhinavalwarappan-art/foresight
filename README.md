# Foresight

**AI fantasy intelligence for NFL + NBA.** _Fantasy points tell you what happened. Foresight helps you understand what happens next._

Foresight combines box scores, opportunity/usage, availability, market context, league settings and roster construction into deterministic analytics — then puts an LLM on top that can only answer by calling those analytics as tools. It never treats the model as a source of statistics.

It runs fully without credentials: a deterministic, **fictional** mock world powers every page until you add keys.

---

## Product

| Surface | What it does |
|---|---|
| **Command Center** `/[sport]` | Matchup projection + model win probability, playoff/title odds (Monte Carlo), lineup & injury alerts, start/sit, weaknesses → Find trade/waiver, waiver and trade ideas, risers/fallers, league activity |
| **Players** `/[sport]/players` | Every player priced like an asset: value, projection range, opportunity, trend, market rank → model rank, BUY/SELL + signal tags. Filters live in the URL |
| **Player page** `/[sport]/players/[id]` | Projection distribution with inputs, opportunity signals, availability factors, "What's changing?", production-vs-opportunity and usage charts, game log, advanced, injuries, news |
| **Trade Lab** `/[sport]/trade` | Build any N-for-M trade; both sides evaluated (lineup, positional strength/depth, title odds, floor/ceiling); fairness, verdict (WIN-WIN…), acceptance estimate. **Find me a trade** scans the league for complementary surplus ↔ need |
| **Scenario Engine** `/[sport]/scenarios` | "What if X is out / starts / plays N minutes?" — usage redistributes by role and depth chart; beneficiaries ranked with waiver priority |
| **Waivers** | Personalized roster fit, reasons, recommended drop, before/after lineup |
| **Roster / League** | Team grades vs league, slot-by-slot weaknesses, power rankings, expected (all-play) records, simulated playoff/title odds |
| **Ask** | Tool-calling analyst with visible tool traces |
| **Admin** `/admin/model-performance` | Walk-forward backtest: MAE, RMSE, bias, range coverage, rank correlation, calibration, vs naive baseline |
| **Data Inspector** `/admin/data` | DEV/ADMIN. Every pipeline stage for any player/team/game/league: provider identities, raw payloads, normalized objects, analytics traces, projection trace, provenance, provider health, freshness, AI tool runner |

Every important number is tagged **Observed · Calculated · Projected · Market · AI interpretation**.

## Architecture

```
providers (BALLDONTLIE · Sleeper · Yahoo · Odds API · Exa · mock)
   │  adapters map payloads → normalized domain types (lib/domain)
   ▼
registry (lib/providers/registry.ts) — mode, fallbacks, ID mapping, health
   ▼
DataSnapshot  ──►  AnalyticsContext (lib/analytics/context.ts, memoized indexes + league baselines)
                        ▼
   usage model → projection → opportunity / availability / value / breakout / sustainability
   → roster → trade / trade-finder / waiver / scenario / matchup / simulation / backtest
                        ▼
services (lib/services) → Server Components & API routes → UI
                        ▲
AI agent (lib/ai) ── registered tools only ──┘
```

```
app/                     routes (App Router; [sport] = nfl | nba)
components/              ui · shell · player · trade · scenario · ask · charts · landing
lib/domain               normalized entities + Provenance
lib/providers            sports/ fantasy/ odds/ research/ · http.ts · health.ts · registry.ts
lib/cache                central TTL policy + store
lib/ids                  cross-provider player identity
lib/scoring              PPR / half / standard / NBA points / 9-cat helper
lib/analytics            all deterministic engines
lib/ai                   provider abstraction, OpenAI, Gemini, tools, system prompt, agent
lib/mock                 deterministic fictional worlds
supabase/migrations      Postgres schema + RLS
tests/                   Vitest
```

## Tech stack
Next.js 16 (App Router, Server Components, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Recharts · Zod · Vitest · Supabase/Postgres (schema) · Geist + Geist Mono.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3600
```

### Mock mode (default)
`DATA_MODE=mock`. Fictional players, teams and leagues, generated from fixed seeds (byte-for-byte reproducible). A banner marks mock data on every app page. Nothing is presented as real.

### Live mode
1. `DATA_MODE=live` and configure at least one implemented sports-data provider.
2. Visit `/connect` and either connect Sleeper or choose **Select my players** for a temporary manual analysis roster.
3. Optional: `THE_ODDS_API_KEY`, `EXA_API_KEY`, `AI_PROVIDER` + key.

`DATA_MODE=live` never substitutes the fictional mock world. A required-provider failure is surfaced as an error; optional stats, injuries, odds, research, or weather are returned as unavailable and shown in provenance. `DATA_MODE=mock` remains the explicit deterministic demonstration environment.

### Manual analysis mode

Manual mode does not create a fantasy league or require an account. Search the real BALLDONTLIE NFL/NBA player endpoint, select the players already on your roster, choose scoring, and store the temporary configuration in an HTTP-only development cookie. The resulting normalized context feeds roster intelligence, player outlooks, weekly outlook, scenarios, targets, and AI tools. Connected-league ownership features remain richer because manual mode cannot know league-wide ownership.

Sleeper itself needs **no API key, password, or OAuth token**. The connection stores only the stable public Sleeper user ID, league ID, provider name, and last-sync timestamp. Use **Sync league** on `/connect` to refresh league settings, managers, rosters, starters, reserves, matchups, and current-week transactions.

### Sleeper integration

The adapter uses the documented public endpoints for `user/<username>`, `user/<user_id>/leagues/nfl/<season>`, `league/<league_id>`, league `users`, `rosters`, `matchups/<week>`, `transactions/<week>`, `state/nfl`, and `players/nfl`. Provider payloads are normalized before reaching pages or AI tools.

- Sleeper owns league context: manager/roster ownership, reported starters and IR, settings, scoring, matchups, and transactions.
- Sports providers own real-world stats, schedules, injuries, and projections.
- Scoring translates passing, rushing, receiving, fumbles, two-point plays, common bonuses, kicker, and DST keys. Unknown settings remain harmless rather than being guessed.
- `SUPER_FLEX`, `WRRB_FLEX`, and `REC_FLEX` preserve distinct eligibility in the lineup optimizer.
- Identity matching is strict name + position + team first, then unique name + position; ambiguous and unmatched players are never silently linked and appear in `/admin/data?league=1`.
- Cache policy: player metadata 24 hours (7-day stale fallback), league/users 30 minutes, rosters/matchups/transactions 5 minutes. Manual sync invalidates league data but deliberately keeps the large player map warm.

### Intelligence orchestration

- `getPlayerOutlook` composes identity, ownership, projection, availability, opportunity, trend rate, historical windows with sample sizes, upcoming games, market context, and weather where available.
- `getGameIntelligence` composes opponents, venue, home/away, rest and NBA back-to-back state, injuries, market, and NFL weather relevance.
- `getWeeklyTeamOutlook` uses the same projection and lineup engines as the rest of the product and returns the recommended lineup, bench, team floor/median/ceiling, confidence, flags, freshness, and unavailable inputs.
- Open-Meteo supplies cached NFL forecasts for outdoor/relevant venues. Dome games skip weather. Retractable roofs are marked as such and are not assumed open.
- AI tools consume these normalized high-level objects. Provider responses and research page text are never sent directly to an LLM.

If an optional provider fails, the registry serves stale cached data when available or marks the factor unavailable. It never fills live-data gaps with invented values.

## Environment variables
See `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser; everything else is read in `lib/config/env.ts`, which imports `server-only` so a client import is a build error. `GET /api/health` reports which providers are configured (booleans only).

## Provider architecture
- Adapters implement `SportsProvider` / `FantasyProvider` / `OddsProvider` / `ResearchProvider` and return `Sourced<T>` (data + provenance).
- All network calls go through `providerFetch` (`lib/providers/http.ts`): cache-first by data class (`lib/cache/policy.ts`), timeout, exponential-backoff retries, 429 `Retry-After`, auth errors surfaced, 3-strike circuit breaker, stale-cache fallback.
- Endpoints/fields were taken from official docs: BALLDONTLIE OpenAPI (`nfl.yml`, `nba.yml`), docs.sleeper.com, The Odds API v4 guide, Exa search reference. SportsDataIO and Sportradar are wired as fallback **stubs** that refuse to run until verified against account documentation.

### Adding a sports provider
1. Create `lib/providers/sports/<name>.ts` implementing `SportsProvider`; map payloads into `Team`, `Player`, `Game`, `PlayerGame` (stats use the stat codes in `lib/scoring`, usage goes in `usage`), `Injury`.
2. Use `providerFetch` with the right `CacheClass`.
3. Add it to `SPORTS_CHAIN` in `registry.ts` (order = fallback priority) and to `providerStatus()`.
4. Add normalization tests in `tests/providers.test.ts`.

### Adding a fantasy provider
1. Implement `FantasyProvider` returning a `FantasyLeagueBundle` with player IDs in the provider's namespace plus `ExternalPlayerRef`s.
2. The registry maps IDs with `matchPlayers` (strict name+pos+team → name+pos, ambiguous matches rejected).
3. Register it in `FANTASY` in `registry.ts` and add a connect flow.

## How AI tools work
- `lib/ai/tools.ts` registers 21 tools (searchPlayers, getPlayerProfile, simulateTrade, findTrades, simulateScenario, getMarketExpectations, …). Each has a Zod schema (converted to JSON Schema for the LLM) and runs against the analytics context.
- `lib/ai/agent.ts` loops: model → tool calls → validated execution → results wrapped as data → model, up to 6 steps.
- Provider chosen by `AI_PROVIDER` (`openai` | `gemini` | `deepseek`); models via `OPENAI_MODEL` / `GEMINI_MODEL` / `DEEPSEEK_MODEL`. Without a key, a deterministic analyst plans the same tool calls and writes a templated answer.
- Guardrails: no tool fetches arbitrary URLs; research text is classified into structured events and never forwarded verbatim; the system prompt forbids un-sourced statistics, requires both-sides trade analysis and uncertainty, and treats tool output as untrusted data.

## Database setup
```bash
supabase link --project-ref <ref>
supabase db push            # applies supabase/migrations/0001_init.sql
```
Highlights: provenance on every provider row; `projection_snapshots`, `player_value_history` and `model_predictions` are append-only (UPDATE/DELETE raise) so a Monday 18.4 projection and a Saturday 15.8 revision both survive for backtesting; RLS makes reference data world-readable and league/trade/AI data owner-only. Server-side jobs write reference data with the service role.

## Testing
```bash
npm test             # vitest — 68 tests: scoring, lineup, engines, trades, scenarios, providers, Sleeper, ID mapping,
                     # ambiguity, missing data, analytics-trace reconciliation, tool outputs, freshness, redaction
npm run typecheck
npm run build
```

## Data Inspector (`/admin/data`)
Internal validation tool for checking the pipeline before (and after) enabling live mode.

- **Open it:** `npm run dev` → <http://localhost:3600/admin/data> (also linked as "Data inspector · DEV" in the app sidebar). In production it returns 404 unless `ADMIN_TOKEN` (≥24 chars) is set and the request carries cookie `fs_admin=<ADMIN_TOKEN>`; replace `lib/admin/guard.ts` with a real role check once auth lands.
- **Select** sport, provider filter, team, player, game, or "Inspect league" — all state is in the URL, so any view can be shared.
- **Sections:** 1 identity · 2 provider IDs (+ ambiguous/unmatched refs, never auto-linked) · 3 raw payloads · 4 normalized objects + raw→normalized field checks · 5 derived-analytics traces · 6 projection trace · 7 provenance · 8 provider health · 9 freshness · 10 AI tool inspector · 11 mock/live comparison.
- **Mock mode:** raw payloads are *synthetic*, built in the documented provider shapes and pushed through the real adapters; labeled SYNTHETIC everywhere.
- **Live mode:** raw bodies are captured by the adapters (process memory, bounded, credential-redacted) and identity mapping comes from the last league load.
- **Debugging a bad AI answer:** source data (3, 7) → normalization (4) → analytics (5, 6; every trace shows whether its steps reproduce the engine output) → tool payload (10, exact string the LLM gets) → otherwise it's the model's reasoning.
- `POST /api/admin/tools` (same gate) runs a registered tool and returns `{ ok, durationMs, bytes, llmMessage, result }`.

## Deployment
Vercel: import the repo, set env vars, deploy. All data routes are dynamic server routes; secrets stay server-side. Before production: set `ADMIN_TOKEN` (or real auth) for `/admin/*`, add a nonce-based CSP, move rate limiting to a shared store, and enable Supabase Auth.

## Legal / product language
Fantasy sports analytics only. Projections and probabilities are model estimates, never guarantees. Availability scores estimate participation, not medical outcomes. Market data is analytical context, not betting advice.
