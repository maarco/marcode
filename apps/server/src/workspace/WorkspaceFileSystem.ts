// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";

import type {
<<<<<<< HEAD
  ProjectCreateFileInput,
  ProjectCreateFileResult,
  ProjectDeleteFileInput,
  ProjectDeleteFileResult,
=======
  FilesystemEntryMetadata,
  FilesystemGetMetadataInput,
  FilesystemGetMetadataResult,
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectRenameFileInput,
  ProjectRenameFileResult,
  ProjectSearchContentInput,
  ProjectSearchContentResult,
  ProjectSearchContentMatch,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "@t3tools/contracts";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { isNetworkPath } from "@t3tools/shared/path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as KnownWorkspaces from "./KnownWorkspaces.ts";
import * as WorkspaceEntries from "./WorkspaceEntries.ts";
import * as WorkspacePaths from "./WorkspacePaths.ts";
import { fileHeaderMimeType } from "./fileHeaderMimeType.ts";

export const PROJECT_READ_FILE_MAX_BYTES = 1024 * 1024;

// NTFS reaches .git through trailing dots/spaces, stream suffixes and GIT~1; compare uppercased names.
const isGitMetadataName = (segment: string) => {
  const name = (segment.split(":")[0] ?? "").replace(/[. ]+$/, "").toUpperCase();
  return name === ".GIT" || name === "GIT~1";
};

export class WorkspaceFileSystemOperationError extends Schema.TaggedError<WorkspaceFileSystemOperationError>()(
  "WorkspaceFileSystemOperationError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
    operationPath: Schema.String,
    operation: Schema.Literals([
      "realpath-workspace-root",
      "realpath-target",
      "open",
      "stat",
      "read",
      "close",
      "make-directory",
      "write-file",
      "create-file",
      "create-directory",
      "rename",
      "delete",
      "search",
    ]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Workspace file operation '${this.operation}' failed at '${this.operationPath}' for resolved path '${this.resolvedPath}' (requested as '${this.relativePath}' in '${this.workspaceRoot}').`;
  }
}

class WorkspaceMutationPathResolutionError extends Schema.TaggedError<WorkspaceMutationPathResolutionError>()(
  "WorkspaceMutationPathResolutionError",
  {
    code: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {}

export class WorkspaceFilePathEscapeError extends Schema.TaggedError<WorkspaceFilePathEscapeError>()(
  "WorkspaceFilePathEscapeError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedWorkspaceRoot: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' resolves outside workspace root '${this.workspaceRoot}': ${this.resolvedPath}`;
  }
}

export class WorkspacePathNotFileError extends Schema.TaggedError<WorkspacePathNotFileError>()(
  "WorkspacePathNotFileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace path '${this.relativePath}' in '${this.workspaceRoot}' is not a file: ${this.resolvedPath}`;
  }
}

export class WorkspaceBinaryFileError extends Schema.TaggedError<WorkspaceBinaryFileError>()(
  "WorkspaceBinaryFileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' in '${this.workspaceRoot}' is binary and cannot be previewed as text.`;
  }
}

export class WorkspaceInvalidUtf8FileError extends Schema.TaggedError<WorkspaceInvalidUtf8FileError>()(
  "WorkspaceInvalidUtf8FileError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' in '${this.workspaceRoot}' is not valid UTF-8 and cannot be previewed as text.`;
  }
}

export class WorkspaceFileTooLargeToWriteError extends Schema.TaggedError<WorkspaceFileTooLargeToWriteError>()(
  "WorkspaceFileTooLargeToWriteError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
    observedBytes: Schema.Number,
    maxBytes: Schema.Number,
  },
) {
  override get message(): string {
    return `Workspace file '${this.relativePath}' in '${this.workspaceRoot}' is ${this.observedBytes} bytes, over the ${this.maxBytes}-byte cap this transport can read (${this.resolvedPath}). No client of this transport can ever hold the full contents of a file this large, so writing it back can only produce a truncated copy; refusing the write instead of silently corrupting the file on disk.`;
  }
}

export class WorkspacePathAlreadyExistsError extends Schema.TaggedError<WorkspacePathAlreadyExistsError>()(
  "WorkspacePathAlreadyExistsError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace path '${this.relativePath}' already exists in '${this.workspaceRoot}': ${this.resolvedPath}`;
  }
}

export class WorkspacePathNotFoundError extends Schema.TaggedError<WorkspacePathNotFoundError>()(
  "WorkspacePathNotFoundError",
  {
    workspaceRoot: Schema.String,
    relativePath: Schema.String,
    resolvedPath: Schema.String,
  },
) {
  override get message(): string {
    return `Workspace path '${this.relativePath}' was not found in '${this.workspaceRoot}': ${this.resolvedPath}`;
  }
}

export const WorkspaceFileSystemError = Schema.Union([
  WorkspaceFileSystemOperationError,
  WorkspaceFilePathEscapeError,
  WorkspacePathNotFileError,
  WorkspaceBinaryFileError,
  WorkspaceInvalidUtf8FileError,
  WorkspaceFileTooLargeToWriteError,
  WorkspacePathAlreadyExistsError,
  WorkspacePathNotFoundError,
]);
export type WorkspaceFileSystemError = typeof WorkspaceFileSystemError.Type;

export class WorkspaceFileSystem extends Context.Service<
  WorkspaceFileSystem,
  {
    readonly getMetadata: (
      input: FilesystemGetMetadataInput,
    ) => Effect.Effect<FilesystemGetMetadataResult>;

    readonly readFile: (
      input: ProjectReadFileInput,
    ) => Effect.Effect<
      ProjectReadFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /** Writes inside a known workspace only. */
    readonly writeFile: (
      input: ProjectWriteFileInput,
    ) => Effect.Effect<
      ProjectWriteFileResult,
      | WorkspaceFileSystemError
      | WorkspacePaths.WorkspacePathOutsideRootError
      | KnownWorkspaces.UnknownWorkspaceError
    >;
    /** Create a file or directory relative to the workspace root. */
    readonly createFile: (
      input: ProjectCreateFileInput,
    ) => Effect.Effect<
      ProjectCreateFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /** Rename/move a path within the workspace root. */
    readonly renameFile: (
      input: ProjectRenameFileInput,
    ) => Effect.Effect<
      ProjectRenameFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /** Delete a file or directory relative to the workspace root. */
    readonly deleteFile: (
      input: ProjectDeleteFileInput,
    ) => Effect.Effect<
      ProjectDeleteFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /** Content search (grep) scoped to the workspace root via ripgrep. */
    readonly searchContent: (
      input: ProjectSearchContentInput,
    ) => Effect.Effect<
      ProjectSearchContentResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
  }
>()("t3/workspace/WorkspaceFileSystem") {}

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const knownWorkspaces = yield* KnownWorkspaces.KnownWorkspaces;
  const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;

<<<<<<< HEAD
  const isWithinRoot = (workspaceRoot: string, candidate: string): boolean => {
    const relativePath = path.relative(workspaceRoot, candidate);
    return (
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath)
    );
  };

  const isNodeErrorWithCode = (cause: unknown, code: string): boolean =>
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { readonly code?: unknown }).code === code;

  /**
   * Resolve a mutation target through the real workspace root. For a new path,
   * canonicalize its nearest existing ancestor and append the missing suffix;
   * this prevents recursive mkdir/write/rename from following an outside-root
   * symlink in an existing parent directory.
   */
  const resolveMutationTarget = Effect.fn("WorkspaceFileSystem.resolveMutationTarget")(function* (
    input: { readonly cwd: string; readonly relativePath: string },
    target: { readonly absolutePath: string; readonly relativePath: string },
  ) {
    const realWorkspaceRoot = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(input.cwd),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: input.cwd,
          operation: "realpath-workspace-root",
          cause,
        }),
    });

    let candidate = target.absolutePath;
    const missingParts: string[] = [];
    let realCandidate: string;

    while (true) {
      const resolvedCandidate = yield* Effect.tryPromise({
        try: () => NodeFSP.realpath(candidate),
        catch: (cause) =>
          new WorkspaceMutationPathResolutionError({
            code:
              typeof (cause as { readonly code?: unknown }).code === "string"
                ? (cause as { readonly code: string }).code
                : undefined,
            cause,
          }),
      }).pipe(
        Effect.matchEffect({
          onFailure: (cause) =>
            isNodeErrorWithCode(cause, "ENOENT")
              ? Effect.succeed(null)
              : Effect.fail(
                  new WorkspaceFileSystemOperationError({
                    workspaceRoot: input.cwd,
                    relativePath: input.relativePath,
                    resolvedPath: candidate,
                    operationPath: candidate,
                    operation: "realpath-target",
                    cause: cause.cause,
                  }),
                ),
          onSuccess: Effect.succeed,
        }),
      );

      if (resolvedCandidate !== null) {
        realCandidate = resolvedCandidate;
        break;
      }

      const parent = path.dirname(candidate);
      if (parent === candidate) {
        return yield* new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: candidate,
          operationPath: candidate,
          operation: "realpath-target",
          cause: new Error("No existing ancestor was found for the workspace mutation target."),
        });
      }

      // A broken symlink reports ENOENT from realpath but must not be treated
      // as an ordinary missing path that recursive mkdir can traverse.
      const candidateStat = yield* Effect.tryPromise({
        try: () => NodeFSP.lstat(candidate),
        catch: (cause) =>
          new WorkspaceMutationPathResolutionError({
            code:
              typeof (cause as { readonly code?: unknown }).code === "string"
                ? (cause as { readonly code: string }).code
                : undefined,
            cause,
          }),
      }).pipe(
        Effect.matchEffect({
          onFailure: (cause) =>
            isNodeErrorWithCode(cause, "ENOENT")
              ? Effect.succeed(null)
              : Effect.fail(
                  new WorkspaceFileSystemOperationError({
                    workspaceRoot: input.cwd,
                    relativePath: input.relativePath,
                    resolvedPath: candidate,
                    operationPath: candidate,
                    operation: "stat",
                    cause: cause.cause,
                  }),
                ),
          onSuccess: Effect.succeed,
        }),
      );
      if (candidateStat?.isSymbolicLink()) {
        return yield* new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: candidate,
          operationPath: candidate,
          operation: "realpath-target",
          cause: new Error("Workspace mutations cannot traverse a broken symbolic link."),
        });
      }

      missingParts.unshift(path.basename(candidate));
      candidate = parent;
    }

    const resolvedPath = missingParts.reduce(
      (current, part) => path.join(current, part),
      realCandidate,
    );
    if (!isWithinRoot(realWorkspaceRoot, resolvedPath)) {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: realWorkspaceRoot,
        resolvedPath,
      });
    }

    // Keep the caller's lexical path for the actual mutation. The canonical
    // path above is only the boundary check: preserving the lexical target
    // keeps symlink, rename, and delete semantics unchanged for paths that
    // remain inside the workspace.
    return { absolutePath: target.absolutePath, relativePath: target.relativePath };
  });
=======
  const metadataForPath = Effect.fnUntraced(function* (requestedPath: string) {
    const expandedPath = expandHomePath(requestedPath, yield* HostProcess.HomeDirectory);
    // Chips ask as soon as an agent's message renders, and touching a network
    // path makes Windows sign in to its host with the user's NTLM credentials.
    if (!path.isAbsolute(expandedPath) || isNetworkPath(expandedPath)) return null;
    const stat = yield* fileSystem.stat(expandedPath).pipe(Effect.option);
    if (stat._tag === "None") return null;
    if (stat.value.type === "Directory") return { kind: "directory" } as const;
    if (stat.value.type !== "File") return { kind: "other" } as const;
    let mimeType: string | undefined;
    if (path.extname(expandedPath) === "" && stat.value.size > 0) {
      mimeType = yield* Effect.tryPromise({
        try: async () => {
          const handle = await NodeFSP.open(
            expandedPath,
            NodeFS.constants.O_RDONLY | NodeFS.constants.O_NONBLOCK,
          );
          try {
            if (!(await handle.stat()).isFile()) return undefined;
            const buffer = Buffer.alloc(512);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            return fileHeaderMimeType(buffer.subarray(0, bytesRead));
          } finally {
            await handle.close();
          }
        },
        catch: () => undefined,
      }).pipe(Effect.orElseSucceed(() => undefined));
    }
    return {
      kind: "file",
      byteLength: Number(stat.value.size),
      ...(mimeType === undefined ? {} : { mimeType }),
    } satisfies FilesystemEntryMetadata;
  });

  const getMetadata: WorkspaceFileSystem["Service"]["getMetadata"] = Effect.fn(
    "WorkspaceFileSystem.getMetadata",
  )(function* (input) {
    const paths = [...new Set(input.paths)];
    const entries = yield* Effect.forEach(paths, metadataForPath, { concurrency: 8 });
    const byPath = new Map(paths.map((value, index) => [value, entries[index] ?? null]));
    return { entries: input.paths.map((value) => byPath.get(value) ?? null) };
  });

  /** Both paths must already be real paths. */
  const isInsideRealRoot = (realWorkspaceRoot: string, realPath: string) => {
    const relative = path.relative(realWorkspaceRoot, realPath);
    return !(
      relative.startsWith(`..${path.sep}`) ||
      relative === ".." ||
      path.isAbsolute(relative)
    );
  };

  // Reject Git folders, including renamed bare repos whose config/hooks can execute; paths must be normalized.
  // Stop at linked worktrees' .git files since worktrees can sit inside bare repos.
  const isInGitFolder = async (absolutePath: string) => {
    if (absolutePath.split(path.sep).some(isGitMetadataName)) return true;
    for (let folder = path.dirname(absolutePath); ; folder = path.dirname(folder)) {
      const [head, commondir, objects, refs, dotGit] = await Promise.all(
        ["HEAD", "commondir", "objects", "refs", ".git"].map((name) =>
          NodeFSP.lstat(path.join(folder, name)).catch((error: NodeJS.ErrnoException) => {
            // Any other failure leaves the folder unknown, so the write is refused.
            if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
            throw error;
          }),
        ),
      );
      // Git recognizes HEAD with commondir or objects/refs as a repository.
      if (head && (commondir || (objects && refs))) return true;
      if (dotGit?.isFile() || path.dirname(folder) === folder) return false;
    }
  };
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

  /**
   * Workspace-relative paths must stay inside the root, symlinks included. An
   * absolute or `~/` path reads a host file in place, such as a report an agent
   * wrote to a temp directory; it gets no root check. A network path does, since
   * Windows signs in to its host with the user's NTLM credentials.
   */
  const resolveReadTarget = Effect.fn("WorkspaceFileSystem.resolveReadTarget")(function* (
    input: ProjectReadFileInput,
  ) {
    const requestedPath = input.relativePath.trim();
    const hostPath = requestedPath.startsWith("~/")
      ? expandHomePath(requestedPath, yield* HostProcess.HomeDirectory)
      : requestedPath;
    if (
      isNetworkPath(hostPath) &&
      !KnownWorkspaces.isWithinRoot(path, path.resolve(hostPath), path.resolve(input.cwd))
    ) {
      return yield* new WorkspacePaths.WorkspacePathOutsideRootError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
      });
    }
    if (path.isAbsolute(hostPath)) {
      // Native realpath hands Windows a `\\?\` path as written, `..` included,
      // so a network path must be the resolved one the check above approved.
      // Others keep POSIX `link/..` semantics, which resolving first would change.
      const absolutePath = isNetworkPath(hostPath) ? path.resolve(hostPath) : hostPath;
      const realTargetPath = yield* Effect.tryPromise({
        try: () => NodeFSP.realpath(absolutePath),
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: absolutePath,
            operationPath: absolutePath,
            operation: "realpath-target",
            cause,
          }),
      }).pipe(
        Effect.catchIf(
          (error) =>
            input.allowMissing === true && (error.cause as NodeJS.ErrnoException).code === "ENOENT",
          () => Effect.succeed(null),
        ),
      );
      return { relativePath: requestedPath, realTargetPath };
    }

    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    const realWorkspaceRoot = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(path.resolve(input.cwd)),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: input.cwd,
          operation: "realpath-workspace-root",
          cause,
        }),
    });
    const resolved = yield* Effect.tryPromise({
      try: async () => {
        let candidate = target.absolutePath;
        for (;;) {
          try {
            return {
              realTargetPath: path.join(
                await NodeFSP.realpath(candidate),
                path.relative(candidate, target.absolutePath),
              ),
              exists: candidate === target.absolutePath,
            };
          } catch (error) {
            if (!input.allowMissing || (error as NodeJS.ErrnoException).code !== "ENOENT") {
              throw error;
            }
            // Like writes, missing reads must check the nearest existing ancestor.
            // An existing entry that cannot resolve is a dangling link, not absence.
            const exists = await NodeFSP.lstat(candidate).then(
              () => true,
              (cause: NodeJS.ErrnoException) => {
                if (cause.code !== "ENOENT") throw cause;
                return false;
              },
            );
            if (exists || path.dirname(candidate) === candidate) throw error;
            candidate = path.dirname(candidate);
          }
        }
      },
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: target.absolutePath,
          operation: "realpath-target",
          cause,
        }),
    });
    if (!isInsideRealRoot(realWorkspaceRoot, resolved.realTargetPath)) {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: realWorkspaceRoot,
        resolvedPath: resolved.realTargetPath,
      });
    }
    return {
      relativePath: target.relativePath,
      realTargetPath: resolved.exists ? resolved.realTargetPath : null,
    };
  });

  const readFile: WorkspaceFileSystem["Service"]["readFile"] = Effect.fn(
    "WorkspaceFileSystem.readFile",
  )(function* (input) {
    const target = yield* resolveReadTarget(input);
    const absentResult = {
      relativePath: target.relativePath,
      contents: "",
      byteLength: 0,
      truncated: false,
      exists: false,
    };
    const realTargetPath = target.realTargetPath;
    if (realTargetPath === null) return absentResult;

    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        // Non-blocking opens prevent FIFO hangs before stat rejects them; Windows lacks the flag.
        try: () =>
          NodeFSP.open(
            realTargetPath,
            NodeFS.constants.O_RDONLY | (NodeFS.constants.O_NONBLOCK ?? 0),
          ),
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: realTargetPath,
            operationPath: realTargetPath,
            operation: "open",
            cause,
          }),
      }).pipe(
        Effect.catchIf(
          (error) =>
            input.allowMissing === true && (error.cause as NodeJS.ErrnoException).code === "ENOENT",
          () => Effect.succeed(null),
        ),
      ),
      (handle) =>
        Effect.gen(function* () {
          if (handle === null) return absentResult;
          const stat = yield* Effect.tryPromise({
            try: () => handle.stat(),
            catch: (cause) =>
              new WorkspaceFileSystemOperationError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: realTargetPath,
                operationPath: realTargetPath,
                operation: "stat",
                cause,
              }),
          });
          if (!stat.isFile()) {
            return yield* new WorkspacePathNotFileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          const bytesToRead = Math.min(stat.size, PROJECT_READ_FILE_MAX_BYTES);
          const buffer = Buffer.alloc(bytesToRead);
          const { bytesRead } = yield* Effect.tryPromise({
            try: () => handle.read(buffer, 0, bytesToRead, 0),
            catch: (cause) =>
              new WorkspaceFileSystemOperationError({
                workspaceRoot: input.cwd,
                relativePath: input.relativePath,
                resolvedPath: realTargetPath,
                operationPath: realTargetPath,
                operation: "read",
                cause,
              }),
          });
          const fileBytes = buffer.subarray(0, bytesRead);
          if (fileBytes.includes(0)) {
            return yield* new WorkspaceBinaryFileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          let contents: string;
          try {
            contents = new TextDecoder("utf-8", { fatal: true }).decode(fileBytes);
          } catch {
            return yield* new WorkspaceInvalidUtf8FileError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: realTargetPath,
            });
          }

          return {
            relativePath: target.relativePath,
            contents,
            byteLength: stat.size,
            truncated: stat.size > PROJECT_READ_FILE_MAX_BYTES,
          };
        }),
      (handle) =>
        handle === null
          ? Effect.void
          : Effect.tryPromise({
              try: () => handle.close(),
              catch: (cause) =>
                new WorkspaceFileSystemOperationError({
                  workspaceRoot: input.cwd,
                  relativePath: input.relativePath,
                  resolvedPath: realTargetPath,
                  operationPath: realTargetPath,
                  operation: "close",
                  cause,
                }),
            }),
    );
  });

  // Resolve existing ancestors and reject dangling links so creation cannot follow symlinks outside root.
  const resolveWriteTarget = Effect.fn("WorkspaceFileSystem.resolveWriteTarget")(function* (
    input: ProjectWriteFileInput,
  ) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });
    const realWorkspaceRoot = yield* Effect.tryPromise({
      // Resolve `..` in cwd the way the relative path was resolved, before following links.
      try: () => NodeFSP.realpath(path.resolve(input.cwd)),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: input.cwd,
          operation: "realpath-workspace-root",
          cause,
        }),
    });

    // Split the host path, not the display relativePath: on POSIX `\` is a file name character.
    const segments = path.relative(input.cwd, target.absolutePath).split(path.sep);
    const realTargetPath = yield* Effect.tryPromise({
      try: async () => {
        for (let depth = segments.length; depth > 0; depth--) {
          const candidate = path.join(realWorkspaceRoot, ...segments.slice(0, depth));
          try {
            return path.join(await NodeFSP.realpath(candidate), ...segments.slice(depth));
          } catch (error) {
            // Only a missing entry is skipped; one that exists but cannot resolve is a dangling link.
            const exists = await NodeFSP.lstat(candidate).then(
              () => true,
              () => false,
            );
            if ((error as NodeJS.ErrnoException).code !== "ENOENT" || exists) throw error;
          }
        }
        return path.join(realWorkspaceRoot, ...segments);
      },
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          operationPath: target.absolutePath,
          operation: "realpath-target",
          cause,
        }),
    });
    // The path as named is checked too: a `.git/config` symlink resolves away the `.git`.
    const namedTargetPath = path.join(realWorkspaceRoot, ...segments);
    const inGitFolder = Effect.fn("WorkspaceFileSystem.inGitFolder")((checkedPath: string) =>
      Effect.tryPromise({
        try: () => isInGitFolder(checkedPath),
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: realTargetPath,
            operationPath: checkedPath,
            operation: "stat",
            cause,
          }),
      }),
    );
    if (
      !isInsideRealRoot(realWorkspaceRoot, realTargetPath) ||
      (yield* inGitFolder(realTargetPath)) ||
      (yield* inGitFolder(namedTargetPath))
    ) {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: realWorkspaceRoot,
        resolvedPath: realTargetPath,
      });
    }
    return { relativePath: target.relativePath, realTargetPath };
  });

  const writeFile: WorkspaceFileSystem["Service"]["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
<<<<<<< HEAD
    const resolvedTarget = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });
    const target = yield* resolveMutationTarget(input, resolvedTarget);

    // No client of this transport can ever hold the full contents of a file
    // larger than PROJECT_READ_FILE_MAX_BYTES (readFile caps reads at that
    // size). So a write targeting an existing file above that size can only
    // be a partial, truncated copy of it — refuse it outright rather than
    // silently corrupting the file on disk. A target that doesn't exist yet
    // is always fine (creation), and a target that is a directory is left to
    // fail naturally at the write-file step below, as before.
    const existingStat = yield* fileSystem.stat(target.absolutePath).pipe(
      Effect.matchEffect({
        onFailure: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed(null)
            : Effect.fail(
                new WorkspaceFileSystemOperationError({
                  workspaceRoot: input.cwd,
                  relativePath: input.relativePath,
                  resolvedPath: target.absolutePath,
                  operationPath: target.absolutePath,
                  operation: "stat",
                  cause,
                }),
              ),
        onSuccess: Effect.succeed,
      }),
    );

    if (existingStat !== null && existingStat.type === "File") {
      const observedBytes = Number(existingStat.size);
      if (observedBytes > PROJECT_READ_FILE_MAX_BYTES) {
        return yield* new WorkspaceFileTooLargeToWriteError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: target.absolutePath,
          observedBytes,
          maxBytes: PROJECT_READ_FILE_MAX_BYTES,
        });
      }
    }
=======
    yield* knownWorkspaces.assertContains(input.cwd);
    const target = yield* resolveWriteTarget(input);
    const realTargetPath = target.realTargetPath;
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

    yield* fileSystem.makeDirectory(path.dirname(realTargetPath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: realTargetPath,
            operationPath: path.dirname(realTargetPath),
            operation: "make-directory",
            cause,
          }),
      ),
    );
    yield* Effect.tryPromise({
      // A symlink swapped in after the check is not followed. Windows lacks O_NOFOLLOW.
      try: () =>
        NodeFSP.writeFile(realTargetPath, input.contents, {
          flag:
            NodeFS.constants.O_WRONLY |
            NodeFS.constants.O_CREAT |
            NodeFS.constants.O_TRUNC |
            (NodeFS.constants.O_NOFOLLOW ?? 0),
        }),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: input.relativePath,
          resolvedPath: realTargetPath,
          operationPath: realTargetPath,
          operation: "write-file",
          cause,
        }),
    });
    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });

<<<<<<< HEAD
  // existence check that maps the underlying PlatformError into our error union
  const statExists = (
    workspaceRoot: string,
    relativePath: string,
    absolutePath: string,
  ): Effect.Effect<boolean, WorkspaceFileSystemOperationError> =>
    fileSystem.exists(absolutePath).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot,
            relativePath,
            resolvedPath: absolutePath,
            operationPath: absolutePath,
            operation: "stat",
            cause,
          }),
      ),
    );

  const createFile: WorkspaceFileSystem["Service"]["createFile"] = Effect.fn(
    "WorkspaceFileSystem.createFile",
  )(function* (input) {
    const resolvedTarget = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });
    const target = yield* resolveMutationTarget(input, resolvedTarget);

    if (yield* statExists(input.cwd, input.relativePath, target.absolutePath)) {
      return yield* new WorkspacePathAlreadyExistsError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedPath: target.absolutePath,
      });
    }

    if (input.kind === "directory") {
      yield* fileSystem.makeDirectory(target.absolutePath, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceFileSystemOperationError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: target.absolutePath,
              operationPath: target.absolutePath,
              operation: "create-directory",
              cause,
            }),
        ),
      );
    } else {
      yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceFileSystemOperationError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: target.absolutePath,
              operationPath: path.dirname(target.absolutePath),
              operation: "make-directory",
              cause,
            }),
        ),
      );
      yield* fileSystem.writeFileString(target.absolutePath, "").pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceFileSystemOperationError({
              workspaceRoot: input.cwd,
              relativePath: input.relativePath,
              resolvedPath: target.absolutePath,
              operationPath: target.absolutePath,
              operation: "create-file",
              cause,
            }),
        ),
      );
    }

    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });

  const renameFile: WorkspaceFileSystem["Service"]["renameFile"] = Effect.fn(
    "WorkspaceFileSystem.renameFile",
  )(function* (input) {
    const resolvedFrom = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.fromRelativePath,
    });
    const resolvedTo = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.toRelativePath,
    });
    const from = yield* resolveMutationTarget(
      { cwd: input.cwd, relativePath: input.fromRelativePath },
      resolvedFrom,
    );
    const to = yield* resolveMutationTarget(
      { cwd: input.cwd, relativePath: input.toRelativePath },
      resolvedTo,
    );

    if (!(yield* statExists(input.cwd, input.fromRelativePath, from.absolutePath))) {
      return yield* new WorkspacePathNotFoundError({
        workspaceRoot: input.cwd,
        relativePath: input.fromRelativePath,
        resolvedPath: from.absolutePath,
      });
    }
    if (yield* statExists(input.cwd, input.toRelativePath, to.absolutePath)) {
      return yield* new WorkspacePathAlreadyExistsError({
        workspaceRoot: input.cwd,
        relativePath: input.toRelativePath,
        resolvedPath: to.absolutePath,
      });
    }

    yield* fileSystem.makeDirectory(path.dirname(to.absolutePath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.toRelativePath,
            resolvedPath: to.absolutePath,
            operationPath: path.dirname(to.absolutePath),
            operation: "make-directory",
            cause,
          }),
      ),
    );
    yield* fileSystem.rename(from.absolutePath, to.absolutePath).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.fromRelativePath,
            resolvedPath: to.absolutePath,
            operationPath: to.absolutePath,
            operation: "rename",
            cause,
          }),
      ),
    );

    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: to.relativePath };
  });

  const deleteFile: WorkspaceFileSystem["Service"]["deleteFile"] = Effect.fn(
    "WorkspaceFileSystem.deleteFile",
  )(function* (input) {
    const resolvedTarget = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });
    const target = yield* resolveMutationTarget(input, resolvedTarget);

    if (!(yield* statExists(input.cwd, input.relativePath, target.absolutePath))) {
      return yield* new WorkspacePathNotFoundError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedPath: target.absolutePath,
      });
    }

    yield* fileSystem.remove(target.absolutePath, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: target.absolutePath,
            operationPath: target.absolutePath,
            operation: "delete",
            cause,
          }),
      ),
    );

    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });

  const searchContent: WorkspaceFileSystem["Service"]["searchContent"] = Effect.fn(
    "WorkspaceFileSystem.searchContent",
  )(function* (input) {
    const limit = input.limit ?? 200;
    const args = [
      "--line-number",
      "--column",
      "--no-heading",
      "--color",
      "never",
      "--max-count",
      String(Math.ceil(limit / 4) || 1),
      ...(input.regex ? [] : ["-F"]),
      "-e",
      input.query,
      ".",
    ];
    // rg runs with cwd = workspace root and searches ".", so it is inherently
    // sandboxed to the workspace. The WS layer authenticates the environment.
    const output = yield* Effect.tryPromise({
      try: () =>
        new Promise<string>((resolve, reject) => {
          NodeChildProcess.execFile(
            "rg",
            args,
            { cwd: input.cwd, encoding: "utf-8", maxBuffer: 4 * 1024 * 1024, timeout: 15_000 },
            (err, stdout) => {
              // ripgrep uses exit code 1 for a valid search with no matches.
              // Every other process error must remain observable to callers.
              if (err && err.code !== 1) {
                reject(err);
                return;
              }
              resolve(stdout);
            },
          );
        }),
      catch: (cause) =>
        new WorkspaceFileSystemOperationError({
          workspaceRoot: input.cwd,
          relativePath: "",
          resolvedPath: input.cwd,
          operationPath: input.cwd,
          operation: "search",
          cause,
        }),
    });
    const matches: ProjectSearchContentMatch[] = [];
    let truncated = false;
    for (const line of output.split("\n")) {
      if (line.length === 0) continue;
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      // path:line:column:text  (column may be absent if --column unsupported; fall back to 1)
      const first = line.indexOf(":");
      const second = line.indexOf(":", first + 1);
      const third = line.indexOf(":", second + 1);
      if (first === -1 || second === -1 || third === -1) continue;
      const path = line.slice(0, first);
      const lineNum = Number(line.slice(first + 1, second));
      const colNum = Number(line.slice(second + 1, third));
      if (!Number.isFinite(lineNum) || lineNum < 1) continue;
      matches.push({
        path,
        line: Math.trunc(lineNum),
        column: Number.isFinite(colNum) && colNum > 0 ? Math.trunc(colNum) : 1,
        text: line.slice(third + 1),
      });
    }
    return { matches, truncated };
  });

  return WorkspaceFileSystem.of({
    readFile,
    writeFile,
    createFile,
    renameFile,
    deleteFile,
    searchContent,
  });
=======
  return WorkspaceFileSystem.of({ getMetadata, readFile, writeFile });
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
});

export const layer = Layer.effect(WorkspaceFileSystem, make);
