// Response types for the editor git API (mirrors apps/server/src/editor/editorHttpRoutes.ts).

export interface GitFileStatus {
  path: string;
  name: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusCode: string;
}

export interface GitStatusResult {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  refs: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  tracking?: string;
  lastCommit?: string;
  lastCommitDate?: string;
}

export interface GitBranchListResult {
  branches: GitBranch[];
  current: string;
  defaultBranch?: string;
}

export interface GitBranchCreateResult {
  ok: boolean;
  branch?: string;
  error?: string;
  current?: string;
}

export interface GitBranchSwitchResult {
  ok: boolean;
  current?: string;
  previous?: string;
  error?: string;
  hasUncommittedChanges?: boolean;
}

export interface GitBranchDeleteResult {
  ok: boolean;
  deleted?: string;
  error?: string;
  forceUsed?: boolean;
}

export interface GitStash {
  id: string;
  branch: string;
  message: string;
  date: string;
  commitHash?: string;
}

export interface GitStashListResult {
  ok: boolean;
  stashes: GitStash[];
  error?: string;
}

export interface GitStashCreateResult {
  ok: boolean;
  stashId?: string;
  message?: string;
  error?: string;
}

export interface GitStashApplyResult {
  ok: boolean;
  appliedStashId?: string;
  conflicts?: string[];
  conflictCount?: number;
  hasUnmergedPaths?: boolean;
  error?: string;
  status?: GitStatusResult;
}

export interface GitStashDropResult {
  ok: boolean;
  droppedId?: string;
  error?: string;
}

export interface GitStashShowResult {
  ok: boolean;
  diff: string;
  stashId?: string;
  error?: string;
}
