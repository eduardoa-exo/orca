export type CodeImportSpecifierRange = {
  specifier: string
  startOffset: number
  endOffset: number
}

// Member access (`Array.from('./x')`) is not a module reference, so a preceding `.`/identifier char rejects the keyword.
const RELATIVE_IMPORT_SPECIFIER =
  /(?<![.\w$])(?:import\s*\(|require\s*\(|from|import)\s*(['"])(\.\.?(?:\/[^'"\n]*)?)\1/g

/** Relative module specifiers in `from`, side-effect `import`, `import()` and `require()` forms. */
export function findRelativeImportSpecifiers(text: string): CodeImportSpecifierRange[] {
  const ranges: CodeImportSpecifierRange[] = []
  for (const match of text.matchAll(RELATIVE_IMPORT_SPECIFIER)) {
    const specifier = match[2]
    const endOffset = match.index + match[0].length - 1
    ranges.push({ specifier, startOffset: endOffset - specifier.length, endOffset })
  }
  return ranges
}

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs']
// TS ESM imports name the emitted file, so `./x.js` usually means `./x.ts` on disk.
const EMITTED_TO_SOURCE_EXTENSIONS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts']
}

/** Relative paths a bundler-style resolver would try for a specifier, most specific first. */
export function getImportSpecifierCandidates(specifier: string): string[] {
  const base = specifier.replace(/\/+$/, '') || specifier
  const candidates: string[] = []
  const isDirectoryReference = base === '.' || base === '..'
  if (!isDirectoryReference) {
    const lastSegment = base.slice(base.lastIndexOf('/') + 1)
    const extension = /\.[^.]+$/.exec(lastSegment)?.[0]
    if (extension) {
      candidates.push(base)
      const stem = base.slice(0, -extension.length)
      for (const sourceExtension of EMITTED_TO_SOURCE_EXTENSIONS[extension.toLowerCase()] ?? []) {
        candidates.push(stem + sourceExtension)
      }
    }
    candidates.push(...MODULE_EXTENSIONS.map((ext) => base + ext), `${base}.json`)
  }
  candidates.push(...MODULE_EXTENSIONS.map((ext) => `${base}/index${ext}`))
  return [...new Set(candidates)]
}
