#!/usr/bin/env python3
"""Build the Rusty Goat dashboard snapshot from live cluster truth and push it to Upstash.

This replaces the old GitHub commit/push publication path with a single Upstash write.
Expected env vars:
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
Optional env vars:
- DASHBOARD_SNAPSHOT_KEY (default: rusty-goat:dashboard:snapshot)
- KUBECTL_BIN (default: kubectl)
- CLICKHOUSE_QUERY_URL (default: http://localhost:30909/exp)
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_KEY = os.getenv("DASHBOARD_SNAPSHOT_KEY", "rusty-goat:dashboard:snapshot")
KUBECTL_BIN = os.getenv("KUBECTL_BIN", "kubectl")
CLICKHOUSE_QUERY_URL = os.getenv("CLICKHOUSE_QUERY_URL", "http://localhost:30909/exp")
NAMESPACE = "rusty-goat"


def run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def get_summary(deploy: str) -> dict[str, Any]:
    logs = run([KUBECTL_BIN, "logs", "-n", NAMESPACE, f"deploy/{deploy}", "--tail=400"])
    if not logs:
        return {}

    candidates = [line for line in logs.splitlines() if "paper_trader_summary" in line]
    if not candidates:
        return {}

    payload = candidates[-1].split("paper_trader_summary", 1)[-1].strip()
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return {}


def get_running_pods() -> int:
    output = run([KUBECTL_BIN, "get", "pods", "-n", NAMESPACE, "--no-headers"])
    if not output:
        return 0
    return sum(1 for line in output.splitlines() if "Running" in line)


def get_last_signal_time() -> str:
    logs = run([KUBECTL_BIN, "logs", "-n", NAMESPACE, "deploy/rl-inference-s2", "--tail=80"])
    if not logs:
        return "unknown"

    candidates = [line for line in logs.splitlines() if "published_signal" in line]
    if not candidates:
        return "unknown"

    match = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", candidates[-1])
    if not match:
        return "unknown"

    return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).isoformat()


def get_candle_count() -> int:
    params = urlencode({"query": "SELECT count() FROM candles_1m WHERE symbol = 'BTC'"})
    request = Request(f"{CLICKHOUSE_QUERY_URL}?{params}")
    try:
        with urlopen(request, timeout=5) as response:
            body = response.read().decode("utf-8", errors="ignore")
    except (URLError, TimeoutError):
        return 0

    numbers = re.findall(r"\d+", body)
    return int(numbers[0]) if numbers else 0


def strategy_metrics(summary: dict[str, Any] | None) -> dict[str, Any] | None:
    if not summary:
        return None

    portfolio_value = float(summary.get("portfolio_value", 10000))
    return {
        "portfolio_value": portfolio_value,
        "return_pct": round(((portfolio_value - 10000) / 10000) * 100, 2),
        "realized_pnl": float(summary.get("total_realized_pnl", 0)),
        "trade_count": int(summary.get("trade_count", 0)),
        "win_rate": float(summary.get("win_rate", 0)),
        "avg_r_multiple": float(summary.get("avg_r_multiple", 0)),
    }


def strategy_row(strategy_id: str, name: str, thesis: str, default_status: str, verdict: str, summary: dict[str, Any]) -> dict[str, Any]:
    measurement_status = summary.get("measurement_status") if summary else None
    metrics = strategy_metrics(summary)

    if summary:
        if measurement_status == "measured":
            status = "live"
            status_detail = "Measured from isolated paper account"
        elif measurement_status == "insufficient_sample":
            status = "validating"
            status_detail = summary.get("status_reason") or "Isolated paper path is live, but sample is still too small"
        else:
            status = default_status
            status_detail = "Paper path detected, measurement status unknown"
    else:
        status = default_status
        status_detail = "No isolated paper summary exported yet"

    return {
        "id": strategy_id,
        "name": name,
        "thesis": thesis,
        "status": status,
        "status_detail": status_detail,
        "measurement_status": measurement_status or ("not_deployed" if not summary else "unknown"),
        "signal_stream": summary.get("stream_name") if summary else None,
        "metrics_1x": metrics,
        "verdict": verdict,
    }


def build_snapshot() -> dict[str, Any]:
    s1 = get_summary("paper-1x")
    s5 = get_summary("paper-5x")
    s10 = get_summary("paper-10x")
    s2 = get_summary("paper-s2-1x")
    s3 = get_summary("paper-s3-1x")

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "strategies": [
            strategy_row("s1", "S1 — Momentum Breakout", "Ride breakouts using price patterns", "live", "kill", s1),
            strategy_row("s2", "S2 — Order Book Imbalance", "Front-run order flow microstructure", "validating", "watch", s2),
            strategy_row("s3", "S3 — Fibonacci + Harmonics", "Trade at Fibonacci structure levels", "training", "promising", s3),
        ],
        "paper_portfolios": {
            "1x": {
                "leverage": 1,
                "portfolio_value": float(s1.get("portfolio_value", 10000)),
                "realized_pnl": float(s1.get("total_realized_pnl", 0)),
                "trade_count": int(s1.get("trade_count", 0)),
                "win_rate": float(s1.get("win_rate", 0)),
                "avg_r_multiple": float(s1.get("avg_r_multiple", 0)),
                "signals": int(s1.get("signals", 0)),
            },
            "5x": {
                "leverage": 5,
                "portfolio_value": float(s5.get("portfolio_value", 10000)),
                "realized_pnl": float(s5.get("total_realized_pnl", 0)),
                "trade_count": int(s5.get("trade_count", 0)),
                "win_rate": float(s5.get("win_rate", 0)),
                "avg_r_multiple": float(s5.get("avg_r_multiple", 0)),
                "signals": int(s5.get("signals", 0)),
            },
            "10x": {
                "leverage": 10,
                "portfolio_value": float(s10.get("portfolio_value", 10000)),
                "realized_pnl": float(s10.get("total_realized_pnl", 0)),
                "trade_count": int(s10.get("trade_count", 0)),
                "win_rate": float(s10.get("win_rate", 0)),
                "avg_r_multiple": float(s10.get("avg_r_multiple", 0)),
                "signals": int(s10.get("signals", 0)),
            },
        },
        "infrastructure": {
            "running_pods": get_running_pods(),
            "last_signal_time": get_last_signal_time(),
            "candles_collected": get_candle_count(),
            "data_sources": ["OHLCV", "L2 Order Book", "Funding Rates"],
        },
    }


def write_upstash(snapshot: dict[str, Any]) -> None:
    url = os.getenv("UPSTASH_REDIS_REST_URL", "").strip()
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip()
    if not url or not token:
        raise RuntimeError("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN")

    payload = json.dumps(snapshot)
    request = Request(
        f"{url}/set/{DEFAULT_KEY}",
        data=payload.encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urlopen(request, timeout=10) as response:
        body = response.read().decode("utf-8", errors="ignore")

    print(body)


def main() -> int:
    try:
        snapshot = build_snapshot()
        write_upstash(snapshot)
        print(json.dumps({"ok": True, "key": DEFAULT_KEY, "updated_at": snapshot["updated_at"]}))
        return 0
    except Exception as error:  # pragma: no cover - pragmatic operator script
        print(json.dumps({"ok": False, "error": str(error)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
