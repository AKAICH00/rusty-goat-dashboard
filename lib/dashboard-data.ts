import fs from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

export type StrategyMetrics = {
  portfolio_value: number;
  return_pct: number;
  realized_pnl: number;
  trade_count: number;
  win_rate: number;
  avg_r_multiple: number;
};

export type Strategy = {
  id: string;
  name: string;
  thesis: string;
  status: "live" | "training" | "validating";
  status_detail?: string;
  measurement_status?: "measured" | "insufficient_sample" | "not_deployed" | "unknown";
  signal_stream?: string | null;
  verdict: "promising" | "watch" | "kill";
  metrics_1x: StrategyMetrics | null;
};

export type Portfolio = {
  leverage: number;
  portfolio_value: number;
  realized_pnl: number;
  trade_count: number;
  win_rate: number;
  avg_r_multiple: number;
  signals: number;
};

export type Snapshot = {
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

export type SnapshotSource = "upstash" | "static";

const snapshotFilePath = path.join(process.cwd(), "public", "data", "snapshot.json");
const DASHBOARD_SNAPSHOT_KEY = process.env.DASHBOARD_SNAPSHOT_KEY?.trim() || "rusty-goat:dashboard:snapshot";

async function getStaticSnapshot(): Promise<Snapshot> {
  const raw = await fs.readFile(snapshotFilePath, "utf8");
  return JSON.parse(raw) as Snapshot;
}

function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

async function getUpstashSnapshot(): Promise<Snapshot | null> {
  const redis = getRedisClient();

  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get<string | Snapshot>(DASHBOARD_SNAPSHOT_KEY);

    if (!raw) {
      return null;
    }

    if (typeof raw === "string") {
      return JSON.parse(raw) as Snapshot;
    }

    return raw as Snapshot;
  } catch (error) {
    console.error("Failed to load dashboard snapshot from Upstash", error);
    return null;
  }
}

export async function getDashboardSnapshot(): Promise<{ snapshot: Snapshot; source: SnapshotSource }> {
  const liveSnapshot = await getUpstashSnapshot();

  if (liveSnapshot) {
    return { snapshot: liveSnapshot, source: "upstash" };
  }

  return {
    snapshot: await getStaticSnapshot(),
    source: "static",
  };
}
