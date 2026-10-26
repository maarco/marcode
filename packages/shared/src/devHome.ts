<<<<<<< HEAD
/**
 * Where development state lives, and how to keep it away from the shared
 * `~/.marcode` that a user's installed Marcode runs against.
 *
 * A linked git worktree gets its own (gitignored) `.marcode`: feature work in a
 * throwaway branch must not share a database with the real app, and an ambient
 * `MARCODE_HOME` counts as an explicit base dir — flipping the state directory
 * from `<base>/dev` to `<base>/userdata`, the live production database.
 */
=======
/** Worktrees use isolated .t3 state; ambient T3CODE_HOME could otherwise select the live userdata database. */
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

// Match worktrees/<name>; bare repos and GIT_COMMON_DIR need not use a directory named .git.
const pointsAtLinkedWorktree = (gitFileContents: string, path: Path.Path): boolean => {
  const gitdir = gitFileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("gitdir:"))
    ?.slice("gitdir:".length)
    .trim();
  if (gitdir === undefined || gitdir.length === 0) {
    return false;
  }
  const segments = path
    .normalize(gitdir.replaceAll("\\", "/"))
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0);
  return segments.length >= 3 && segments.at(-2) === "worktrees";
};

export const resolveGitWorktreePath = Effect.fn("devHome.resolveGitWorktreePath")(function* (
  cwd: string,
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  let directory = path.resolve(cwd);
  for (;;) {
    const gitPath = path.join(directory, ".git");
    const info = yield* fileSystem.stat(gitPath).pipe(Effect.option);
    if (Option.isSome(info)) {
      if (info.value.type !== "File") {
        return undefined;
      }
      const contents = yield* fileSystem
        .readFileString(gitPath)
        .pipe(Effect.orElseSucceed(() => ""));
      return pointsAtLinkedWorktree(contents, path) ? directory : undefined;
    }
<<<<<<< HEAD
  });

/**
 * The worktree-local data directory for `cwd`, or undefined outside a linked
 * worktree. Deliberately does not require the directory to exist yet: falling
 * back because it is missing would send callers at the shared home.
 */
export const resolveWorktreeMarcodeHome = (
  cwd: string,
): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const worktreePath = yield* resolveGitWorktreePath(cwd);
    if (worktreePath === undefined) {
      return undefined;
    }
    const path = yield* Path.Path;
    return path.join(worktreePath, ".marcode");
  });
=======
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
});

/**
 * Deliberately does not require the directory to exist yet: falling back
 * because it is missing would send callers at the shared home.
 */
export const resolveWorktreeT3Home = Effect.fn("devHome.resolveWorktreeT3Home")(function* (
  cwd: string,
): Effect.fn.Return<string | undefined, never, FileSystem.FileSystem | Path.Path> {
  const worktreePath = yield* resolveGitWorktreePath(cwd);
  if (worktreePath === undefined) {
    return undefined;
  }
  const path = yield* Path.Path;
  return path.join(worktreePath, ".t3");
});
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
