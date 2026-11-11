import { useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import {
  createFileSearchResultOwner,
  type FileSearchResultOwner
} from '@/lib/files/search/file-search-result-owner'
import {
  getExecutionHostIdForWorktree,
  runtimeEnvironmentIdOrLocalUnlessTwin
} from '@/lib/workspace/ownership/worktree-runtime-owner'
import { isTwinWorkspace } from '@/lib/workspace/ownership/resolve-owner'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/rpc/targets/runtime-client-target'
import type { searchRuntimeFiles } from '@/runtime/files/search/runtime-file-search-client'

export type RuntimeFileSearchRoute = {
  runtimeEnvironmentId: string | null
  executionHostId: ReturnType<typeof getExecutionHostIdForWorktree>
  ownerIsTwin: boolean
}

/** Which host serves workspace content searches; shared by content and symbol search. */
export function useRuntimeFileSearchRoute(worktreeId: string | null): RuntimeFileSearchRoute {
  const runtimeEnvironmentId = useAppStore((state) =>
    runtimeEnvironmentIdOrLocalUnlessTwin(state, worktreeId)
  )
  const executionHostId = useAppStore((state) => getExecutionHostIdForWorktree(state, worktreeId))
  // Why: a workspace two hosts publish names no owner, so either host's results would mislead.
  const ownerIsTwin = useAppStore((state) => isTwinWorkspace(state, worktreeId))
  return useMemo(
    () => ({ runtimeEnvironmentId, executionHostId, ownerIsTwin }),
    [runtimeEnvironmentId, executionHostId, ownerIsTwin]
  )
}

export function createRuntimeFileSearchResultOwner(
  route: RuntimeFileSearchRoute,
  worktreeId: string,
  worktreePath: string
): FileSearchResultOwner {
  return createFileSearchResultOwner(worktreeId, route.runtimeEnvironmentId, {
    rootPath: worktreePath,
    executionHostId: route.executionHostId
  })
}

export function runtimeFileSearchTarget(
  route: RuntimeFileSearchRoute,
  worktreeId: string,
  worktreePath: string
): Parameters<typeof searchRuntimeFiles>[0] {
  return {
    target: runtimeTargetForOwnerEnvironment(route.runtimeEnvironmentId),
    worktreeId,
    worktreePath,
    connectionId: getConnectionId(worktreeId) ?? undefined
  }
}
