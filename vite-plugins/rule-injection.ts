import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:rule-injection-data'
const RESOLVED_ID = '\0' + VIRTUAL_ID

export interface RuleInjectionOptions {
  clashConfigPath: string
  userProxyPath: string
  awAvenuePath: string
}

const readOr = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf-8') : '')

export function ruleInjectionPlugin(opts: RuleInjectionOptions): Plugin {
  const paths = [opts.clashConfigPath, opts.userProxyPath, opts.awAvenuePath].map((p) => resolve(p))

  return {
    name: 'rule-injection-data',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const [clashConfig, userProxy, awAvenue] = paths.map(readOr)
      return [
        `export const clashConfigText = ${JSON.stringify(clashConfig)};`,
        `export const userProxyYaml = ${JSON.stringify(userProxy)};`,
        `export const awAvenueYaml = ${JSON.stringify(awAvenue)};`,
      ].join('\n')
    },
    configureServer(server) {
      paths.forEach((p) => {
        if (existsSync(p)) server.watcher.add(p)
      })
      const onChange = (changed: string) => {
        if (!paths.includes(resolve(changed))) return
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
