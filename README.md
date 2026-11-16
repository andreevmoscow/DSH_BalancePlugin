# DeepSeek balance

Always-visible floating card showing your DeepSeek account balance and today's spend.

## What it shows

- **Balance** — total available balance (recharge + bonus wallets) of your signed-in DeepSeek account.
- **Spent today** — approximate: the balance drop since this browser first saw the balance today.

## How it works

- The Host half reads the balance through DSH's built-in DeepSeek account service (`deepseekAccount.getBalance`) and serves it on `GET /api/deepseek-balance/snapshot`.
- The Client half renders a floating card in the `shell.overlay` slot (visible on every screen) and refreshes every 5 minutes.

## Requirements

- Sign in to your DeepSeek account in DSH (**Settings → Account**).

## Limitations

- "Spent today" is an estimate based on balance snapshots, not DeepSeek's usage API. Top-ups and grants can understate it.
