// @effect-diagnostics nodeBuiltinImport:off
/**
 * WorkspaceFileSystem - Effect service contract for workspace file mutations.
 *
 * Owns workspace-root-relative file read/write operations and their associated
 * safety checks and cache invalidation hooks.
 *
 * @module WorkspaceFileSystem
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";

import type {
  ProjectCreateFileInput,
  ProjectCreateFileResult,
  ProjectDeleteFileInput,
  ProjectDeleteFileResult,
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
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as WorkspaceEntries from "./WorkspaceEntries.ts";
import * as WorkspacePaths from "./WorkspacePaths.ts";

export const PROJECT_READ_FILE_MAX_BYTES = 1024 * 1024;

export class WorkspaceFileSystemOperationError extends Schema.TaggedErrorClass<WorkspaceFileSystemOperationError>()(
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

class WorkspaceMutationPathResolutionError extends Schema.TaggedErrorClass<WorkspaceMutationPathResolutionError>()(
  "WorkspaceMutationPathResolutionError",
  {
    code: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {}

export class WorkspaceFilePathEscapeError extends Schema.TaggedErrorClass<WorkspaceFilePathEscapeError>()(
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

export class WorkspacePathNotFileError extends Schema.TaggedErrorClass<WorkspacePathNotFileError>()(
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

export class WorkspaceBinaryFileError extends Schema.TaggedErrorClass<WorkspaceBinaryFileError>()(
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

export class WorkspaceInvalidUtf8FileError extends Schema.TaggedErrorClass<WorkspaceInvalidUtf8FileError>()(
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

export class WorkspaceFileTooLargeToWriteError extends Schema.TaggedErrorClass<WorkspaceFileTooLargeToWriteError>()(
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

export class WorkspacePathAlreadyExistsError extends Schema.TaggedErrorClass<WorkspacePathAlreadyExistsError>()(
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

export class WorkspacePathNotFoundError extends Schema.TaggedErrorClass<WorkspacePathNotFoundError>()(
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

/** Service tag for workspace file operations. */
export class WorkspaceFileSystem extends Context.Service<
  WorkspaceFileSystem,
  {
    /** Read a UTF-8 text file relative to the workspace root. */
    readonly readFile: (
      input: ProjectReadFileInput,
    ) => Effect.Effect<
      ProjectReadFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
    >;
    /**
     * Write a file relative to the workspace root.
     *
     * Creates parent directories as needed and rejects paths that escape the
     * workspace root.
     */
    readonly writeFile: (
      input: ProjectWriteFileInput,
    ) => Effect.Effect<
      ProjectWriteFileResult,
      WorkspaceFileSystemError | WorkspacePaths.WorkspacePathOutsideRootError
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

export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths.WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries.WorkspaceEntries;

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

  const readFile: WorkspaceFileSystem["Service"]["readFile"] = Effect.fn(
    "WorkspaceFileSystem.readFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

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
    const realTargetPath = yield* Effect.tryPromise({
      try: () => NodeFSP.realpath(target.absolutePath),
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
    const relativeRealPath = path.relative(realWorkspaceRoot, realTargetPath);
    if (
      relativeRealPath.startsWith(`..${path.sep}`) ||
      relativeRealPath === ".." ||
      path.isAbsolute(relativeRealPath)
    ) {
      return yield* new WorkspaceFilePathEscapeError({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
        resolvedWorkspaceRoot: realWorkspaceRoot,
        resolvedPath: realTargetPath,
      });
    }

    return yield* Effect.acquireUseRelease(
      Effect.tryPromise({
        try: () => NodeFSP.open(realTargetPath, "r"),
        catch: (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: realTargetPath,
            operationPath: realTargetPath,
            operation: "open",
            cause,
          }),
      }),
      (handle) =>
        Effect.gen(function* () {
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
        Effect.tryPromise({
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

  const writeFile: WorkspaceFileSystem["Service"]["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
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
    yield* fileSystem.writeFileString(target.absolutePath, input.contents).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemOperationError({
            workspaceRoot: input.cwd,
            relativePath: input.relativePath,
            resolvedPath: target.absolutePath,
            operationPath: target.absolutePath,
            operation: "write-file",
            cause,
          }),
      ),
    );
    yield* workspaceEntries.refresh(input.cwd);
    return { relativePath: target.relativePath };
  });

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
});

export const layer = Layer.effect(WorkspaceFileSystem, make);
