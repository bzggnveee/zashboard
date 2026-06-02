import { updateConfigsAPI } from '@/api'
import { showNotification } from '@/helper/notification'
import { buildInjectedConfig, hasInjectionData } from '@/helper/ruleInjection'
import { fetchConfigs } from '@/store/config'
import { fetchRules } from '@/store/rules'

let isRunning = false

export const runRuleInjection = async (): Promise<void> => {
  if (isRunning) return
  if (!hasInjectionData()) return

  isRunning = true
  try {
    const payload = buildInjectedConfig()
    if (!payload) return
    await updateConfigsAPI({ payload }, true)
    await Promise.all([fetchConfigs(), fetchRules()])
    showNotification({
      content: 'ruleInjectionSuccess',
      type: 'alert-success',
    })
  } catch {
    // axios interceptor surfaces the underlying error
  } finally {
    isRunning = false
  }
}
