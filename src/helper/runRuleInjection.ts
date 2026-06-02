import { reloadConfigsAPI, updateConfigsAPI } from '@/api'
import { downloadTextFile } from '@/helper/downloadText'
import { showNotification } from '@/helper/notification'
import {
  buildInjectedConfig,
  clashSourcePath,
  getInjectionDataStatus,
  hasInjectionData,
} from '@/helper/ruleInjection'
import { verifyInjectionInCore } from '@/helper/ruleInjectionVerify'
import { fetchConfigs } from '@/store/config'
import { fetchRules } from '@/store/rules'

let isRunning = false

/** Vite dev/preview middleware path (same origin as dashboard). */
const PERSIST_INJECTION_PATH = '/__zashboard/persist-injection'

/**
 * Try to write the injected config to disk via the Vite dev/preview middleware.
 * The middleware writes back to the same file it originally read from.
 */
const persistViaMiddleware = async (payload: string): Promise<string | null> => {
  if (typeof window === 'undefined') return null
  try {
    const headers: Record<string, string> = { 'Content-Type': 'text/yaml;charset=utf-8' }
    if (clashSourcePath) {
      headers['X-Source-Path'] = clashSourcePath
    }
    const res = await fetch(PERSIST_INJECTION_PATH, {
      method: 'POST',
      headers,
      body: payload,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; path?: string }
    return data.ok && data.path ? data.path : null
  } catch {
    return null
  }
}

export const runRuleInjection = async (): Promise<boolean> => {
  if (isRunning) return false

  const status = getInjectionDataStatus()
  if (!hasInjectionData()) {
    showNotification({
      content: 'ruleInjectionNoData',
      params: {
        hasClashConfig: String(status.hasClashConfig),
        userProxyCount: String(status.userProxyCount),
        awAvenueCount: String(status.awAvenueCount),
      },
      type: 'alert-warning',
    })
    return false
  }

  isRunning = true
  try {
    const payload = buildInjectedConfig()
    if (!payload || payload === status.clashConfig) {
      showNotification({
        content: 'ruleInjectionNoData',
        params: {
          hasClashConfig: String(status.hasClashConfig),
          userProxyCount: String(status.userProxyCount),
          awAvenueCount: String(status.awAvenueCount),
        },
        type: 'alert-warning',
      })
      return false
    }

    // Step 1: Push injected config to mihomo in-memory
    await updateConfigsAPI({ payload }, true)
    await Promise.all([fetchConfigs(), fetchRules()])

    const verified = await verifyInjectionInCore()
    if (!verified) {
      showNotification({
        content: 'ruleInjectionVerifyFailed',
        type: 'alert-error',
      })
      return false
    }

    // Step 2: Always try to persist to disk via middleware (writes to ../Clash配置.yaml)
    const savedPath: string | null = await persistViaMiddleware(payload)

    // Step 3: If middleware wrote to disk, reload mihomo from disk so the config sticks
    if (savedPath) {
      try {
        await reloadConfigsAPI()
        await Promise.all([fetchConfigs(), fetchRules()])
      } catch {
        // reload failed, in-memory config is still active
      }
    }

    // Step 4: If no middleware (production build), download file for manual replacement
    if (!savedPath) {
      downloadTextFile('Clash配置-injected.yaml', payload)
    }

    showNotification({
      content: savedPath ? 'ruleInjectionSuccessPersisted' : 'ruleInjectionSuccessDownload',
      params: {
        rules: String(status.ruleCount),
        path: savedPath || 'Clash配置-injected.yaml',
      },
      type: 'alert-success',
      timeout: 6000,
    })
    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    showNotification({
      content: 'ruleInjectionFailed',
      params: { message },
      type: 'alert-error',
    })
    return false
  } finally {
    isRunning = false
  }
}
