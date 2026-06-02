import { updateConfigsAPI } from '@/api'
import { downloadTextFile } from '@/helper/downloadText'
import { showNotification } from '@/helper/notification'
import {
  buildInjectedConfig,
  getInjectionDataStatus,
  hasInjectionData,
} from '@/helper/ruleInjection'
import { ruleInjectionConfigPath, ruleInjectionPersistToDisk } from '@/helper/ruleInjectionSettings'
import { verifyInjectionInCore } from '@/helper/ruleInjectionVerify'
import { fetchConfigs } from '@/store/config'
import { fetchRules } from '@/store/rules'

let isRunning = false

const persistInjectedConfigToDisk = async (payload: string): Promise<string | null> => {
  if (typeof window === 'undefined') return null
  try {
    const headers: Record<string, string> = { 'Content-Type': 'text/yaml;charset=utf-8' }
    if (ruleInjectionConfigPath.value.trim()) {
      headers['X-Config-Path'] = ruleInjectionConfigPath.value.trim()
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

/** Vite dev/preview middleware path (same origin as dashboard). */
const PERSIST_INJECTION_PATH = '/__zashboard/persist-injection'

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

    let savedPath: string | null = null
    if (ruleInjectionPersistToDisk.value) {
      savedPath = await persistInjectedConfigToDisk(payload)
    }

    if (!savedPath) {
      downloadTextFile('Clash配置-injected.yaml', payload)
    }

    showNotification({
      content: savedPath ? 'ruleInjectionSuccessPersisted' : 'ruleInjectionSuccessDownload',
      params: {
        rules: String(status.ruleCount),
        path: savedPath || ruleInjectionConfigPath.value || 'Clash配置-injected.yaml',
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
