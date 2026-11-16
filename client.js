/** Client half of the DeepSeek balance bundle:
 *  an always-visible floating card registered into `shell.overlay`.
 */
window.__ModuleLoader__.load({
  id: '@local/deepseek-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const SYMBOL = { CNY: '¥', USD: '$' }
    const REFRESH_MS = 5 * 60 * 1000
    const LS_KEY = 'deepseek-balance.day-start.v1'

    function localDay() {
      const d = new Date()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${d.getFullYear()}-${mm}-${dd}`
    }

    function sumWallets(wallets) {
      const out = {}
      for (const w of wallets || []) {
        if (!w || !w.currency) continue
        const n = Number(w.balance)
        if (!Number.isFinite(n)) continue
        out[w.currency] = (out[w.currency] || 0) + n
      }
      return out
    }

    function totalsOf(balance) {
      if (!balance) return {}
      const out = sumWallets(balance.value)
      for (const [c, v] of Object.entries(sumWallets(balance.bonusWallets))) {
        out[c] = (out[c] || 0) + v
      }
      return out
    }

    function bonusOf(balance) {
      return sumWallets(balance && balance.bonusWallets)
    }

    function readDayStart() {
      try {
        const raw = localStorage.getItem(LS_KEY)
        return raw ? JSON.parse(raw) : null
      } catch (e) {
        return null
      }
    }

    function writeDayStart(v) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(v))
      } catch (e) { /* ignore */ }
    }

    /** Approximate "spent today": the balance drop since this browser first saw it today. */
    function computeSpent(totals) {
      const today = localDay()
      let ds = readDayStart()
      if (!ds || ds.date !== today) {
        writeDayStart({ date: today, totals })
        return {}
      }
      const spent = {}
      for (const c of Object.keys(totals)) {
        spent[c] = Math.max(0, ((ds.totals && ds.totals[c]) || 0) - totals[c])
      }
      return spent
    }

    function fmt(c, amount) {
      return `${SYMBOL[c] || (c + ' ')}${Number(amount).toFixed(2)}`
    }

    const s = {
      card: {
        position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000,
        pointerEvents: 'auto',
        width: 236, boxSizing: 'border-box', borderRadius: 12,
        padding: '12px 14px',
        background: 'var(--dsw-alias-bg-overlay, #ffffff)',
        border: '1px solid var(--dsw-alias-border-l1, #e5e5e5)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.18)',
        color: 'var(--dsw-alias-label-primary, #1a1a1a)',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 13, lineHeight: 1.5,
      },
      pill: {
        position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000,
        pointerEvents: 'auto',
        padding: '6px 11px', borderRadius: 999,
        background: 'var(--dsw-alias-bg-overlay, #ffffff)',
        border: '1px solid var(--dsw-alias-border-l1, #e5e5e5)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
        color: 'var(--dsw-alias-label-primary, #1a1a1a)',
        fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: 700,
        cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
      },
      header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
      title: { fontSize: 11, fontWeight: 700, color: 'var(--dsw-alias-label-secondary, #6b6b6b)', letterSpacing: '0.05em', textTransform: 'uppercase' },
      controls: { display: 'flex', gap: 2 },
      iconBtn: {
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--dsw-alias-label-secondary, #6b6b6b)',
        fontSize: 15, lineHeight: 1, padding: '2px 4px', borderRadius: 6,
      },
      row: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 5 },
      rowLabel: { color: 'var(--dsw-alias-label-secondary, #6b6b6b)', fontSize: 12 },
      amountBig: { fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums' },
      spent: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
      bonus: { color: 'var(--dsw-alias-label-secondary, #6b6b6b)', fontSize: 11, marginTop: 4 },
      hint: { color: 'var(--dsw-alias-label-secondary, #6b6b6b)', fontSize: 12, marginTop: 6 },
      error: { color: 'var(--dsw-alias-state-error-primary, #d93025)', fontSize: 12, marginTop: 4 },
      links: { display: 'flex', gap: 14, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--dsw-alias-border-l1, #e5e5e5)' },
      link: { color: 'var(--dsw-alias-brand-primary, #247bbf)', textDecoration: 'none', fontSize: 12, cursor: 'pointer' },
      updated: { color: 'var(--dsw-alias-label-secondary, #6b6b6b)', fontSize: 10, marginTop: 8, textAlign: 'right' },
    }

    function Widget() {
      const [snapshot, setSnapshot] = useState(null) // { payload, totals, spent, at }
      const [error, setError] = useState(null)
      const [collapsed, setCollapsed] = useState(false)

      const load = useCallback(async () => {
        try {
          const tz = -new Date().getTimezoneOffset() * 60
          const navLang = (typeof navigator !== 'undefined' && navigator.language) || 'ru'
          const locale = navLang.split(/[-_]/)[0] || 'ru'
          const res = await fetch(`/api/deepseek-balance/snapshot?locale=${encodeURIComponent(locale)}&tz=${tz}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = await res.json()
          const totals = totalsOf(json.balance)
          const spent = computeSpent(totals)
          setSnapshot({ payload: json, totals, spent, at: Date.now() })
          setError(json && json.error ? json.error : null)
        } catch (e) {
          setError(e && e.message ? e.message : String(e))
        }
      }, [])

      useEffect(() => {
        load()
        const timer = setInterval(load, REFRESH_MS)
        return () => clearInterval(timer)
      }, [load])

      if (collapsed || (!snapshot && !error)) {
        let label = error ? '!' : '…'
        if (snapshot && snapshot.totals) {
          const first = Object.keys(snapshot.totals)[0]
          if (first) label = fmt(first, snapshot.totals[first])
        }
        return h('button', {
          style: s.pill,
          onClick: () => setCollapsed(false),
          title: 'Баланс DeepSeek — развернуть',
        }, label)
      }

      const payload = snapshot && snapshot.payload
      let inner

      if (error && !snapshot) {
        inner = h('div', { style: s.error }, 'Не удалось загрузить баланс: ' + error)
      } else if (payload && payload.unavailable) {
        inner = h('div', { style: s.hint }, 'Сервис аккаунта DeepSeek недоступен.')
      } else if (payload && !payload.signedIn) {
        inner = h('div', null,
          h('div', { style: s.hint }, 'Вы не вошли в аккаунт DeepSeek.'),
          h('div', { style: s.hint }, 'Войдите: Настройки → Аккаунт.'),
        )
      } else if (payload && payload.balance) {
        const bonus = bonusOf(payload.balance)
        const currencies = Object.keys(snapshot.totals).sort()
        inner = h('div', null,
          ...currencies.map((c) => h('div', { key: c },
            h('div', { style: s.row },
              h('span', { style: s.rowLabel }, 'Баланс'),
              h('span', { style: s.amountBig }, fmt(c, snapshot.totals[c])),
            ),
            h('div', { style: s.row },
              h('span', {
                style: s.rowLabel,
                title: 'Приблизительно: разница баланса с начала дня. Пополнения и гранты могут занижать значение.',
              }, 'Потрачено сегодня'),
              h('span', { style: s.spent }, fmt(c, snapshot.spent[c] || 0)),
            ),
            bonus[c] ? h('div', { style: s.bonus }, `В т.ч. бонус: ${fmt(c, bonus[c])}`) : null,
          )),
        )
      } else if (payload) {
        inner = h('div', { style: s.hint }, 'Баланс не определён.')
      }

      const links = payload && payload.links
        ? h('div', { style: s.links },
            payload.links.topUpUrl ? h('a', { href: payload.links.topUpUrl, target: '_blank', rel: 'noreferrer', style: s.link }, 'Пополнить') : null,
            payload.links.usageUrl ? h('a', { href: payload.links.usageUrl, target: '_blank', rel: 'noreferrer', style: s.link }, 'Usage') : null,
          )
        : null

      const updated = snapshot && snapshot.at
        ? h('div', { style: s.updated }, 'Обновлено ' + new Date(snapshot.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
        : null

      return h('div', { style: s.card },
        h('div', { style: s.header },
          h('span', { style: s.title }, 'DeepSeek'),
          h('span', { style: s.controls },
            h('button', { style: s.iconBtn, onClick: load, title: 'Обновить' }, '↻'),
            h('button', { style: s.iconBtn, onClick: () => setCollapsed(true), title: 'Свернуть' }, '—'),
          ),
        ),
        inner,
        links,
        updated,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'deepseek-balance', order: 100, label: 'DeepSeek balance',
        }, Widget))
      },
    }
  },
})
