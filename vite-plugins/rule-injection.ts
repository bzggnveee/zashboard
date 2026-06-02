import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:rule-injection-data'
const RESOLVED_ID = '\0' + VIRTUAL_ID

export interface RuleInjectionOptions {
  /** Project root (zashboard directory). */
  rootDir: string
}

const readFirst = (candidates: string[]): string => {
  for (const p of candidates) {
    const abs = resolve(p)
    if (existsSync(abs)) return readFileSync(abs, 'utf-8')
  }
  return ''
}

export function ruleInjectionPlugin(opts: RuleInjectionOptions): Plugin {
  const root = resolve(opts.rootDir)
  const clashCandidates = [
    resolve(root, 'injection/Clash配置.yaml'),
    resolve(root, '../Clash配置.yaml'),
  ]
  const userProxyCandidates = [
    resolve(root, 'injection/rule_providers/userProxy.yaml'),
    resolve(root, '../rule_providers/userProxy.yaml'),
  ]
  const awAvenueCandidates = [
    resolve(root, 'injection/rule_providers/AWAvenue-Ads-Rule-Clash.yaml'),
    resolve(root, '../rule_providers/AWAvenue-Ads-Rule-Clash.yaml'),
  ]
  const watchPaths = [...clashCandidates, ...userProxyCandidates, ...awAvenueCandidates].filter(
    (p) => existsSync(p),
  )

  return {
    name: 'rule-injection-data',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const clashConfig = readFirst(clashCandidates)
      const userProxy = readFirst(userProxyCandidates)
      const awAvenue = readFirst(awAvenueCandidates)
      return [
        `export const clashConfigText = ${JSON.stringify(clashConfig)};`,
        `export const userProxyYaml = ${JSON.stringify(userProxy)};`,
        `export const awAvenueYaml = ${JSON.stringify(awAvenue)};`,
      ].join('\n')
    },
    configureServer(server) {
      watchPaths.forEach((p) => server.watcher.add(p))
      const onChange = (changed: string) => {
        if (!watchPaths.includes(resolve(changed))) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.ws.send({ type: 'full-reload' })
        }
      }
      server.watcher.on('change', onChange)
      server.watcher.on('add', onChange)
    },
  }
}
