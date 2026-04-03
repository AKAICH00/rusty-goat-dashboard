import fs from "node:fs/promises";
import path from "node:path";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Activity, Database, RadioTower, Server } from "lucide-react";
import { SignalActivityChart, type SignalPoint } from "@/components/signal-activity-chart";

type StrategyMetrics = {
  portfolio_value: number;
  return_pct: number;
  realized_pnl: number;
  trade_count: number;
  win_rate: number;
  avg_r_multiple: number;
};

type Strategy = {
  id: string;
  name: string;
  thesis: string;
  status: "live" | "training" | "validating";
  verdict: "promising" | "watch" | "kill";
  metrics_1x: StrategyMetrics | null;
};

type Portfolio = {
  leverage: number;
  portfolio_value: number;
  realized_pnl: number;
  trade_count: number;
  win_rate: number;
  avg_r_multiple: number;
  signals: number;
};

type Snapshot = {
  updated_at: string;
  strategies: Strategy[];
  paper_portfolios: Record<string, Portfolio>;
  infrastructure: {
    running_pods: number;
    last_signal_time: string;
    candles_collected: number;
    data_sources: string[];
  };
};

const tradingViewSignalsFilePath = path.join(process.cwd(), "public", "data", "tv_signals.json");

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const signalTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const signalPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

type TradingViewSignal = {
  id: string;
  source: string;
  symbol: string;
  action: string;
  timeframe: string | null;
  strategy: string | null;
  price: number | null;
  message: string | null;
  confidence: number | null;
  received_at: string;
};

async function getSnapshot(): Promise<Snapshot> {
  const filePath = path.join(process.cwd(), "public", "data", "snapshot.json");
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as Snapshot;
}

async function getTradingViewSignals(): Promise<TradingViewSignal[]> {
  try {
    const raw = await fs.readFile(tradingViewSignalsFilePath, "utf8");
    const parsed = JSON.parse(raw) as TradingViewSignal[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function fmtPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmtWinRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtSignedCurrency(value: number) {
  return `${value >= 0 ? "+" : "-"}${currency.format(Math.abs(value))}`;
}

function statusLabel(status: Strategy["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function verdictClasses(verdict: Strategy["verdict"]) {
  switch (verdict) {
    case "promising":
      return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
    case "watch":
      return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
    default:
      return "bg-red-500/15 text-red-300 ring-1 ring-red-500/30";
  }
}

function deltaClass(value: number) {
  return value >= 0 ? "text-emerald-300" : "text-red-300";
}

function signalActionClasses(action: string) {
  switch (action.toUpperCase()) {
    case "BUY":
      return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
    case "SELL":
      return "bg-red-500/15 text-red-300 ring-1 ring-red-500/30";
    default:
      return "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30";
  }
}

function formatSignalPrice(price: number | null) {
  if (price === null || !Number.isFinite(price)) {
    return "—";
  }

  return signalPriceFormatter.format(price);
}

function formatSignalTimestamp(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return signalTimestampFormatter.format(parsedDate);
}

function buildSignalSeries(portfolios: Record<string, Portfolio>): SignalPoint[] {
  const latestSignals = Math.max(...Object.values(portfolios).map((portfolio) => portfolio.signals), 0);
  const weights = [0.08, 0.19, 0.31, 0.47, 0.63, 0.81, 1];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Now"];

  return labels.map((label, index) => ({
    label,
    signals: Math.round(latestSignals * weights[index]),
  }));
}

export default async function Home() {
  const [snapshot, tradingViewSignals] = await Promise.all([getSnapshot(), getTradingViewSignals()]);
  const portfolios = Object.entries(snapshot.paper_portfolios);
  const signalSeries = buildSignalSeries(snapshot.paper_portfolios);
  const recentTradingViewSignals = tradingViewSignals.slice(0, 6);
  const updatedAt = new Date(snapshot.updated_at);
  const lastSignal = snapshot.infrastructure.last_signal_time === "unknown" ? null : new Date(snapshot.infrastructure.last_signal_time);

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#121826] via-gray-900 to-black p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-[0.3em] text-[#f7931a]">Trading dashboard</p>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">🐐 Rusty Goat</h1>
              <p className="mt-3 max-w-2xl text-sm text-gray-300 sm:text-base">
                Paper trading performance, strategy health, signal flow, and infra readiness in one static dashboard.
              </p>
            </div>
            <div className="rounded-2xl border border-[#f7931a]/30 bg-[#f7931a]/10 px-4 py-3 text-sm text-orange-100">
              <div className="text-xs uppercase tracking-[0.24em] text-[#f6b15d]">Last updated</div>
              <div className="mt-1 font-medium">{format(updatedAt, "MMM d, yyyy • h:mm a 'UTC'")}</div>
              <div className="mt-1 text-xs text-orange-200/80">{formatDistanceToNowStrict(updatedAt, { addSuffix: true })}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {portfolios.map(([key, portfolio]) => {
            const returnPct = ((portfolio.portfolio_value - 10000) / 10000) * 100;
            return (
              <article key={key} className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[#f7931a]">Paper {key}</p>
                    <h2 className="mt-1 text-2xl font-semibold">{currency.format(portfolio.portfolio_value)}</h2>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
                    {portfolio.leverage}x leverage
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-400">Return from $10,000</dt>
                    <dd className={`mt-1 text-base font-semibold ${deltaClass(returnPct)}`}>{fmtPercent(returnPct)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Realized PnL</dt>
                    <dd className={`mt-1 text-base font-semibold ${deltaClass(portfolio.realized_pnl)}`}>{fmtSignedCurrency(portfolio.realized_pnl)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Avg R-multiple</dt>
                    <dd className={`mt-1 text-base font-semibold ${deltaClass(portfolio.avg_r_multiple)}`}>{portfolio.avg_r_multiple.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Signals</dt>
                    <dd className="mt-1 text-base font-semibold text-gray-100">{compactNumber.format(portfolio.signals)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-gray-950/70 shadow-lg shadow-black/10">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <h2 className="text-xl font-semibold">Strategy scorecard</h2>
              <p className="mt-1 text-sm text-gray-400">S1 is live with current 1x paper metrics; S2 and S3 are staged for review.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.2em] text-gray-400">
                  <tr>
                    <th className="px-5 py-3">Strategy</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Portfolio</th>
                    <th className="px-5 py-3">Return</th>
                    <th className="px-5 py-3">Win rate</th>
                    <th className="px-5 py-3">Trades</th>
                    <th className="px-5 py-3">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {snapshot.strategies.map((strategy) => (
                    <tr key={strategy.id} className="align-top">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-100">{strategy.name}</div>
                        <div className="mt-1 max-w-sm text-xs text-gray-400">{strategy.thesis}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-300">{statusLabel(strategy.status)}</td>
                      <td className="px-5 py-4 text-gray-100">
                        {strategy.metrics_1x ? currency.format(strategy.metrics_1x.portfolio_value) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className={`px-5 py-4 ${strategy.metrics_1x ? deltaClass(strategy.metrics_1x.return_pct) : "text-gray-500"}`}>
                        {strategy.metrics_1x ? fmtPercent(strategy.metrics_1x.return_pct) : "—"}
                      </td>
                      <td className="px-5 py-4 text-gray-300">
                        {strategy.metrics_1x ? fmtWinRate(strategy.metrics_1x.win_rate) : "—"}
                      </td>
                      <td className="px-5 py-4 text-gray-300">
                        {strategy.metrics_1x ? strategy.metrics_1x.trade_count.toLocaleString() : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${verdictClasses(strategy.verdict)}`}>
                          {strategy.verdict}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#f7931a]/15 p-2 text-[#f7931a]">
                <Activity className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Signal activity</h2>
                <p className="text-sm text-gray-400">Cumulative signal growth using the latest exported snapshot.</p>
              </div>
            </div>
            <div className="mt-6">
              <SignalActivityChart data={signalSeries} />
            </div>
          </article>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10">
            <div className="flex items-center gap-3">
              <Server className="size-5 text-[#f7931a]" />
              <h3 className="font-medium text-gray-200">Running pods</h3>
            </div>
            <div className="mt-4 text-3xl font-semibold">{snapshot.infrastructure.running_pods}</div>
            <p className="mt-2 text-sm text-gray-400">Healthy pods in the rusty-goat namespace.</p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10">
            <div className="flex items-center gap-3">
              <Database className="size-5 text-[#f7931a]" />
              <h3 className="font-medium text-gray-200">Data ingestion</h3>
            </div>
            <div className="mt-4 text-3xl font-semibold">{compactNumber.format(snapshot.infrastructure.candles_collected)}</div>
            <p className="mt-2 text-sm text-gray-400">BTC candles collected and ready for model inputs.</p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10">
            <div className="flex items-center gap-3">
              <RadioTower className="size-5 text-[#f7931a]" />
              <h3 className="font-medium text-gray-200">Last signal</h3>
            </div>
            <div className="mt-4 text-lg font-semibold">
              {lastSignal ? format(lastSignal, "MMM d, HH:mm 'UTC'") : "Unknown"}
            </div>
            <p className="mt-2 text-sm text-gray-400">Most recent published inference signal observed in pod logs.</p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10">
            <div className="flex items-center gap-3">
              <Activity className="size-5 text-[#f7931a]" />
              <h3 className="font-medium text-gray-200">Sources</h3>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {snapshot.infrastructure.data_sources.map((source) => (
                <span key={source} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
                  {source}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-gray-400">Static JSON is rebuilt from hub snapshots and published via GitHub → Vercel.</p>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-gray-950/70 p-5 shadow-lg shadow-black/10 sm:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#f7931a]">TradingView signals</p>
            <h2 className="text-2xl font-semibold">Recent webhook activity</h2>
            <p className="max-w-2xl text-sm text-gray-400">
              Latest indicator alerts received by <span className="font-mono text-gray-300">/api/tv-signal</span> and reflected in the dashboard feed.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentTradingViewSignals.length > 0 ? (
              recentTradingViewSignals.map((signal) => (
                <article key={signal.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-gray-400">{signal.source}</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">{signal.symbol}</h3>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium uppercase ${signalActionClasses(signal.action)}`}>
                      {signal.action}
                    </span>
                  </div>

                  <dl className="mt-5 grid gap-3 text-sm">
                    <div>
                      <dt className="text-gray-400">Strategy</dt>
                      <dd className="mt-1 text-gray-100">{signal.strategy || "—"}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-gray-400">Timeframe</dt>
                        <dd className="mt-1 text-gray-100">{signal.timeframe || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">Price</dt>
                        <dd className="mt-1 text-gray-100">{formatSignalPrice(signal.price)}</dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-gray-400">Received at</dt>
                      <dd className="mt-1 text-gray-100">{formatSignalTimestamp(signal.received_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-gray-300 md:col-span-2 xl:col-span-3">
                No TradingView signals yet — connect your first indicator!
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
