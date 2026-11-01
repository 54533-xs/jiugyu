// Focused regressions for account nicknames, shared memory and message indexing.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const empty = () => [];
const fallback = new Proxy({}, { get: () => empty });
function load(file, dependencies = {}, browser) {
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(source, {
        module, exports: module.exports,
        require: name => dependencies[name] || fallback,
        window: browser, console, setTimeout, clearTimeout,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    }, { filename: file });
    return module.exports;
}

async function main() {
    const kv = new Map();
    const accounts = load("lib/chat-alt-account-storage.ts", {
        "./kv-db": { kvGet: key => kv.get(key), kvSet: (key, value) => kv.set(key, value), registerKvMigration() {} },
    }, { dispatchEvent() {} });
    const account = accounts.createChatAltAccount({ userIdentityId: "main-persona", nickname: "小林", gender: "", age: "", signature: "摄影师" });
    accounts.updateChatAltAccount(account.id, { nickname: "更新昵称" });
    assert.equal(accounts.findChatAltAccount(account.id).nickname, "更新昵称");
    accounts.updateChatAltAccount(account.id, { nickname: "小林" });
    accounts.deleteChatAltAccount(account.id);
    assert.ok(accounts.findChatAltAccount(account.id).deletedAt);
    // Deleted identities remain resolvable for historical memory.
    kv.set("ai_phone_chat_alt_accounts_v1", JSON.stringify([{ ...accounts.findChatAltAccount(account.id), id: "alt" }]));
    const identity = accounts.resolveChatAltAccountIdentity("alt");
    assert.equal(identity.name, "小林");
    assert.equal(identity.bio, "摄影师");
    assert.equal(identity.customSettings, "");
    assert.ok(!JSON.stringify(identity).includes("主号"));

    const sessions = [{ id: "main-chat", contactId: "char" }, { id: "alt-chat", contactId: "char", chatAccountId: "alt" }];
    const messages = [
        { id: "a", sessionId: "main-chat", role: "user", content: "主号的约定", createdAt: "2026-01-01" },
        { id: "b", sessionId: "alt-chat", role: "user", content: "小林的约定", createdAt: "2026-01-02" },
        { id: "c", sessionId: "alt-chat", role: "user", senderName: "旧昵称", content: "改名前的约定", createdAt: "2026-01-03" },
    ];
    const assembler = load("lib/short-term-assembler.ts", {
        "./chat-storage": {
            loadChatSessions: () => sessions,
            loadChatMessages: id => messages.filter(message => message.sessionId === id),
            isSystemInstructionMessage: () => false,
        },
        "./character-storage": { loadCharacters: () => [{ id: "char", name: "角色" }] },
        "./settings-storage": { resolveUserIdentity: () => ({ name: "简初" }) },
        "./chat-scope-storage": { resolveChatAccountUserIdentity: id => id ? identity : { name: "简初" } },
        "./prompt-sanitizer": { stripStateAndInnerForPrompt: text => text },
        "./prompt-time": { resolvePromptTimeAware: () => false, formatPromptEventLabel: label => `[${label}]` },
        "./kv-db": { kvGet: key => kv.get(key), registerDynamicPrefix() {} },
        "./memory-storage": { loadMemoryConfig: () => ({ shortTermTokenBudget: 10000 }) },
        "./token-counter": { estimateTokens: text => text.length },
    }, { dispatchEvent() {} });
    const timeline = assembler.loadNativeTimeline("char");
    assert.equal(timeline.length, 3);
    assert.match(timeline[0].content, /简初: 主号的约定/);
    assert.match(timeline[1].content, /小林: 小林的约定/);
    assert.match(timeline[2].content, /旧昵称: 改名前的约定/);
    assert.equal(timeline[1].chatAccountId, "alt");
    assert.equal(assembler.loadNativeTimeline("char", { chatAccountId: null }).length, 1);
    assert.equal(assembler.loadNativeTimeline("char", { excludeChatSessionId: "alt-chat" }).length, 1);
    kv.set("ai_phone_hidden_short_term_memory:char", JSON.stringify(["chat:direct::::a"]));
    assert.equal(assembler.loadNativeTimeline("char").length, 2, "Legacy hidden memory must stay hidden");
    kv.delete("ai_phone_hidden_short_term_memory:char");
    for (let i = 0; i < 350; i++) messages.push({ ...messages[1], id: `bulk-${i}` });
    let yielded = false;
    setTimeout(() => { yielded = true; }, 0);
    const asyncTimeline = await assembler.loadNativeTimelineAsync("char");
    assert.ok(yielded, "Large timelines must release the event loop");
    assert.equal(JSON.stringify(asyncTimeline), JSON.stringify(assembler.loadNativeTimeline("char")));
    const prepared = assembler.prepareShortTermContext("char", "chat", { timeline, history: [], excludeChatSessionId: "main-chat" });
    assert.ok(prepared.recentBlocks.some(block => block.content.includes("小林的约定")));

    const storage = load("lib/chat-storage.ts", {
        "./chat-scope-storage": { loadChatScope: () => ({ chatAccountId: null }), resolveChatAccountUserIdentity: () => ({ name: "简初" }) },
        "./chat-plugin-hooks": { runChatPluginTransformSync: (_event, payload) => payload, emitChatPluginEvent() {} },
    }, undefined);
    // No browser prevents database side effects; mutations still exercise the real cache.
    const first = storage.pushChatMessage({ sessionId: "one", role: "user", content: "original" });
    storage.pushChatMessage({ sessionId: "two", role: "user", content: "other" });
    assert.equal(storage.loadChatMessages("one").length, 1);
    storage.editChatMessage(first.id, "edited");
    assert.equal(storage.loadChatMessages("one")[0].content, "edited");
    storage.pushChatMessage({ sessionId: "one", role: "user", content: "next" });
    assert.equal(storage.loadChatMessages("one").length, 2);
    storage.clearChatSessionMessages("one");
    assert.equal(storage.loadChatMessages("one").length, 0);
    assert.equal(storage.loadChatMessages("two").length, 1);
    console.log("✅ 身份昵称、跨身份记忆、异步让出与会话索引回归通过");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
