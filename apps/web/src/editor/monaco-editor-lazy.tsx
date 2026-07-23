// Lazy chunk: bundles monaco locally (no CDN) and wires vite workers.
// Loaded via React.lazy from editor-pane so monaco stays out of the main bundle.
import * as monaco from "monaco-editor";
// monaco's exports map aliases "./*" to "./esm/vs/*", so specifiers skip the esm/vs prefix
import editorWorker from "monaco-editor/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import cssWorker from "monaco-editor/language/css/css.worker.js?worker";
import htmlWorker from "monaco-editor/language/html/html.worker.js?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

export default Editor;
export { DiffEditor };
