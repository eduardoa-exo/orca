export type CodeSymbolKind =
  | 'class'
  | 'method'
  | 'function'
  | 'field'
  | 'attribute'
  | 'variable'
  | 'record'
  | 'template'
  | 'menuitem'

/** `line` and `column` are 1-based, matching editor reveal positions. */
export type CodeSymbol = {
  name: string
  kind: CodeSymbolKind
  detail?: string
  line: number
  column: number
  children: CodeSymbol[]
}
