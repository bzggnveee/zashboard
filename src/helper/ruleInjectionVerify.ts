import { fetchRulesAPI } from '@/api'
import type { Rule } from '@/types'

/** Domains that exist in bundled providers and become inline DOMAIN rules after injection. */
const INLINE_PROBE: Array<{ type: string; payload: string }> = [
  { type: 'DOMAIN', payload: 'httpdns.bilivideo.com' },
  { type: 'DOMAIN', payload: 'ad-cdn.qingting.fm' },
]

export const hasInlineInjectedRule = (rules: Rule[]): boolean =>
  INLINE_PROBE.some((probe) =>
    rules.some((r) => r.type === probe.type && r.payload === probe.payload),
  )

export const verifyInjectionInCore = async (): Promise<boolean> => {
  const { data } = await fetchRulesAPI()
  return hasInlineInjectedRule(data.rules)
}
