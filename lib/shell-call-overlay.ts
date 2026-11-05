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
