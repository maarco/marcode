import { SourceControlProviderKind, VcsProcessSpawnError } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { providerAuth } from "@t3tools/source-control-core/server/discovery";
import type * as SourceControlHost from "@t3tools/source-control-core/server/SourceControlHost";
import {
  fakeDiscovery,
  fakeSourceControlProvider,
} from "@t3tools/source-control-testing/fakeSourceControlDriver";
import * as TestSourceControlHost from "@t3tools/source-control-testing/TestSourceControlHost";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as SourceControlDiscovery from "./SourceControlDiscovery.ts";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";

const kind = SourceControlProviderKind.make;

// Serves both the host's runs and the server's own VCS probes, whose inputs share these fields.
const run = (
  input: Pick<
    SourceControlHost.SourceControlProcessInput,
    "operation" | "command" | "args" | "cwd"
  >,
): Effect.Effect<SourceControlHost.SourceControlProcessOutput, VcsProcessSpawnError> => {
  if (input.args[0] === "--version") {
    return input.command === "missing-cli"
      ? Effect.fail(
          new VcsProcessSpawnError({
            operation: input.operation,
            command: input.command,
            cwd: input.cwd,
            cause: new Error(`${input.command} not found`),
          }),
        )
      : Effect.succeed(TestSourceControlHost.processOutput(`${input.command} version test\n`));
  }
  return Effect.succeed(
    TestSourceControlHost.processOutput(`signed in as ${input.command}-user\n`),
  );
};

const cliDiscovery = (name: string) => ({
  type: "cli" as const,
  kind: kind(name),
  label: name,
  installHint: `Install ${name}.`,
  executable: name === "beta" ? "missing-cli" : `${name}-cli`,
  versionArgs: ["--version"],
  authArgs: ["auth", "status"],
  parseAuth: ({ stdout }: { readonly stdout: string }) =>
    providerAuth({ status: "authenticated", account: /as (\S+)/.exec(stdout)?.[1] }),
});

const layerDiscovery = Layer.effect(
  SourceControlProviderRegistry.SourceControlProviderRegistry,
  SourceControlProviderRegistry.makeWithProviders(
    [
      cliDiscovery("alpha"),
      cliDiscovery("beta"),
      fakeDiscovery("gamma", {
        probeAuth: Effect.succeed(providerAuth({ status: "authenticated", account: "api-user" })),
      }),
    ].map((discovery) => ({
      kind: discovery.kind,
      provider: fakeSourceControlProvider(discovery.kind),
      discovery,
    })),
  ),
).pipe(
  Layer.provideMerge(TestSourceControlHost.layer({ process: { run } })),
  Layer.provideMerge(ServerSettings.ServerSettingsService.layerTest()),
  Layer.provideMerge(Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({})),
  Layer.provideMerge(Layer.mock(VcsProcess.VcsProcess)({ run })),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), { prefix: "t3-source-control-discovery-" }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

<<<<<<< HEAD
it.effect(
  "loads Forgejo reactions on comments, reviews and inline threads and resolves review mutations",
  () => {
    const user = { login: "maria" };
    const review = {
      id: 8,
      body: "review body",
      user,
      state: "COMMENT",
      submitted_at: "2026-09-12T00:00:00Z",
      html_url: "https://forgejo.test/maria/project/pulls/2#issuecomment-37",
      comments_count: 1,
    };
    const comment = { id: 12, body: "ordinary", user, created_at: review.submitted_at };
    const responses: Record<string, unknown> = {
      user,
      "repos/maria/project/issues/2/comments": [comment],
      "repos/maria/project/pulls/2/reviews": [review],
      "repos/maria/project/pulls/2/reviews/8": review,
      "repos/maria/project/pulls/2/reviews/9": { ...review, id: 9, html_url: "" },
      "repos/maria/project/pulls/2/commits": [],
      "repos/maria/project/issues/2/reactions": [],
      "repos/maria/project/pulls/2/reviews/8/comments": [
        {
          ...comment,
          id: 38,
          body: "inline",
          path: "file.ts",
          position: 1,
          original_position: 1,
          commit_id: "head",
          original_commit_id: "head",
          resolver: null,
        },
      ],
      "repos/maria/project/issues/comments/12/reactions": [{ content: "+1", user }],
      "repos/maria/project/issues/comments/37/reactions": [{ content: "heart", user }],
      "repos/maria/project/issues/comments/38/reactions": [
        { content: "rocket", user: { login: "reviewer" } },
      ],
    };
    const writes: ForgejoCli.ForgejoApiInput[] = [];
    let reactionReads = 0;
    return Effect.gen(function* () {
      const provider = yield* ForgejoPullRequestProvider.make;
      const input = { cwd: "/repo", repository: "maria/project", host: "forgejo.test", number: 2 };
      const activity = yield* provider.getChangeRequestActivity(input);
      assert.deepStrictEqual(
        activity.comments.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          reactions: entry.reactions,
        })),
        [
          {
            id: "12",
            kind: "issue-comment",
            reactions: [{ content: "thumbs-up", count: 1, actors: [], viewerHasReacted: true }],
          },
          {
            id: "review:8",
            kind: "review",
            reactions: [{ content: "heart", count: 1, actors: [], viewerHasReacted: true }],
          },
          {
            id: "38",
            kind: "review-comment",
            reactions: [
              { content: "rocket", count: 1, actors: ["reviewer"], viewerHasReacted: false },
            ],
          },
        ],
      );
      const inlineComment = activity.comments[2];
      assert.ok(inlineComment);
      assert.deepStrictEqual(activity.reviewThreads[0]?.comments, [inlineComment]);
      for (const reacted of [true, false]) {
        yield* provider.setReaction({ ...input, subjectId: "review:8", content: "heart", reacted });
        yield* provider.setReaction({ ...input, subjectId: "38", content: "rocket", reacted });
      }
      assert.deepStrictEqual(
        writes.map(({ path, method, body }) => ({ path, method, body })),
        [
          {
            path: "repos/maria/project/issues/comments/37/reactions",
            method: "POST",
            body: { content: "heart" },
          },
          {
            path: "repos/maria/project/issues/comments/38/reactions",
            method: "POST",
            body: { content: "rocket" },
          },
          {
            path: "repos/maria/project/issues/comments/37/reactions",
            method: "DELETE",
            body: { content: "heart" },
          },
          {
            path: "repos/maria/project/issues/comments/38/reactions",
            method: "DELETE",
            body: { content: "rocket" },
          },
        ],
      );
      const missing = yield* provider
        .setReaction({ ...input, subjectId: "review:9", content: "heart", reacted: true })
        .pipe(Effect.result);
      assert.strictEqual(missing._tag, "Failure");
      if (missing._tag === "Failure") assert.include(missing.failure.detail, "comment ID");
      assert.strictEqual(writes.length, 4);
      responses["repos/maria/project/pulls/2/reviews/8/comments"] = Array.from(
        { length: 501 },
        (_, index) => ({
          ...comment,
          id: 1000 + index,
          path: "file.ts",
          position: 1,
          original_position: 1,
          commit_id: "head",
          original_commit_id: "head",
          resolver: null,
        }),
      );
      for (let index = 0; index < 500; index++) {
        responses[`repos/maria/project/issues/comments/${1000 + index}/reactions`] = [];
      }
      reactionReads = 0;
      const bounded = yield* provider.getChangeRequestActivity(input);
      assert.strictEqual(bounded.reviewThreads.length, 500);
      assert.strictEqual(
        bounded.comments.filter((entry) => entry.kind === "review-comment").length,
        500,
      );
      assert.strictEqual(bounded.commentsTruncated, true);
      assert.strictEqual(reactionReads, 502);
    }).pipe(
      Effect.provide(
        Layer.mock(ForgejoCli.ForgejoCli)({
          api: (input) => {
            if (input.method) {
              writes.push(input);
              return Effect.succeed(processOutput("{}"));
            }
            const path = input.path.split("?")[0]!;
            if (/\/issues\/comments\/\d+\/reactions$/.test(path)) reactionReads++;
            assert.ok(Object.hasOwn(responses, path), `Unexpected Forgejo request: ${path}`);
            const page = Number(new URLSearchParams(input.path.split("?")[1]).get("page"));
            return encodeJsonEffect(page > 1 ? [] : responses[path]).pipe(
              Effect.orDie,
              Effect.map(processOutput),
            );
          },
        }),
      ),
    );
  },
);

it.effect("reports implemented tools separately from locally available executables", () => {
  const processMock = {
    run: (input: VcsProcess.VcsProcessInput) => {
      if (input.command === "git") {
        return Effect.succeed(processOutput("git version 2.51.0\n"));
      }
      if (input.command === "gh" && input.args[0] === "--version") {
        return Effect.succeed(processOutput("gh version 2.83.0\n"));
      }
      if (input.command === "gh" && input.args.join(" ") === "auth status --json hosts") {
        return Effect.succeed(
          processOutput(
            encodeJson({
              hosts: {
                "github.com": [
                  {
                    state: "success",
                    active: true,
                    host: "github.com",
                    login: "juliusmarminge",
                    tokenSource: "keyring",
                    gitProtocol: "ssh",
                  },
                ],
              },
            }),
          ),
        );
      }
      return Effect.fail(
        new VcsProcessSpawnError({
          operation: input.operation,
          command: input.command,
          cwd: input.cwd,
          cause: new Error(`${input.command} not found`),
        }),
      );
    },
  } satisfies Partial<VcsProcess.VcsProcess["Service"]>;
  const testLayer = SourceControlDiscovery.layer.pipe(
    Layer.provide(
      ServerConfig.layerTest(process.cwd(), {
        prefix: "t3-source-control-discovery-",
      }),
    ),
    Layer.provide(Layer.mock(VcsProcess.VcsProcess)(processMock)),
    Layer.provide(
      sourceControlProviderRegistryTestLayer({
        process: processMock,
        bitbucket: {
          probeAuth: Effect.succeed({
            status: "unauthenticated",
            account: Option.none(),
            host: Option.some("bitbucket.org"),
            detail: Option.some(
              "Set MARCODE_BITBUCKET_EMAIL and MARCODE_BITBUCKET_API_TOKEN, or MARCODE_BITBUCKET_ACCESS_TOKEN.",
            ),
          }),
        },
      }),
    ),
    Layer.provideMerge(NodeServices.layer),
  );

  return Effect.gen(function* () {
    const discovery = yield* SourceControlDiscovery.SourceControlDiscovery;
    const result = yield* discovery.discover;

    assert.deepStrictEqual(
      result.versionControlSystems.map((item) => ({
        kind: item.kind,
        implemented: item.implemented,
        status: item.status,
      })),
      [
        { kind: "git", implemented: true, status: "available" },
        { kind: "jj", implemented: false, status: "missing" },
      ],
    );
    assert.deepStrictEqual(
      result.sourceControlProviders.map((item) => ({
        kind: item.kind,
        status: item.status,
        auth: item.auth.status,
        account: item.auth.account,
      })),
      [
        {
          kind: "github",
          status: "available",
          auth: "authenticated",
          account: Option.some("juliusmarminge"),
        },
        {
          kind: "gitlab",
          status: "missing",
          auth: "unknown",
          account: Option.none(),
        },
        {
          kind: "azure-devops",
          status: "missing",
          auth: "unknown",
          account: Option.none(),
        },
        {
          kind: "bitbucket",
          status: "available",
          auth: "unauthenticated",
          account: Option.none(),
        },
        {
          kind: "forgejo",
          status: "missing",
          auth: "unknown",
          account: Option.none(),
        },
      ],
    );
    const bitbucket = result.sourceControlProviders.find((item) => item.kind === "bitbucket");
    assert.ok(bitbucket);
    assert.strictEqual(bitbucket.executable, undefined);
  }).pipe(Effect.provide(testLayer));
});

it.effect("probes provider authentication without exposing token details", () => {
  const processMock = {
    run: (input: VcsProcess.VcsProcessInput) => {
      if (input.args[0] === "--version") {
        return Effect.succeed(processOutput(`${input.command} version test\n`));
      }
      if (input.command === "gh" && input.args.join(" ") === "auth status --json hosts") {
        return Effect.succeed(
          processOutput(
            encodeJson({
              hosts: {
                "github.com": [
                  {
                    state: "success",
                    active: true,
                    host: "github.com",
                    login: "octocat",
                    tokenSource: "keyring",
                    gitProtocol: "ssh",
                  },
                ],
              },
            }),
          ),
        );
      }
      if (input.command === "glab" && input.args.join(" ") === "auth status") {
        return Effect.succeed(
          processOutput(`gitlab.com
Logged in to gitlab.com as gitlab-user
`),
        );
      }
      if (input.command === "tea" && input.args[0] === "login") {
        return Effect.succeed(
          processOutput(
            encodeJson([
              {
                name: "forgejo",
                url: "https://forgejo.example.com",
                ssh_host: "forgejo.example.com",
                user: "forgejo-user",
                valid: "true",
                default: "true",
              },
            ]),
          ),
        );
      }
      if (
        input.command === "az" &&
        input.args.join(" ") === "account show --query user.name -o tsv"
      ) {
        return Effect.succeed(processOutput("azure-user@example.com\n"));
      }
      return Effect.fail(
        new VcsProcessSpawnError({
          operation: input.operation,
          command: input.command,
          cwd: input.cwd,
          cause: new Error(`${input.command} not found`),
        }),
      );
    },
  } satisfies Partial<VcsProcess.VcsProcess["Service"]>;
  const testLayer = SourceControlDiscovery.layer.pipe(
    Layer.provide(
      ServerConfig.layerTest(process.cwd(), {
        prefix: "t3-source-control-auth-discovery-",
      }),
    ),
    Layer.provide(Layer.mock(VcsProcess.VcsProcess)(processMock)),
    Layer.provide(
      sourceControlProviderRegistryTestLayer({
        process: processMock,
        bitbucket: {
          probeAuth: Effect.succeed({
            status: "authenticated",
            account: Option.some("bitbucket-user"),
            host: Option.some("bitbucket.org"),
            detail: Option.none(),
          }),
        },
      }),
    ),
    Layer.provideMerge(NodeServices.layer),
  );

  return Effect.gen(function* () {
=======
it.effect("reports every hosting integration in registry order with its sign-in", () =>
  Effect.gen(function* () {
>>>>>>> d73fd1279a9cbf3ef4677b88b4ad82f0a55583c7
    const discovery = yield* SourceControlDiscovery.SourceControlDiscovery;
    const result = yield* discovery.discover;

    assert.deepStrictEqual(
      result.sourceControlProviders.map((item) => ({
        kind: item.kind,
        status: item.status,
        version: item.version,
        auth: item.auth.status,
        account: item.auth.account,
      })),
      [
        {
          kind: kind("alpha"),
          status: "available",
          version: Option.some("alpha-cli version test"),
          auth: "authenticated",
          account: Option.some("alpha-cli-user"),
        },
        {
          kind: kind("beta"),
          status: "missing",
          version: Option.none(),
          auth: "unknown",
          account: Option.none(),
        },
        {
          kind: kind("gamma"),
          status: "available",
          version: Option.none(),
          auth: "authenticated",
          account: Option.some("api-user"),
        },
      ],
    );
    assert.deepStrictEqual(
      result.versionControlSystems.map((item) => [item.kind, item.status]),
      [
        ["git", "available"],
        ["jj", "available"],
      ],
    );
  }).pipe(Effect.provide(SourceControlDiscovery.layer.pipe(Layer.provide(layerDiscovery)))),
);
