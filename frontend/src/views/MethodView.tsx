import type { Meta } from "../types";
import { isoDateLabel } from "../format";

export function MethodView({ meta }: { meta: Meta }) {
  return (
    <div className="prose">
      <div className="page-intro">
        <h2>Method &amp; data</h2>
        <p>How every number in this portal is produced, so it can be checked and trusted.</p>
      </div>

      <h3>Data</h3>
      <ul>
        <li>
          <b>Actual wind:</b> {meta.sources.actuals}. {meta.counts.actuals.toLocaleString()} half-hours.
        </li>
        <li>
          <b>Forecast wind:</b> {meta.sources.forecasts}. {meta.counts.forecast_runs} runs ({meta.counts.forecast_rows.toLocaleString()}{" "}
          hourly values), published at {meta.forecast_run_times_uk.join(", ")} UK time.
        </li>
        <li>
          <b>Scope:</b> purchase decisions made {isoDateLabel(meta.decision_start)} – {isoDateLabel(meta.decision_end)} 2026, i.e.
          delivery days {isoDateLabel(meta.delivery_start)} – {isoDateLabel(meta.delivery_end)}.
        </li>
      </ul>

      <h3>Which forecast counts as “available at the decision”</h3>
      <p>
        For delivery day D, the decision is taken at the day-ahead auction gate closure on D-1: EPEX SPOT GB at{" "}
        <code>09:20</code> or Nord Pool N2EX at <code>09:50</code> (UK local time; any custom time can be chosen). For every
        delivery hour we use the most recent forecast with <code>publishTime ≤ gate closure</code>. Forecasts published later
        are never used for that decision: that would be look-ahead bias.
      </p>
      <p>
        The <i>fixed lead time</i> mode on the accuracy page instead scores, for each hour, the latest forecast published at
        least N hours earlier, which shows how accuracy changes with lead time.
      </p>

      <h3>Error metrics</h3>
      <ul>
        <li>
          <code>error = forecast − actual</code> (MW), compared at hourly start times present in both datasets. Positive
          means less wind than forecast: the desk is <b>short</b> and must buy the gap later, usually at a worse price.
        </li>
        <li>MAE (typical miss), RMSE (penalises large misses), bias (mean error), and normalised MAE (MAE / mean actual).</li>
        <li>MAPE is deliberately not used: wind output can fall close to zero, which makes percentage errors explode.</li>
      </ul>

      <h3>Uncertainty band (P10 – P90)</h3>
      <p>
        Built from the empirical 10th/90th percentiles of gate-closure errors on the <i>other</i> delivery days in the period
        (leave-one-day-out), applied to the day’s forecast. “P10 wind” = forecast − 90th-percentile error: wind came in at
        least this high in about 9 of 10 hours.
      </p>

      <h3>Bias-adjusted forecast</h3>
      <p>
        The forecast minus the mean error over the previous 7 fully settled delivery days. At gate closure on D-1, the last
        settled day is D-2, so the adjustment only uses information the desk actually had. The first two days of the period
        have no history and are left unadjusted.
      </p>

      <h3>Known limitations</h3>
      <ul>
        <li>Wind only, national level, as scoped. Demand, solar and prices would turn this into a full net-position view.</li>
        <li>Forecasts are hourly and actuals half-hourly; accuracy is scored on the shared hourly start times.</li>
        <li>FUELHH reports metered output after any curtailment, which may explain part of the persistent over-forecast.</li>
        <li>One month of history: error statistics will tighten (and become seasonal) with more data.</li>
      </ul>
    </div>
  );
}
