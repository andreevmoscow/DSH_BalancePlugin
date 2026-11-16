/** Host half of the DeepSeek balance bundle.
 *  Reads the signed-in DeepSeek account balance through the built-in
 *  `deepseekAccount` service and serves it on a local HTTP route for the Client.
 */
export const inject = ['webServer']

const ROUTE_PATH = '/api/deepseek-balance/snapshot'

export function apply(ctx) {
  const server = ctx.get('webServer')
  const account = ctx.get('deepseekAccount')
  if (!server) return

  ctx.effect(() => {
    const dispose = server.register({
      kind: 'exact',
      path: ROUTE_PATH,
      resource: async (request) => {
        const url = new URL(request.url)
        const meta = {
          version: url.searchParams.get('version') || '0.2.2-rc.3',
          locale: url.searchParams.get('locale') || 'en',
          timezoneOffsetSeconds: Number(url.searchParams.get('tz') || 0),
        }

        const payload = { ok: true, unavailable: !account, signedIn: false, links: null, balance: null, error: null }

        if (!account) return Response.json(payload)

        try {
          const state = await account.getState()
          payload.links = state && state.links
            ? { usageUrl: state.links.usageUrl, topUpUrl: state.links.topUpUrl }
            : null
          payload.signedIn = state && state.status === 'credential-stored'

          if (payload.signedIn) {
            const balance = await account.getBalance(meta)
            if (balance && balance.status === 'ready') {
              payload.balance = { value: balance.value, bonusWallets: balance.bonusWallets }
            }
          }
        } catch (error) {
          payload.error = error && error.message ? error.message : String(error)
        }

        return Response.json(payload)
      },
    })
    return dispose
  }, 'deepseek-balance: route')
}
