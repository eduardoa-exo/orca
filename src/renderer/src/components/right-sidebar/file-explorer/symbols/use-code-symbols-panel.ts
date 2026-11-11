import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/index'
import { scheduleEditorLineReveal } from '@/store/slices/editor/focus/editor-focus-reveal'
import { cancelRevealFrame, openMatchResult } from '../content-search/search-match-open'
import {
  buildOutlineRows,
  buildWorkspaceRows,
  type CodeSymbolItemRow,
  type CodeSymbolRow
} from './code-symbol-rows'
import {
  useActiveFileCodeSymbols,
  type ActiveFileCodeSymbols
} from './use-active-file-code-symbols'
import {
  useWorkspaceCodeSymbolSearch,
  type WorkspaceCodeSymbolSearchState
} from './use-workspace-code-symbol-search'

const NO_ROWS: CodeSymbolRow[] = []

export type CodeSymbolsPanelModel = {
  query: string
  setQuery: (query: string) => void
  onQueryKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  loading: boolean
  outline: ActiveFileCodeSymbols
  workspace: WorkspaceCodeSymbolSearchState
  rows: CodeSymbolRow[]
  selectedIndex: number
  onOpenRow: (row: CodeSymbolItemRow) => void
  onToggleRow: (row: CodeSymbolItemRow) => void
}

export function useCodeSymbolsPanel(args: {
  worktreeId: string | null
  worktreePath: string | null
  active: boolean
}): CodeSymbolsPanelModel {
  const { worktreeId, worktreePath, active } = args
  const openFile = useAppStore((s) => s.openFile)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)
  const [query, setQuery] = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const revealRafRef = useRef<number | null>(null)
  const revealInnerRafRef = useRef<number | null>(null)
  const searchingWorkspace = query.trim() !== ''
  const updateQuery = useCallback((next: string) => {
    setQuery(next)
    setSelectedKey(null)
  }, [])

  const outline = useActiveFileCodeSymbols(worktreeId, active && !searchingWorkspace)
  const workspace = useWorkspaceCodeSymbolSearch({
    worktreeId,
    worktreePath,
    query,
    enabled: active && searchingWorkspace
  })

  const rows = useMemo(() => {
    if (searchingWorkspace) {
      return workspace.status === 'ready' ? buildWorkspaceRows(workspace.hits) : NO_ROWS
    }
    return outline.status === 'ready'
      ? buildOutlineRows(outline.symbols, collapsedKeys, outline.activePath)
      : NO_ROWS
  }, [searchingWorkspace, workspace, outline, collapsedKeys])

  const selectedIndex = useMemo(() => {
    const index = selectedKey ? rows.findIndex((row) => row.key === selectedKey) : -1
    if (index !== -1 || !searchingWorkspace) {
      return index
    }
    // Searching highlights the first hit so Enter has a visible target.
    return rows.findIndex((row) => row.type === 'symbol')
  }, [rows, selectedKey, searchingWorkspace])

  useEffect(
    () => () => {
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    },
    []
  )

  const onOpenRow = useCallback(
    (row: CodeSymbolItemRow) => {
      setSelectedKey(row.key)
      if (row.target.source === 'outline') {
        if (outline.status !== 'no-file') {
          const { file } = outline
          const { symbol } = row.target
          scheduleEditorLineReveal(
            useAppStore.getState,
            file.filePath,
            symbol.line,
            symbol.column,
            file.id
          )
        }
        return
      }
      if (workspace.status !== 'ready') {
        return
      }
      const { hit } = row.target
      openMatchResult({
        resultOwner: workspace.owner,
        fileResult: { filePath: hit.filePath, relativePath: hit.relativePath, matches: [] },
        match: {
          line: hit.line,
          column: hit.column,
          matchLength: hit.name.length,
          lineContent: ''
        },
        openFile,
        setPendingEditorReveal,
        revealRafRef,
        revealInnerRafRef
      })
    },
    [outline, workspace, openFile, setPendingEditorReveal]
  )

  const onToggleRow = useCallback((row: CodeSymbolItemRow) => {
    const { collapseKey } = row
    if (!collapseKey) {
      return
    }
    setCollapsedKeys((current) => {
      const next = new Set(current)
      if (!next.delete(collapseKey)) {
        next.add(collapseKey)
      }
      return next
    })
  }, [])

  const onQueryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape' && query) {
        event.preventDefault()
        updateQuery('')
        return
      }
      if (event.key === 'Enter') {
        const row = rows[selectedIndex]
        if (row?.type === 'symbol') {
          event.preventDefault()
          onOpenRow(row)
        }
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return
      }
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      for (let i = selectedIndex + step; i >= 0 && i < rows.length; i += step) {
        if (rows[i].type === 'symbol') {
          setSelectedKey(rows[i].key)
          return
        }
      }
    },
    [query, rows, selectedIndex, onOpenRow, updateQuery]
  )

  return {
    query,
    setQuery: updateQuery,
    onQueryKeyDown,
    loading: searchingWorkspace ? workspace.status === 'loading' : outline.status === 'loading',
    outline,
    workspace,
    rows,
    selectedIndex,
    onOpenRow,
    onToggleRow
  }
}
