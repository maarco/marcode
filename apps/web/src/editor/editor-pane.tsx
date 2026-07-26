import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore, usePane, fileKey, type FileData } from "./editor-store";
import {
  flushProjectFile,
  cancelProjectFile,
  useProjectFile,
  useProjectFileEditor,
  clearProjectFileQueryData,
} from "~/state/projectFileState";
import { useEnvironmentQuery } from "~/state/query";
import { vcsEnvironment } from "~/state/vcs";
import { WaveSpinner } from "./wave-spinner";
import { StatusBar } from "./status-bar";
import { getFileAccentColor } from "./file-tree";
import { Markdown } from "./markdown";
import type { editor } from "monaco-editor";

const MonacoEditor = lazy(() => import("./monaco-editor-lazy"));
const MonacoDiffEditor = lazy(() =>
  import("./monaco-editor-lazy").then((mod) => ({ default: mod.DiffEditor })),
);

function MonacoLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <WaveSpinner size="sm" color="primary" animation="ripple" />
    </div>
  );
}

function defineVoidTheme(monaco: typeof import("monaco-editor"), accent: string) {
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  };
  const rgb = hexToRgb(accent);
  const a = (alpha: number) => {
    const r = Math.round(rgb.r * alpha + 14 * (1 - alpha));
    const g = Math.round(rgb.g * alpha + 14 * (1 - alpha));
    const b = Math.round(rgb.b * alpha + 20 * (1 - alpha));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  };

  monaco.editor.defineTheme("mentiko-void", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "4a4a55", fontStyle: "italic" },
      { token: "string", foreground: "e8b661" },
      { token: "keyword", foreground: "7eb8da" },
      { token: "number", foreground: "6dd4c8" },
      { token: "type", foreground: "7eb8da" },
      { token: "function", foreground: "e0e0e8" },
      { token: "variable", foreground: "c8c8d0" },
      { token: "operator", foreground: "ffffff66" },
      { token: "delimiter", foreground: "ffffff40" },
    ],
    colors: {
      "editor.background": "#0a0a0a",
      "editor.foreground": "#d4d4d4",
      "editor.lineHighlightBackground": a(0.06),
      "editor.selectionBackground": a(0.22),
      "editor.selectionHighlightBackground": a(0.1),
      "editor.inactiveSelectionBackground": a(0.08),
      "editorCursor.foreground": accent + "e0",
      "editorLineNumber.foreground": "#ffffff12",
      "editorLineNumber.activeForeground": accent + "80",
      "editorGutter.background": "#0a0a0a",
      "minimap.background": "#080808",
      "minimapSlider.background": accent + "18",
      "minimapSlider.hoverBackground": accent + "30",
      "minimapSlider.activeBackground": accent + "40",
      "scrollbar.shadow": "#00000000",
      "editorOverviewRuler.border": "#00000000",
      "editor.rangeHighlightBackground": a(0.04),
      "editorBracketMatch.background": a(0.12),
      "editorBracketMatch.border": accent + "30",
      "editorIndentGuide.background": "#ffffff08",
      "editorIndentGuide.activeBackground": "#ffffff15",
      "editorWidget.background": "#0a0a0a",
      "editorWidget.border": "#ffffff10",
      "input.background": "#080808",
      "input.border": "#ffffff10",
      "list.activeSelectionBackground": a(0.15),
      "list.hoverBackground": a(0.08),
    },
  });
}

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".jsonl": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".md": "markdown",
  ".mdx": "markdown",
  ".css": "css",
  ".scss": "scss",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".html": "html",
  ".svg": "xml",
  ".xml": "xml",
  ".sql": "sql",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".toml": "ini",
  ".ini": "ini",
  ".conf": "ini",
  ".txt": "plaintext",
};

interface EditorPaneProps {
  paneId: string;
  rootPath: string;
}

export function EditorPane({ paneId, rootPath }: EditorPaneProps) {
  const { activeFile: file, pane } = usePane(paneId);
  const closeFileAction = useEditorStore((s) => s.closeFile);
  const setActiveFileAction = useEditorStore((s) => s.setActiveFile);
  const dirtyKeys = useEditorStore((s) => s.dirtyKeys);

  const isMarkdown = file ? file.ext === ".md" || file.ext === ".mdx" : false;

  // keyboard shortcuts (operate on the active file regardless of editor kind)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!file?.path) return;

      // cmd+s save (force-flush via the shared coordinator registry)
      if (mod && e.key === "s") {
        e.preventDefault();
        if (file.relativePath && file.environmentId && file.cwd) {
          void flushProjectFile(file.environmentId, file.cwd, file.relativePath);
        }
        return;
      }

      // cmd+w close active tab
      if (mod && e.key === "w") {
        e.preventDefault();
        const key = fileKey(file.environmentId, file.path);
        const dirty = dirtyKeys.has(key);
        if (dirty && !window.confirm(`Discard unsaved changes to ${file.name}?`)) return;
        // stop the pending autosave, then drop the optimistic overlay so the
        // discard reverts to server content. Order matters: stop writes →
        // drop overlay → unmount.
        if (dirty && file.environmentId && file.cwd && file.relativePath) {
          cancelProjectFile(file.environmentId, file.cwd, file.relativePath);
          clearProjectFileQueryData(file.environmentId, file.cwd, file.relativePath);
        }
        closeFileAction(paneId, key);
        return;
      }

      // cmd+shift+[ previous tab
      if (mod && e.shiftKey && e.key === "[") {
        e.preventDefault();
        if (!pane) return;
        const idx = pane.openPaths.indexOf(fileKey(file.environmentId, file.path));
        if (idx > 0) setActiveFileAction(paneId, pane.openPaths[idx - 1]!);
        return;
      }

      // cmd+shift+] next tab
      if (mod && e.shiftKey && e.key === "]") {
        e.preventDefault();
        if (!pane) return;
        const idx = pane.openPaths.indexOf(fileKey(file.environmentId, file.path));
        if (idx < pane.openPaths.length - 1) setActiveFileAction(paneId, pane.openPaths[idx + 1]!);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [file, pane, paneId, closeFileAction, setActiveFileAction, dirtyKeys]);

  if (!file) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 relative">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
              backgroundSize: "12px 12px",
            }}
          />
          <div className="relative flex flex-col items-center gap-3">
            <span className="text-5xl font-bold tracking-tighter text-white/[0.04] font-mono select-none">
              {"{ }"}
            </span>
            <div className="text-center space-y-1.5">
              <p className="text-[11px] text-white/20 font-mono">select a file to open</p>
              <div className="flex items-center gap-3 text-[10px] text-white/10">
                <span className="px-1.5 py-0.5 rounded bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                  cmd+p
                </span>
                <span>quick open</span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
                  cmd+\
                </span>
                <span>split</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // view tabs (peer review / tasks db in mentiko) are not ported to marcode.
  if (file.view) {
    return null;
  }

  // keyed by composite identity so switching tabs remounts the child instead
  // of reusing it: its editorRef/monacoRef would otherwise still point at the
  // PREVIOUS file's Monaco instance for a render, and the pending-reveal
  // effect would fire against that stale editor (search hit opens at line 1,
  // reveal silently consumed).
  const identity = fileKey(file.environmentId, file.path);

  // virtual (non-env) read-only content, e.g. a commit patch
  if (file.virtualContent !== undefined) {
    return <VirtualFileEditor key={identity} file={file} rootPath={rootPath} />;
  }

  return <EnvFileEditor key={identity} file={file} rootPath={rootPath} isMarkdown={isMarkdown} />;
}

interface ChildProps {
  file: FileData;
  rootPath: string;
}

function EnvFileEditor({ file, rootPath, isMarkdown }: ChildProps & { isMarkdown: boolean }) {
  const pendingReveal = useEditorStore((s) => s.pendingReveal);
  const setPendingReveal = useEditorStore((s) => s.setPendingReveal);
  const editorConfig = useEditorStore((s) => s.editorConfig);
  const setFileDirty = useEditorStore((s) => s.setFileDirty);

  // composite tab identity (env + path) — see fileKey. Used for dirty
  // tracking, Monaco's own per-model identity, and detecting "this is a
  // genuinely different file" below, so two environments that happen to
  // share an absolute path never get treated as the same open tab.
  const fileIdentityKey = fileKey(file.environmentId, file.path);

  const fileState = useProjectFile(file.environmentId, file.cwd, file.relativePath);
  // stable per open file so useProjectFileEditor's coordinator useMemo (keyed
  // in part on this callback) isn't rebuilt on every render — see
  // FileSaveCoordinator's dispose()-forces-persist semantics.
  const onPendingChange = useCallback(
    (pending: boolean) => setFileDirty(fileIdentityKey, pending),
    [setFileDirty, fileIdentityKey],
  );
  const editor = useProjectFileEditor(file.environmentId, file.cwd, file.relativePath, {
    onPendingChange,
  });

  // HEAD contents for the diff view come from the env-scoped VCS `showFile`
  // atom (file contents at HEAD). Working/modified content stays in the shared
  // project-file layer below. `diffOriginal` now only flags "this is a diff tab".
  const isDiff = file.diffOriginal !== undefined;
  const headQuery = useEnvironmentQuery(
    isDiff
      ? vcsEnvironment.showFile({
          environmentId: file.environmentId,
          input: { cwd: file.cwd, relativePath: file.relativePath },
        })
      : null,
  );

  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);
  const [selectionLength, setSelectionLength] = useState(0);
  const [mdPreview, setMdPreview] = useState(true);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

  // reset to preview mode when switching to a (genuinely different) markdown
  // file — keyed by fileIdentityKey, not file.path, so switching between two
  // environments' same-path files also resets this.
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (fileIdentityKey !== prevPathRef.current) {
      prevPathRef.current = fileIdentityKey;
      setMdPreview(isMarkdown);
    }
  }, [fileIdentityKey, isMarkdown]);

  const accent = getFileAccentColor(file.path, rootPath);

  const handleBeforeMount = useCallback(
    (monaco: typeof import("monaco-editor")) => {
      monacoRef.current = monaco;
      defineVoidTheme(monaco, accent);
    },
    [accent],
  );

  // re-define theme when accent changes
  useEffect(() => {
    if (monacoRef.current) {
      defineVoidTheme(monacoRef.current, accent);
    }
  }, [accent]);

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance;
      editorInstance.onDidChangeCursorPosition((e) => {
        setCursorLine(e.position.lineNumber);
        setCursorColumn(e.position.column);
      });
      editorInstance.onDidChangeCursorSelection(() => {
        const sel = editorInstance.getSelection();
        if (sel) {
          const text = editorInstance.getModel()?.getValueInRange(sel) ?? "";
          setSelectionLength(text.length);
        }
      });

      if (
        pendingReveal &&
        pendingReveal.environmentId === file.environmentId &&
        pendingReveal.path === file.path
      ) {
        editorInstance.revealLineInCenter(pendingReveal.line);
        editorInstance.setPosition({
          lineNumber: pendingReveal.line,
          column: pendingReveal.column,
        });
        setPendingReveal(null);
      }
    },
    [file.environmentId, file.path, pendingReveal, setPendingReveal],
  );

  // handle pending reveal when switching tabs
  useEffect(() => {
    if (
      !pendingReveal ||
      pendingReveal.environmentId !== file.environmentId ||
      pendingReveal.path !== file.path
    )
      return;
    if (!editorRef.current) return;
    editorRef.current.revealLineInCenter(pendingReveal.line);
    editorRef.current.setPosition({
      lineNumber: pendingReveal.line,
      column: pendingReveal.column,
    });
    setPendingReveal(null);
  }, [file.environmentId, file.path, pendingReveal, setPendingReveal]);

  if (fileState.isPending && fileState.contents === null) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <WaveSpinner size="sm" color="primary" animation="ripple" />
        </div>
      </div>
    );
  }

  const language = EXT_TO_LANG[file.ext] ?? "plaintext";
  const contents = fileState.contents ?? "";
  const showMarkdownPreview = isMarkdown && mdPreview;
  const diffOriginal = isDiff ? (headQuery.data?.contents ?? "") : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative overflow-hidden">
        {showMarkdownPreview ? (
          <div className="overflow-y-auto h-full">
            <div className="max-w-3xl mx-auto px-8 py-8">
              <Markdown content={contents} />
            </div>
          </div>
        ) : isDiff ? (
          <Suspense fallback={<MonacoLoading />}>
            <MonacoDiffEditor
              height="100%"
              language={language}
              original={diffOriginal ?? ""}
              modified={contents}
              beforeMount={handleBeforeMount}
              theme="mentiko-void"
              options={{
                fontSize: editorConfig.fontSize,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                lineHeight: 1.6,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 8, bottom: 8 },
                smoothScrolling: true,
                renderWhitespace: editorConfig.renderWhitespace,
                ...(editorConfig.tabSize ? { tabSize: editorConfig.tabSize } : {}),
                lineNumbers: editorConfig.lineNumbers,
                overviewRulerBorder: false,
                readOnly: true,
                renderSideBySide: true,
              }}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<MonacoLoading />}>
            <MonacoEditor
              height="100%"
              path={fileIdentityKey}
              language={language}
              value={contents}
              onChange={(val) => editor.update(val ?? "")}
              onMount={handleEditorMount}
              beforeMount={handleBeforeMount}
              theme="mentiko-void"
              options={{
                fontSize: editorConfig.fontSize,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                lineHeight: 1.6,
                minimap: {
                  enabled: editorConfig.minimap,
                  renderCharacters: false,
                  showSlider: "always",
                },
                scrollBeyondLastLine: false,
                renderLineHighlight: "all",
                padding: { top: 8, bottom: 8 },
                smoothScrolling: true,
                cursorStyle: "line-thin",
                cursorSmoothCaretAnimation: "on",
                cursorBlinking: "phase",
                roundedSelection: true,
                renderWhitespace: editorConfig.renderWhitespace,
                tabSize: editorConfig.tabSize,
                wordWrap: editorConfig.wordWrap,
                lineNumbers: editorConfig.lineNumbers,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
              }}
            />
          </Suspense>
        )}

        {/* markdown mode toggle */}
        {isMarkdown && (
          <button
            onClick={() => setMdPreview((v) => !v)}
            className="absolute top-2 right-4 z-10 px-2 py-0.5 rounded-md bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] text-[9px] font-mono text-white/40 hover:text-white/60 hover:bg-white/8 transition-all cursor-pointer select-none"
          >
            {mdPreview ? "edit" : "preview"}
          </button>
        )}

        {/* floating save indicator - offset right when md toggle is present */}
        {fileState.isDirty && (
          <div
            className={`absolute top-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.15)] text-[9px] font-mono text-amber-400/60 animate-in fade-in duration-300 ${isMarkdown ? "right-[72px]" : "right-4"}`}
          >
            <span className="w-1 h-1 rounded-full bg-amber-400/60 animate-pulse" />
            unsaved
          </div>
        )}
        {editor.isSaving && (
          <div
            className={`absolute top-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] text-[9px] font-mono text-white/40 ${isMarkdown ? "right-[72px]" : "right-4"}`}
          >
            saving...
          </div>
        )}
      </div>

      <StatusBar
        contents={contents}
        ext={file.ext}
        dirty={fileState.isDirty}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        selectionLength={selectionLength}
      />
    </div>
  );
}

function VirtualFileEditor({ file, rootPath }: ChildProps) {
  const editorConfig = useEditorStore((s) => s.editorConfig);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);
  const [selectionLength, setSelectionLength] = useState(0);

  const accent = getFileAccentColor(file.path, rootPath);

  const handleBeforeMount = useCallback(
    (monaco: typeof import("monaco-editor")) => {
      monacoRef.current = monaco;
      defineVoidTheme(monaco, accent);
    },
    [accent],
  );

  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    editorInstance.onDidChangeCursorPosition((e) => {
      setCursorLine(e.position.lineNumber);
      setCursorColumn(e.position.column);
    });
    editorInstance.onDidChangeCursorSelection(() => {
      const sel = editorInstance.getSelection();
      if (sel) {
        const text = editorInstance.getModel()?.getValueInRange(sel) ?? "";
        setSelectionLength(text.length);
      }
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative overflow-hidden">
        <Suspense fallback={<MonacoLoading />}>
          <MonacoEditor
            height="100%"
            path={fileKey(file.environmentId, file.path)}
            language="diff"
            value={file.virtualContent ?? ""}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            theme="mentiko-void"
            options={{
              fontSize: editorConfig.fontSize,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              lineHeight: 1.6,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
              smoothScrolling: true,
              readOnly: true,
              lineNumbers: editorConfig.lineNumbers,
              overviewRulerBorder: false,
            }}
          />
        </Suspense>
      </div>
      <StatusBar
        contents={file.virtualContent ?? ""}
        ext={file.ext}
        dirty={false}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        selectionLength={selectionLength}
      />
    </div>
  );
}
