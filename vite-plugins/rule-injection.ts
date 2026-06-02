import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'

const VIRTUAL_ID = 'virtual:rule-injection-data'
const RESOLVED_ID = '\0' + VIRTUAL_ID
const PERSIST_PATH = '/__zashboard/persist-injection'

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

const readBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })

const attachPersistMiddleware = (
  middlewares: Connect.Server,
  root: string,
  clashCandidates: string[],
) => {
  middlewares.use(PERSIST_PATH, async (req, res, next) => {
    if (req.method !== 'POST') {
      next()
      return
    }

    try {
      const body = await readBody(req)
      const headerPath = req.headers['x-config-path']
      const customPath =
        typeof headerPath === 'string' && headerPath.trim() ? resolve(headerPath.trim()) : ''

      const targets = [
        ...(customPath ? [customPath] : []),
        ...clashCandidates,
        resolve(root, 'injection/Clash配置.yaml'),
      ]

      let writtenPath = ''
      for (const target of targets) {
        try {
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, body, 'utf-8')
          writtenPath = target
          break
        } catch {
          // try next candidate
        }
      }

      if (!writtenPath) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'write failed' }))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, path: writtenPath }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  })
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

  const setupPersist = (server: { middlewares: Connect.Server }) => {
    attachPersistMiddleware(server.middlewares, root, clashCandidates)
  }

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
    configureServer(server: ViteDevServer) {
      setupPersist(server)
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
    configurePreviewServer(server: PreviewServer) {
      setupPersist(server)
    },
  }
}
