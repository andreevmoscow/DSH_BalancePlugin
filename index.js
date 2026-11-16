/** Host half of the DeepSeek balance bundle.
 *  - Balance: `deepseekAccount.getBalance` (recharge + bonus wallets).
 *  - Spent today: platform usage cost for the local day (the site's "Cost"), read
 *    from `GET /api/v0/usage/export`. That endpoint needs the platform *web*
 *    `userToken`, not the DSH account grant, so the token is stored separately
 *    (DEEPSEEK_BALANCE_USER_TOKEN) and set from the card.
 *  Served on local HTTP routes for the Client half.
 */
import { inflateRawSync } from 'node:zlib'

export const inject = ['webServer', 'credentials']

const SNAPSHOT_PATH = '/api/deepseek-balance/snapshot'
const TOKEN_PATH = '/api/deepseek-balance/token'
const TOKEN_REF = 'DEEPSEEK_BALANCE_USER_TOKEN'
const DEFAULT_PLATFORM_ORIGIN = 'https://platform.deepseek.com'
const EXPORT_PATH = '/api/v0/usage/export'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const EXPORT_TIMEOUT_MS = 15000
const MAX_EXPORT_BYTES = 64 * 1024 * 1024
const MAX_ZIP_OUTPUT_BYTES = 32 * 1024 * 1024
const TOKEN_TYPES = new Set(['output_tokens', 'input_cache_hit_tokens', 'input_cache_miss_tokens'])

export function apply(ctx) {
  const server = ctx.get('webServer')
  const credentials = ctx.get('credentials')
  if (!server || !credentials) return

  async function resolveToken() {
    try {
      const cred = await credentials.resolve(TOKEN_REF)
      const value = cred && typeof cred.value === 'string' ? cred.value.trim() : ''
      return value || null
    } catch {
      return null
    }
  }

  ctx.effect(() => {
    const disposers = []

    disposers.push(server.register({
      kind: 'exact',
      path: SNAPSHOT_PATH,
      resource: async (request) => {
        // Resolved per request: the account service may activate after this plugin.
        const account = ctx.get('deepseekAccount')
        const url = new URL(request.url)
        const meta = {
          version: url.searchParams.get('version') || '0.2.2-rc.3',
          locale: url.searchParams.get('locale') || 'en',
          timezoneOffsetSeconds: Number(url.searchParams.get('tz') || 0),
        }

        const payload = {
          ok: true,
          unavailable: !account,
          signedIn: false,
          hasToken: !!(await resolveToken()),
          links: null,
          balance: null,
          spentToday: null,
          spentTodayError: null,
          error: null,
        }

        if (!account) return Response.json(payload)

        try {
          const state = await account.getState()
          payload.links = state && state.links
            ? { usageUrl: state.links.usageUrl, topUpUrl: state.links.topUpUrl }
            : null
          payload.signedIn = !!(state && state.status === 'credential-stored')

          if (payload.signedIn) {
            const balance = await account.getBalance(meta)
            if (balance && balance.status === 'ready') {
              payload.balance = { value: balance.value, bonusWallets: balance.bonusWallets }
            }
            try {
              payload.spentToday = await readTodayCost(await resolveToken())
            } catch (error) {
              payload.spentToday = null
              payload.spentTodayError = error && error.message ? error.message : String(error)
            }
          }
        } catch (error) {
          payload.error = error && error.message ? error.message : String(error)
        }

        return Response.json(payload)
      },
    }))

    disposers.push(server.register({
      kind: 'exact',
      path: TOKEN_PATH,
      handler: async (req, res) => {
        const send = (status, body) => {
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify(body))
        }
        try {
          if (req.method === 'PUT') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            let body = null
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { body = null }
            const token = body && typeof body.token === 'string' ? body.token.trim() : ''
            if (!token) { send(400, { ok: false, error: 'empty token' }); return }
            await credentials.set(TOKEN_REF, token)
            send(200, { ok: true, hasToken: true })
            return
          }
          if (req.method === 'DELETE') {
            await credentials.unset(TOKEN_REF)
            send(200, { ok: true, hasToken: false })
            return
          }
          if (req.method === 'GET') {
            send(200, { ok: true, hasToken: !!(await resolveToken()) })
            return
          }
          send(405, { ok: false, error: 'method not allowed' })
        } catch (error) {
          send(500, { ok: false, error: error && error.message ? error.message : String(error) })
        }
      },
    }))

    return () => { for (const dispose of disposers) dispose() }
  }, 'deepseek-balance: routes')
}

/** Sum the token cost of the local day from the platform usage export. */
async function readTodayCost(token) {
  if (!token) throw new Error('userToken is not configured')

  const now = new Date()
  const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime() / 1000)
  const end = Math.max(Math.ceil(now.getTime() / 3600000) * 3600, start + 3600)

  const res = await fetch(`${DEFAULT_PLATFORM_ORIGIN}${EXPORT_PATH}?start=${start}&end=${end}&tz=0`, {
    headers: {
      accept: 'application/octet-stream',
      authorization: 'Bearer ' + token,
      'user-agent': UA,
      referer: DEFAULT_PLATFORM_ORIGIN + '/usage',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
  })
  if (res.status !== 200) throw new Error('usage export HTTP ' + res.status)

  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_EXPORT_BYTES) throw new Error('usage export is too large')

  // An auth/param error comes back as a small JSON envelope.
  if (buffer.length < 1024 && buffer.toString('utf8').trim().startsWith('{')) {
    let message = 'usage export failed'
    try {
      const body = JSON.parse(buffer.toString('utf8'))
      if (body && (body.msg || body.message)) message = 'usage export: ' + (body.msg || body.message)
    } catch { /* keep default */ }
    throw new Error(message)
  }

  const csv = extractAmountCsv(buffer)
  if (!csv) throw new Error('usage export contains no amount CSV')
  return sumCost(csv)
}

/** Sum `price * amount` over token rows of the usage CSV. */
function sumCost(csv) {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  if (lines.length < 2) return 0
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim())
  const typeIdx = header.indexOf('type')
  const amountIdx = header.indexOf('amount')
  const priceIdx = header.indexOf('price')
  if (typeIdx < 0 || amountIdx < 0 || priceIdx < 0) throw new Error('usage CSV has unexpected columns')

  let cost = 0
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    if (!TOKEN_TYPES.has(row[typeIdx] || '')) continue
    const price = parseFloat(row[priceIdx])
    const amount = parseFloat(row[amountIdx])
    if (Number.isFinite(price) && Number.isFinite(amount)) cost += price * amount
  }
  return cost
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Return the "amount" CSV text from a ZIP export buffer. */
function extractAmountCsv(buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new Error('usage export is not a ZIP archive')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  let fallback = null
  let outputBytes = 0

  for (let n = 0; n < count; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('usage ZIP directory is malformed')
    }
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    if (offset + 46 + nameLength > buffer.length) throw new Error('usage ZIP directory is malformed')
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength

    if (!name.toLowerCase().endsWith('.csv')) continue
    if (uncompressedSize > MAX_ZIP_OUTPUT_BYTES || outputBytes + uncompressedSize > MAX_ZIP_OUTPUT_BYTES) {
      throw new Error('usage ZIP entry is too large')
    }
    if (localOffset + 30 > buffer.length) throw new Error('usage ZIP entry is malformed')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (dataStart + compressedSize > buffer.length) throw new Error('usage ZIP entry is malformed')
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)

    let data
    if (method === 0) data = compressed
    else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_OUTPUT_BYTES - outputBytes })
    else throw new Error('usage ZIP compression method is unsupported')

    outputBytes += data.length
    const text = data.toString('utf8')
    if (name.toLowerCase().includes('amount')) return text
    if (fallback === null) fallback = text
  }

  return fallback
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) return i
  }
  return -1
}
