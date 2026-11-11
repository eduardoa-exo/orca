import { useAppStore } from '@/store'
import {
  resolveLinkSourceFileContext,
  type LinkSourceContext
} from '@/lib/files/access/link-source-file-context'
import { statRuntimePath } from '@/runtime/files/metadata/runtime-file-metadata-client'
import { resolveMarkdownLinkTarget } from '../markdown/link-routing/markdown-internal-links'
import { getImportSpecifierCandidates } from './code-import-specifiers'

async function isOpenableFile(
  fileContext: Parameters<typeof statRuntimePath>[0],
  absolutePath: string
): Promise<boolean> {
  try {
    return !(await statRuntimePath(fileContext, absolutePath)).isDirectory
  } catch {
    return false
  }
}

/** Opens the first file a relative import specifier resolves to inside the source workspace. */
export async function openCodeImportSpecifier(
  specifier: string,
  ctx: LinkSourceContext
): Promise<void> {
  const source = resolveLinkSourceFileContext(useAppStore.getState(), ctx)
  if (!source) {
    return
  }
  const candidates = getImportSpecifierCandidates(specifier).flatMap((href) => {
    const target = resolveMarkdownLinkTarget(href, ctx.sourceFilePath, ctx.worktreeRoot)
    // Why: only workspace files may be probed on the owning host; outside paths could name the client OS.
    return target && target.kind !== 'anchor' && target.kind !== 'external' && target.relativePath
      ? [{ href, absolutePath: target.absolutePath }]
      : []
  })
  if (candidates.length === 0) {
    return
  }
  const openable = await Promise.all(
    candidates.map((candidate) => isOpenableFile(source.fileContext, candidate.absolutePath))
  )
  const resolved = candidates.find((_, index) => openable[index])
  // Unresolved specifiers fall through so the shared link action reports the missing path.
  await useAppStore.getState().activateMarkdownLink(resolved?.href ?? specifier, ctx)
}
