import type * as Monaco from 'monaco-editor'
import { useAppStore } from '@/store'
import type { LinkSourceContext } from '@/lib/files/access/link-source-file-context'
import { resolveRichMarkdownWorktreeRoot } from '../rich-markdown/citations/useRichMarkdownSuperscriptLinkSetup'
import { findRelativeImportSpecifiers } from './code-import-specifiers'
import { openCodeImportSpecifier } from './code-import-link-open'

const CODE_IMPORT_LINK_SCHEME = 'orca-code-import'
const CODE_IMPORT_LANGUAGES = ['typescript', 'javascript', 'vue', 'svelte', 'astro']

type LinkSourceResolver = () => LinkSourceContext

// Keyed by editor, not model: a mounted editor can swap models while its owning tab stays the same.
const linkSources = new Map<Monaco.editor.ICodeEditor, LinkSourceResolver>()

function findLinkSource(modelUri: string): LinkSourceResolver | null {
  for (const [editorInstance, resolve] of linkSources) {
    if (editorInstance.getModel()?.uri.toString() === modelUri) {
      return resolve
    }
  }
  return null
}

/** Makes relative import specifiers in this editor Cmd/Ctrl+clickable while it is mounted. */
export function registerCodeImportLinkSource(
  editorInstance: Monaco.editor.ICodeEditor,
  source: {
    filePath: string
    worktreeId: string | undefined
    fileIdRef: { readonly current: string }
  }
): () => void {
  const { filePath, worktreeId, fileIdRef } = source
  if (!worktreeId) {
    return () => {}
  }
  // Read the tab at click time so renames and owner changes after mount are honored.
  linkSources.set(editorInstance, () => {
    const state = useAppStore.getState()
    const file = state.openFiles.find((openFile) => openFile.id === fileIdRef.current)
    return {
      sourceFilePath: file?.filePath ?? filePath,
      worktreeId,
      worktreeRoot: resolveRichMarkdownWorktreeRoot(state, worktreeId),
      runtimeEnvironmentId: file?.runtimeEnvironmentId
    }
  })
  return () => {
    linkSources.delete(editorInstance)
  }
}

export function registerCodeImportLinks(monaco: typeof Monaco): void {
  monaco.languages.registerLinkProvider(CODE_IMPORT_LANGUAGES, {
    provideLinks(model) {
      const modelUri = model.uri.toString()
      if (!findLinkSource(modelUri)) {
        return { links: [] }
      }
      const links = findRelativeImportSpecifiers(model.getValue()).map((range) => {
        const start = model.getPositionAt(range.startOffset)
        const end = model.getPositionAt(range.endOffset)
        return {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          url: monaco.Uri.from({
            scheme: CODE_IMPORT_LINK_SCHEME,
            path: '/',
            query: new URLSearchParams({ model: modelUri, specifier: range.specifier }).toString()
          })
        }
      })
      return { links }
    }
  })

  monaco.editor.registerLinkOpener({
    open(resource) {
      if (resource.scheme !== CODE_IMPORT_LINK_SCHEME) {
        return false
      }
      const params = new URLSearchParams(resource.query)
      const specifier = params.get('specifier')
      const ctx = findLinkSource(params.get('model') ?? '')?.()
      if (specifier && ctx) {
        void openCodeImportSpecifier(specifier, ctx)
      }
      return true
    }
  })
}
