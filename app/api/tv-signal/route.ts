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

type GitHubContentsResponse = {
  content: string;
  sha: string;
};

type WebhookBody = Record<string, unknown>;

const DEFAULT_WEBHOOK_SECRET = "rg_tv_secret_2026";
const GITHUB_API_URL =
  "https://api.github.com/repos/AKAICH00/rusty-goat-dashboard/contents/public/data/tv_signals.json";
const BRANCH = "main";
const SIGNALS_KEY = "rusty_goat_tv_signals";
const MAX_STORED_SIGNALS = 500;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is WebhookBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstText(record: WebhookBody, keys: string[]) {
  for (const key of keys) {
    const value = sanitizeText(record[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function pickFirstNumber(record: WebhookBody, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/USDT\.P$/i, "").replace(/USDT$/i, "");
}

function extractStrategy(body: WebhookBody) {
  const directStrategy = pickFirstText(body, ["strategy", "strategy_name", "strategyName"]);
  if (directStrategy) {
    return directStrategy;
  }

  const nestedStrategy = body.strategy;
  if (isRecord(nestedStrategy)) {
    return pickFirstText(nestedStrategy, ["name", "title"]) || null;
  }

  return null;
}

function extractMessage(body: WebhookBody) {
  const directMessage = pickFirstText(body, ["message", "note", "comment"]);
  if (directMessage) {
    return directMessage;
  }

  const nestedAlert = body.alert;
  if (isRecord(nestedAlert)) {
    return pickFirstText(nestedAlert, ["message", "text"]) || null;
  }

  return null;
}

function extractAction(body: WebhookBody) {
  const directAction = pickFirstText(body, ["action", "side", "signal"]);
  if (directAction) {
    return directAction.toUpperCase();
  }

  const nestedOrder = body.order;
  if (isRecord(nestedOrder)) {
    const orderAction = pickFirstText(nestedOrder, ["action", "side"]);
    if (orderAction) {
      return orderAction.toUpperCase();
    }
  }

  return "HOLD";
}

function buildSignal(body: WebhookBody): TradingViewSignal {
  const rawSymbol = pickFirstText(body, ["symbol", "ticker", "pair"]);
  const symbol = normalizeSymbol(rawSymbol);

  return {
    id: crypto.randomUUID(),
    source: pickFirstText(body, ["source"]) || "tradingview",
    symbol,
    action: extractAction(body),
    timeframe: pickFirstText(body, ["timeframe", "interval"]) || null,
    strategy: extractStrategy(body),
    price: pickFirstNumber(body, ["price", "close", "last_price", "lastPrice"]),
    message: extractMessage(body),
    confidence: pickFirstNumber(body, ["confidence", "score"]),
    received_at: new Date().toISOString(),
  };
}

async function readSignalsFromGitHub(token: string) {
  const response = await fetch(`${GITHUB_API_URL}?ref=${BRANCH}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "rusty-goat-dashboard",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return { signals: [] as TradingViewSignal[], sha: undefined };
  }

  if (!response.ok) {
    throw new Error(`GitHub fetch failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GitHubContentsResponse;
  const decodedContent = Buffer.from(payload.content, "base64").toString("utf8");
  const parsedSignals = JSON.parse(decodedContent) as TradingViewSignal[];

  return {
    signals: Array.isArray(parsedSignals) ? parsedSignals : [],
    sha: payload.sha,
  };
}

async function writeSignalsToGitHub(token: string, signals: TradingViewSignal[], sha?: string) {
  const content = Buffer.from(`${JSON.stringify(signals, null, 2)}\n`).toString("base64");
  const response = await fetch(GITHUB_API_URL, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "rusty-goat-dashboard",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `Add TradingView signal: ${signals[0]?.symbol ?? "signal"} ${signals[0]?.action ?? ""}`.trim(),
      content,
      sha,
      branch: BRANCH,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub update failed with status ${response.status}.`);
  }
}

async function storeSignalInUpstash(signal: TradingViewSignal, url: string, token: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["LPUSH", SIGNALS_KEY, JSON.stringify(signal)]),
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? `Upstash write failed with status ${response.status}.`);
  }
}

export async function POST(request: Request) {
  const secret = process.env.TV_WEBHOOK_SECRET || DEFAULT_WEBHOOK_SECRET;
  const body = (await request.json().catch(() => null)) as unknown;

  if (!isRecord(body)) {
    return jsonError("Invalid JSON payload.", 400);
  }

  const providedSecret =
    pickFirstText(body, ["secret", "passphrase", "webhook_secret"]) || sanitizeText(request.headers.get("x-webhook-secret"));

  if (!providedSecret) {
    return jsonError("Webhook secret is required.", 401);
  }

  if (providedSecret !== secret) {
    return jsonError("Invalid webhook secret.", 401);
  }

  const signal = buildSignal(body);

  if (!signal.symbol) {
    return jsonError("Signal symbol is required.", 400);
  }

  const upstashUrl = sanitizeText(process.env.UPSTASH_REDIS_REST_URL);
  const upstashToken = sanitizeText(process.env.UPSTASH_REDIS_REST_TOKEN);

  try {
    if (upstashUrl && upstashToken) {
      await storeSignalInUpstash(signal, upstashUrl, upstashToken);
      return Response.json({ ok: true, signal_id: signal.id, stored: "upstash" });
    }

    const githubToken = sanitizeText(process.env.GITHUB_TOKEN);

    if (!githubToken) {
      return jsonError("Server is missing GITHUB_TOKEN for GitHub fallback storage.", 500);
    }

    const { signals, sha } = await readSignalsFromGitHub(githubToken);
    const nextSignals = [signal, ...signals].slice(0, MAX_STORED_SIGNALS);

    await writeSignalsToGitHub(githubToken, nextSignals, sha);

    return Response.json({ ok: true, signal_id: signal.id, stored: "github" });
  } catch {
    return jsonError("Unable to store TradingView signal right now.", 500);
  }
}
