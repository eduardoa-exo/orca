import type { AppState } from '@/store/types'
import type { HttpLinkSourceOwner } from '@/lib/browser/navigation/http-link-routing'
import { getConnectionIdForFileFromState } from '@/lib/workspace/ownership/connection-owner-resolution'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'

export type LinkSourceContext = {
  sourceFilePath: string
  worktreeId: string
  worktreeRoot: string | null
  runtimeEnvironmentId?: string | null
  sourceOwner?: HttpLinkSourceOwner
}

export type LinkSourceFileContext = {
  sourceOwner: Exclude<HttpLinkSourceOwner, { kind: 'unknown' }>
  sourceRuntimeEnvironmentId: string | null | undefined
  fileContext: RuntimeFileOperationArgs
}

/** Resolves the host that owns a link's source file; null when ownership is ambiguous or unknown. */
export function resolveLinkSourceFileContext(
  state: AppState,
  ctx: LinkSourceContext
): LinkSourceFileContext | null {
  let inferredRuntimeEnvironmentId: string | null | undefined
  if (!ctx.sourceOwner && ctx.runtimeEnvironmentId === undefined) {
    const inferredRuntimeOwners = new Set(
      state.openFiles
        .filter(
          (file) => file.filePath === ctx.sourceFilePath && file.worktreeId === ctx.worktreeId
        )
        .map((file) => file.runtimeEnvironmentId?.trim() || null)
    )
    if (inferredRuntimeOwners.size > 1) {
      return null
    }
    inferredRuntimeEnvironmentId =
      inferredRuntimeOwners.size === 1 ? [...inferredRuntimeOwners][0] : undefined
  }
  const sourceRuntimeEnvironmentId =
    ctx.sourceOwner?.kind === 'runtime'
      ? ctx.sourceOwner.runtimeEnvironmentId
      : ctx.sourceOwner
        ? null
        : ctx.runtimeEnvironmentId !== undefined
          ? ctx.runtimeEnvironmentId
          : inferredRuntimeEnvironmentId
  const runtimeOwnerId = sourceRuntimeEnvironmentId?.trim() || null
  const resolvedConnectionId =
    ctx.sourceOwner || runtimeOwnerId
      ? undefined
      : getConnectionIdForFileFromState(state, ctx.worktreeId, ctx.sourceFilePath)
  const sourceOwner: HttpLinkSourceOwner =
    ctx.sourceOwner ??
    (runtimeOwnerId
      ? { kind: 'runtime', runtimeEnvironmentId: runtimeOwnerId }
      : resolvedConnectionId === undefined
        ? { kind: 'unknown' }
        : resolvedConnectionId === null
          ? { kind: 'local' }
          : { kind: 'ssh', connectionId: resolvedConnectionId })
  if (sourceOwner.kind === 'unknown') {
    return null
  }
  return {
    sourceOwner,
    sourceRuntimeEnvironmentId,
    fileContext: {
      target: runtimeTargetForOwnerEnvironment(runtimeOwnerId),
      worktreeId: ctx.worktreeId,
      worktreePath: ctx.worktreeRoot,
      connectionId: sourceOwner.kind === 'ssh' ? sourceOwner.connectionId : undefined
    }
  }
}
