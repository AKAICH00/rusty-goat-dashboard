type StrategyIdea = {
  id: string;
  name: string | null;
  concept: string;
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  signal_logic: string;
  edge_hypothesis: string;
  submitted_at: string;
};

type GitHubContentsResponse = {
  content: string;
  sha: string;
};

const GITHUB_API_URL =
  "https://api.github.com/repos/AKAICH00/rusty-goat-dashboard/contents/public/data/ideas.json";
const BRANCH = "main";
const validTimeframes = new Set<StrategyIdea["timeframe"]>(["1m", "5m", "15m", "1h", "4h", "1d"]);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readIdeasFromGitHub(token: string) {
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
    return { ideas: [] as StrategyIdea[], sha: undefined };
  }

  if (!response.ok) {
    throw new Error(`GitHub fetch failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GitHubContentsResponse;
  const decodedContent = Buffer.from(payload.content, "base64").toString("utf8");
  const parsedIdeas = JSON.parse(decodedContent) as StrategyIdea[];

  return {
    ideas: Array.isArray(parsedIdeas) ? parsedIdeas : [],
    sha: payload.sha,
  };
}

async function writeIdeasToGitHub(token: string, ideas: StrategyIdea[], sha?: string) {
  const content = Buffer.from(`${JSON.stringify(ideas, null, 2)}\n`).toString("base64");
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
      message: `Add strategy idea: ${ideas.at(-1)?.concept.slice(0, 72) ?? "submission"}`,
      content,
      sha,
      branch: BRANCH,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub update failed with status ${response.status}.`);
  }
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return jsonError("Server is missing GITHUB_TOKEN.", 500);
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: unknown;
        concept?: unknown;
        timeframe?: unknown;
        signalLogic?: unknown;
        edgeHypothesis?: unknown;
      }
    | null;

  const concept = sanitizeText(body?.concept);
  const timeframe = sanitizeText(body?.timeframe);

  if (!concept) {
    return jsonError("Strategy concept is required.", 400);
  }

  if (!validTimeframes.has(timeframe as StrategyIdea["timeframe"])) {
    return jsonError("Timeframe is required.", 400);
  }

  try {
    const { ideas, sha } = await readIdeasFromGitHub(token);
    const nextIdea: StrategyIdea = {
      id: crypto.randomUUID(),
      name: sanitizeText(body?.name) || null,
      concept,
      timeframe: timeframe as StrategyIdea["timeframe"],
      signal_logic: sanitizeText(body?.signalLogic),
      edge_hypothesis: sanitizeText(body?.edgeHypothesis),
      submitted_at: new Date().toISOString(),
    };

    await writeIdeasToGitHub(token, [...ideas, nextIdea], sha);

    return Response.json({ ok: true, idea: nextIdea });
  } catch {
    return jsonError("Unable to save strategy idea right now.", 500);
  }
}
