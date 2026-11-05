/**
 * 安卓壳通话浮窗与无障碍服务事件监听桥。
 * 接收来自原生 ShellBus 广播的 'shell-call-overlay' 事件。
 */

export type ShellOverlayEvent = {
  action: "restore" | "hangup" | "reply" | "tick" | "foregroundApp" | string;
  package?: string;
  text?: string;
  seconds?: number;
  [key: string]: unknown;
};

type ShellOverlayListener = (event: ShellOverlayEvent) => void;

const listeners = new Set<ShellOverlayListener>();
let isListening = false;

function handleShellOverlayEvent(e: Event) {
  const customEvent = e as CustomEvent<ShellOverlayEvent>;
  const detail = customEvent.detail;
  if (!detail) return;
  for (const listener of Array.from(listeners)) {
    try {
      listener(detail);
    } catch (err) {
      console.warn("[ShellOverlay] 事件处理异常", err);
    }
  }
}

/** 是否运行在安卓壳环境中 */
export function isShellEnvironment(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("FloatShell/");
}

/** 打开系统无障碍设置页 */
export function openAccessibilitySettings(): boolean {
  if (typeof window === "undefined") return false;
  const shell = (window as unknown as {
    AndroidShell?: {
      openSystemSettings?: (which: string) => boolean;
      openAppSettings?: () => void;
    };
  }).AndroidShell;
  if (!shell) return false;
  if (typeof shell.openSystemSettings === "function") {
    try {
      return Boolean(shell.openSystemSettings("accessibility"));
    } catch {
      // ignore
    }
  }
  if (typeof shell.openAppSettings === "function") {
    try {
      shell.openAppSettings();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** 确保全局事件监听器已挂载（幂等） */
export function ensureShellOverlayListener(): void {
  if (typeof window === "undefined") return;
  if (isListening) return;
  window.addEventListener("shell-call-overlay", handleShellOverlayEvent);
  isListening = true;
}

/** 订阅浮窗事件，返回取消订阅函数 */
export function subscribeShellOverlayEvents(callback: ShellOverlayListener): () => void {
  ensureShellOverlayListener();
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
