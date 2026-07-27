const FOLDER_COLORS: Record<string, string> = {
  bin: "#f59e0b",
  chains: "#3b82f6",
  docs: "#22c55e",
  lib: "#38bdf8",
  web: "#06b6d4",
  tests: "#eab308",
  scripts: "#f97316",
  public: "#64748b",
  memory: "#ec4899",
  namespaces: "#8b5cf6",
  agents: "#14b8a6",
  templates: "#f472b6",
  workspace: "#6366f1",
  examples: "#84cc16",
  src: "#06b6d4",
  components: "#3b82f6",
  app: "#22c55e",
  api: "#f59e0b",
  hooks: "#a855f7",
  utils: "#64748b",
  config: "#f97316",
  node_modules: "#374151",
};

const EXT_COLORS: Record<string, string> = {
  ".ts": "text-blue-400",
  ".tsx": "text-blue-400",
  ".js": "text-yellow-400",
  ".jsx": "text-yellow-400",
  ".mjs": "text-yellow-400",
  ".json": "text-amber-300",
  ".yaml": "text-rose-300",
  ".yml": "text-rose-300",
  ".md": "text-foreground/50",
  ".mdx": "text-foreground/50",
  ".css": "text-purple-400",
  ".scss": "text-pink-400",
  ".html": "text-orange-400",
  ".py": "text-green-400",
  ".go": "text-cyan-400",
  ".rs": "text-orange-300",
  ".sh": "text-green-300",
  ".bash": "text-green-300",
  ".sql": "text-sky-300",
  ".svg": "text-amber-400",
};

const EXT_LABELS: Record<string, string> = {
  ".ts": "TS",
  ".tsx": "TX",
  ".js": "JS",
  ".jsx": "JX",
  ".json": "{}",
  ".yaml": "YM",
  ".yml": "YM",
  ".md": "MD",
  ".css": "CS",
  ".py": "PY",
  ".go": "GO",
  ".rs": "RS",
  ".sh": "SH",
  ".html": "<>",
  ".sql": "SQ",
};

export function getFolderColor(name: string): string {
  return FOLDER_COLORS[name.toLowerCase()] ?? "#64748b";
}

export function getFileAccentColor(filePath: string, rootPath: string): string {
  const rel = filePath.startsWith(rootPath) ? filePath.slice(rootPath.length + 1) : filePath;
  const firstFolder = rel.split("/")[0];
  return getFolderColor(firstFolder ?? "");
}

export function fileExtension(fileNameOrPath: string): string {
  const fileName = fileNameOrPath.split("/").at(-1) ?? fileNameOrPath;
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function FileTypeIcon({ ext, size = "sm" }: { ext: string; size?: "sm" | "xs" }) {
  const color = EXT_COLORS[ext.toLowerCase()] ?? "text-foreground/30";
  const label = EXT_LABELS[ext.toLowerCase()] ?? "";
  const dim = size === "sm" ? "size-4" : "size-3.5";
  const fontSize = size === "sm" ? "text-[7px]" : "text-[6px]";

  if (label) {
    return (
      <span
        aria-hidden="true"
        className={`${dim} flex shrink-0 items-center justify-center ${color} ${fontSize} font-bold leading-none`}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${dim} flex shrink-0 items-center justify-center ${color}`}
    >
      <svg className="size-3" viewBox="0 0 16 16" fill="currentColor">
        <path d="M3 1h7l4 4v10H3V1zm7 0v4h4" />
      </svg>
    </span>
  );
}
