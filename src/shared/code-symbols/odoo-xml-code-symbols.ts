import type { CodeSymbol } from './code-symbol-types'

type OdooXmlSymbolKind = 'record' | 'template' | 'menuitem'

const SYMBOL_TAG_OPEN = /<(record|template|menuitem)(?=[\s/>])/g
const XML_ATTRIBUTE = /(?:^|\s)([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const DETAIL_ATTRIBUTE: Record<OdooXmlSymbolKind, string> = {
  record: 'model',
  template: 'name',
  menuitem: 'name'
}

type OdooXmlTag = { kind: OdooXmlSymbolKind; id: string; idOffset: number; detail?: string }

/** Reads attributes up to the closing `>`; `>` inside quoted values does not end the tag. */
function readSymbolTag(
  text: string,
  kind: OdooXmlSymbolKind,
  attrsStart: number
): OdooXmlTag | null {
  let end = attrsStart
  let quote: string | null = null
  while (end < text.length) {
    const ch = text[end]
    if (quote) {
      quote = ch === quote ? null : quote
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      break
    }
    end += 1
  }
  const attrs = text.slice(attrsStart, end)
  let id: { value: string; offset: number } | null = null
  let detail: string | undefined
  for (const match of attrs.matchAll(XML_ATTRIBUTE)) {
    const value = match[2] ?? match[3] ?? ''
    if (match[1] === 'id' && !id) {
      const valueOffset = match.index + match[0].lastIndexOf(value)
      id = { value, offset: attrsStart + valueOffset }
    } else if (match[1] === DETAIL_ATTRIBUTE[kind] && detail === undefined) {
      detail = value
    }
  }
  if (!id || id.value === '') {
    return null
  }
  return { kind, id: id.value, idOffset: id.offset, ...(detail ? { detail } : {}) }
}

/** Blanks comments in place so offsets and line numbers stay aligned with the source. */
function blankXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function readSymbolTags(text: string): OdooXmlTag[] {
  const tags: OdooXmlTag[] = []
  for (const match of text.matchAll(SYMBOL_TAG_OPEN)) {
    const tag = readSymbolTag(text, match[1] as OdooXmlSymbolKind, match.index + match[0].length)
    if (tag) {
      tags.push(tag)
    }
  }
  return tags
}

export function parseOdooXmlCodeSymbols(text: string): CodeSymbol[] {
  const source = blankXmlComments(text)
  const lineStarts = [0]
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') {
      lineStarts.push(i + 1)
    }
  }
  let lineIndex = 0
  return readSymbolTags(source).map((tag) => {
    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= tag.idOffset) {
      lineIndex += 1
    }
    return {
      name: tag.id,
      kind: tag.kind,
      ...(tag.detail ? { detail: tag.detail } : {}),
      line: lineIndex + 1,
      column: tag.idOffset - lineStarts[lineIndex] + 1,
      children: []
    }
  })
}

/** Single-line form used for workspace search hits, where only the matched line is known. */
export function classifyOdooXmlSymbolLine(
  line: string
): { name: string; kind: OdooXmlSymbolKind; detail?: string; column: number } | null {
  const [symbol] = parseOdooXmlCodeSymbols(line)
  if (!symbol) {
    return null
  }
  return {
    name: symbol.name,
    kind: symbol.kind as OdooXmlSymbolKind,
    ...(symbol.detail ? { detail: symbol.detail } : {}),
    column: symbol.column
  }
}
