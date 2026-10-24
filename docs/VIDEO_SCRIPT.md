# Video talk track (≤ 10 min)

## Part 1: client pitch (≤ 5 min)

1. **The problem (30 s).** You buy power a day ahead, at 09:20 (EPEX) or 09:50 (N2EX). Wind covers a big, variable part of demand, so every MW of wind you overestimate is a MW you must buy later, usually at a worse price.
2. **Day-ahead view (90 s).** Pick a delivery day, for example Thu 15 Jan.
   - The context strip shows exactly which forecast you had: published 07:30, 16.5–39.5 h ahead. The next run comes out 10 minutes *after* EPEX closes.
   - Blue is the forecast you would have bought against. The shaded band is the range wind actually landed in for 8 of 10 hours this month. Orange is what really happened.
   - The KPI tiles give the forecast energy, a prudent P10 figure (how much cover to hold), and the shortfall vs forecast.
   - Toggle "runs after gate" to show the forecast kept moving after you had to commit.
3. **Accuracy view (90 s).**
   - Typical miss is 2 GW (18% of output). More important, it is **one-sided**: the forecast was too high in 85% of hours, by +1.7 GW on average.
   - Lead-time chart: waiting longer helps only a little. The bias is the bigger lever.
   - **A simple 7-day bias correction cuts the error by 17%** with no new data.
   - EPEX vs N2EX: bidding into N2EX lets you use the 09:30 run.
4. **Close (30 s).** Pilot outcome: a quantified, auditable view of wind risk at the moment of decision. Next: add demand and solar to get net volume, then price-aware risk.

## Part 2: tech lead review (≤ 5 min)

1. **Architecture (60 s).** Show the README diagram. FastAPI and pandas backend, React, TypeScript and Recharts frontend, one Docker image, Vercel or Heroku. Data is a 110 KB snapshot of immutable January data, with live-fetch fallback.
2. **Code tour (2 min).**
   - `forecast_selection.py`: the core rule `publishTime ≤ gate closure`, chosen per target hour, with the Europe/London timezone and clock-change handling.
   - `metrics.py`: the sign convention, and why MAPE is avoided.
   - `analysis.py`: use cases, memoisation, the leave-one-out band, and the trailing bias with D-2 to stop look-ahead.
   - `api.py` / `schemas.py`: thin HTTP layer and typed contract, mirrored in `types.ts`.
   - Frontend: views, a shared ChartCard with a table view, the `useApi` hook.
3. **Practices (60 s).** Tests (including the no-look-ahead test), ruff and tsc strict, CI with a Docker smoke test, a validated colour palette, and dark mode.
4. **Trade-offs and next steps (60 s).** In-memory compute is fine at this size; scheduled ingestion into a database would be needed for live use. Hourly vs half-hourly alignment. Level-dependent quantile bands.
