# TradingView Webhook Setup

Use this webhook URL in your TradingView alert:

```text
https://rusty-goat.vercel.app/api/tv-signal
```

Use this shared secret in the payload:

```text
rg_tv_secret_2026
```

## JSON Alert Template

Paste this into the TradingView alert message box:

```json
{
  "secret": "rg_tv_secret_2026",
  "source": "tradingview",
  "symbol": "{{ticker}}",
  "action": "BUY",
  "timeframe": "{{interval}}",
  "strategy": "Rusty Goat Momentum",
  "price": "{{close}}",
  "message": "Momentum crossover fired",
  "confidence": 0.78
}
```

## Pine Script Example

```pine
//@version=6
indicator("Rusty Goat Webhook Demo", overlay=true)

fast = ta.ema(close, 9)
slow = ta.ema(close, 21)
buySignal = ta.crossover(fast, slow)
sellSignal = ta.crossunder(fast, slow)

plot(fast, color=color.orange)
plot(slow, color=color.blue)

if buySignal
    alert('{"secret":"rg_tv_secret_2026","source":"tradingview","symbol":"{{ticker}}","action":"BUY","timeframe":"{{interval}}","strategy":"EMA Cross","price":"{{close}}","message":"Fast EMA crossed above slow EMA","confidence":0.81}', alert.freq_once_per_bar_close)

if sellSignal
    alert('{"secret":"rg_tv_secret_2026","source":"tradingview","symbol":"{{ticker}}","action":"SELL","timeframe":"{{interval}}","strategy":"EMA Cross","price":"{{close}}","message":"Fast EMA crossed below slow EMA","confidence":0.81}', alert.freq_once_per_bar_close)
```

For strategy alerts, use the same JSON payload shape in the alert message so TradingView sends a compatible body.

## Manual Curl Test

```bash
curl -X POST https://rusty-goat.vercel.app/api/tv-signal \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "rg_tv_secret_2026",
    "source": "manual-test",
    "symbol": "BTCUSDT.P",
    "action": "buy",
    "timeframe": "1h",
    "strategy": "Webhook smoke test",
    "price": 84250.12,
    "message": "Manual TradingView payload test",
    "confidence": 0.9
  }'
```
