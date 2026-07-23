import { toastManager } from "../components/ui/toast";

interface EditorToast {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
}

export function showToast(toast: EditorToast) {
  toastManager.add({
    type: toast.type,
    title: toast.title,
    description: toast.message,
  });
}
