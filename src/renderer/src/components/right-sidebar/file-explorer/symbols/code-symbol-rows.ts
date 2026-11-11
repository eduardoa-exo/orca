import type {
  CodeSymbol,
  CodeSymbolKind
} from '../../../../../../shared/code-symbols/code-symbol-types'
import type { WorkspaceCodeSymbolHit } from '../../../../../../shared/code-symbols/workspace-code-symbol-query'

export type CodeSymbolFileRow = {
  type: 'file'
  key: string
  relativePath: string
  count: number
}

export type CodeSymbolItemRow = {
  type: 'symbol'
  key: string
  name: string
  kind: CodeSymbolKind
  detail?: string
  line: number
  depth: number
  /** Outline rows with children toggle by this key; null when the row cannot collapse. */
  collapseKey: string | null
  expanded: boolean
  active: boolean
  target:
    | { source: 'outline'; symbol: CodeSymbol }
    | { source: 'workspace'; hit: WorkspaceCodeSymbolHit }
}

export type CodeSymbolRow = CodeSymbolFileRow | CodeSymbolItemRow

export function buildOutlineRows(
  symbols: readonly CodeSymbol[],
  collapsedKeys: ReadonlySet<string>,
  activePath: readonly CodeSymbol[]
): CodeSymbolRow[] {
  const active = activePath.at(-1)
  const rows: CodeSymbolRow[] = []
  const visit = (level: readonly CodeSymbol[], depth: number, parentKey: string): void => {
    for (const symbol of level) {
      // Name-based keys keep collapse state stable while edits shift line numbers.
      const collapseKey = `${parentKey}/${symbol.kind}:${symbol.name}`
      const expanded = !collapsedKeys.has(collapseKey)
      rows.push({
        type: 'symbol',
        key: `${collapseKey}#${rows.length}`,
        name: symbol.name,
        kind: symbol.kind,
        ...(symbol.detail ? { detail: symbol.detail } : {}),
        line: symbol.line,
        depth,
        collapseKey: symbol.children.length > 0 ? collapseKey : null,
        expanded,
        active: symbol === active,
        target: { source: 'outline', symbol }
      })
      if (expanded) {
        visit(symbol.children, depth + 1, collapseKey)
      }
    }
  }
  visit(symbols, 0, '')
  return rows
}

/** Groups hits by file, ordering files by their best-ranked hit. */
export function buildWorkspaceRows(hits: readonly WorkspaceCodeSymbolHit[]): CodeSymbolRow[] {
  const byFile = new Map<string, WorkspaceCodeSymbolHit[]>()
  for (const hit of hits) {
    const fileHits = byFile.get(hit.filePath)
    if (fileHits) {
      fileHits.push(hit)
    } else {
      byFile.set(hit.filePath, [hit])
    }
  }
  const rows: CodeSymbolRow[] = []
  for (const [filePath, fileHits] of byFile) {
    rows.push({
      type: 'file',
      key: `file:${filePath}`,
      relativePath: fileHits[0].relativePath,
      count: fileHits.length
    })
    for (const hit of fileHits) {
      rows.push({
        type: 'symbol',
        key: `hit:${filePath}:${hit.line}`,
        name: hit.name,
        kind: hit.kind,
        ...(hit.detail ? { detail: hit.detail } : {}),
        line: hit.line,
        depth: 0,
        collapseKey: null,
        expanded: false,
        active: false,
        target: { source: 'workspace', hit }
      })
    }
  }
  return rows
}
