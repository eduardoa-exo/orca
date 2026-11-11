import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store/index'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { editorModelRegistry } from '@/lib/editor/monaco/editor-model-registry'
import { currentUnsavedText } from '@/components/editor/save/flush/removal-unsaved-editor-files'
import { editorTabModelUri } from '@/components/editor/save/queue/editor-save-disk-precondition'
import { detectLanguage } from '../../../../../../shared/editor-language/editor-language-detect'
import {
  findCodeSymbolPathAtLine,
  parseCodeSymbols,
  supportsCodeSymbols
} from '../../../../../../shared/code-symbols/code-symbols'
import type { CodeSymbol } from '../../../../../../shared/code-symbols/code-symbol-types'

const REPARSE_DEBOUNCE_MS = 250
const NO_SYMBOL_PATH: CodeSymbol[] = []

export type ActiveFileCodeSymbols =
  | { status: 'no-file' }
  | { status: 'unsupported'; file: OpenFile }
  | { status: 'loading'; file: OpenFile }
  | { status: 'ready'; file: OpenFile; symbols: CodeSymbol[]; activePath: CodeSymbol[] }

type ParsedSymbols = { fileId: string; symbols: CodeSymbol[] | null }

export function useActiveFileCodeSymbols(
  worktreeId: string | null,
  enabled: boolean
): ActiveFileCodeSymbols {
  const file = useAppStore((s) => {
    const active = s.activeFileId ? s.openFiles.find((f) => f.id === s.activeFileId) : undefined
    return active && active.worktreeId === worktreeId && active.mode === 'edit' ? active : null
  })
  const language = file ? detectLanguage(file.filePath) : null
  const supported = language !== null && supportsCodeSymbols(language)
  const draft = useAppStore((s) => (file ? s.editorDrafts?.[file.id] : undefined))
  const cursorLine = useAppStore((s) => (file ? s.editorCursorLine[file.id] : undefined))
  const registry = useSyncExternalStore(editorModelRegistry.subscribe, editorModelRegistry.get)
  const [parsed, setParsed] = useState<ParsedSymbols | null>(null)

  useEffect(() => {
    if (!enabled || !file || !language || !supported) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    let modelSubscription: { dispose(): void } | undefined
    const refresh = (): void => {
      const text = currentUnsavedText(useAppStore.getState(), file)
      setParsed({
        fileId: file.id,
        symbols: text === undefined ? null : parseCodeSymbols(language, text)
      })
    }
    const scheduleRefresh = (): void => {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(refresh, REPARSE_DEBOUNCE_MS)
    }
    const attachModel = (): void => {
      modelSubscription?.dispose()
      const uri = registry?.Uri.parse(editorTabModelUri(useAppStore.getState(), file))
      modelSubscription = uri
        ? registry?.editor.getModel(uri)?.onDidChangeContent(scheduleRefresh)
        : undefined
    }
    refresh()
    attachModel()
    // Why: the tab can become active before Monaco creates its model.
    const createSubscription = registry?.editor.onDidCreateModel(() => {
      attachModel()
      scheduleRefresh()
    })
    return () => {
      if (timer) {
        clearTimeout(timer)
      }
      modelSubscription?.dispose()
      createSubscription?.dispose()
    }
  }, [enabled, file, language, supported, registry, draft])

  const symbols = parsed && file && parsed.fileId === file.id ? parsed.symbols : null
  const activePath = useMemo(
    () => (symbols && cursorLine ? findCodeSymbolPathAtLine(symbols, cursorLine) : NO_SYMBOL_PATH),
    [symbols, cursorLine]
  )

  return useMemo((): ActiveFileCodeSymbols => {
    if (!file) {
      return { status: 'no-file' }
    }
    if (!supported) {
      return { status: 'unsupported', file }
    }
    return symbols ? { status: 'ready', file, symbols, activePath } : { status: 'loading', file }
  }, [file, supported, symbols, activePath])
}
