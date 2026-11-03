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
  let stored = { theme: "paper", voiceEnabled: true }, storedCSS = ".example { color: red; }", applied = 0, closed = false;
  const settingsPatches = [];
  const original = { ...stored };
  const render = async () => act(async () => {
    renderer.render(React.createElement(StoryAppearanceEditor, { initialPrefs: stored, initialCSS: storedCSS, userName: "简初", characterName: "角色甲",
      onSettingsChange: patch => { settingsPatches.push(patch); stored = { ...stored, ...patch }; },
      onCSSChange: css => { storedCSS = css; },
      onClose: () => { closed = true; }, onApplyAppearance: appearance => { applied++; stored = { ...stored, appearance }; } }));
  });
  const button = text => [...container.querySelectorAll("button")].find(element => element.textContent === text);
  const click = async element => act(async () => element.dispatchEvent(new window.Event("click", { bubbles: true })));
  const input = label => [...container.querySelectorAll("input,select,textarea")].find(element => element.getAttribute("aria-label") === label);
  // linkedom has no native form event implementation; call the rendered React handler.
  const change = async (element, value) => act(async () => {
    const key = Object.keys(element).find(name => name.startsWith("__reactProps$"));
    element[key].onChange({ target: { value, checked: value } });
  });
  const reopen = async () => { await act(async () => renderer.unmount()); renderer = createRoot(container); await render(); };
  await render();
  assert.equal(container.querySelectorAll('select[aria-label="主题预设"] option').length, 6);
  assert.equal(input("字体大小"), undefined, "Original reader hides free-layout controls");
  assert.equal(appearance.storyChromeAttributes({})["data-story-controls-opacity"], undefined, "Old sessions preserve theme controls");
  assert.equal(appearance.storyAppearanceStyle({})["--story-controls-opacity"], undefined);
  assert.equal(appearance.normalizeStoryBubbleAppearance({ avatarLayout: "bad" }).avatarLayout, "default");
  assert.equal(appearance.storyMessageAppearanceAttributes({ appearance: { user: { avatarLayout: "center" } } }, "user")["data-story-avatar-layout"], "center");
  assert.equal(appearance.storyMessageAppearanceAttributes({}, "system")["data-story-avatar-layout"], undefined);
  const badChrome = appearance.normalizeStoryChromeAppearance({ barOpacity: 200, buttonOpacity: -9, controlsColor: "red; color: pink", hideHeaderAvatar: "yes" });
  assert.equal(badChrome.barOpacity, 100); assert.equal(badChrome.buttonOpacity, 0); assert.equal(badChrome.controlsColor, undefined); assert.equal(badChrome.hideHeaderAvatar, false);
  await change(input("顶栏与底栏背景透明度"), "40");
  await change(input("两栏按钮透明度"), "35");
  await change(input("两栏文字与图标颜色"), "#123456");
  await change(input("显示顶栏头像"), false);
  assert.deepEqual(stored.chrome, { barOpacity: 60, buttonOpacity: 65, controlsColor: "#123456", hideHeaderAvatar: true });
  let demo = container.querySelector(".story-beautify-preview");
  assert.equal(demo.getAttribute("data-story-header-avatar"), "hidden");
  assert.match(demo.style.getPropertyValue("--story-header-background"), /60%/);
  assert.match(demo.style.getPropertyValue("--story-footer-background"), /60%/);
  assert.equal(Number(demo.style.getPropertyValue("--story-controls-opacity")), .65);
  assert.equal(demo.style.getPropertyValue("--story-controls-color"), "#123456");
  assert.equal(applied, 0, "Chrome applies before basic controls even become visible");
  assert.equal(button("保存并应用"), undefined, "Only basic appearance needs Apply");
  assert.equal(container.querySelectorAll(".story-beautify-preview .story-dialogue").length, 0);
  await click(button("去掉"));
  assert.equal(stored.readingPanel, "hide", "Panel mode persists without Apply");
  assert.equal(container.querySelectorAll(".story-beautify-preview .story-dialogue").length, 2);
  await click(button("保留"));
  assert.equal(container.querySelectorAll(".story-beautify-preview .story-dialogue").length, 0);
  await click(button("去掉"));
  await change(input("字体大小"), "21"); await change(input("默认文字颜色"), "#123456");
  await change(input("背景透明度"), "75"); await change(input("头像大小"), "60");
  assert.equal(stored.appearance, undefined, "Basic edits are only previewed before Apply");
  assert.equal(container.querySelector('[data-role="user"]').closest(".story-beautify-preview").style.getPropertyValue("--story-user-fontSize"), "21px");
  await click(button("角色"));
  assert.equal(input("字体大小").getAttribute("value"), "14");
  await change(input("「」内文字颜色"), "#abcdef"); await change(input("加粗文字颜色"), "#fedcba");
  await change(input("头像形状"), "circle"); await change(input("字体大小"), "16");
  await change(input("主题预设"), "night");
  assert.equal(stored.theme, "night");
  assert.equal(stored.appearance, undefined, "Instant changes must not commit a basic draft");
  await change(input("剧情自定义 CSS"), ".story-bubble { letter-spacing: 1px; }");
  assert.match(storedCSS, /letter-spacing/, "CSS applies without Apply");
  await click(button("保存并应用"));
  assert.equal(applied, 1); assert.equal(closed, false);
  assert.ok(container.querySelector('[aria-label="剧情美化"]'), "Apply keeps the editor open");
  assert.equal(stored.appearance.user.fontSize, 21); assert.equal(stored.appearance.user.backgroundOpacity, 25);
  assert.equal(stored.appearance.assistant.fontSize, 16); assert.equal(stored.appearance.assistant.dialogueColor, "#abcdef");
  assert.equal(stored.appearance.assistant.boldColor, "#fedcba"); assert.equal(stored.appearance.assistant.avatarShape, "circle");
  assert.equal(stored.theme, "night"); assert.equal(stored.voiceEnabled, true);
  assert.deepEqual(original, { theme: "paper", voiceEnabled: true });
  await click(button("一起设置"));
  assert.equal(input("字体大小").getAttribute("value"), "21");
  const quoteRow = input("「」内文字颜色").closest(".story-beautify-color");
  assert.ok(quoteRow.querySelector("button"), "Together mode can reset a color customized only on the character");
  await change(input("字体大小"), "19"); await change(input("内边距"), "18");
  await change(input("默认文字颜色"), "#778899"); await change(input("消息间距"), "32");
  await change(input("头像位置"), "center");
  assert.equal(container.querySelectorAll('.story-beautify-preview .story-row[data-story-avatar-layout="center"]').length, 2);
  assert.ok(container.querySelector('.story-beautify-preview .story-row .story-msg-meta .story-msg-time'), "Centered preview includes time below the avatar");
  assert.equal(stored.appearance.user.fontSize, 21, "Together edits also need Apply");
  await click(button("保存并应用"));
  for (const role of ["user", "assistant"]) {
    assert.equal(stored.appearance[role].fontSize, 19); assert.equal(stored.appearance[role].padding, 18);
    assert.equal(stored.appearance[role].textColor, "#778899");
  }
  assert.equal(stored.appearance.assistant.dialogueColor, "#abcdef", "Together edits preserve untouched per-role differences");
  assert.equal(stored.appearance.user.backgroundOpacity, 25); assert.equal(stored.appearance.messageGap, 32);
  await reopen();
  assert.equal(input("字体大小").getAttribute("value"), "19");
  assert.equal(input("头像位置").value, "center");
  assert.equal(input("显示顶栏头像").checked, false);
  assert.equal(input("顶栏与底栏背景透明度").getAttribute("value"), "40");
  await click(button("角色")); await change(input("头像位置"), "reverse"); await click(button("保存并应用"));
  assert.equal(stored.appearance.user.avatarLayout, "center"); assert.equal(stored.appearance.assistant.avatarLayout, "reverse");
  await click(button("用户"));
  await click(button("恢复用户默认样式"));
  await click(button("保存并应用"));
  assert.equal(stored.appearance.user, undefined); assert.equal(stored.appearance.assistant.fontSize, 19);
  await click(button("一起设置")); await click(button("恢复双方默认样式"));
  await click(button("保存并应用"));
  assert.equal(stored.appearance.assistant, undefined); assert.equal(stored.appearance.messageGap, 32);

  // File selection, stale reads, clear, and leaving with an unsaved basic draft.
  const readers = [];
  global.FileReader = class { readAsDataURL() { readers.push(this); } };
  const chooseFile = async () => act(async () => {
    const element = container.querySelector('input[type="file"]');
    element[Object.keys(element).find(key => key.startsWith("__reactProps$"))].onChange({ target: { files: [{}], value: "file" } });
  });
  await chooseFile(); await chooseFile();
  await act(async () => { readers[0].result = "stale"; readers[0].onload(); });
  assert.equal(stored.wallpaper, undefined);
  const wallpaper = "data:image/png;base64,AA==";
  await act(async () => { readers[1].result = wallpaper; readers[1].onload(); });
  assert.equal(stored.wallpaper, wallpaper, "Wallpaper applies as soon as it is read");
  await click(button("清除壁纸")); assert.equal(stored.wallpaper, undefined);
  await chooseFile(); await act(async () => { readers[2].result = wallpaper; readers[2].onload(); });
  await change(input("字体大小"), "25");
  await click(container.querySelector('[aria-label="关闭美化"]')); assert.ok(closed);
  await reopen();
  assert.equal(stored.wallpaper, wallpaper); assert.equal(stored.theme, "night");
  assert.equal(input("字体大小").getAttribute("value"), "14", "Closing discards unsaved basic appearance");
  assert.match(input("剧情自定义 CSS").value, /letter-spacing/);
  await click(button("重置基础美化"));
  assert.equal(stored.appearance.messageGap, 32, "Reset remains a draft until Apply");
  await click(button("保存并应用")); assert.equal(stored.appearance, undefined);
  assert.equal(stored.wallpaper, wallpaper); assert.equal(stored.theme, "night"); assert.match(storedCSS, /letter-spacing/);
  await click(button("清除 CSS")); assert.equal(storedCSS, "");
  await click(button("加载白色基础模板")); assert.ok(storedCSS.length > 100);
  assert.ok(settingsPatches.every(patch => !("appearance" in patch)), "Instant patches never include basic appearance");
  await click(button("自动")); assert.equal(stored.readingPanel, "auto");
  assert.ok(input("字体大小"), "Wallpaper in auto mode hides the reader");
  await click(button("清除壁纸")); assert.equal(input("字体大小"), undefined);
  await click(button("恢复两栏默认设置"));
  demo = container.querySelector(".story-beautify-preview");
  assert.equal(stored.chrome, undefined); assert.equal(demo.getAttribute("data-story-controls-color"), null);
  const cssExample = require(path.join(root, "lib/css-examples.ts")).STORY_CSS_EXAMPLE;
  const { scopeSessionCSS } = require(path.join(root, "lib/css-scoper.ts"));
  const postcss = require("postcss");
  // Parse both the white base and every optional block enabled together, without fetching images.
  postcss.parse(scopeSessionCSS(cssExample, ".test-story"));
  const optionalCSS = [...cssExample.matchAll(/\/\*([\s\S]*?)\*\//g)].map(match => {
    const lines = match[1].split("\n");
    const start = lines.findIndex(line => /^\s*(?:[.:@#]|button\[)/.test(line));
    return start < 0 ? "" : lines.slice(start).join("\n");
  }).join("\n");
  const allScoped = scopeSessionCSS(optionalCSS, ".test-story");
  postcss.parse(allScoped);
  assert.match(allScoped, /\.test-story \.story-header/);
  assert.match(allScoped, /data-story-action="send"/);
  assert.match(cssExample, /白色基础模板/); assert.match(cssExample, /pointer-events: none/);
  assert.ok(!/url\(/.test(cssExample.replace(/\/\*[\s\S]*?\*\//g, "")), "White base never fetches placeholder images or fonts");
  const style = postcss.parse(fs.readFileSync(path.join(root, "styles/story-appearance.css"), "utf8"));
  const matching = (element, property) => {
    let found = false;
    style.walkRules(rule => { if (!rule.nodes.some(node => node.prop === property && node.value.includes("--story-controls-"))) return;
      if (!rule.selector || rule.selector.includes("::")) return; if (!element.matches(rule.selector)) return;
      rule.walkDecls(property, declaration => { if (declaration.value.includes("--story-controls-")) found = true; }); });
    return found;
  };
  await change(input("两栏文字与图标颜色"), "#778899"); await change(input("两栏按钮透明度"), "20");
  assert.ok(matching(demo.querySelector(".story-header button"), "color"));
  assert.ok(matching(demo.querySelector(".story-composer button"), "color"));
  assert.ok(matching(demo.querySelector(".story-header button"), "opacity"));
  assert.ok(matching(demo.querySelector(".story-composer button"), "opacity"));
  const source = fs.readFileSync(path.join(root, "components/story/story-app-base.tsx"), "utf8");
  for (const action of ["back", "new", "beautify", "settings", "voice", "continue", "quick-input", "auto-read", "current-read", "send"]) assert.ok(source.includes('data-story-action="' + action + '"'), action + " has a stable template selector");
  assert.ok(source.includes('storyMessageAppearanceAttributes(uiPrefs, message.role)'));
  assert.ok(source.includes('storyMessageAppearanceAttributes(uiPrefs, "assistant")'));
  assert.ok(source.includes('appearancePrefs={uiPrefs}'));
  const callsBeforeClose = settingsPatches.length;
  await chooseFile(); await act(async () => renderer.unmount());
  await act(async () => { readers[3].result = "late"; readers[3].onload(); });
  assert.equal(settingsPatches.length, callsBeforeClose, "Late wallpaper reads cannot save after closing");
  console.log("✅ 剧情美化：双方/独立设置、三种头像布局、两栏统一配色透明度与头像隐藏、即时保存/基础应用不关闭、恢复重置、完整白色模板与稳定按钮选择器；无 API 调用");
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
