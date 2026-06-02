import { updateConfigsAPI } from '@/api'
import { showNotification } from '@/helper/notification'
import {
  buildInjectedConfig,
  getInjectionDataStatus,
  hasInjectionData,
} from '@/helper/ruleInjection'
import { fetchConfigs } from '@/store/config'
import { fetchRules } from '@/store/rules'

let isRunning = false

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
    showNotification({
      content: 'ruleInjectionSuccess',
      params: {
        rules: String(status.ruleCount),
      },
      type: 'alert-success',
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
