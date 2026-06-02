import { awAvenueYaml, clashConfigText, userProxyYaml } from 'virtual:rule-injection-data'

const KNOWN_FLAGS = new Set(['no-resolve', 'src'])

const BEGIN_MARKER = '# >>> zashboard auto-injected rules (do not edit) >>>'
const END_MARKER = '# <<< zashboard auto-injected rules <<<'

const stripQuotes = (s: string): string => {
  if (s.length >= 2) {
    const f = s[0]
    const l = s[s.length - 1]
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) {
      return s.slice(1, -1)
    }
  }
  return s
}

const splitRuleParts = (rule: string): string[] => rule.split(',').map((p) => p.trim())

const hasPolicy = (parts: string[]): boolean => {
  // Format: TYPE,ARGUMENT[,POLICY][,FLAGS...]
  // A "policy" is any token after the argument that is NOT a known flag.
  for (let i = 2; i < parts.length; i++) {
    if (!KNOWN_FLAGS.has(parts[i])) return true
  }
  return false
}

const ensureRejectPolicy = (rule: string): string => {
  const parts = splitRuleParts(rule)
  if (parts.length < 2) return rule
  if (hasPolicy(parts)) return rule
  // Insert REJECT after the argument, before any trailing flags.
  return [parts[0], parts[1], 'REJECT', ...parts.slice(2)].join(',')
}

const ensureProxyPolicy = (rule: string): string => {
  const parts = splitRuleParts(rule)
  if (parts.length < 2) return rule
  if (hasPolicy(parts)) return rule
  return [parts[0], parts[1], '代理', ...parts.slice(2)].join(',')
}

export const extractRulesFromProvider = (
  yamlText: string,
  mode: 'userProxy' | 'awAvenue',
): string[] => {
  const out: string[] = []
  for (const raw of yamlText.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    if (trimmed === 'payload:' || trimmed.startsWith('payload:')) continue
    if (!trimmed.startsWith('-')) continue

    // Strip leading "-" and any whitespace after it.
    let body = trimmed.replace(/^-\s*/, '').trim()
    if (!body) continue
    // Strip inline trailing comment (# ...) — but be conservative about #
    // inside quoted strings; rule provider lines don't generally use quotes.
    const hashIdx = body.indexOf(' #')
    if (hashIdx !== -1) body = body.slice(0, hashIdx).trim()
    body = stripQuotes(body)
    if (!body) continue

    const adjusted = mode === 'awAvenue' ? ensureRejectPolicy(body) : ensureProxyPolicy(body)
    out.push(adjusted)
  }
  return out
}

interface RulesBlock {
  startLine: number // index of `rules:` line
  endLine: number // exclusive; first line after the rules block
  indent: string // leading whitespace for a rule item (e.g. "  ")
}

const findRulesBlock = (lines: string[]): RulesBlock | null => {
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
    // A new top-level key starts at column 0 with a letter/quote.
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

const stripExistingInjection = (lines: string[]): string[] => {
  const begin = lines.findIndex((l) => l.trim() === BEGIN_MARKER)
  if (begin === -1) return lines
  const end = lines.findIndex((l, i) => i > begin && l.trim() === END_MARKER)
  if (end === -1) return lines
  return [...lines.slice(0, begin), ...lines.slice(end + 1)]
}

const findInjectionPoint = (lines: string[], block: RulesBlock): number => {
  // Walk upward from the last rule line, treating contiguous MATCH/GEOIP
  // entries as the trailing block we must stay above. Blank lines inside
  // that trailing block are ignored.
  let injectAt = block.endLine
  for (let i = block.endLine - 1; i > block.startLine; i--) {
    const t = lines[i].trim()
    if (t === '') continue
    if (/^-\s*(MATCH|GEOIP)\b/.test(t)) {
      injectAt = i
    } else {
      break
    }
  }
  return injectAt
}

export const buildInjectedConfig = (): string => {
  if (!clashConfigText) return clashConfigText
  const rules = [
    ...extractRulesFromProvider(userProxyYaml, 'userProxy'),
    ...extractRulesFromProvider(awAvenueYaml, 'awAvenue'),
  ]
  if (rules.length === 0) return clashConfigText

  // Use \n as the working separator; preserve final newline status.
  const hadTrailingNewline = clashConfigText.endsWith('\n')
  const initialLines = clashConfigText.replace(/\r\n/g, '\n').split('\n')
  // If the file ended with a newline, split() leaves an empty final element;
  // we'll re-add it at the end and drop it from the working array.
  const trailingEmpty = hadTrailingNewline && initialLines[initialLines.length - 1] === ''
  const working = trailingEmpty ? initialLines.slice(0, -1) : initialLines

  const stripped = stripExistingInjection(working)
  const block = findRulesBlock(stripped)
  if (!block) return clashConfigText

  const injectAt = findInjectionPoint(stripped, block)
  const indent = block.indent
  const injected: string[] = [
    `${indent}${BEGIN_MARKER}`,
    ...rules.map((r) => `${indent}- ${r}`),
    `${indent}${END_MARKER}`,
  ]

  const merged = [...stripped.slice(0, injectAt), ...injected, ...stripped.slice(injectAt)]
  return merged.join('\n') + (hadTrailingNewline ? '\n' : '')
}

export const getInjectionDataStatus = () => {
  const userProxyRules = extractRulesFromProvider(userProxyYaml, 'userProxy')
  const awAvenueRules = extractRulesFromProvider(awAvenueYaml, 'awAvenue')
  return {
    clashConfig: clashConfigText,
    hasClashConfig: Boolean(clashConfigText),
    hasUserProxy: Boolean(userProxyYaml),
    hasAwAvenue: Boolean(awAvenueYaml),
    userProxyCount: userProxyRules.length,
    awAvenueCount: awAvenueRules.length,
    ruleCount: userProxyRules.length + awAvenueRules.length,
  }
}

export const hasInjectionData = (): boolean => {
  const { hasClashConfig, userProxyCount, awAvenueCount } = getInjectionDataStatus()
  return hasClashConfig && userProxyCount + awAvenueCount > 0
}
