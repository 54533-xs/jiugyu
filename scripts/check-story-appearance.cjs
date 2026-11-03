const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
require("fake-indexeddb/auto");
const { parseHTML } = require("linkedom");
const { window } = parseHTML('<html><body><div class="phone-shell"><div id="root"></div></div></body></html>');
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.cancelAnimationFrame = clearTimeout;
global.getComputedStyle = () => ({ getPropertyValue: () => "" });
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.fetch = () => { throw new Error("Appearance tests must never call an API"); };
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, ...rest);
};
for (const extension of [".ts", ".tsx"]) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);

async function main() {
  const appearance = require(path.join(root, "lib/story-appearance.ts"));
  const { decorateStoryDialogue, clearStoryDialogueDecoration } = require(path.join(root, "lib/story-dialogue-decoration.ts"));
  for (const [prefs, expected] of [[{}, true], [{ wallpaper: "data:image/png;base64,AA==" }, false], [{ readingPanel: "show", wallpaper: "image" }, true],
    [{ readingPanel: "hide" }, false], [{ readingPanel: "auto", wallpaper: "" }, true], [{ readingPanel: "unknown", wallpaper: "image" }, false]]) {
    assert.equal(appearance.isStoryReadingPanelVisible(prefs), expected);
  }
  const invalid = appearance.normalizeStoryBubbleAppearance({ fontSize: 500, padding: -1, radius: NaN, lineHeight: Infinity, avatarSize: 1, textColor: "red; background:url(x)", avatarShape: "other" });
  assert.equal(invalid.fontSize, 28); assert.equal(invalid.padding, 0); assert.equal(invalid.radius, 12);
  assert.equal(invalid.lineHeight, 1.78); assert.equal(invalid.avatarSize, 20); assert.equal(invalid.textColor, undefined);
  assert.equal(appearance.normalizeStoryBubbleAppearance(null).fontSize, 14);
  const vars = appearance.storyAppearanceStyle({ appearance: { user: { fontSize: 21, textColor: "#123456", backgroundOpacity: 25 }, assistant: { fontSize: 16, textColor: "#654321" } } });
  assert.equal(vars["--story-user-fontSize"], "21px"); assert.equal(vars["--story-assistant-fontSize"], "16px");
  assert.match(vars["--story-user-background"], /25%/); assert.ok(!("opacity" in vars), "Transparency must affect the bubble background only");

  const fragment = document.createElement("div");
  fragment.innerHTML = '<p title="「属性不动」">正文「你好<strong>重要</strong>，再见」普通。</p><p>「未闭合</p><p>下一段</p><pre>「代码」</pre><span class="story-voice-segment">「原语音」<button>播放</button></span>';
  decorateStoryDialogue(fragment);
  assert.equal(fragment.querySelector("p").getAttribute("title"), "「属性不动」");
  assert.equal(fragment.querySelectorAll(".story-dialogue").length, 4);
  assert.equal(fragment.querySelector("pre .story-dialogue"), null);
  assert.equal(fragment.querySelectorAll("p")[2].textContent, "下一段");
  assert.equal(fragment.querySelectorAll("p")[2].querySelector("span"), null);
  assert.equal(fragment.querySelector(".story-voice-segment button").textContent, "播放");
  decorateStoryDialogue(fragment);
  assert.equal(fragment.querySelectorAll(".story-dialogue").length, 4, "Decoration is idempotent");
  clearStoryDialogueDecoration(fragment);
  assert.equal(fragment.querySelectorAll(".story-dialogue").length, 0);

  const React = require("react");
  const { act } = React;
  const { createRoot } = require("react-dom/client");
  const { StoryAppearanceEditor } = require(path.join(root, "components/story/story-appearance-editor.tsx"));
  const container = document.getElementById("root");
  let renderer = createRoot(container);
  let preview = null, saved = null, closed = false;
  const original = { theme: "paper", voiceEnabled: true };
  const previewChanged = value => { preview = value; };
  const render = async (initialPrefs = original, initialCSS = ".example { color: red; }") => act(async () => {
    renderer.render(React.createElement(StoryAppearanceEditor, { initialPrefs, initialCSS, userName: "简初", characterName: "角色甲", onPreview: previewChanged,
      onClose: () => { closed = true; }, onSave: (prefs, css) => { saved = { prefs: JSON.parse(JSON.stringify(prefs)), css }; } }));
  });
  const button = text => [...container.querySelectorAll("button")].find(element => element.textContent === text);
  const click = async element => act(async () => element.dispatchEvent(new window.Event("click", { bubbles: true })));
  const input = label => [...container.querySelectorAll("input,select,textarea")].find(element => element.getAttribute("aria-label") === label);
  // linkedom has no native form event implementation; call the rendered React handler.
  const change = async (element, value) => act(async () => {
    const key = Object.keys(element).find(name => name.startsWith("__reactProps$"));
    element[key].onChange({ target: { value } });
  });
  await render();
  assert.equal(container.querySelectorAll('select[aria-label="主题预设"] option').length, 6);
  assert.equal(input("字体大小"), undefined, "Original reader hides free-layout controls");
  assert.equal(container.querySelectorAll(".story-beautify-preview .story-dialogue").length, 0, "Original reader markup stays unchanged");
  await click(button("去掉"));
  assert.ok(input("字体大小"));
  assert.equal(preview.readingPanel, "hide");
  assert.equal(container.querySelectorAll(".story-beautify-preview .story-dialogue").length, 2, "Quotes receive markup even without voice generation");
  assert.equal(container.querySelectorAll(".story-beautify-preview strong").length, 2);
  await click(button("保留"));
  assert.equal(container.querySelectorAll(".story-beautify-preview .story-dialogue").length, 0, "Switching back clears only generated dialogue markers");
  await click(button("去掉"));
  await change(input("字体大小"), "21"); await change(input("默认文字颜色"), "#123456");
  await change(input("背景透明度"), "75"); await change(input("头像大小"), "60");
  assert.equal(preview.appearance.user.fontSize, 21); assert.equal(preview.appearance.user.backgroundOpacity, 25);
  await click(button("角色"));
  assert.equal(input("字体大小").getAttribute("value"), "14");
  await change(input("「」内文字颜色"), "#abcdef"); await change(input("加粗文字颜色"), "#fedcba");
  await change(input("头像形状"), "circle"); await change(input("字体大小"), "16");
  await change(input("主题预设"), "night");
  await click(button("保存并应用"));
  assert.equal(saved.prefs.theme, "night"); assert.equal(saved.prefs.appearance.user.fontSize, 21);
  assert.equal(saved.prefs.appearance.assistant.fontSize, 16); assert.equal(saved.prefs.appearance.assistant.dialogueColor, "#abcdef");
  assert.equal(saved.prefs.appearance.assistant.boldColor, "#fedcba"); assert.equal(saved.prefs.appearance.assistant.avatarShape, "circle");
  assert.deepEqual(original, { theme: "paper", voiceEnabled: true }, "Editing must not mutate stored preferences before Apply");
  const previous = JSON.stringify(saved);
  await act(async () => renderer.unmount());
  renderer = createRoot(container);
  await render(saved.prefs, saved.css);
  assert.equal(input("字体大小").getAttribute("value"), "21");
  await click(button("恢复用户默认样式"));
  assert.equal(preview.appearance.user, undefined); assert.equal(preview.appearance.assistant.fontSize, 16);
  await click(button("重置美化"));
  assert.equal(preview.theme, "paper"); assert.equal(preview.appearance, undefined);
  assert.equal(JSON.stringify(saved), previous, "Reset must remain a draft until Apply");
  await click(container.querySelector('[aria-label="关闭美化"]'));
  assert.ok(closed);
  await act(async () => renderer.unmount());
  assert.equal(preview, null, "Closing must clear temporary preview");
  console.log("✅ 剧情美化回归通过：壁纸/面板模式、两侧独立样式、文本节点对白标记、无语音对白颜色、主题列表、保存恢复、局部/全部重置及取消；无 API 调用");
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
