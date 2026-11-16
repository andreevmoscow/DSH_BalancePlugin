# DeepSeek balance

Always-visible floating card showing your DeepSeek account balance and today's spend.

## What it shows

- **Balance** — total available balance (recharge + bonus wallets) of your signed-in DeepSeek account.
- **Spent today** — the platform's usage cost for the current local day, the same number the Usage page shows under **Cost**.

## How it works

- The Host half reads the balance through DSH's built-in DeepSeek account service (`deepseekAccount.getBalance`) and the day's cost through the platform usage export (`/api/v0/usage/export`), and serves both on `GET /api/deepseek-balance/snapshot`.
- The usage-export endpoint needs the platform **web** `userToken` (from `localStorage.getItem("userToken")` at `platform.deepseek.com`), which is a different credential from the DSH account grant. The card asks for it once and stores it in DSH credentials (`DEEPSEEK_BALANCE_USER_TOKEN`); it is sent only to `platform.deepseek.com`.
- The Client half renders a floating card in the `shell.overlay` slot (visible on every screen) and refreshes every 5 minutes.

## Files

| File | What it does |
|---|---|
| `index.js` | Host half: balance and today's cost, served on `/api/deepseek-balance/snapshot`; token set on `/api/deepseek-balance/token`. |
| `client.js` | Client half: the floating card in `shell.overlay`. |
| `package.json` | Bundle manifest: `dsh.bundle.patch`, `dsh.client` entry, exports. |
| `cordis.patch.yml` | Loader patch that inserts the plugin row. |
| `locale/en.json` | English title and description for Plugin Manager. |
| `locale/ru.json` | Russian title and description for Plugin Manager. |
| `icon.svg` | Plugin icon (36×36). |
| `docs/DETAIL.md` | Detail page shown in Plugin Manager. |
| `.gitignore` | Keeps `node_modules/` out of the repo. |
| `README.md` | This file. |

## Requirements

- Sign in to your DeepSeek account in DSH (**Settings → Account**).
- For "Spent today", provide the platform web `userToken` once (the card shows an "Указать токен" action).

## Limitations

- The day's cost comes from `platform.deepseek.com/api/v0/usage/export` — a private endpoint that may change without notice. If it fails, the card shows "—".
- The platform splits usage by UTC day; the cost is computed over the local-timezone window from 00:00 to the current hour, matching the platform's **Today** filter.
