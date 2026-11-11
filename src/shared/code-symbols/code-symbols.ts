import type { CodeSymbol } from './code-symbol-types'
import { parseOdooXmlCodeSymbols } from './odoo-xml-code-symbols'
import { parsePythonCodeSymbols } from './python-code-symbols'

const CODE_SYMBOL_PARSERS: Record<string, (text: string) => CodeSymbol[]> = {
  python: parsePythonCodeSymbols,
  xml: parseOdooXmlCodeSymbols
}

export function supportsCodeSymbols(language: string): boolean {
  return language in CODE_SYMBOL_PARSERS
}

/** Returns null for languages without a symbol parser so callers can show "unsupported". */
export function parseCodeSymbols(language: string, text: string): CodeSymbol[] | null {
  return CODE_SYMBOL_PARSERS[language]?.(text) ?? null
}

/** Innermost symbol whose start is at or above `line`, for highlighting the cursor's scope. */
export function findCodeSymbolPathAtLine(
  symbols: readonly CodeSymbol[],
  line: number
): CodeSymbol[] {
  const path: CodeSymbol[] = []
  let level = symbols
  while (level.length > 0) {
    let candidate: CodeSymbol | undefined
    for (const symbol of level) {
      if (symbol.line > line) {
        break
      }
      candidate = symbol
    }
    if (!candidate) {
      break
    }
    path.push(candidate)
    level = candidate.children
  }
  return path
}
