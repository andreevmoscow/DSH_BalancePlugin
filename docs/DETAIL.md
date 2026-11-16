# DeepSeek balance

A small floating card, pinned to the bottom-right corner, that stays visible on every screen of DeepSeek Harness.

## What it shows

- **Баланс** — total available balance (recharge + bonus wallets) of your signed-in DeepSeek account, per currency (CNY / USD).
- **Потрачено сегодня** — the drop in total balance since the card first observed it today.
- **Пополнить** / **Usage** — links to the DeepSeek platform top-up and usage pages.

## Behavior

- Refreshes every 5 minutes and on the ↻ button.
- Collapses to a compact pill with the ↻ and — buttons.
- When you are signed out, it shows a hint to sign in at **Settings → Account**.

## Semantics and limits

- Balance comes from the DeepSeek platform wallet service and is authoritative.
- "Spent today" is an estimate: it diffs the balance against the first value of the day in this browser. A top-up or a granted bonus during the day can understate the spend; the number never goes negative.
- No API key is stored by this plugin — it reuses the DSH DeepSeek account sign-in.
