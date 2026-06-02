/// <reference types="vite/client" />
interface Window {
  ksu?: object
}

declare module 'virtual:rule-injection-data' {
  export const clashConfigText: string
  export const userProxyYaml: string
  export const awAvenueYaml: string
}
