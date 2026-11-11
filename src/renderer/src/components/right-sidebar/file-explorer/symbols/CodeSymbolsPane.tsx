import React, { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Box,
  Braces,
  ChevronRight,
  Database,
  LayoutTemplate,
  Menu,
  SquareFunction,
  Tag,
  Variable,
  type LucideIcon
} from 'lucide-react'
import { basename, dirname } from '@/lib/path'
import { cn } from '@/lib/class-names'
import { FileTypeIcon } from '@/components/FileTypeIcon'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { CodeSymbolKind } from '../../../../../../shared/code-symbols/code-symbol-types'
import type { CodeSymbolFileRow, CodeSymbolItemRow } from './code-symbol-rows'
import type { CodeSymbolsPanelModel } from './use-code-symbols-panel'

const KIND_ICONS: Record<CodeSymbolKind, LucideIcon> = {
  class: Box,
  method: SquareFunction,
  function: SquareFunction,
  field: Database,
  attribute: Tag,
  variable: Variable,
  record: Braces,
  template: LayoutTemplate,
  menuitem: Menu
}
const ROW_INDENT_PX = 12

function CodeSymbolFileHeader({ row }: { row: CodeSymbolFileRow }): React.JSX.Element {
  const parentDir = dirname(row.relativePath)
  return (
    <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5 text-xs" title={row.relativePath}>
      <FileTypeIcon
        filePath={row.relativePath}
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground">{basename(row.relativePath)}</span>
        {parentDir !== '.' && (
          <span className="ml-1.5 text-[11px] text-muted-foreground">{parentDir}</span>
        )}
      </span>
      <span className="shrink-0 rounded-full bg-muted/80 px-1.5 text-[10px] text-muted-foreground">
        {row.count}
      </span>
    </div>
  )
}

function CodeSymbolItem({
  row,
  selected,
  onOpen,
  onToggle
}: {
  row: CodeSymbolItemRow
  selected: boolean
  onOpen: () => void
  onToggle: () => void
}): React.JSX.Element {
  const Icon = KIND_ICONS[row.kind]
  const indent = row.target.source === 'workspace' ? 20 : 4 + row.depth * ROW_INDENT_PX
  return (
    <div
      className={cn(
        'group flex h-[22px] items-center pr-2 text-xs',
        selected && 'bg-accent text-accent-foreground',
        !selected && row.active && 'bg-muted'
      )}
      style={{ paddingLeft: indent }}
    >
      {row.collapseKey ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-auto w-auto shrink-0 rounded-sm p-0.5 text-muted-foreground"
          aria-expanded={row.expanded}
          aria-label={row.name}
          onClick={onToggle}
        >
          <ChevronRight
            className={cn(
              'size-3 transition-transform motion-reduce:transition-none',
              row.expanded && 'rotate-90'
            )}
          />
        </Button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
        onMouseDown={(event) => {
          // Keep focus off the sidebar so the editor keeps it after the reveal.
          if (event.button === 0) {
            event.preventDefault()
          }
        }}
        onClick={onOpen}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-foreground">{row.name}</span>
        {row.detail && <span className="min-w-0 truncate text-muted-foreground">{row.detail}</span>}
        <span className="ml-auto shrink-0 pl-1 text-3xs tabular-nums text-muted-foreground">
          {row.line}
        </span>
      </button>
    </div>
  )
}

function CodeSymbolsEmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{children}</div>
}

export function CodeSymbolsPane({ panel }: { panel: CodeSymbolsPanelModel }): React.JSX.Element {
  const t = useTranslate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { rows, selectedIndex, outline, workspace, query } = panel
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.type === 'file' ? 26 : 22),
    getItemKey: (index) => rows[index]?.key ?? `missing:${index}`,
    paddingEnd: 8,
    overscan: 12
  })

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  let emptyMessage: string | null = null
  if (rows.length === 0) {
    if (query.trim()) {
      if (workspace.status === 'invalid-query') {
        emptyMessage = t(
          'fileExplorer.symbols.invalidQuery',
          'Use letters, digits, underscores or dots to search symbols.'
        )
      } else if (workspace.status === 'ready') {
        emptyMessage = t(
          'fileExplorer.symbols.noResults',
          'No matching symbols in Python or XML files.'
        )
      }
    } else if (outline.status === 'no-file') {
      emptyMessage = t(
        'fileExplorer.symbols.noFile',
        'Open a file to see its outline, or type to search the workspace.'
      )
    } else if (outline.status === 'unsupported') {
      emptyMessage = t(
        'fileExplorer.symbols.unsupported',
        'Outline is available for Python and XML files. Type to search the workspace.'
      )
    } else if (outline.status === 'ready') {
      emptyMessage = t('fileExplorer.symbols.emptyOutline', 'No symbols in this file.')
    }
  }

  return (
    <>
      {query.trim() && workspace.status === 'ready' && workspace.truncated && (
        <div className="border-b border-border px-2 py-1 text-2xs text-muted-foreground">
          {t('fileExplorer.symbols.truncated', 'Results truncated. Refine your search.')}
        </div>
      )}
      <div ref={scrollRef} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {workspace.status === 'error' && query.trim() ? (
          <div
            role="alert"
            className="whitespace-pre-wrap break-words p-2 text-xs text-destructive"
          >
            {workspace.message}
          </div>
        ) : emptyMessage ? (
          <CodeSymbolsEmptyState>{emptyMessage}</CodeSymbolsEmptyState>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) {
                return null
              }
              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.type === 'file' ? (
                    <CodeSymbolFileHeader row={row} />
                  ) : (
                    <CodeSymbolItem
                      row={row}
                      selected={virtualRow.index === selectedIndex}
                      onOpen={() => panel.onOpenRow(row)}
                      onToggle={() => panel.onToggleRow(row)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
