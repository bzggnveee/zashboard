#!/usr/bin/env node
/**
 * Write injected Clash config to disk (for hosts where the dashboard is static).
 * Usage: node scripts/persist-injection.mjs [outputPath]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const readFirst = (paths) => {
  for (const p of paths) {
    const abs = resolve(p)
    if (existsSync(abs)) return { path: abs, content: readFileSync(abs, 'utf-8') }
  }
  return null
}

// Inline minimal injection (keep in sync with src/helper/ruleInjection.ts)
const KNOWN_FLAGS = new Set(['no-resolve', 'src'])
const BEGIN_MARKER = '# >>> zashboard auto-injected rules (do not edit) >>>'
const END_MARKER = '# <<< zashboard auto-injected rules <<<'

const splitRuleParts = (rule) => rule.split(',').map((p) => p.trim())
const hasPolicy = (parts) => {
  for (let i = 2; i < parts.length; i++) if (!KNOWN_FLAGS.has(parts[i])) return true
  return false
}
const ensureRejectPolicy = (rule) => {
  const parts = splitRuleParts(rule)
  if (parts.length < 2 || hasPolicy(parts)) return rule
  return [parts[0], parts[1], 'REJECT', ...parts.slice(2)].join(',')
}
const ensureProxyPolicy = (rule) => {
  const parts = splitRuleParts(rule)
  if (parts.length < 2 || hasPolicy(parts)) return rule
  return [parts[0], parts[1], '代理', ...parts.slice(2)].join(',')
}
const extractRulesFromProvider = (yamlText, mode) => {
  const out = []
  for (const raw of yamlText.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'payload:' || trimmed.startsWith('payload:'))
      continue
    if (!trimmed.startsWith('-')) continue
    let body = trimmed.replace(/^-\s*/, '').trim()
    const hashIdx = body.indexOf(' #')
    if (hashIdx !== -1) body = body.slice(0, hashIdx).trim()
    out.push(mode === 'awAvenue' ? ensureRejectPolicy(body) : ensureProxyPolicy(body))
  }
  return out
}
const findRulesBlock = (lines) => {
  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^rules\s*:\s*(#.*)?$/.test(lines[i])) {
      startLine = i
      break
    }
  }
  if (startLine === -1) return null
  let endLine = lines.length
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === '') continue
    if (/^[A-Za-z_'"]/.test(line)) {
      endLine = i
      break
    }
  }
  let indent = '  '
  for (let i = startLine + 1; i < endLine; i++) {
    const m = lines[i].match(/^(\s*)-\s/)
    if (m) {
      indent = m[1]
      break
    }
  }
  return { startLine, endLine, indent }
}
const stripExistingInjection = (lines) => {
  const begin = lines.findIndex((l) => l.trim() === BEGIN_MARKER)
  if (begin === -1) return lines
  const end = lines.findIndex((l, i) => i > begin && l.trim() === END_MARKER)
  if (end === -1) return lines
  return [...lines.slice(0, begin), ...lines.slice(end + 1)]
}
const findInjectionPoint = (lines, block) => {
  let injectAt = block.endLine
  for (let i = block.endLine - 1; i > block.startLine; i--) {
    const t = lines[i].trim()
    if (t === '') continue
    if (/^-\s*(MATCH|GEOIP)\b/.test(t)) injectAt = i
    else break
  }
  return injectAt
}

const clashResult = readFirst([
  resolve(root, 'injection/Clash配置.yaml'),
  resolve(root, '../Clash配置.yaml'),
])
const clashConfigText = clashResult?.content ?? ''
const clashSourcePath = clashResult?.path ?? null

const userProxyResult = readFirst([
  resolve(root, 'injection/rule_providers/userProxy.yaml'),
  resolve(root, '../rule_providers/userProxy.yaml'),
])
const userProxyYaml = userProxyResult?.content ?? ''

const awAvenueResult = readFirst([
  resolve(root, 'injection/rule_providers/AWAvenue-Ads-Rule-Clash.yaml'),
  resolve(root, '../rule_providers/AWAvenue-Ads-Rule-Clash.yaml'),
])
const awAvenueYaml = awAvenueResult?.content ?? ''

if (!clashConfigText) {
  console.error('Missing Clash配置.yaml in injection/ or parent directory')
  process.exit(1)
}

const rules = [
  ...extractRulesFromProvider(userProxyYaml, 'userProxy'),
  ...extractRulesFromProvider(awAvenueYaml, 'awAvenue'),
]
const hadTrailingNewline = clashConfigText.endsWith('\n')
const initialLines = clashConfigText.replace(/\r\n/g, '\n').split('\n')
const trailingEmpty = hadTrailingNewline && initialLines[initialLines.length - 1] === ''
const working = trailingEmpty ? initialLines.slice(0, -1) : initialLines
const stripped = stripExistingInjection(working)
const block = findRulesBlock(stripped)
if (!block) {
  console.error('No rules: section found')
  process.exit(1)
}
const injectAt = findInjectionPoint(stripped, block)
const injected = [
  `${block.indent}${BEGIN_MARKER}`,
  ...rules.map((r) => `${block.indent}- ${r}`),
  `${block.indent}${END_MARKER}`,
]
const merged = [...stripped.slice(0, injectAt), ...injected, ...stripped.slice(injectAt)]
const result = merged.join('\n') + (hadTrailingNewline ? '\n' : '')

// Write back to the source file, plus the parent config (mihomo's actual config)
const mainConfigPath = resolve(root, '../Clash配置.yaml')
const outPath = resolve(process.argv[2] || clashSourcePath || mainConfigPath)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, result, 'utf-8')
const written = [outPath]
if (resolve(outPath) !== resolve(mainConfigPath)) {
  mkdirSync(dirname(mainConfigPath), { recursive: true })
  writeFileSync(mainConfigPath, result, 'utf-8')
  written.push(mainConfigPath)
}
console.log(`Wrote ${rules.length} injected rules to:\n  ${written.join('\n  ')}`)
