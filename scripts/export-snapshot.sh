#!/bin/bash
# Run on hub. Publishes the Rusty Goat dashboard snapshot.
# Preferred path: write live snapshot to Upstash for immediate Vercel reads.
# Fallback path: refresh local snapshot.json only.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/aksel/rusty-goat-dashboard}"

if [[ -n "${UPSTASH_REDIS_REST_URL:-}" && -n "${UPSTASH_REDIS_REST_TOKEN:-}" ]]; then
  echo "Publishing Rusty Goat dashboard snapshot to Upstash..."
  python3 "$REPO_DIR/scripts/publish-upstash-snapshot.py"
  echo "Done. Dashboard can now read current state from Upstash without a GitHub/Vercel redeploy."
  exit 0
fi

echo "Upstash env vars not found; rebuilding local snapshot.json fallback only."
SNAPSHOT_FILE="$REPO_DIR/public/data/snapshot.json"
mkdir -p "$(dirname "$SNAPSHOT_FILE")"

get_summary() {
  local deploy=$1
  kubectl logs -n rusty-goat deploy/$deploy --tail=400 2>/dev/null | grep paper_trader_summary | tail -1 | sed 's/.*paper_trader_summary //'
}

S1_DATA=$(get_summary "paper-1x" || true)
S5_DATA=$(get_summary "paper-5x" || true)
S10_DATA=$(get_summary "paper-10x" || true)
S2_DATA=$(get_summary "paper-s2-1x" || true)
S3_DATA=$(get_summary "paper-s3-1x" || true)

PODS=$(kubectl get pods -n rusty-goat --no-headers 2>/dev/null | grep Running | wc -l | tr -d ' ')
LAST_SIGNAL=$(kubectl logs -n rusty-goat deploy/rl-inference-s2 --tail=50 2>/dev/null | grep published_signal | tail -1 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}' | tail -1 || echo "unknown")
CANDLES=$(curl -s -G "http://localhost:30909/exp" --data-urlencode "query=SELECT count() FROM candles_1m WHERE symbol = 'BTC'" 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

python3 <<PYEOF
import json
from datetime import datetime, timezone
from pathlib import Path

s1 = '''$S1_DATA'''
s5 = '''$S5_DATA'''
s10 = '''$S10_DATA'''
s2 = '''$S2_DATA'''
s3 = '''$S3_DATA'''


def parse_summary(s: str):
    try:
        return json.loads(s.strip()) if s.strip() else {}
    except Exception:
        return {}


def iso_or_unknown(value: str):
    if value == 'unknown':
        return value
    try:
        return datetime.strptime(value, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        return value


def strategy_metrics(summary: dict):
    if not summary:
        return None
    return {
        'portfolio_value': summary.get('portfolio_value', 10000),
        'return_pct': round(((summary.get('portfolio_value', 10000) - 10000) / 10000) * 100, 2),
        'realized_pnl': summary.get('total_realized_pnl', 0),
        'trade_count': summary.get('trade_count', 0),
        'win_rate': summary.get('win_rate', 0),
        'avg_r_multiple': summary.get('avg_r_multiple', 0),
    }


def strategy_row(id_: str, name: str, thesis: str, default_status: str, verdict: str, summary: dict):
    summary = summary or {}
    measurement_status = summary.get('measurement_status')
    has_summary = bool(summary)
    metrics = strategy_metrics(summary) if has_summary else None

    if has_summary:
        if measurement_status == 'measured':
            status = 'live'
            status_detail = 'Measured from isolated paper account'
        elif measurement_status == 'insufficient_sample':
            status = 'validating'
            status_detail = summary.get('status_reason') or 'Isolated paper path is live, but sample is still too small'
        else:
            status = default_status
            status_detail = 'Paper path detected, measurement status unknown'
    else:
        status = default_status
        status_detail = 'No isolated paper summary exported yet'

    return {
        'id': id_,
        'name': name,
        'thesis': thesis,
        'status': status,
        'status_detail': status_detail,
        'measurement_status': measurement_status or ('not_deployed' if not has_summary else 'unknown'),
        'signal_stream': summary.get('stream_name'),
        'metrics_1x': metrics,
        'verdict': verdict,
    }

p1 = parse_summary(s1)
p5 = parse_summary(s5)
p10 = parse_summary(s10)
p2 = parse_summary(s2)
p3 = parse_summary(s3)

snapshot = {
    'updated_at': datetime.now(timezone.utc).isoformat(),
    'strategies': [
        strategy_row('s1', 'S1 — Momentum Breakout', 'Ride breakouts using price patterns', 'live', 'kill', p1),
        strategy_row('s2', 'S2 — Order Book Imbalance', 'Front-run order flow microstructure', 'validating', 'watch', p2),
        strategy_row('s3', 'S3 — Fibonacci + Harmonics', 'Trade at Fibonacci structure levels', 'training', 'promising', p3),
    ],
    'paper_portfolios': {
        '1x': {
            'leverage': 1,
            'portfolio_value': p1.get('portfolio_value', 10000),
            'realized_pnl': p1.get('total_realized_pnl', 0),
            'trade_count': p1.get('trade_count', 0),
            'win_rate': p1.get('win_rate', 0),
            'avg_r_multiple': p1.get('avg_r_multiple', 0),
            'signals': p1.get('signals', 0),
        },
        '5x': {
            'leverage': 5,
            'portfolio_value': p5.get('portfolio_value', 10000),
            'realized_pnl': p5.get('total_realized_pnl', 0),
            'trade_count': p5.get('trade_count', 0),
            'win_rate': p5.get('win_rate', 0),
            'avg_r_multiple': p5.get('avg_r_multiple', 0),
            'signals': p5.get('signals', 0),
        },
        '10x': {
            'leverage': 10,
            'portfolio_value': p10.get('portfolio_value', 10000),
            'realized_pnl': p10.get('total_realized_pnl', 0),
            'trade_count': p10.get('trade_count', 0),
            'win_rate': p10.get('win_rate', 0),
            'avg_r_multiple': p10.get('avg_r_multiple', 0),
            'signals': p10.get('signals', 0),
        },
    },
    'infrastructure': {
        'running_pods': int('$PODS') if '$PODS'.strip().isdigit() else 0,
        'last_signal_time': iso_or_unknown('$LAST_SIGNAL'),
        'candles_collected': int('$CANDLES') if '$CANDLES'.strip().isdigit() else 0,
        'data_sources': ['OHLCV', 'L2 Order Book', 'Funding Rates'],
    },
}

Path('$SNAPSHOT_FILE').write_text(json.dumps(snapshot, indent=2) + '\n')
print(f'Snapshot written to $SNAPSHOT_FILE')
PYEOF

echo "Local fallback snapshot refreshed at $SNAPSHOT_FILE"
