import { describe, expect, it } from 'vitest'
import {
  findRelativeImportSpecifiers,
  getImportSpecifierCandidates
} from './code-import-specifiers'

describe('findRelativeImportSpecifiers', () => {
  it('finds relative specifiers in import, export, dynamic import and require forms', () => {
    const text = [
      "import type { A } from '../../shared/a'",
      "import { b } from '@/lib/b'",
      'import "./side-effect.css"',
      "export * from './c'",
      "const d = await import('./d')",
      'const e = require("..")',
      "const f = Array.from('./not-an-import')"
    ].join('\n')

    const found = findRelativeImportSpecifiers(text)

    expect(found.map((range) => range.specifier)).toEqual([
      '../../shared/a',
      './side-effect.css',
      './c',
      './d',
      '..'
    ])
    expect(text.slice(found[0].startOffset, found[0].endOffset)).toBe('../../shared/a')
  })
})

describe('getImportSpecifierCandidates', () => {
  it('tries the TS source for an emitted .js specifier before extension and index lookups', () => {
    expect(getImportSpecifierCandidates('./x.js').slice(0, 4)).toEqual([
      './x.js',
      './x.ts',
      './x.tsx',
      './x.js.ts'
    ])
  })

  it('only tries index files for a bare directory reference', () => {
    expect(getImportSpecifierCandidates('..')[0]).toBe('../index.ts')
    expect(getImportSpecifierCandidates('./dir/')).toContain('./dir/index.tsx')
  })
})
