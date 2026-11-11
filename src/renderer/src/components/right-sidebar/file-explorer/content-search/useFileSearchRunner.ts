import { readIpcErrorDetail } from '@/runtime/errors/ipc-error'
import { translate } from '@/i18n/i18n'
import { useCallback, useEffect, useRef } from 'react'
import type { FileSearchResultOwner } from '@/lib/files/search/file-search-result-owner'
import {
  createEmptyRuntimeFileSearchResult,
  getRuntimeFileSearchRejectedField
} from '@/runtime/files/search/runtime-file-search-bounds'
import { searchRuntimeFiles } from '@/runtime/files/search/runtime-file-search-client'
import { useAppStore } from '@/store/index'
import type { SearchResult } from '../../../../../../shared/file-search/code-search-types'
import {
  createRuntimeFileSearchResultOwner,
  runtimeFileSearchTarget,
  useRuntimeFileSearchRoute
} from './use-runtime-file-search-route'

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MAX_RESULTS = 2000

type UpdateSearchState = (updates: {
  error?: string | null
  loading?: boolean
  results?: SearchResult | null
  resultOwner?: FileSearchResultOwner | null
}) => void

type UseFileSearchRunnerArgs = {
  activeWorktreeId: string | null
  worktreePath: string | null
  updateActiveSearchState: UpdateSearchState
}

export function useFileSearchRunner({
  activeWorktreeId,
  worktreePath,
  updateActiveSearchState
}: UseFileSearchRunnerArgs): {
  executeSearch: (query: string) => void
  cancelPendingSearch: () => void
} {
  const route = useRuntimeFileSearchRoute(activeWorktreeId)
  const { runtimeEnvironmentId, executionHostId, ownerIsTwin } = route
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reject out-of-order completions so old searches cannot overwrite newer queries.
  const latestSearchIdRef = useRef(0)
  const searchControllerRef = useRef<AbortController | null>(null)

  const cancelPendingSearch = useCallback(() => {
    const interrupted = searchControllerRef.current !== null || searchTimerRef.current !== null
    searchControllerRef.current?.abort()
    searchControllerRef.current = null
    latestSearchIdRef.current += 1
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
    updateActiveSearchState({
      loading: false,
      ...(interrupted ? { results: null, resultOwner: null } : {})
    })
  }, [updateActiveSearchState])

  const executeSearch = useCallback(
    (query: string) => {
      searchControllerRef.current?.abort()
      searchControllerRef.current = null
      latestSearchIdRef.current += 1
      const searchId = latestSearchIdRef.current
      updateActiveSearchState({ error: null })

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }

      if (!worktreePath || !activeWorktreeId || ownerIsTwin) {
        updateActiveSearchState({ results: null, resultOwner: null, loading: false })
        return
      }

      const currentSearchState = useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]
      if (
        getRuntimeFileSearchRejectedField({
          query,
          includePattern: currentSearchState?.includePattern || undefined,
          excludePattern: currentSearchState?.excludePattern || undefined
        })
      ) {
        updateActiveSearchState({
          results: createEmptyRuntimeFileSearchResult(),
          resultOwner: createRuntimeFileSearchResultOwner(route, activeWorktreeId, worktreePath),
          loading: false
        })
        return
      }

      if (!query.trim()) {
        updateActiveSearchState({ results: null, resultOwner: null, loading: false })
        return
      }

      updateActiveSearchState({ loading: true })
      searchTimerRef.current = setTimeout(async () => {
        searchTimerRef.current = null
        // Results outlive navigation; clicks must retain the route that produced them.
        const resultOwner = createRuntimeFileSearchResultOwner(
          route,
          activeWorktreeId,
          worktreePath
        )
        const controller = new AbortController()
        searchControllerRef.current = controller
        try {
          const state = useAppStore.getState()
          const activeSearchState = state.fileSearchStateByWorktree[activeWorktreeId]
          if (
            getRuntimeFileSearchRejectedField({
              query,
              includePattern: activeSearchState?.includePattern || undefined,
              excludePattern: activeSearchState?.excludePattern || undefined
            })
          ) {
            if (latestSearchIdRef.current === searchId) {
              updateActiveSearchState({
                results: createEmptyRuntimeFileSearchResult(),
                resultOwner,
                loading: false
              })
            }
            return
          }
          const results = await searchRuntimeFiles(
            runtimeFileSearchTarget(route, activeWorktreeId, worktreePath),
            {
              query,
              rootPath: worktreePath,
              caseSensitive: activeSearchState?.caseSensitive ?? false,
              wholeWord: activeSearchState?.wholeWord ?? false,
              useRegex: activeSearchState?.useRegex ?? false,
              includePattern: activeSearchState?.includePattern || undefined,
              excludePattern: activeSearchState?.excludePattern || undefined,
              maxResults: SEARCH_MAX_RESULTS
            },
            controller.signal
          )
          if (latestSearchIdRef.current === searchId) {
            updateActiveSearchState({ results, resultOwner })
          }
        } catch (err) {
          if (controller.signal.aborted) {
            return
          }
          console.error('Search failed:', err)
          if (latestSearchIdRef.current === searchId) {
            updateActiveSearchState({
              results: null,
              error:
                readIpcErrorDetail(err) ??
                translate('fileSearch.failed', 'Search failed. Try again.'),
              resultOwner
            })
          }
        } finally {
          if (searchControllerRef.current === controller) {
            searchControllerRef.current = null
          }
          if (latestSearchIdRef.current === searchId) {
            updateActiveSearchState({ loading: false })
          }
        }
      }, SEARCH_DEBOUNCE_MS)
    },
    [activeWorktreeId, updateActiveSearchState, worktreePath, route, ownerIsTwin]
  )

  useEffect(
    () => cancelPendingSearch,
    [cancelPendingSearch, worktreePath, executionHostId, runtimeEnvironmentId]
  )

  return { executeSearch, cancelPendingSearch }
}
