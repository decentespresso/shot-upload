const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { pump } = require("./helpers");

function page({
  state = { autoUpload: false, invitationSeen: false },
  loggedIn = true,
  acknowledgementFails = false,
  settingsFail = false,
  saveThenFail = false,
  statusFails = false,
  uploadResult = { ok: true },
  beforeAcknowledgement,
} = {}) {
  const requests = [];
  const elements = new Map();
  let document;
  class Element {
    constructor(id) {
      this.id = id;
      this.listeners = {};
      this.children = [];
      this.open = false;
      this.disabled = false;
      this.checked = false;
      this.hidden = false;
      this.textContent = "";
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() { document.activeElement = this; }
  }
  document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element(id));
      return elements.get(id);
    },
    createElement(tag) { return new Element(tag); },
  };
  const context = vm.createContext({
    document,
    window: { addEventListener() {} },
    URL,
    async fetch(url, options = {}) {
      const request = { url, method: options.method || "GET", body: options.body && JSON.parse(options.body) };
      requests.push(request);
      let data;
      let status = 200;
      if (url.endsWith("/status")) {
        data = { recentUploads: [], ...state };
        if (statusFails) status = 503;
      }
      else if (url.endsWith("/account/decent")) data = { loggedIn };
      else if (url.endsWith("/invitation") && request.method === "POST") {
        if (beforeAcknowledgement) await beforeAcknowledgement();
        if (acknowledgementFails) { status = 503; data = { error: "Storage unavailable" }; }
        else { state.invitationSeen = true; data = { ok: true }; }
      } else if (url.endsWith("/settings") && request.method === "POST") {
        if (saveThenFail && request.body.AutoUpload) {
          state.autoUpload = true; status = 500; data = { error: "Reload failed" };
        } else if (settingsFail) { status = 500; data = { error: "Settings unavailable" }; }
        else { state.autoUpload = request.body.AutoUpload; data = { ok: true }; }
      } else if (url.endsWith("/upload") && request.method === "POST") {
        data = uploadResult;
      } else throw new Error(`Unexpected UI request: ${url}`);
      return { ok: status >= 200 && status < 300, status, json: async () => data };
    },
  });
  const html = fs.readFileSync(path.join(__dirname, "..", "src", "ui.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return {
    state, requests, elements, document,
    async act(id, event = "click") {
      const element = document.getElementById(id);
      return element.listeners[event]({ target: element, preventDefault() {} });
    },
  };
}

test("first visit invites upload without sending or enabling data", async () => {
  const harness = page();
  await pump();
  assert.equal(harness.elements.get("invitation").open, true);
  assert.equal(harness.state.autoUpload, false);
  assert.equal(harness.requests.some((request) => request.method === "POST"), false);
});

test("decline is remembered across page reloads and leaves uploads off", async () => {
  const state = { autoUpload: false, invitationSeen: false };
  const first = page({ state });
  await pump();
  await first.act("decline");
  assert.equal(state.invitationSeen, true);
  assert.equal(state.autoUpload, false);
  assert.equal(first.elements.get("invitation").open, false);
  assert.equal(first.requests.some((request) => request.url.endsWith("/settings")), false);
  const reopened = page({ state });
  await pump();
  assert.equal(reopened.elements.get("invitation").open, false);
});

test("accept acknowledges before changing AutoUpload and restores focus", async () => {
  const harness = page();
  await pump();
  await harness.act("enable");
  const writes = harness.requests.filter((request) => request.method === "POST");
  assert.equal(writes[0].url.endsWith("/invitation"), true);
  assert.equal(writes[1].url.endsWith("/settings"), true);
  assert.equal(writes[1].body.AutoUpload, true);
  assert.equal(harness.state.autoUpload, true);
  assert.equal(harness.elements.get("automatic").checked, true);
  assert.equal(harness.elements.get("invitation").open, false);
  assert.equal(harness.document.activeElement.id, "automatic");
});

test("Escape declines rather than enabling uploads", async () => {
  const harness = page();
  await pump();
  await harness.act("invitation", "cancel");
  assert.equal(harness.state.invitationSeen, true);
  assert.equal(harness.state.autoUpload, false);
});

test("existing enabled users see controls without another invitation", async () => {
  const harness = page({ state: { autoUpload: true, invitationSeen: false } });
  await pump();
  assert.equal(harness.elements.get("invitation").open, false);
  assert.equal(harness.elements.get("automatic").checked, true);
});

test("an unlinked account cannot enable uploads", async () => {
  const harness = page({ loggedIn: false });
  await pump();
  assert.equal(harness.elements.get("enable").disabled, true);
  await harness.act("enable");
  assert.equal(harness.state.autoUpload, false);
  assert.equal(harness.requests.some((request) => request.method === "POST"), false);
});

test("declining while unlinked restores focus to an enabled control", async () => {
  const harness = page({ loggedIn: false });
  await pump();
  await harness.act("decline");
  assert.equal(harness.document.activeElement.id, "refresh");
  assert.equal(harness.state.autoUpload, false);
});

test("failed acknowledgement keeps the invitation open and uploads off", async () => {
  const harness = page({ acknowledgementFails: true });
  await pump();
  await harness.act("enable");
  assert.equal(harness.state.autoUpload, false);
  assert.equal(harness.elements.get("invitation").open, true);
  assert.equal(harness.requests.some((request) => request.url.endsWith("/settings")), false);
  assert.notEqual(harness.elements.get("invitationError").textContent, "");
});

test("failed settings save does not report uploads enabled", async () => {
  const harness = page({ settingsFail: true });
  await pump();
  await harness.act("enable");
  assert.equal(harness.state.autoUpload, false);
  assert.equal(harness.elements.get("automatic").checked, false);
  assert.notEqual(harness.elements.get("error").textContent, "");
});

test("users can enable after decline and disable without a linked account", async () => {
  const state = { autoUpload: false, invitationSeen: true };
  const harness = page({ state });
  await pump();
  harness.elements.get("automatic").checked = true;
  await harness.act("automatic", "change");
  assert.equal(state.autoUpload, true);
  const unlinked = page({ state, loggedIn: false });
  await pump();
  assert.equal(unlinked.elements.get("automatic").disabled, false);
  unlinked.elements.get("automatic").checked = false;
  await unlinked.act("automatic", "change");
  assert.equal(state.autoUpload, false);
});

test("duplicate clicks cannot submit the invitation twice", async () => {
  let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const harness = page({ beforeAcknowledgement: () => waiting });
  await pump();
  const first = harness.act("enable");
  await pump();
  await harness.act("enable");
  assert.equal(harness.requests.filter((request) => request.url.endsWith("/invitation")).length, 1);
  finish();
  await first;
});

test("a settings save that persists before failing is rolled back off", async () => {
  const harness = page({ saveThenFail: true });
  await pump();
  await harness.act("enable");
  assert.equal(harness.state.autoUpload, false);
  assert.equal(harness.elements.get("automatic").checked, false);
  assert.equal(harness.requests.at(-1).body.AutoUpload, false);
  assert.notEqual(harness.elements.get("error").textContent, "");
});

test("status storage failure leaves all upload actions disabled", async () => {
  const harness = page({ statusFails: true });
  await pump();
  assert.equal(harness.elements.get("automatic").disabled, true);
  assert.equal(harness.elements.get("upload").disabled, true);
  assert.equal(harness.elements.get("refresh").disabled, false);
  assert.equal(harness.requests.some((request) => request.method === "POST"), false);
});

test("manual upload is an explicit POST and leaves automatic uploads off", async () => {
  const harness = page({ state: { autoUpload: false, invitationSeen: true } });
  await pump();
  assert.equal(harness.requests.some((request) => request.url.endsWith("/upload")), false);
  await harness.act("upload");
  assert.equal(harness.requests.filter((request) => request.url.endsWith("/upload") && request.method === "POST").length, 1);
  assert.equal(harness.state.autoUpload, false);
  assert.equal(harness.elements.get("result").textContent, "Shot uploaded.");
});

test("recent upload labels remain text and links stay on Decent HTTPS", async () => {
  const harness = page({ state: {
    autoUpload: false, invitationSeen: true,
    recentUploads: [
      { title: "<script>alert(1)</script>", url: "javascript:alert(1)" },
      { title: "External", url: "https://decentespresso.com.evil.example/shot" },
      { title: "Uploaded", url: "https://decentespresso.com/support/espressomachine?id=1" },
    ],
  } });
  await pump();
  const rows = harness.elements.get("recent").children;
  assert.equal(rows[0].children[0].textContent, "<script>alert(1)</script>");
  assert.equal(rows[0].children[0].href, undefined);
  assert.equal(rows[1].children[0].href, undefined);
  assert.equal(rows[2].children[0].href, "https://decentespresso.com/support/espressomachine?id=1");
});
