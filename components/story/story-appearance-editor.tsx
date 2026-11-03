"use client";

import { useEffect, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { Avatar } from "@/components/ui/primitives";
import CSSSchemeBar from "@/components/ui/css-scheme-picker";
import { StoryHtmlRenderer } from "@/components/ui/story-html-renderer";
import { STORY_CSS_EXAMPLE } from "@/lib/css-examples";
import { isStoryReadingPanelVisible, normalizeStoryBubbleAppearance, normalizeStoryMessageGap, storyAppearanceStyle, STORY_THEMES,
  type StoryAppearance, type StoryAppearancePrefs, type StoryBubbleAppearance } from "@/lib/story-appearance";

function RangeSetting({ label, value, min, max, step = 1, unit = "", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void;
}) {
  return <label className="story-beautify-range"><span>{label}<output>{value}{unit}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

export function StoryAppearanceEditor({ initialPrefs, initialCSS, userName, characterName, userAvatar, characterAvatar, onSettingsChange, onCSSChange, onApplyAppearance, onClose }: {
  initialPrefs: StoryAppearancePrefs; initialCSS: string; userName: string; characterName: string; userAvatar?: string; characterAvatar?: string;
  onSettingsChange: (patch: Omit<StoryAppearancePrefs, "appearance">) => void; onCSSChange: (css: string) => void;
  onApplyAppearance: (appearance: StoryAppearance | undefined) => void; onClose: () => void;
}) {
  const [prefs, setPrefs] = useState<StoryAppearancePrefs>(() => ({ theme: initialPrefs.theme, wallpaper: initialPrefs.wallpaper,
    readingPanel: initialPrefs.readingPanel, appearance: initialPrefs.appearance }));
  const [css, setCSS] = useState(initialCSS);
  const [role, setRole] = useState<"user" | "assistant" | "both">("user");
  const [notice, setNotice] = useState("");
  const [wallpaperLoading, setWallpaperLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRequest = useRef(0);
  const [palette, setPalette] = useState({ backgroundColor: "#ffffff", textColor: "#334155", dialogueColor: "#334155", boldColor: "#1e293b" });
  const panelVisible = isStoryReadingPanelVisible(prefs);
  const displayRole = role === "both" ? "user" : role;
  const appearance = normalizeStoryBubbleAppearance(prefs.appearance?.[displayRole]);
  const patch = (next: Partial<StoryBubbleAppearance>) => {
    setNotice("");
    setPrefs(previous => {
      const updated = { ...previous.appearance };
      for (const target of role === "both" ? ["user", "assistant"] as const : [role]) {
        updated[target] = { ...updated[target], ...next };
      }
      return { ...previous, appearance: updated };
    });
  };
  const applySettings = (next: Omit<StoryAppearancePrefs, "appearance">) => {
    setPrefs(previous => ({ ...previous, ...next }));
    onSettingsChange(next);
  };
  const applyCSS = (next: string) => { setCSS(next); onCSSChange(next); };

  useEffect(() => () => { fileRequest.current++; }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!rootRef.current) return;
      const style = getComputedStyle(rootRef.current);
      const get = (key: string, fallback: string) => {
        const value = style.getPropertyValue(key).trim();
        return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
      };
      const text = get(displayRole === "user" ? "--c-story-text-user" : "--c-story-text", get("--c-story-text", "#334155"));
      setPalette({ backgroundColor: get(displayRole === "user" ? "--c-story-bubble-user" : "--c-story-bubble-bg", "#ffffff"),
        textColor: text, dialogueColor: text, boldColor: get("--c-story-heading", "#1e293b") });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefs.theme, displayRole]);

  const chooseWallpaper = (file?: File) => {
    if (!file) return;
    const request = ++fileRequest.current;
    setWallpaperLoading(true);
    const reader = new FileReader();
    reader.onload = () => { if (request === fileRequest.current && typeof reader.result === "string") {
      applySettings({ wallpaper: reader.result as string }); setNotice(""); setWallpaperLoading(false);
    } };
    reader.onerror = () => { if (request === fileRequest.current) { setNotice("壁纸读取失败，请重新选择图片"); setWallpaperLoading(false); } };
    reader.readAsDataURL(file);
  };

  const colorSetting = (key: "backgroundColor" | "textColor" | "dialogueColor" | "boldColor", label: string) => <div className="story-beautify-color" key={key}>
    <label><span>{label}</span><input type="color" aria-label={label} value={appearance[key] || palette[key]} onChange={event => patch({ [key]: event.target.value })} /></label>
    {(appearance[key] || (role === "both" && prefs.appearance?.assistant?.[key])) ? <button type="button" onClick={() => patch({ [key]: undefined })}>跟随主题</button> : <small>跟随主题</small>}
  </div>;

  return <div ref={rootRef} className="story-beautify-page" role="dialog" aria-modal="true" aria-label="剧情美化"
    onTouchStart={event => event.stopPropagation()} onTouchMove={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onMouseMove={event => event.stopPropagation()}>
    <header><strong>剧情美化</strong><button type="button" onClick={onClose} aria-label="关闭美化"><XMarkIcon width={20} /></button></header>
    <main>
      <section className="story-beautify-card">
        <h3>背景壁纸</h3>
        {prefs.wallpaper ? <img className="story-beautify-wallpaper" src={prefs.wallpaper} alt="当前剧情壁纸" /> : <p>未设置壁纸</p>}
        <div className="story-beautify-actions"><button type="button" onClick={() => fileRef.current?.click()}>选择壁纸</button>
          {prefs.wallpaper && <button type="button" onClick={() => { fileRequest.current++; setWallpaperLoading(false); applySettings({ wallpaper: undefined }); }}>清除壁纸</button>}</div>
        <input ref={fileRef} hidden type="file" accept="image/*" onChange={event => { chooseWallpaper(event.target.files?.[0]); event.target.value = ""; }} />
      </section>

      <section className="story-beautify-card">
        <h3>阅读面板</h3>
        <div className="story-beautify-tabs" role="group" aria-label="阅读面板">
          {([{ id: "auto", name: "自动" }, { id: "show", name: "保留" }, { id: "hide", name: "去掉" }] as const).map(option =>
            <button key={option.id} type="button" aria-pressed={(prefs.readingPanel || "auto") === option.id} onClick={() => applySettings({ readingPanel: option.id })}>{option.name}</button>)}
        </div>
        <p>{(prefs.readingPanel || "auto") === "auto" ? "自动：有壁纸时直接展示背景，没有壁纸时保留原阅读面板。" : panelVisible ? "保留原来的整块阅读面板。" : "去掉整块阅读面板与壁纸遮罩，自定义用户和角色样式。"}</p>
      </section>

      <label className="story-beautify-preset"><span>主题预设</span><select aria-label="主题预设" value={prefs.theme || "paper"} onChange={event => applySettings({ theme: event.target.value })}>
        {STORY_THEMES.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
      </select></label>

      {!panelVisible && <section className="story-beautify-card">
        <h3>基础美化</h3>
        <div className="story-beautify-tabs" role="group" aria-label="美化对象">
          <button type="button" aria-pressed={role === "user"} onClick={() => setRole("user")}>用户</button>
          <button type="button" aria-pressed={role === "assistant"} onClick={() => setRole("assistant")}>角色</button>
          <button type="button" aria-pressed={role === "both"} onClick={() => setRole("both")}>一起设置</button>
        </div>
        <p>{role === "both" ? "以用户当前数值显示，修改的项目同时应用双方，其余项目保留各自设置。" : "基础美化需保存并应用，关闭页面会放弃未保存的修改。"}</p>
        <h4>气泡</h4>
        {colorSetting("backgroundColor", "背景颜色")}
        <RangeSetting label="背景透明度" value={100 - appearance.backgroundOpacity} min={0} max={100} unit="％" onChange={value => patch({ backgroundOpacity: 100 - value })} />
        <RangeSetting label="内边距" value={appearance.padding} min={0} max={32} unit="px" onChange={value => patch({ padding: value })} />
        <RangeSetting label="气泡圆角" value={appearance.radius} min={0} max={40} unit="px" onChange={value => patch({ radius: value })} />
        <RangeSetting label="气泡最大宽度" value={appearance.maxWidth} min={55} max={100} unit="％" onChange={value => patch({ maxWidth: value })} />
        <h4>文字</h4>
        <RangeSetting label="字体大小" value={appearance.fontSize} min={10} max={28} unit="px" onChange={value => patch({ fontSize: value })} />
        {colorSetting("textColor", "默认文字颜色")}
        {colorSetting("dialogueColor", "「」内文字颜色")}
        {colorSetting("boldColor", "加粗文字颜色")}
        <RangeSetting label="行间距" value={appearance.lineHeight} min={1.2} max={2.6} step={0.02} unit="倍" onChange={value => patch({ lineHeight: value })} />
        <RangeSetting label="段落间距" value={appearance.paragraphGap} min={0} max={32} unit="px" onChange={value => patch({ paragraphGap: value })} />
        <h4>头像</h4>
        <RangeSetting label="头像大小" value={appearance.avatarSize} min={20} max={72} unit="px" onChange={value => patch({ avatarSize: value })} />
        <label className="story-beautify-preset"><span>头像形状</span><select aria-label="头像形状" value={appearance.avatarShape} onChange={event => patch({ avatarShape: event.target.value as StoryBubbleAppearance["avatarShape"] })}>
          <option value="square">方形</option><option value="rounded">圆角方形</option><option value="circle">圆形</option>
        </select></label>
        <button className="story-beautify-reset-side" type="button" onClick={() => { setNotice(""); setPrefs(previous => ({ ...previous, appearance: { ...previous.appearance,
          ...(role === "both" ? { user: undefined, assistant: undefined } : { [role]: undefined }),
        } })); }}>恢复{role === "both" ? "双方" : role === "user" ? "用户" : "角色"}默认样式</button>
        <h4>消息间距（双方共用）</h4>
        <RangeSetting label="消息间距" value={normalizeStoryMessageGap(prefs.appearance?.messageGap)} min={8} max={64} unit="px" onChange={value => { setNotice(""); setPrefs(previous => ({ ...previous, appearance: { ...previous.appearance, messageGap: value } })); }} />
      </section>}

      <section className="story-beautify-card">
        <h3>效果预览</h3>
        <div className="story-beautify-preview" style={{ ...storyAppearanceStyle(prefs), backgroundImage: prefs.wallpaper ? `url(${JSON.stringify(prefs.wallpaper)})` : undefined }}>
          {prefs.wallpaper && panelVisible && <div className="story-beautify-preview-shade" />}
          <div className={`story-stage-inner${panelVisible ? "" : " story-free-layout"}`}>
            {(["user", "assistant"] as const).map(speaker => <article key={speaker} className="story-row" data-role={speaker}>
              <div className="story-msg-head"><div className="story-avatar-wrap"><Avatar size="md" name={speaker === "user" ? userName : characterName} src={speaker === "user" ? userAvatar : characterAvatar} /></div>
                <div className="story-msg-meta"><span className="story-msg-name">{speaker === "user" ? userName : characterName}</span></div></div>
              <div className="story-bubble-wrap"><div className="story-bubble"><StoryHtmlRenderer colorDialogue={!panelVisible} messageId={`beauty-preview-${speaker}`} content={speaker === "user" ? "我抬起头望向你。\n\n「今天一起走走吧。」\n\n**这句话很重要。**" : "我停下脚步，笑着回应。\n\n「好，我陪你。」\n\n**我记住了你的邀请。**"} /></div></div>
            </article>)}
          </div>
        </div>
        <p>基础美化在此预览，保存并应用后生效；壁纸、阅读面板、主题和 CSS 实时保存应用。HTML 卡片保留自身样式。</p>
      </section>

      <details className="story-beautify-card story-beautify-css"><summary>高级自定义 CSS</summary>
        <textarea aria-label="剧情自定义 CSS" className="story-css-box" value={css} onChange={event => applyCSS(event.target.value)} placeholder="在这里输入剧情页面 CSS" />
        <div className="story-beautify-actions"><CSSSchemeBar target="story" currentCSS={css} onLoad={applyCSS} />
          <button type="button" onClick={() => applyCSS(STORY_CSS_EXAMPLE)}>加载示例</button><button type="button" onClick={() => applyCSS("")}>清除 CSS</button></div>
      </details>
      <p className="story-beautify-notice" role="status">{wallpaperLoading ? "正在读取壁纸…" : notice || "壁纸、阅读面板、主题和 CSS 修改后立即保存，关闭美化不会撤销。"}</p>
    </main>
    {!panelVisible && <footer><button type="button" onClick={() => { setPrefs(previous => ({ ...previous, appearance: undefined })); setNotice("基础美化已重置，保存并应用后生效。"); }}>重置基础美化</button>
      <button type="button" className="story-beautify-save" onClick={() => { onApplyAppearance(prefs.appearance); setNotice("基础美化已保存并应用，可继续调整。"); }}>保存并应用</button></footer>}
  </div>;
}
