import type { CSSProperties } from "react";

export type StoryReadingPanelMode = "auto" | "show" | "hide";
export type StoryBubbleAppearance = {
  backgroundColor?: string;
  backgroundOpacity?: number;
  padding?: number;
  radius?: number;
  maxWidth?: number;
  fontSize?: number;
  textColor?: string;
  dialogueColor?: string;
  boldColor?: string;
  lineHeight?: number;
  paragraphGap?: number;
  avatarSize?: number;
  avatarShape?: "square" | "rounded" | "circle";
};
export type StoryAppearance = { user?: StoryBubbleAppearance; assistant?: StoryBubbleAppearance; messageGap?: number };
export type StoryAppearancePrefs = { theme?: string; wallpaper?: string; readingPanel?: StoryReadingPanelMode; appearance?: StoryAppearance };

export const STORY_THEMES = [
  { id: "paper", color: "#94a3b8", name: "纸白" },
  { id: "warm", color: "#b89870", name: "手账" },
  { id: "night", color: "#3a4560", name: "夜读" },
  { id: "ink", color: "#1a1a1a", name: "水墨" },
  { id: "rose", color: "#d4889a", name: "玫瑰" },
  { id: "sage", color: "#7a9a6a", name: "青苔" },
] as const;

const numberInRange = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value)) * 100) / 100 : fallback;
const color = (value: unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : undefined;

export function normalizeStoryBubbleAppearance(input?: StoryBubbleAppearance) {
  const value = input && typeof input === "object" ? input : {};
  return {
    backgroundColor: color(value.backgroundColor), backgroundOpacity: numberInRange(value.backgroundOpacity, 0, 0, 100),
    padding: numberInRange(value.padding, 12, 0, 32), radius: numberInRange(value.radius, 12, 0, 40), maxWidth: numberInRange(value.maxWidth, 100, 55, 100),
    fontSize: numberInRange(value.fontSize, 14, 10, 28), textColor: color(value.textColor), dialogueColor: color(value.dialogueColor), boldColor: color(value.boldColor),
    lineHeight: numberInRange(value.lineHeight, 1.78, 1.2, 2.6), paragraphGap: numberInRange(value.paragraphGap, 12, 0, 32),
    avatarSize: numberInRange(value.avatarSize, 38, 20, 72),
    avatarShape: value.avatarShape === "circle" || value.avatarShape === "rounded" ? value.avatarShape : "square",
  };
}

export const normalizeStoryMessageGap = (value: unknown) => numberInRange(value, 24, 8, 64);

export function isStoryReadingPanelVisible(prefs: StoryAppearancePrefs): boolean {
  return prefs.readingPanel === "show" || (prefs.readingPanel !== "hide" && !prefs.wallpaper?.trim());
}

export function storyAppearanceStyle(prefs: StoryAppearancePrefs): CSSProperties {
  const style: Record<string, string | number> = { "--story-message-gap": `${normalizeStoryMessageGap(prefs.appearance?.messageGap)}px` };
  for (const role of ["user", "assistant"] as const) {
    const value = normalizeStoryBubbleAppearance(prefs.appearance?.[role]);
    const prefix = `--story-${role}-`;
    style[`${prefix}background`] = `color-mix(in srgb, ${value.backgroundColor || (role === "user" ? "var(--c-story-bubble-user, #f0f0f0)" : "var(--c-story-bubble-bg, #ffffff)")} ${value.backgroundOpacity}%, transparent)`;
    for (const key of ["padding", "radius", "fontSize", "paragraphGap", "avatarSize"] as const) style[`${prefix}${key}`] = `${value[key]}px`;
    style[`${prefix}maxWidth`] = `${value.maxWidth}%`;
    style[`${prefix}lineHeight`] = value.lineHeight;
    style[`${prefix}textColor`] = value.textColor || (role === "user" ? "var(--c-story-text-user, var(--c-story-text, #334155))" : "var(--c-story-text, #334155)");
    style[`${prefix}dialogueColor`] = value.dialogueColor || `var(${prefix}textColor)`;
    style[`${prefix}boldColor`] = value.boldColor || "var(--c-story-heading, #1e293b)";
    style[`${prefix}avatarRadius`] = value.avatarShape === "circle" ? "50%" : value.avatarShape === "rounded" ? "10px" : "0px";
  }
  return style as CSSProperties;
}
