import type React from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'

type CodeSymbolQueryRowProps = {
  query: string
  loading: boolean
  onQueryChange: (value: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

export function CodeSymbolQueryRow({
  query,
  loading,
  onQueryChange,
  onKeyDown
}: CodeSymbolQueryRowProps): React.JSX.Element {
  const t = useTranslate()
  const label = t('fileExplorer.symbols.searchWorkspace', 'Search symbols in workspace')
  return (
    <div
      className="flex h-8 items-center gap-1 rounded-md border border-border bg-input/50 px-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
      data-ignore-file-explorer-keys="true"
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="text"
        data-explorer-query-input="symbols"
        className="min-w-0 flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      {loading ? <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" /> : null}
      {query ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-auto w-auto rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t('fileExplorer.symbols.clearSearch', 'Clear symbol search')}
          onClick={() => onQueryChange('')}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}
