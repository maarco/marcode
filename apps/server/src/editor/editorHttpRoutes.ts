// @effect-diagnostics nodeBuiltinImport:off tryCatchInEffectGen:off - sync git/fs handlers ported from mentiko; blocking node calls are deliberate for this single-user editor surface.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import * as NodePath from "node:path";
import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/unstable/http";
import * as Layer from "effect/Layer";

import { authenticateRawRouteWithScope } from "../http.ts";

// Raw HTTP surface for the floating code editor (ported from mentiko's
// /api/git and /api/fs routes). Same-origin browser calls authenticate with
// the session cookie; git/file writes require the operate scope.
// ponytail: paths are validated (absolute, existing, git-rooted) but not
// checked against a per-project allow-list — the authed session already
// drives agents with full workspace access. Add a roots registry if marcode
// ever serves untrusted multi-tenant sessions.

// ── response envelope (mentiko apiSuccess shape the web components expect) ──

function json(data: unknown, status = 200) {
  return HttpServerResponse.text(JSON.stringify({ success: true, data }), {
    status,
    contentType: "application/json",
  });
}

function jsonError(message: string, status = 400) {
  return HttpServerResponse.text(JSON.stringify({ success: false, error: { message } }), {
    status,
    contentType: "application/json",
  });
}

// ── git exec layer ──────────────────────────────────────────────────────────

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf-8",
    timeout: 30000,
  }).trim();
}

function runGitOptional(cwd: string, args: string[]): string {
  try {
    return runGit(cwd, args);
  } catch {
    return "";
  }
}

// Porcelain output is column-sensitive: trimming eats the leading space of the
// first line (" M file" -> "M file"), flipping its staged/unstaged split and
// clipping the filename. Status parsing must use the untrimmed variant.
function runGitRawOptional(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      timeout: 30000,
    });
  } catch {
    return "";
  }
}

// ── git types ───────────────────────────────────────────────────────────────

interface GitFileStatus {
  path: string;
  name: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusCode: string;
}

interface GitStatusResult {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

interface GitStash {
  id: string;
  branch: string;
  message: string;
  date: string;
  commitHash?: string | undefined;
}

// ── git helpers (ported from mentiko web/app/api/git/route.ts) ──────────────

function parseStatus(cwd: string): GitStatusResult {
  const branchLine = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchLine || "HEAD";

  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const remote = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"]);
  if (remote) upstream = remote;
  const counts = runGitOptional(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
  if (counts) {
    const [a, b] = counts.split("\t").map(Number);
    ahead = a || 0;
    behind = b || 0;
  }

  const raw = runGitRawOptional(cwd, ["status", "--porcelain", "-u"]);
  const files: GitFileStatus[] = [];

  for (const line of raw.split("\n").filter(Boolean)) {
    const xy = line.slice(0, 2);
    const x = xy[0]!;
    const y = xy[1]!;
    const rawPath = line.slice(3);
    const path = (rawPath.includes(" -> ") ? rawPath.split(" -> ")[1] : rawPath) ?? rawPath;
    const name = path.split("/").pop() ?? path;

    files.push({
      path,
      name,
      staged: x !== " " && x !== "?",
      unstaged: y !== " " && y !== "?",
      untracked: x === "?" && y === "?",
      statusCode: xy,
    });
  }

  return { branch, upstream, ahead, behind, files };
}

function parseLog(cwd: string, limit = 20) {
  const sep = "||GITSEP||";
  const fmt = `%H${sep}%h${sep}%s${sep}%an${sep}%ar${sep}%D`;
  const raw = runGitOptional(cwd, ["log", `--format=${fmt}`, "-n", String(limit)]);
  if (!raw) return [];

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(sep);
      return {
        hash: parts[0] ?? "",
        shortHash: parts[1] ?? "",
        message: parts[2] ?? "",
        author: parts[3] ?? "",
        date: parts[4] ?? "",
        refs: parts[5] ?? "",
      };
    });
}

function validateBranchName(branchName: string): { valid: boolean; error?: string } {
  if (!branchName || branchName.trim().length === 0) {
    return { valid: false, error: "Branch name cannot be empty" };
  }
  if (branchName.length > 255) {
    return { valid: false, error: "Branch name must be 255 characters or less" };
  }
  const invalidChars = /[~^:?*\[\\@{}]/;
  if (invalidChars.test(branchName)) {
    return { valid: false, error: "Branch name contains invalid characters: ~ ^ : ? * [ \\ @ { }" };
  }
  if (branchName.startsWith(".") || branchName.endsWith(".")) {
    return { valid: false, error: "Branch name cannot start or end with a dot" };
  }
  if (branchName.includes("..")) {
    return { valid: false, error: "Branch name cannot contain consecutive dots" };
  }
  if (branchName === "@") {
    return { valid: false, error: "Branch name cannot be a single @" };
  }
  if (branchName.endsWith(".lock")) {
    return { valid: false, error: "Branch name cannot end with .lock" };
  }
  if (branchName.startsWith("/") || branchName.endsWith("/")) {
    return { valid: false, error: "Branch name cannot start or end with slash" };
  }
  return { valid: true };
}

function parseBranchList(cwd: string) {
  const current = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
  const defaultRef = runGitOptional(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  const defaultBranch = defaultRef ? defaultRef.replace(/^refs\/remotes\/origin\//, "") : undefined;

  const branches: Array<{
    name: string;
    isCurrent: boolean;
    isRemote: boolean;
    tracking?: string | undefined;
    lastCommit?: string | undefined;
    lastCommitDate?: string | undefined;
  }> = [];

  const localRaw = runGitOptional(cwd, [
    "branch",
    "--format=%(refname:short)|%(HEAD)|%(upstream:short)|%(objectname:short)|%(committerdate:relative)",
  ]);
  for (const line of localRaw.split("\n").filter(Boolean)) {
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const [name, headMarker, tracking, shortHash, date] = parts;
    branches.push({
      name: name!,
      isCurrent: headMarker === "*",
      isRemote: false,
      tracking: tracking || undefined,
      lastCommit: shortHash,
      lastCommitDate: date,
    });
  }

  const remoteRaw = runGitOptional(cwd, [
    "branch",
    "--remote",
    "--format=%(refname:short)|%(HEAD)|%(objectname:short)|%(committerdate:relative)",
  ]);
  for (const line of remoteRaw.split("\n").filter(Boolean)) {
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const [name, , shortHash, date] = parts;
    branches.push({
      name: name!,
      isCurrent: false,
      isRemote: true,
      lastCommit: shortHash,
      lastCommitDate: date,
    });
  }

  return { branches, current, defaultBranch };
}

function switchBranch(cwd: string, targetBranch: string) {
  const previous = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";

  try {
    runGit(cwd, ["switch", targetBranch]);
    const current = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    return { ok: true, current: current || targetBranch, previous, hasUncommittedChanges: false };
  } catch (e) {
    const error = String(e);

    // switch -m carries the uncommitted changes over into the target branch
    // (a merge, NOT an auto-stash).
    if (
      error.includes("uncommitted") ||
      error.includes("working tree") ||
      error.includes("changes")
    ) {
      try {
        runGit(cwd, ["switch", "-m", targetBranch]);
        const current = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
        return {
          ok: true,
          current: current || targetBranch,
          previous,
          hasUncommittedChanges: true,
        };
      } catch (e2) {
        return { ok: false, error: String(e2), previous };
      }
    }

    return { ok: false, error: String(e), previous };
  }
}

function deleteBranch(cwd: string, branchName: string, force: boolean) {
  const current = runGitOptional(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";

  if (branchName === current) {
    return {
      ok: false,
      error: "Cannot delete the currently checked-out branch. Switch to another branch first.",
    };
  }

  // A branch is only remote if its first path segment names an actual remote —
  // local branches (feature/x) contain slashes too and must never become a
  // `git push <remote> --delete` call.
  const remotes = runGitOptional(cwd, ["remote"]).split("\n").filter(Boolean);
  const remote = remotes.find((r) => branchName.startsWith(`${r}/`));

  try {
    if (remote) {
      const remoteBranch = branchName.substring(remote.length + 1);
      runGit(cwd, ["push", remote, "--delete", remoteBranch]);
      return { ok: true, deleted: branchName, forceUsed: false };
    }
    runGit(cwd, force ? ["branch", "-D", branchName] : ["branch", "-d", branchName]);
    return { ok: true, deleted: branchName, forceUsed: force };
  } catch (e) {
    const error = String(e);
    if (!force && error.includes("not fully merged")) {
      return {
        ok: false,
        error: "Branch has unmerged commits. Use force delete to remove it anyway.",
      };
    }
    return { ok: false, error: String(e) };
  }
}

function formatStashRef(id: string): string {
  if (id.startsWith("stash@{")) return id;
  return `stash@{${id}}`;
}

function extractBranchFromMessage(message: string): string {
  const match = message.match(/on (.+?):/);
  return match?.[1] ?? "unknown";
}

function parseStashList(cwd: string): GitStash[] {
  const sep = "||STASHSEP||";
  // `git stash list` runs `git log` over the stash reflog — the format MUST
  // use git-log placeholders (%gd %s %cr %h), NOT for-each-ref ones.
  const fmt = `%gd${sep}%s${sep}%cr${sep}%h`;
  const raw = runGitOptional(cwd, ["stash", "list", `--format=${fmt}`]);
  if (!raw) return [];

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(sep);
      const fullId = parts[0] ?? "stash@{0}";
      const id = fullId.replace(/^stash@\{|\}$/g, "");
      return {
        id,
        branch: extractBranchFromMessage(parts[1] ?? ""),
        message: parts[1] ?? "",
        date: parts[2] ?? "",
        commitHash: parts[3],
      };
    });
}

// Mutations resolve stashes by commit SHA when provided — positional indices
// shift when stashes are created/dropped. A stale SHA returns null and the
// caller must NOT fall back to an index.
function resolveStashRef(cwd: string, stashId?: string, stashCommit?: string): string | null {
  if (stashCommit) {
    const hit = parseStashList(cwd).find(
      (s) => s.commitHash && stashCommit.startsWith(s.commitHash),
    );
    return hit ? formatStashRef(hit.id) : null;
  }
  if (stashId) return formatStashRef(stashId);
  return null;
}

function applyStash(cwd: string, ref: string) {
  try {
    runGit(cwd, ["stash", "apply", ref]);
    return { ok: true, appliedStashId: ref, status: parseStatus(cwd) };
  } catch (e) {
    const error = String(e);
    if (error.includes("CONFLICT") || error.includes("conflicting")) {
      const status = parseStatus(cwd);
      const conflicts = status.files.filter((f) => f.statusCode.includes("U")).map((f) => f.path);
      return {
        ok: false,
        appliedStashId: ref,
        conflicts,
        conflictCount: conflicts.length,
        hasUnmergedPaths: conflicts.length > 0,
        error: "Merge conflicts during stash apply. Resolve conflicts and commit.",
        status,
      };
    }
    return { ok: false, error, appliedStashId: ref };
  }
}

// ── git action dispatch ─────────────────────────────────────────────────────

const GIT_WRITE_ACTIONS = new Set([
  "stage",
  "unstage",
  "stage_all",
  "unstage_all",
  "commit",
  "push",
  "create_branch",
  "switch_branch",
  "delete_branch",
  "create_stash",
  "apply_stash",
  "drop_stash",
]);

interface GitRequestBody {
  action: string;
  workspacePath: string;
  paths?: string[];
  message?: string;
  path?: string;
  staged?: boolean;
  branchName?: string;
  force?: boolean;
  stashId?: string;
  stashCommit?: string;
  stashMessage?: string;
  includeUntracked?: boolean;
  commitHash?: string;
}

function handleGitAction(body: GitRequestBody, gitRoot: string) {
  switch (body.action) {
    case "status":
      return json(parseStatus(gitRoot));

    case "log":
      return json({ entries: parseLog(gitRoot) });

    case "stage": {
      const paths = body.paths ?? [];
      if (!paths.length) return json({ ok: false, error: "no paths" });
      try {
        runGit(gitRoot, ["add", "--", ...paths]);
      } catch (e) {
        return json({ ok: false, error: String(e) });
      }
      return json({ ok: true, status: parseStatus(gitRoot) });
    }

    case "unstage": {
      const paths = body.paths ?? [];
      if (!paths.length) return json({ ok: false, error: "no paths" });
      try {
        runGit(gitRoot, ["restore", "--staged", "--", ...paths]);
      } catch (e) {
        return json({ ok: false, error: String(e) });
      }
      return json({ ok: true, status: parseStatus(gitRoot) });
    }

    case "stage_all":
      try {
        runGit(gitRoot, ["add", "-A"]);
      } catch (e) {
        return json({ ok: false, error: String(e) });
      }
      return json({ ok: true, status: parseStatus(gitRoot) });

    case "unstage_all":
      try {
        runGit(gitRoot, ["restore", "--staged", "."]);
      } catch (e) {
        return json({ ok: false, error: String(e) });
      }
      return json({ ok: true, status: parseStatus(gitRoot) });

    case "commit": {
      const message = body.message?.trim();
      if (!message) return json({ ok: false, error: "commit message required" });
      try {
        const out = runGit(gitRoot, ["commit", "-m", message]);
        return json({ ok: true, output: out, status: parseStatus(gitRoot) });
      } catch (e) {
        return json({ ok: false, error: String(e), status: parseStatus(gitRoot) });
      }
    }

    case "push": {
      try {
        const out = runGit(gitRoot, ["push"]);
        return json({ ok: true, output: out, status: parseStatus(gitRoot) });
      } catch (e) {
        return json({ ok: false, error: String(e), status: parseStatus(gitRoot) });
      }
    }

    case "show": {
      const showPath = body.path;
      if (!showPath) return json({ content: "", error: "path required" });
      try {
        const content = runGit(gitRoot, ["show", `HEAD:${showPath}`]);
        return json({ content });
      } catch {
        // file doesn't exist at HEAD (new file)
        return json({ content: "" });
      }
    }

    case "show_commit": {
      // hash is validated hex so it can never be read as a git option or path
      const commitHash = body.commitHash;
      if (!commitHash || !/^[0-9a-f]{4,40}$/i.test(commitHash)) {
        return json({ content: "", error: "valid commitHash required" });
      }
      try {
        const content = runGit(gitRoot, ["show", "--no-color", commitHash]);
        return json({ content });
      } catch (e) {
        return json({ content: "", error: String(e) });
      }
    }

    case "diff": {
      const diffPath = body.path;
      if (!diffPath) return json({ diff: "", error: "path required" });
      try {
        const args = body.staged ? ["diff", "--cached", "--", diffPath] : ["diff", "--", diffPath];
        const diff = runGitOptional(gitRoot, args);
        return json({ diff });
      } catch {
        return json({ diff: "" });
      }
    }

    case "list_branches":
      return json(parseBranchList(gitRoot));

    case "current_branch": {
      const current = runGitOptional(gitRoot, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
      return json({ ok: true, current });
    }

    case "create_branch": {
      const branchName = body.branchName?.trim();
      if (!branchName) return json({ ok: false, error: "branchName is required" }, 400);
      const validation = validateBranchName(branchName);
      if (!validation.valid) return json({ ok: false, error: validation.error }, 400);
      try {
        runGit(gitRoot, ["branch", branchName]);
        const current = runGitOptional(gitRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
        return json({ ok: true, branch: branchName, current: current || "HEAD" });
      } catch (e) {
        return json({ ok: false, error: String(e) });
      }
    }

    case "switch_branch": {
      const branchName = body.branchName?.trim();
      if (!branchName) return json({ ok: false, error: "branchName is required" }, 400);
      const validation = validateBranchName(branchName);
      if (!validation.valid) return json({ ok: false, error: validation.error }, 400);
      return json(switchBranch(gitRoot, branchName));
    }

    case "delete_branch": {
      const branchName = body.branchName?.trim();
      if (!branchName) return json({ ok: false, error: "branchName is required" }, 400);
      const validation = validateBranchName(branchName);
      if (!validation.valid) return json({ ok: false, error: validation.error }, 400);
      return json(deleteBranch(gitRoot, branchName, body.force ?? false));
    }

    case "list_stashes":
      return json({ ok: true, stashes: parseStashList(gitRoot) });

    case "create_stash": {
      const message = body.stashMessage?.trim();
      try {
        const args = ["stash", "push"];
        if (body.includeUntracked) args.push("-u");
        if (message) args.push("-m", message);
        runGit(gitRoot, args);
        const stashes = parseStashList(gitRoot);
        if (stashes.length > 0) {
          return json({
            ok: true,
            stashId: `stash@{${stashes[0]!.id}}`,
            message: message || stashes[0]!.message,
          });
        }
        return json({ ok: true, message });
      } catch (e) {
        return json({ ok: false, error: String(e) });
      }
    }

    case "apply_stash": {
      const stashId = body.stashId?.trim();
      const stashCommit = body.stashCommit?.trim();
      if (!stashId && !stashCommit) {
        return json({ ok: false, error: "stashId or stashCommit required" }, 400);
      }
      const ref = resolveStashRef(gitRoot, stashId, stashCommit);
      if (!ref) {
        return json({
          ok: false,
          error: "stash not found — it may have been applied or dropped already",
        });
      }
      return json(applyStash(gitRoot, ref));
    }

    case "drop_stash": {
      const stashId = body.stashId?.trim();
      const stashCommit = body.stashCommit?.trim();
      if (!stashId && !stashCommit) {
        return json({ ok: false, error: "stashId or stashCommit required" }, 400);
      }
      const ref = resolveStashRef(gitRoot, stashId, stashCommit);
      if (!ref) {
        return json({
          ok: false,
          error: "stash not found — it may have been applied or dropped already",
        });
      }
      try {
        runGit(gitRoot, ["stash", "drop", ref]);
        return json({ ok: true, droppedId: ref });
      } catch (e) {
        return json({ ok: false, error: String(e), droppedId: ref });
      }
    }

    case "show_stash": {
      const stashId = body.stashId?.trim();
      if (!stashId) return json({ ok: false, error: "stashId required" }, 400);
      try {
        const diff = runGitOptional(gitRoot, ["stash", "show", "-p", formatStashRef(stashId)]);
        return json({ ok: true, diff, stashId });
      } catch (e) {
        return json({ ok: false, diff: "", error: String(e), stashId });
      }
    }

    default:
      return jsonError(`unknown action: ${body.action}`);
  }
}

// ── fs helpers (ported from mentiko web/app/api/fs) ─────────────────────────

const MAX_FILE_SIZE = 2 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".sh",
  ".bash",
  ".zsh",
  ".md",
  ".mdx",
  ".txt",
  ".css",
  ".scss",
  ".env",
  ".env.example",
  ".env.local",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".html",
  ".svg",
  ".xml",
  ".toml",
  ".ini",
  ".conf",
  ".graphql",
  ".gql",
  ".sql",
  ".dockerfile",
  ".diff",
  ".patch",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".cache",
  ".turbo",
  "coverage",
  ".claude",
  ".vscode",
]);

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot === -1 || dot === 0) return "";
  return name.slice(dot);
}

function buildTree(dir: string, depth = 0): FileNode[] {
  if (depth > 8) return [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];

  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const files = entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const d of dirs) {
    const fullPath = NodePath.join(dir, d.name);
    nodes.push({
      name: d.name,
      path: fullPath,
      type: "dir",
      children: buildTree(fullPath, depth + 1),
    });
  }

  for (const f of files) {
    const ext = getExtension(f.name);
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) continue;
    nodes.push({ name: f.name, path: NodePath.join(dir, f.name), type: "file", ext });
  }

  return nodes;
}

interface SearchResult {
  path: string;
  name: string;
  line: number;
  column: number;
  text: string;
  context: string;
}

function runSearch(workspace: string, query: string, useRegex: boolean): SearchResult[] {
  const args = ["-r", "-n", "--color=never"];
  for (const dir of SKIP_DIRS) args.push("--exclude-dir", dir);
  const binaryExts = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".svg",
    ".webp",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".xz",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".mp4",
    ".mp3",
    ".mov",
    ".avi",
    ".pyc",
    ".so",
    ".dylib",
    ".dll",
    ".exe",
  ];
  for (const ext of binaryExts) args.push("--exclude", `*${ext}`);
  args.push(useRegex ? "-E" : "-F", "-e", query, ".");

  let output = "";
  try {
    output = execFileSync("grep", args, {
      cwd: workspace,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 20000,
    });
  } catch (err) {
    // grep exits 1 on no matches — treat everything else as empty too
    const withOutput = err as { stdout?: string };
    output = withOutput.stdout ?? "";
  }

  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const maxResults = 500;

  for (const line of output.split("\n")) {
    if (!line.trim()) continue;

    const firstColon = line.indexOf(":");
    const secondColon = line.indexOf(":", firstColon + 1);
    if (firstColon === -1 || secondColon === -1) continue;

    let filePath = line.slice(0, firstColon);
    if (filePath.startsWith("./")) filePath = filePath.slice(2);
    if (filePath.includes("Binary")) continue;

    const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
    if (isNaN(lineNum)) continue;
    const content = line.slice(secondColon + 1);

    const key = `${filePath}:${lineNum}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      path: filePath,
      name: filePath.split("/").pop() || filePath,
      line: lineNum,
      column: 1,
      text: content.trim(),
      context: "",
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

// ── path validation ─────────────────────────────────────────────────────────

function validateDir(raw: string | null): string | null {
  if (!raw || !NodePath.isAbsolute(raw) || raw.includes("\0")) return null;
  const resolved = NodePath.resolve(raw);
  try {
    if (!statSync(resolved).isDirectory()) return null;
  } catch {
    return null;
  }
  return resolved;
}

function validateFilePathForRead(raw: string | null): string | null {
  if (!raw || !NodePath.isAbsolute(raw) || raw.includes("\0")) return null;
  return NodePath.resolve(raw);
}

// ── route layers ────────────────────────────────────────────────────────────

const respondAuthErrors = {
  EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
  EnvironmentInternalError: HttpServerRespondable.toResponse,
  EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
} as const;

const gitRouteLayer = HttpRouter.add(
  "POST",
  "/api/editor/git",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* request.json) as unknown as GitRequestBody;

    yield* authenticateRawRouteWithScope(
      GIT_WRITE_ACTIONS.has(body.action)
        ? AuthOrchestrationOperateScope
        : AuthOrchestrationReadScope,
    );

    const workspace = validateDir(body.workspacePath ?? null);
    if (!workspace) return jsonError("workspacePath must be an existing absolute directory");

    // resolve the git root from the workspace; a worktree subdirectory walks
    // up to its checkout root, which is exactly the cwd git actions need
    const gitRoot = runGitOptional(workspace, ["rev-parse", "--show-toplevel"]) || workspace;

    return handleGitAction(body, gitRoot);
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const configRouteLayer = HttpRouter.add(
  "GET",
  "/api/editor/config",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    return json({ root: process.cwd() });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const treeRouteLayer = HttpRouter.add(
  "GET",
  "/api/editor/fs/tree",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const workspace = validateDir(
      url._tag === "Some" ? url.value.searchParams.get("workspace") : null,
    );
    if (!workspace) return jsonError("workspace must be an existing absolute directory");
    return json({ path: workspace, tree: buildTree(workspace) });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const fileReadRouteLayer = HttpRouter.add(
  "GET",
  "/api/editor/fs/file",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const filePath = validateFilePathForRead(
      url._tag === "Some" ? url.value.searchParams.get("path") : null,
    );
    if (!filePath) return jsonError("path must be absolute");
    if (!existsSync(filePath)) return jsonError("file not found", 404);
    const stat = statSync(filePath);
    if (!stat.isFile()) return jsonError("not a file");
    if (stat.size > MAX_FILE_SIZE) return jsonError("file too large (max 2MB)");
    return json({ path: filePath, content: readFileSync(filePath, "utf-8"), size: stat.size });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const fileWriteRouteLayer = HttpRouter.add(
  "PUT",
  "/api/editor/fs/file",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const filePath = validateFilePathForRead(
      url._tag === "Some" ? url.value.searchParams.get("path") : null,
    );
    if (!filePath) return jsonError("path must be absolute");
    const body = (yield* request.json) as { content?: unknown };
    if (typeof body.content !== "string") return jsonError("content must be a string");
    if (body.content.length > MAX_FILE_SIZE) return jsonError("content too large (max 2MB)");
    writeFileSync(filePath, body.content, "utf-8");
    return json({ success: true, path: filePath });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const searchRouteLayer = HttpRouter.add(
  "GET",
  "/api/editor/fs/search",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const params = url._tag === "Some" ? url.value.searchParams : new URLSearchParams();
    const workspace = validateDir(params.get("workspace"));
    const query = params.get("query") ?? "";
    if (!workspace) return jsonError("workspace must be an existing absolute directory");
    if (query.length < 2) return jsonError("query too short (min 2 chars)");
    const useRegex = params.get("regex") === "true";
    if (useRegex) {
      if (query.length > 200) return jsonError("regex pattern too long (max 200 chars)");
      // reject catastrophic-backtracking shapes: nested quantifiers and
      // repeated alternation inside a quantifier
      const nestedQuantifier = /(\([^)]*[+*][^)]*\))[+*]/;
      const alternationInQuantifier = /\([^)]*\|[^)]*\)[+*]/;
      if (nestedQuantifier.test(query) || alternationInQuantifier.test(query)) {
        return jsonError("regex pattern contains structures prone to catastrophic backtracking");
      }
      try {
        new RegExp(query);
      } catch (e) {
        return jsonError(`invalid regex: ${(e as Error).message}`);
      }
    }
    return json({ results: runSearch(workspace, query, useRegex) });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const gitStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/editor/fs/git-status",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const workspace = validateDir(
      url._tag === "Some" ? url.value.searchParams.get("workspace") : null,
    );
    if (!workspace) return jsonError("workspace must be an existing absolute directory");

    const raw = runGitRawOptional(workspace, ["status", "--porcelain"]);
    const status: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      if (!line || line.length < 4) continue;
      const xy = line.slice(0, 2);
      let filePath = line.slice(3);
      if (xy[0] === "R" || xy[1] === "R") {
        const arrowIdx = filePath.indexOf(" -> ");
        if (arrowIdx !== -1) filePath = filePath.slice(arrowIdx + 4);
      }
      const x = xy[0]!;
      const y = xy[1]!;
      let code = "M";
      if (x === "?" && y === "?") code = "?";
      else if (x === "R" || y === "R") code = "R";
      else if (x === "A" || y === "A") code = "A";
      else if (x === "D" || y === "D") code = "D";
      else if (x === "M" || y === "M") code = "M";
      else code = x.trim() || y.trim() || "M";
      status[filePath] = code;
    }
    return json({ status });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const fileCreateRouteLayer = HttpRouter.add(
  "POST",
  "/api/editor/fs/create",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* request.json) as { path?: string; type?: string };
    const target = validateFilePathForRead(body.path ?? null);
    if (!target) return jsonError("path must be absolute");
    if (existsSync(target)) return jsonError("already exists");
    if (body.type === "dir") {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(NodePath.resolve(target, ".."), { recursive: true });
      writeFileSync(target, "", "utf-8");
    }
    return json({ success: true, path: target });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const fileRenameRouteLayer = HttpRouter.add(
  "POST",
  "/api/editor/fs/rename",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* request.json) as { oldPath?: string; newPath?: string };
    const oldPath = validateFilePathForRead(body.oldPath ?? null);
    const newPath = validateFilePathForRead(body.newPath ?? null);
    if (!oldPath || !newPath) return jsonError("oldPath and newPath must be absolute");
    if (!existsSync(oldPath)) return jsonError("source not found", 404);
    if (existsSync(newPath)) return jsonError("target already exists");
    renameSync(oldPath, newPath);
    return json({ success: true, path: newPath });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

const fileDeleteRouteLayer = HttpRouter.add(
  "POST",
  "/api/editor/fs/delete",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* request.json) as { path?: string };
    const target = validateFilePathForRead(body.path ?? null);
    if (!target) return jsonError("path must be absolute");
    if (!existsSync(target)) return jsonError("not found", 404);
    rmSync(target, { recursive: true });
    return json({ success: true, path: target });
  }).pipe(Effect.catchTags(respondAuthErrors)),
);

export const editorHttpRoutesLayer = Layer.mergeAll(
  gitRouteLayer,
  configRouteLayer,
  treeRouteLayer,
  fileReadRouteLayer,
  fileWriteRouteLayer,
  searchRouteLayer,
  gitStatusRouteLayer,
  fileCreateRouteLayer,
  fileRenameRouteLayer,
  fileDeleteRouteLayer,
);
