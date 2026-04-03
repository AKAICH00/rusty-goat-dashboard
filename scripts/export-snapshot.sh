#!/bin/bash
# Run on hub. Exports Rusty Goat trading stats to GitHub for Vercel dashboard.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/aksel/rusty-goat-dashboard}"
SNAPSHOT_FILE="$REPO_DIR/public/data/snapshot.json"

mkdir -p "$(dirname "$SNAPSHOT_FILE")"

get_summary() {
  local deploy=$1
  kubectl logs -n rusty-goat deploy/$deploy --tail=200 2>/dev/null | grep paper_trader_summary | tail -1 | sed 's/.*paper_trader_summary //'
}

S1_DATA=$(get_summary "paper-1x" || true)
S5_DATA=$(get_summary "paper-5x" || true)
S10_DATA=$(get_summary "paper-10x" || true)

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

p1 = parse_summary(s1)
p5 = parse_summary(s5)
p10 = parse_summary(s10)

snapshot = {
    'updated_at': datetime.now(timezone.utc).isoformat(),
    'strategies': [
        {
            'id': 's1',
            'name': 'S1 — Momentum Breakout',
            'thesis': 'Ride breakouts using price patterns',
            'status': 'live',
            'verdict': 'kill',
            'metrics_1x': {
                'portfolio_value': p1.get('portfolio_value', 10000),
                'return_pct': round((p1.get('portfolio_value', 10000) - 10000) / 100, 2),
                'realized_pnl': p1.get('total_realized_pnl', 0),
                'trade_count': p1.get('trade_count', 0),
                'win_rate': p1.get('win_rate', 0),
                'avg_r_multiple': p1.get('avg_r_multiple', 0),
            },
        },
        {
            'id': 's2',
            'name': 'S2 — Order Book Imbalance',
            'thesis': 'Front-run order flow microstructure',
            'status': 'live',
            'verdict': 'watch',
            'metrics_1x': None,
        },
        {
            'id': 's3',
            'name': 'S3 — Fibonacci + Harmonics',
            'thesis': 'Trade at Fibonacci structure levels',
            'status': 'validating',
            'verdict': 'promising',
            'metrics_1x': None,
        },
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

cd "$REPO_DIR"
git add public/data/snapshot.json
git commit -m "chore: update trading snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)" || echo "Nothing to commit"
git push origin main

echo "Done. Dashboard will update automatically on Vercel."
