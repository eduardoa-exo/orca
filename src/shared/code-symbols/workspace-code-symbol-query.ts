import type { SearchResult } from '../file-search/code-search-types'
import type { CodeSymbolKind } from './code-symbol-types'
import { classifyOdooXmlSymbolLine } from './odoo-xml-code-symbols'
import { classifyPythonSymbolLine, pythonAssignmentKind } from './python-code-symbols'

export type WorkspaceCodeSymbolSearch = {
  includePattern: string
  pattern: string
  classify: (
    line: string
  ) => { name: string; kind: CodeSymbolKind; detail?: string; column: number } | null
}

export type WorkspaceCodeSymbolHit = {
  name: string
  kind: CodeSymbolKind
  detail?: string
  filePath: string
  relativePath: string
  line: number
  column: number
}

const PYTHON_QUERY = /^\w+$/
const XML_QUERY = /^[\w.-]+$/
// Class attributes sit one indent unit deep; deeper assignments are method locals.
const MAX_ATTRIBUTE_INDENT = 4

function classifyPythonHit(line: string): ReturnType<WorkspaceCodeSymbolSearch['classify']> {
  const symbol = classifyPythonSymbolLine(line)
  if (!symbol) {
    return null
  }
  if (symbol.form === 'class') {
    return { name: symbol.name, kind: 'class', column: symbol.column }
  }
  if (symbol.form === 'def') {
    return {
      name: symbol.name,
      kind: symbol.indent === 0 ? 'function' : 'method',
      column: symbol.column
    }
  }
  if (symbol.indent > MAX_ATTRIBUTE_INDENT || (symbol.indent > 0 && line.startsWith('\t\t'))) {
    return null
  }
  return {
    name: symbol.name,
    kind: symbol.indent === 0 ? 'variable' : pythonAssignmentKind(symbol.detail),
    ...(symbol.detail ? { detail: symbol.detail } : {}),
    column: symbol.column
  }
}

/** Patterns stay POSIX-ERE compatible because search may fall back to `git grep -E`. */
export function buildWorkspaceCodeSymbolSearches(query: string): WorkspaceCodeSymbolSearch[] {
  const searches: WorkspaceCodeSymbolSearch[] = []
  if (PYTHON_QUERY.test(query)) {
    const ident = '[A-Za-z0-9_]*'
    searches.push({
      includePattern: '**/*.py',
      pattern:
        `^[[:space:]]*((async[[:space:]]+)?def|class)[[:space:]]+${ident}${query}` +
        `|^[[:space:]]{0,${MAX_ATTRIBUTE_INDENT}}${ident}${query}${ident}[[:space:]]*(:[^=]*)?=([^=]|$)`,
      classify: classifyPythonHit
    })
  }
  if (XML_QUERY.test(query)) {
    const escaped = query.replace(/\./g, '\\.')
    searches.push({
      includePattern: '**/*.xml',
      pattern: `<(record|template|menuitem)[[:space:]]([^>]*[[:space:]])?id[[:space:]]*=[[:space:]]*["'][^"']*${escaped}`,
      classify: classifyOdooXmlSymbolLine
    })
  }
  return searches
}

function matchRank(name: string, needle: string): number {
  const lower = name.toLowerCase()
  return lower === needle ? 0 : lower.startsWith(needle) ? 1 : 2
}

/** Turns raw line hits into symbols, dropping lines the loose regex matched for other reasons. */
export function collectWorkspaceCodeSymbolHits(
  query: string,
  results: readonly { search: WorkspaceCodeSymbolSearch; result: SearchResult }[]
): WorkspaceCodeSymbolHit[] {
  const needle = query.toLowerCase()
  const hits: WorkspaceCodeSymbolHit[] = []
  const seenLines = new Set<string>()
  for (const { search, result } of results) {
    for (const file of result.files) {
      for (const match of file.matches) {
        const lineKey = `${file.filePath}:${match.line}`
        const symbol = seenLines.has(lineKey) ? null : search.classify(match.lineContent)
        if (!symbol || !symbol.name.toLowerCase().includes(needle)) {
          continue
        }
        seenLines.add(lineKey)
        hits.push({
          ...symbol,
          filePath: file.filePath,
          relativePath: file.relativePath,
          line: match.line
        })
      }
    }
  }
  return hits.sort(
    (a, b) =>
      matchRank(a.name, needle) - matchRank(b.name, needle) ||
      a.relativePath.localeCompare(b.relativePath) ||
      a.line - b.line
  )
}
