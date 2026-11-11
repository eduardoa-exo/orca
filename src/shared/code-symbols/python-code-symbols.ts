import type { CodeSymbol } from './code-symbol-types'

export type PythonSymbolLine = {
  name: string
  form: 'class' | 'def' | 'assignment'
  detail?: string
  indent: number
  column: number
}

const CLASS_LINE = /^([ \t]*)class[ \t]+([A-Za-z_]\w*)/
const DEF_LINE = /^([ \t]*)(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)/
const ASSIGNMENT_LINE = /^([ \t]*)([A-Za-z_]\w*)[ \t]*(?::[^=]*)?=(?!=)[ \t]*(.*)$/
const ODOO_FIELD_VALUE = /^(fields\.[A-Za-z_]\w*)/
const STRING_LITERAL_VALUE = /^[rRuUbBfF]{0,2}(['"])([^'"\\]{1,80})\1[ \t]*(?:#.*)?$/

function assignmentDetail(value: string): string | undefined {
  return ODOO_FIELD_VALUE.exec(value)?.[1] ?? STRING_LITERAL_VALUE.exec(value)?.[2]
}

/** Classifies one source line in isolation; workspace search has no surrounding context. */
export function classifyPythonSymbolLine(line: string): PythonSymbolLine | null {
  const classMatch = CLASS_LINE.exec(line)
  if (classMatch) {
    const indent = classMatch[1].length
    return {
      name: classMatch[2],
      form: 'class',
      indent,
      column: line.indexOf(classMatch[2], indent) + 1
    }
  }
  const defMatch = DEF_LINE.exec(line)
  if (defMatch) {
    const indent = defMatch[1].length
    return { name: defMatch[2], form: 'def', indent, column: line.indexOf(defMatch[2], indent) + 1 }
  }
  const assignment = ASSIGNMENT_LINE.exec(line)
  if (assignment) {
    const indent = assignment[1].length
    return {
      name: assignment[2],
      form: 'assignment',
      detail: assignmentDetail(assignment[3]),
      indent,
      column: indent + 1
    }
  }
  return null
}

export function pythonAssignmentKind(detail: string | undefined): 'field' | 'attribute' {
  return detail?.startsWith('fields.') ? 'field' : 'attribute'
}

type ScanState = { tripleQuote: string | null; depth: number; continued: boolean }

/** Advances bracket depth and string state so continuation lines are never read as statements. */
function scanPythonLine(line: string, state: ScanState): void {
  let i = 0
  state.continued = false
  while (i < line.length) {
    if (state.tripleQuote) {
      const end = line.indexOf(state.tripleQuote, i)
      if (end === -1) {
        return
      }
      i = end + 3
      state.tripleQuote = null
      continue
    }
    const ch = line[i]
    if (ch === '#') {
      return
    }
    if (ch === '"' || ch === "'") {
      const triple = ch.repeat(3)
      if (line.startsWith(triple, i)) {
        state.tripleQuote = triple
        i += 3
        continue
      }
      i += 1
      while (i < line.length && line[i] !== ch) {
        i += line[i] === '\\' ? 2 : 1
      }
      i += 1
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      state.depth += 1
    } else if (ch === ')' || ch === ']' || ch === '}') {
      state.depth = Math.max(0, state.depth - 1)
    } else if (ch === '\\' && i === line.length - 1) {
      state.continued = true
    }
    i += 1
  }
}

type ScopeFrame = { symbol: CodeSymbol; indent: number; bodyIndent: number | null }

export function parsePythonCodeSymbols(text: string): CodeSymbol[] {
  const roots: CodeSymbol[] = []
  const stack: ScopeFrame[] = []
  const state: ScanState = { tripleQuote: null, depth: 0, continued: false }
  const lines = text.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const atStatementStart = !state.tripleQuote && state.depth === 0 && !state.continued
    scanPythonLine(line, state)
    const trimmed = line.trimStart()
    if (!atStatementStart || trimmed === '' || trimmed.startsWith('#')) {
      continue
    }
    const indent = line.length - trimmed.length
    while (stack.length > 0 && stack.at(-1)!.indent >= indent) {
      stack.pop()
    }
    const parent = stack.at(-1)
    if (parent && parent.bodyIndent === null) {
      parent.bodyIndent = indent
    }
    const classified = classifyPythonSymbolLine(line)
    if (!classified) {
      continue
    }
    const siblings = parent ? parent.symbol.children : roots
    const position = { line: index + 1, column: classified.column }
    if (classified.form === 'assignment') {
      const isModuleLevel = !parent && indent === 0
      const isClassBody = parent?.symbol.kind === 'class' && parent.bodyIndent === indent
      if (isModuleLevel || isClassBody) {
        siblings.push({
          name: classified.name,
          kind: isModuleLevel ? 'variable' : pythonAssignmentKind(classified.detail),
          ...(classified.detail ? { detail: classified.detail } : {}),
          ...position,
          children: []
        })
      }
      continue
    }
    const symbol: CodeSymbol = {
      name: classified.name,
      kind:
        classified.form === 'class'
          ? 'class'
          : parent?.symbol.kind === 'class'
            ? 'method'
            : 'function',
      ...position,
      children: []
    }
    siblings.push(symbol)
    stack.push({ symbol, indent, bodyIndent: null })
  }
  return roots
}
