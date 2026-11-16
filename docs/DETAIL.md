# DeepSeek balance

A small floating card, pinned to the bottom-right corner, that stays visible on every screen of DeepSeek Harness.

## What it shows

- **Баланс** — total available balance (recharge + bonus wallets) of your signed-in DeepSeek account, per currency (CNY / USD).
- **Потрачено сегодня** — the platform's usage cost for the local day, matching the **Cost** card on `platform.deepseek.com/usage`.
- **Пополнить** / **Usage** — links to the DeepSeek platform top-up and usage pages.

## Matching the site exactly

The site's "Cost" is the actual token cost for the day, read from the platform's private usage export (`/api/v0/usage/export`). That endpoint does **not** accept the DSH account grant token — it needs the platform **web** `userToken`:

1. Sign in to `platform.deepseek.com` in a browser.
2. Open DevTools → Console and run `localStorage.getItem("userToken")`.
3. In the card, click **Указать токен** and paste the value.

The token is stored in DSH credentials (`DEEPSEEK_BALANCE_USER_TOKEN`) and sent only to `platform.deepseek.com`. Without it, "Потрачено сегодня" shows "—".

## Behavior

- Refreshes every 5 minutes and on the ↻ button.
- Collapses to a compact pill with the ↻ and — buttons.
- When you are signed out, it shows a hint to sign in at **Settings → Account**.

## Semantics and limits

- Balance comes from the DeepSeek platform wallet service and is authoritative.
- "Потрачено сегодня" is the sum of `price × amount` over token rows of the local-day usage export — the same computation the platform uses for its Cost card.
- The platform splits raw usage by UTC day, so the export window runs from local 00:00 to the current hour to align with local "today".
- If the private usage endpoint changes or is unavailable, the card shows "—".

## Files

| File | What it does |
|---|---|
| `index.js` | Host half: balance + today's cost, served on `/api/deepseek-balance/snapshot`; token set on `/api/deepseek-balance/token`. |
| `client.js` | Client half: the floating card in `shell.overlay`. |
| `package.json` | Bundle manifest. |
| `cordis.patch.yml` | Loader patch that inserts the plugin row. |
| `locale/en.json` | English title and description. |
| `locale/ru.json` | Russian title and description. |
| `icon.svg` | Plugin icon. |
| `docs/DETAIL.md` | This detail page. |
| `.gitignore` | Keeps `node_modules/` out of the repo. |
| `README.md` | Overview. |
