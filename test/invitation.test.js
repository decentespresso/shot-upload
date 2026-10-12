const assert = require("node:assert/strict");
const test = require("node:test");
const { loadPlugin, pump, shot } = require("./helpers");

const status = async (harness) => {
  const response = await harness.plugin.__httpRequestHandler({ endpoint: "status", method: "GET" });
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
};

test("first-use invitation state loads without enabling uploads", async () => {
  const harness = loadPlugin({ settings: {}, shots: [shot("shot-1")] });
  const result = await status(harness);
  assert.equal(result.invitationSeen, false);
  assert.equal(result.autoUpload, false);
  assert.equal(harness.proxyCalls.length, 0);
  assert.equal(harness.invitationStorage.size, 0);
  harness.plugin.onUnload();
});

test("acknowledging either choice persists without enabling or reloading", async () => {
  const invitationStorage = new Map();
  const harness = loadPlugin({ settings: {}, invitationStorage });
  const response = await harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(invitationStorage.get("uploadInvitationSeen").uploadInvitationSeen, true);
  assert.equal((await status(harness)).autoUpload, false);
  assert.equal(harness.proxyCalls.length, 0);
  assert.equal(harness.fetches.some((url) => url.endsWith("/settings")), false);
  harness.plugin.onUnload();

  const restarted = loadPlugin({ settings: {}, invitationStorage });
  assert.equal((await status(restarted)).invitationSeen, true);
  restarted.plugin.onUnload();
});

test("GET cannot acknowledge an invitation or upload a shot", async () => {
  const harness = loadPlugin({ settings: {}, shots: [shot("shot-1")] });
  for (const endpoint of ["invitation", "upload"]) {
    const response = await harness.plugin.__httpRequestHandler({ endpoint, method: "GET" });
    assert.equal(response.status, 405);
  }
  assert.equal(harness.invitationStorage.size, 0);
  assert.equal(harness.proxyCalls.length, 0);
  harness.plugin.onUnload();
});

test("existing automatic uploads remain enabled", async () => {
  const harness = loadPlugin({ settings: { AutoUpload: true }, shots: [shot("shot-1")] });
  assert.equal((await status(harness)).autoUpload, true);
  harness.plugin.onEvent({ name: "shotStored", payload: { id: "shot-1" } });
  await pump();
  assert.equal(harness.proxyCalls.length, 1);
  assert.equal(harness.proxyCalls[0].options.gzip, true);
  harness.plugin.onUnload();
});

test("existing opt-in is remembered after uploads are later disabled", async () => {
  const invitationStorage = new Map();
  const enabled = loadPlugin({ settings: { AutoUpload: true }, invitationStorage });
  assert.equal((await status(enabled)).invitationSeen, true);
  enabled.plugin.onUnload();
  const disabled = loadPlugin({ settings: {}, invitationStorage });
  assert.equal((await status(disabled)).invitationSeen, true);
  assert.equal((await status(disabled)).autoUpload, false);
  disabled.plugin.onUnload();
});

test("storage reads have a five-second deadline", async () => {
  const harness = loadPlugin({ settings: {}, storageReadsAvailable: false });
  const pending = harness.plugin.__httpRequestHandler({ endpoint: "status", method: "GET" });
  await pump();
  assert.equal(await harness.runTimer(5000), true);
  assert.equal((await pending).status, 503);
  assert.equal(harness.proxyCalls.length, 0);
  harness.plugin.onUnload();
});

test("failed storage acknowledgement remains off and permits retry", async () => {
  const harness = loadPlugin({ settings: {}, storageWritesAvailable: false });
  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
    await pump();
    assert.equal(await harness.runTimer(5000), true);
    assert.equal((await pending).status, 503);
  }
  assert.equal((await status(harness)).invitationSeen, false);
  assert.equal((await status(harness)).autoUpload, false);
  assert.equal(harness.proxyCalls.length, 0);
  harness.plugin.onUnload();
});

test("unload retires pending acknowledgement and clears its deadline", async () => {
  const harness = loadPlugin({ settings: {}, storageWritesAvailable: false });
  const pending = harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
  await pump();
  harness.plugin.onUnload();
  assert.equal((await pending).status, 503);
  assert.equal(await harness.runTimer(5000), false);
});

test("manual upload requests host gzip without changing its JSON body", async () => {
  const harness = loadPlugin({ settings: {}, shots: [shot("shot-1")] });
  const response = await harness.plugin.__httpRequestHandler({ endpoint: "upload", method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(harness.proxyCalls[0].options.gzip, true);
  assert.equal(JSON.parse(harness.proxyCalls[0].options.body).id, "shot-1");
  harness.plugin.onUnload();
});

test("a late acknowledgement cannot complete a newer retry", async () => {
  const harness = loadPlugin({ settings: {}, storageWritesAvailable: false });
  const first = harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
  await pump();
  const stale = harness.storageCalls.find((call) => call.type === "write").data;
  await harness.runTimer(5000);
  assert.equal((await first).status, 503);
  const retry = harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
  let complete = false;
  retry.then(() => { complete = true; });
  harness.plugin.onEvent({ name: "storageWrite", payload: stale });
  await pump();
  assert.equal(complete, false);
  assert.equal((await status(harness)).invitationSeen, false);
  const current = harness.storageCalls.filter((call) => call.type === "write").at(-1).data;
  harness.plugin.onEvent({ name: "storageWrite", payload: current });
  assert.equal((await retry).status, 200);
  assert.equal((await status(harness)).invitationSeen, true);
  harness.plugin.onUnload();
});

test("concurrent acknowledgements share a single bounded write", async () => {
  const harness = loadPlugin({ settings: {}, storageWritesAvailable: false });
  const first = harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
  const second = harness.plugin.__httpRequestHandler({ endpoint: "invitation", method: "POST" });
  assert.equal(harness.storageCalls.filter((call) => call.type === "write").length, 1);
  await harness.runTimer(5000);
  assert.equal((await first).status, 503);
  assert.equal((await second).status, 503);
  harness.plugin.onUnload();
});

test("existing enabled users are not blocked by invitation storage failure", async () => {
  const harness = loadPlugin({ settings: { AutoUpload: true }, storageReadsAvailable: false });
  assert.equal((await status(harness)).autoUpload, true);
  assert.equal(await harness.runTimer(5000), false);
  harness.plugin.onUnload();
});
