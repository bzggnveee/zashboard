import { useStorage } from '@vueuse/core'

/** Absolute path to the main Clash/Mihomo config file on the core host (for persist hints). */
export const ruleInjectionConfigPath = useStorage('config/rule-injection-config-path', '')

/** When true, try to write injected YAML to disk (dev/preview server only). */
export const ruleInjectionPersistToDisk = useStorage('config/rule-injection-persist-to-disk', true)
