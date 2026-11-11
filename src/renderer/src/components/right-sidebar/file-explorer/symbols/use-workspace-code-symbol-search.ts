import { useEffect, useState } from 'react'
import { readIpcErrorDetail } from '@/runtime/errors/ipc-error'
import { translate } from '@/i18n/i18n'
import type { FileSearchResultOwner } from '@/lib/files/search/file-search-result-owner'
import { searchRuntimeFiles } from '@/runtime/files/search/runtime-file-search-client'
import {
  buildWorkspaceCodeSymbolSearches,
  collectWorkspaceCodeSymbolHits,
  type WorkspaceCodeSymbolHit
} from '../../../../../../shared/code-symbols/workspace-code-symbol-query'
import {
  createRuntimeFileSearchResultOwner,
  runtimeFileSearchTarget,
  useRuntimeFileSearchRoute
} from '../content-search/use-runtime-file-search-route'

const SEARCH_DEBOUNCE_MS = 300
// Matches the backend cap; refining the query is the way past it.
const SEARCH_MAX_RESULTS = 2000

export type WorkspaceCodeSymbolSearchState =
  | { status: 'idle' }
  | { status: 'invalid-query' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      hits: WorkspaceCodeSymbolHit[]
      truncated: boolean
      owner: FileSearchResultOwner
    }

export function useWorkspaceCodeSymbolSearch(args: {
  worktreeId: string | null
  worktreePath: string | null
  query: string
  enabled: boolean
}): WorkspaceCodeSymbolSearchState {
  const { worktreeId, worktreePath, enabled } = args
  const query = args.query.trim()
  const route = useRuntimeFileSearchRoute(worktreeId)
  const [state, setState] = useState<WorkspaceCodeSymbolSearchState>({ status: 'idle' })

  useEffect(() => {
    if (!enabled || !query || !worktreeId || !worktreePath || route.ownerIsTwin) {
      setState({ status: 'idle' })
      return
    }
    const searches = buildWorkspaceCodeSymbolSearches(query)
    if (searches.length === 0) {
      setState({ status: 'invalid-query' })
      return
    }
    setState({ status: 'loading' })
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      // Results outlive navigation; clicks must retain the route that produced them.
      const owner = createRuntimeFileSearchResultOwner(route, worktreeId, worktreePath)
      const target = runtimeFileSearchTarget(route, worktreeId, worktreePath)
      try {
        const results = await Promise.all(
          searches.map(async (search) => ({
            search,
            result: await searchRuntimeFiles(
              target,
              {
                query: search.pattern,
                rootPath: worktreePath,
                useRegex: true,
                caseSensitive: false,
                includePattern: search.includePattern,
                maxResults: SEARCH_MAX_RESULTS
              },
              controller.signal
            )
          }))
        )
        if (controller.signal.aborted) {
          return
        }
        setState({
          status: 'ready',
          hits: collectWorkspaceCodeSymbolHits(query, results),
          truncated: results.some(({ result }) => result.truncated),
          owner
        })
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }
        console.error('Symbol search failed:', err)
        setState({
          status: 'error',
          message:
            readIpcErrorDetail(err) ?? translate('fileSearch.failed', 'Search failed. Try again.')
        })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, query, worktreeId, worktreePath, route])

  return state
}
