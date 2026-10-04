# BUILD_STATUS

_Last updated: 2026-10-04 · model `proj-formula@0.3.1` · 68/68 tests passing · typecheck/build green · phase: **backend hardening + live-data validation**_

## DONE

### Backend hardening + live-data audit
- Work isolated on `feat/backend-hardening-live`; prior validated Sleeper changes preserved. No credentials are tracked or printed.
- LIVE mode no longer silently swaps in the fictional mock world. It requires a connected Sleeper league or manual roster; optional sources degrade to explicit unavailable/stale states.
- Added account-free manual analysis mode backed by real BALLDONTLIE player search and an HTTP-only temporary roster/scoring cookie.
- Added first-class `getPlayerOutlook`, `getGameIntelligence`, and `getWeeklyTeamOutlook` orchestration services and AI tools. Historical windows carry sample sizes; weekly output carries freshness and explicit missing factors.
- Added Open-Meteo weather abstraction and centralized weather TTL. Outdoor NFL venues fetch forecasts; domes are skipped; retractable roofs are not assumed open.
- Added structured provider request logs containing only sanitized endpoint, duration, cache state, success/error. No keys or authorization headers are logged.
- BALLDONTLIE adapter now uses the base player endpoint available on the configured tier rather than the paid `/players/active` endpoint, supports query/ID lookup, validates paginated envelopes, and remembers subscription-blocked optional capabilities per process.
- Projection objects expose whether the required observed inputs exist. Weekly orchestration returns null team projection values when inputs are unavailable rather than presenting zero as a real forecast.

### Live validation evidence (2026-10-04)
- **BALLDONTLIE:** NFL/NBA teams, base players, search, and games returned HTTP 200. Active players, game stats, and injuries returned HTTP 401 on the configured subscription tier. Manual NFL (Patrick Mahomes) and NBA (Stephen Curry) live roster pages rendered HTTP 200 without mock data. NBA game ingestion is date-bounded to recent/upcoming analysis because full-season pagination exceeds the free-tier request window.
- **SportsDataIO:** configured key returned HTTP 200 for documented NFL `Players` (6,254 records) and NBA `PlayersActiveBasic` (619 records). Adapter remains a deliberate stub because cross-provider identity/stat normalization is not implemented yet.
- **The Odds API:** sports list plus live NFL (14 events) and NBA (44 events) spreads/totals returned HTTP 200.
- **Exa:** search returned HTTP 200; structured classifier tests pass.
- **Open-Meteo:** forecast returned HTTP 200; outdoor and dome contract tests pass.
- **Sleeper:** public NFL state returned HTTP 200; no user league was invented or imported.
- **DeepSeek:** models endpoint returned HTTP 200; chat completion returned HTTP 402, so model execution is blocked by account balance despite a configured key.
- **Supabase:** project endpoint was reachable but the anonymous `teams` REST query returned HTTP 404, indicating the migration/table exposure is not active. No schema changes were applied.
- **Sportradar:** credentials exist, but adapters remain unimplemented; no endpoint was guessed.
- **Yahoo:** not configured; normalization remains pending a verified live response.

### Current status matrix
- NFL player/game data: **WORKING**; stats/injuries/advanced data: **BLOCKED by BALLDONTLIE tier**; weather/market: **WORKING**; projections: **PARTIAL** when stats are unavailable.
- NBA player/game data and multi-game schedule architecture: **WORKING**; stats/injuries/lineups/advanced data: **BLOCKED by tier/adapter**; market: **WORKING**; projections: **PARTIAL**.
- Manual roster: **WORKING** for live search, persistence, and shared context; manual arbitrary two-sided trade construction: **PARTIAL**.
- Sleeper: **WORKING** with fixture coverage; live user league validation awaits a real username.
- Yahoo: **NOT CONFIGURED**. SportsDataIO/Sportradar fallback orchestration: **PARTIAL / BLOCKED**.
- Analytics engines and mock regression suite: **WORKING**; live opportunity/trends/breakout/regression depend on paid historical/advanced inputs and are therefore **PARTIAL**.
- DeepSeek tool execution: **BLOCKED (HTTP 402)**. Deterministic local analyst and normalized tool execution: **WORKING**.

### Sleeper deep integration audit
- Audited and retained the existing fantasy-provider → normalized snapshot architecture; no duplicate Sleeper data path was introduced.
- Username lookup now resolves and persists the stable public `user_id`; `/connect` is NFL-focused, shows league season/team count/scoring, handles missing users and provider failures, and exposes a targeted **Sync league** action with last-sync time.
- Normalization preserves provider-reported starters, bench, and IR/reserve; manager mapping is `roster_id → owner_id → league user` and no longer silently assigns an unmatched user to roster 1.
- Real scoring settings feed projection/trade analytics; common custom bonuses, kicker, and DST keys are retained. Superflex and restricted flex slots preserve their eligibility rather than collapsing to FLEX.
- Waiver ownership includes IR players; trade validation continues to enforce actual team ownership; AI roster tools now receive normalized scoring, slots, starters, bench, IR, and league identity.
- Admin league inspection includes raw league/users/rosters/matchups/transactions, normalized teams/roster sizes, scoring and slot translations, mapping issues, cache provenance, provider health, and connection sync timestamp.
- Added isolated mocked-HTTP Sleeper tests; official public `state/nfl` and trending endpoints returned HTTP 200 in the 2026-10-04 smoke test. No credentials or invented user were used.

### Validation phase — Data Inspector (`/admin/data`)
- DEV/ADMIN-gated inspector (`lib/admin/guard.ts`: open in dev; production 404s unless `ADMIN_TOKEN` + `fs_admin` cookie — verified against `next start`).
- Selectors (URL state): sport, provider filter, team, player, game, league.
- Panels: internal identity · provider identities (LINKED / SYNTHETIC / NOT LINKED / NOT CONFIGURED) with ambiguous + unmatched refs surfaced and never linked · raw provider payloads (expandable JSON, provider/endpoint/timestamp/cache) · normalized objects · raw→normalized field checks · derived-analytics traces (opportunity, availability, value, breakout, regression) · projection trace (baseline → opportunity → efficiency → matchup → market → injury → median/floor/ceiling, NOT AVAILABLE where inputs are missing) with ✓/✗ reconciliation badges · provenance table · provider health (status, last success/failure, latency, requests, cache hit/miss/stale) · freshness (LIVE / N MIN AGO / N HOURS OLD / STALE) · AI tool inspector (run any registered tool, see its JSON Schema and the exact string the LLM receives) · mock/live comparison.
- Pipeline instrumentation: provider latency + cache telemetry, sanitized endpoints (secret query params redacted), bounded raw-payload store with credential redaction, per-row cache status in provenance, identity-mapping report, `unavailable`/`estimated` field flags on usage.
- Mock mode exercises the real code paths: synthetic BALLDONTLIE/Sleeper payloads in documented shapes are re-normalized through the real adapters; the real matcher runs over synthetic Sleeper refs; a deliberate same-name WR pair tests ambiguity.
- Defects found and fixed by the inspector: (1) live usage gaps rendered as `0%` instead of NOT AVAILABLE; (2) float noise in `confidence` sent to the LLM; (3) admin gate could be baked into a static page at build time; (4) opportunity trace used a rounded value (now reconciles for all 352 players).

### First build
- **Architecture**: normalized domain types (`lib/domain`), provider adapters → registry → snapshot → analytics context → services → UI. Business logic never touches provider payloads.
- **Mock mode** (`DATA_MODE=mock`, default): deterministic, fully fictional NFL (16 teams, 192 players, 6 weeks) and NBA (16 teams, 160 players, ~17 games) worlds with scripted storylines (injured starter + backup opportunity, breakout, TD-luck regression, minutes surge, minutes restriction). Clearly labeled in the UI everywhere.
- **Analytics engines** (`lib/analytics`): usage/redistribution model, projection (median/floor/ceiling/confidence/variance/ROS), opportunity score + trend, availability/participation risk (non-medical), value/VORP + market-vs-model stock labels, breakout, sustainability/regression, roster intelligence + weakness detection, trade evaluation (both sides, season re-sim), trade finder (conservative/balanced/aggressive) + acceptance heuristic, waiver fit + drop, scenario engine (out/starts/minutes), start/sit by win probability, Monte Carlo season sim, power rankings, walk-forward backtest.
- **UI**: landing (generative data orb, query ticker), command center, players explorer (URL-state filters), player intelligence page (6 tabs, charts, "What's changing?"), roster, Trade Lab (builder + finder), Scenario Engine, waivers, league, Ask, connect, admin model-performance. Loading/error/empty states, mobile bottom nav, ⌘K search, notifications.
- **AI layer** (`lib/ai`): provider abstraction (OpenAI chat-completions, Gemini generateContent), 21 registered Zod-validated tools, tool-calling loop (max 6 steps), injection-resistant system prompt, deterministic built-in analyst when no key is set. Tool traces shown in the UI.
- **Providers**: BALLDONTLIE (NFL+NBA teams/players/games/stats/injuries, verified against official OpenAPI), Sleeper (league/users/rosters/matchups/transactions/players/state, per docs.sleeper.com), The Odds API v4 (spreads/totals → implied team totals), Exa research (+ deterministic classifier), Yahoo OAuth 2.0 start/callback. Central cache policy, timeouts, retries, 429 handling, circuit breaker, stale-cache fallback, provider health endpoint.
- **ID mapping** across providers (strict → loose, rejects ambiguity).
- **Database**: `supabase/migrations/0001_init.sql` — full schema, provenance columns, append-only triggers on prediction tables, RLS (public reference reads, owner-scoped league/trade/AI data).
- **Security**: server-only env, Zod on every API, same-origin check on POSTs, per-IP rate limits, httpOnly cookies, OAuth state, security headers, no `dangerouslySetInnerHTML`, research text never forwarded as instructions.
- **Tests**: scoring, lineup optimizer, opportunity helpers, projection invariants, availability, scenario (NFL+NBA), trade validation/symmetry/reconciliation, trade finder, roster weakness, backtest, BALLDONTLIE + Sleeper normalization, ID mapping, research classifier.

## IN PROGRESS
- Projection calibration: NFL MAE 4.1 vs 4.2 naive baseline; NBA MAE 9.9 vs 10.0, range coverage 52–58% (target 60%). Formula baseline — ready for an ML model behind the same `projectPlayer` signature.

## NEXT
- Validate live mode with real keys using `/admin/data` (provider health → raw → normalized checks → traces → tool payloads) before exposing live data to users.
- Persist raw-payload samples + mapping reports to Supabase so the inspector survives restarts and works across serverless instances (today: process memory).
- Manual identity-resolution UI for AMBIGUOUS/UNMATCHED refs (write to `player_provider_ids` with `match_method = 'manual'`).
- Persist projection snapshots / model predictions / outcomes to Supabase on a schedule (tables exist; writer job not yet wired).
- Supabase Auth + store league connections, Yahoo refresh tokens (encrypted), and AI conversations server-side.
- Yahoo league normalization (needs a real response to verify field shapes).
- BALLDONTLIE advanced stats (snap/route data via `/nfl/v1/advanced_stats/*`, NBA `/nba/v2/stats/advanced`) to replace live-mode usage gaps; depth charts.
- Category (9-cat) league mode end-to-end (scoring helper exists; lineup/trade value still points-based).
- DST/K support in mock leagues; NBA back-to-back detection from schedule.
- Production CSP with nonces; move rate limiting to a shared store (Upstash/Vercel KV).
- Playwright E2E for the critical flows; Lighthouse pass.

## BLOCKED
- Nothing blocked in mock mode.

## NEEDS API KEY
| Feature | Env var |
|---|---|
| Live NFL/NBA data | `BALLDONTLIE_API_KEY` (+ `DATA_MODE=live`) |
| Market context (implied totals) | `THE_ODDS_API_KEY` |
| LLM analyst | `AI_PROVIDER` + `OPENAI_API_KEY`, `GEMINI_API_KEY` or `DEEPSEEK_API_KEY` |
| Live research events | `EXA_API_KEY` |
| Yahoo leagues | `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET` |
| Persistence | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| SportsDataIO / Sportradar fallbacks | keys + adapter verification against account docs (stubs in place) |

Sleeper needs no key.
