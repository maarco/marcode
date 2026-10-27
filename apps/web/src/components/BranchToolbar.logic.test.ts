import { type VcsRef } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  dedupeRemoteBranchesWithLocalMatches,
  deriveLocalBranchNameFromRemoteRef,
  resolveBranchSelectionTarget,
  resolveDraftEnvModeAfterBranchChange,
  resolveEffectiveEnvMode,
  resolveBranchToolbarPrBranch,
  resolveLocalCheckoutBranchMismatch,
  sanitizeNewRefName,
  shouldIncludeBranchPickerItem,
} from "./BranchToolbar.logic";

<<<<<<< HEAD
const localEnvironmentId = EnvironmentId.make("environment-local");
const remoteEnvironmentId = EnvironmentId.make("environment-remote");

describe("resolvePreviousWorktreeSeed", () => {
  it("picks the most recently updated worktree thread", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "t3/older",
            worktreePath: "/repo/.marcode/worktrees/older",
            updatedAt: "2026-07-20T00:00:00.000Z",
          },
          {
            branch: "t3/newer",
            worktreePath: "/repo/.marcode/worktrees/newer",
            updatedAt: "2026-07-22T00:00:00.000Z",
          },
          { branch: "main", worktreePath: null, updatedAt: "2026-07-23T00:00:00.000Z" },
        ],
        currentWorktreePath: null,
      }),
    ).toEqual({ branch: "t3/newer", worktreePath: "/repo/.marcode/worktrees/newer" });
  });

  it("skips the worktree the composer already points at", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "t3/current",
            worktreePath: "/repo/.marcode/worktrees/current",
            updatedAt: "2026-07-22T00:00:00.000Z",
          },
        ],
        currentWorktreePath: "/repo/.marcode/worktrees/current",
      }),
    ).toBeNull();
  });

  it("returns null when no thread has a worktree", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [{ branch: "main", worktreePath: null, updatedAt: "2026-07-22T00:00:00.000Z" }],
        currentWorktreePath: null,
      }),
    ).toBeNull();
  });

  it("ignores archived threads and threads with unparseable timestamps", () => {
    expect(
      resolvePreviousWorktreeSeed({
        threads: [
          {
            branch: "t3/archived",
            worktreePath: "/repo/.marcode/worktrees/archived",
            updatedAt: "2026-07-23T00:00:00.000Z",
            archivedAt: "2026-07-23T01:00:00.000Z",
          },
          {
            branch: "t3/garbage-timestamp",
            worktreePath: "/repo/.marcode/worktrees/garbage",
            updatedAt: "not-a-date",
          },
          {
            branch: "t3/live",
            worktreePath: "/repo/.marcode/worktrees/live",
            updatedAt: "2026-07-21T00:00:00.000Z",
            archivedAt: null,
          },
        ],
        currentWorktreePath: null,
      }),
    ).toEqual({ branch: "t3/live", worktreePath: "/repo/.marcode/worktrees/live" });
  });
});

describe("resolvePreviousWorktreeLabel", () => {
  it("includes the branch when known", () => {
    expect(resolvePreviousWorktreeLabel({ branch: "t3/fix-thing", worktreePath: "/wt" })).toBe(
      "Previous worktree (t3/fix-thing)",
    );
    expect(resolvePreviousWorktreeLabel({ branch: null, worktreePath: "/wt" })).toBe(
      "Previous worktree",
    );
  });
});

=======
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
describe("resolveDraftEnvModeAfterBranchChange", () => {
  it("switches to local mode when returning from an existing worktree to the main worktree", () => {
    expect(
      resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: null,
        currentWorktreePath: "/repo/.marcode/worktrees/feature-a",
        effectiveEnvMode: "worktree",
      }),
    ).toBe("local");
  });

  it("uses worktree mode when selecting a ref already attached to a worktree", () => {
    expect(
      resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: "/repo/.marcode/worktrees/feature-a",
        currentWorktreePath: null,
        effectiveEnvMode: "local",
      }),
    ).toBe("worktree");
  });
});

describe("resolveBranchToolbarPrBranch", () => {
  it("hides PR state while an optimistic branch switch is in flight", () => {
    expect(
      resolveBranchToolbarPrBranch({
        activeThreadBranch: "feature/current",
        resolvedActiveBranch: "feature/next",
      }),
    ).toBeNull();
  });
});

describe("resolveLocalCheckoutBranchMismatch", () => {
  it("detects when a local thread is associated with a different branch than the checkout", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "local",
        activeWorktreePath: null,
        activeThreadBranch: "feature/thread",
        currentGitBranch: "feature/current",
      }),
    ).toEqual({
      threadBranch: "feature/thread",
      currentBranch: "feature/current",
    });
  });

  it("ignores dedicated worktrees because their checkout is already thread-scoped", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        effectiveEnvMode: "worktree",
        activeWorktreePath: "/repo/.marcode/worktrees/feature-thread",
        activeThreadBranch: "feature/thread",
        currentGitBranch: "feature/current",
      }),
    ).toBeNull();
  });
});

describe("resolveEffectiveEnvMode", () => {
<<<<<<< HEAD
  it("treats draft threads already attached to a worktree as current-checkout mode", () => {
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: "/repo/.marcode/worktrees/feature-a",
        hasServerThread: false,
        draftThreadEnvMode: "worktree",
      }),
    ).toBe("local");
  });

  it("keeps explicit new-worktree mode for draft threads without a worktree path", () => {
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: false,
        draftThreadEnvMode: "worktree",
      }),
    ).toBe("worktree");
  });

=======
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  it("keeps a server thread in worktree mode while its worktree is still being created", () => {
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: true,
        draftThreadEnvMode: undefined,
        preparingWorktree: true,
      }),
    ).toBe("worktree");
    expect(
      resolveEffectiveEnvMode({
        activeWorktreePath: null,
        hasServerThread: true,
        draftThreadEnvMode: undefined,
      }),
    ).toBe("local");
  });
});

<<<<<<< HEAD
describe("resolveEnvModeLabel", () => {
  it("uses explicit workspace labels", () => {
    expect(resolveEnvModeLabel("local")).toBe("Current checkout");
    expect(resolveEnvModeLabel("worktree")).toBe("New worktree");
  });
});

describe("resolveCurrentWorkspaceLabel", () => {
  it("describes the main repo checkout when no worktree path is active", () => {
    expect(resolveCurrentWorkspaceLabel(null)).toBe("Current checkout");
  });

  it("describes the active checkout as a worktree when one is attached", () => {
    expect(resolveCurrentWorkspaceLabel("/repo/.marcode/worktrees/feature-a")).toBe(
      "Current worktree",
    );
  });
});

describe("resolveLockedWorkspaceLabel", () => {
  it("uses a shorter label for the main repo checkout", () => {
    expect(resolveLockedWorkspaceLabel(null, "local")).toBe("Local checkout");
  });

  it("uses a shorter label for an attached worktree", () => {
    expect(resolveLockedWorkspaceLabel("/repo/.marcode/worktrees/feature-a", "worktree")).toBe(
      "Worktree",
    );
  });

  it("describes a worktree that is still being created as a new worktree", () => {
    expect(resolveLockedWorkspaceLabel(null, "worktree")).toBe("New worktree");
  });
});

=======
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
describe("deriveLocalBranchNameFromRemoteRef", () => {
  it("supports remote names that contain slashes", () => {
    expect(deriveLocalBranchNameFromRemoteRef("my-org/upstream/feature/demo")).toBe(
      "upstream/feature/demo",
    );
  });
});

describe("dedupeRemoteBranchesWithLocalMatches", () => {
  it("hides remote refs when the matching local ref exists", () => {
    const input: VcsRef[] = [
      {
        name: "feature/demo",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "origin/feature/demo",
        isRemote: true,
        remoteName: "origin",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "origin/feature/remote-only",
        isRemote: true,
        remoteName: "origin",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
    ];

    expect(dedupeRemoteBranchesWithLocalMatches(input).map((ref) => ref.name)).toEqual([
      "feature/demo",
      "origin/feature/remote-only",
    ]);
  });

  it("keeps non-origin remote refs visible when git tracks with first-slash local naming", () => {
    const input: VcsRef[] = [
      {
        name: "upstream/feature",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
      {
        name: "my-org/upstream/feature",
        isRemote: true,
        remoteName: "my-org/upstream",
        current: false,
        isDefault: false,
        worktreePath: null,
      },
    ];

    expect(dedupeRemoteBranchesWithLocalMatches(input).map((ref) => ref.name)).toEqual([
      "upstream/feature",
      "my-org/upstream/feature",
    ]);
  });
});

describe("resolveBranchSelectionTarget", () => {
  it("reuses an existing secondary worktree for the selected ref", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.marcode/worktrees/feature-a",
        refName: {
          isDefault: false,
          worktreePath: "/repo/.marcode/worktrees/feature-b",
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo/.marcode/worktrees/feature-b",
      nextWorktreePath: "/repo/.marcode/worktrees/feature-b",
      reuseExistingWorktree: true,
    });
  });

  it("switches back to the main repo when the ref already lives there", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.marcode/worktrees/feature-a",
        refName: {
          isDefault: true,
          worktreePath: "/repo",
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo",
      nextWorktreePath: null,
      reuseExistingWorktree: true,
    });
  });

<<<<<<< HEAD
  it("checks out the default ref in the main repo when leaving a secondary worktree", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.marcode/worktrees/feature-a",
        refName: {
          isDefault: true,
          worktreePath: null,
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo",
      nextWorktreePath: null,
      reuseExistingWorktree: false,
    });
  });

=======
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
  it("keeps checkout in the current worktree for non-default refs", () => {
    expect(
      resolveBranchSelectionTarget({
        activeProjectCwd: "/repo",
        activeWorktreePath: "/repo/.marcode/worktrees/feature-a",
        refName: {
          isDefault: false,
          worktreePath: null,
        },
      }),
    ).toEqual({
      checkoutCwd: "/repo/.marcode/worktrees/feature-a",
      nextWorktreePath: "/repo/.marcode/worktrees/feature-a",
      reuseExistingWorktree: false,
    });
  });
});

describe("shouldIncludeBranchPickerItem", () => {
  it("keeps the synthetic checkout PR item visible for gh pr checkout input", () => {
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: "__checkout_pull_request__:1359",
        normalizedQuery: "gh pr checkout 1359",
        createBranchItemValue: "__create_new_branch__:gh pr checkout 1359",
        checkoutPullRequestItemValue: "__checkout_pull_request__:1359",
      }),
    ).toBe(true);
  });

  it("surfaces an existing ref matching the sanitized query", () => {
    expect(
      shouldIncludeBranchPickerItem({
        itemValue: "new-branch",
        normalizedQuery: "new branch",
        createBranchItemValue: null,
        checkoutPullRequestItemValue: null,
      }),
    ).toBe(true);
  });
});

describe("sanitizeNewRefName", () => {
  it("collapses a run of whitespace into a single dash", () => {
    expect(sanitizeNewRefName("new   branch")).toBe("new-branch");
  });

  it("replaces tabs, which git rejects just like spaces", () => {
    expect(sanitizeNewRefName("new\tbranch")).toBe("new-branch");
  });

  it("preserves whitespace that git accepts", () => {
    expect(sanitizeNewRefName("new\u00a0branch")).toBe("new\u00a0branch");
    expect(sanitizeNewRefName("new\u2009branch")).toBe("new\u2009branch");
  });

  it("does not collapse dashes the user typed", () => {
    expect(sanitizeNewRefName("new - branch")).toBe("new---branch");
    expect(sanitizeNewRefName("foo--bar")).toBe("foo--bar");
  });
});
