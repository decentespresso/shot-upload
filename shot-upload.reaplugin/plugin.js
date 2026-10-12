const SHOT_UPLOAD_UI = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Shot uploads</title>\n  <style>\n    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; background: #f4f5f6; color: #202326; }\n    * { box-sizing: border-box; }\n    body { margin: 0; padding: 24px; }\n    main { max-width: 760px; margin: auto; }\n    header { border-bottom: 1px solid #cdd1d4; padding-bottom: 20px; }\n    h1 { margin: 0 0 12px; font-size: 28px; }\n    h2 { margin: 0 0 16px; font-size: 20px; }\n    p { line-height: 1.5; }\n    section { padding: 24px 0; border-bottom: 1px solid #cdd1d4; }\n    label { display: flex; align-items: center; gap: 12px; min-height: 44px; font-weight: 600; }\n    input { width: 20px; height: 20px; flex: none; accent-color: #007f68; }\n    button { font: inherit; min-height: 44px; padding: 10px 16px; border: 1px solid #a9b0b5; border-radius: 6px; background: #fff; color: #202326; cursor: pointer; }\n    button.primary { background: #007661; color: #fff; border-color: #007661; }\n    button:disabled { opacity: .5; cursor: default; }\n    :focus-visible { outline: 3px solid #2772cc; outline-offset: 3px; }\n    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }\n    .muted { color: #535d64; }\n    .error { color: #b3261e; }\n    .error:empty { display: none; }\n    #account { margin: 0; }\n    #result { min-height: 24px; }\n    ul { list-style: none; padding: 0; margin: 0; }\n    li { padding: 16px 0; border-top: 1px solid #cdd1d4; }\n    li:first-child { border-top: 0; }\n    a { color: #1762a8; overflow-wrap: anywhere; }\n    .meta { margin-top: 6px; color: #535d64; font-size: 14px; overflow-wrap: anywhere; }\n    dialog { max-width: 500px; width: calc(100% - 32px); max-height: calc(100% - 32px); padding: 24px; border: 1px solid #a9b0b5; border-radius: 8px; background: #fff; color: #202326; }\n    dialog::backdrop { background: rgb(0 0 0 / .45); }\n    dialog h2 { font-size: 22px; }\n    dialog p { margin-bottom: 0; }\n    @media (max-width: 420px) { body { padding: 16px; } dialog { padding: 20px; } .actions button { flex: 1 1 auto; } }\n    @media (prefers-color-scheme: dark) {\n      :root { background: #181b1d; color: #edf0f1; }\n      header, section, li { border-color: #42494e; }\n      button, dialog { background: #262b2e; color: #edf0f1; border-color: #69747c; }\n      .muted, .meta { color: #b7c0c6; }\n      .error { color: #ffb4ab; }\n      a { color: #8bbffc; }\n    }\n  </style>\n</head>\n<body>\n  <main>\n    <header>\n      <h1>Shot uploads</h1>\n      <p id=\"account\" role=\"status\">Checking Decent account...</p>\n      <p id=\"accountHelp\" class=\"muted\" hidden>Link your account in Decaid's native Account settings to enable uploads.</p>\n    </header>\n    <section aria-label=\"Upload controls\">\n      <label for=\"automatic\"><input id=\"automatic\" type=\"checkbox\" disabled>Upload shots automatically</label>\n      <div class=\"actions\">\n        <button id=\"upload\" class=\"primary\" type=\"button\" disabled>Upload latest shot</button>\n        <button id=\"refresh\" type=\"button\">Refresh</button>\n      </div>\n      <p id=\"result\" role=\"status\"></p>\n      <p id=\"error\" class=\"error\" role=\"alert\"></p>\n    </section>\n    <section aria-labelledby=\"recentHeading\">\n      <h2 id=\"recentHeading\">Recent uploads</h2>\n      <ul id=\"recent\"><li class=\"muted\">Loading...</li></ul>\n    </section>\n  </main>\n  <dialog id=\"invitation\" aria-labelledby=\"invitationTitle\" aria-describedby=\"invitationDescription\">\n    <h2 id=\"invitationTitle\">Upload your shot data to Decent?</h2>\n    <p id=\"invitationDescription\">Upload shot measurements, profiles, machine and equipment details, and annotations to your linked Decent account for shot history and Decent's shot analysis. This includes eligible saved shots.</p>\n    <p id=\"invitationAccount\" class=\"muted\" hidden>Link your account in Decaid's native Account settings to enable uploads.</p>\n    <p id=\"invitationError\" class=\"error\" role=\"alert\"></p>\n    <div class=\"actions\">\n      <button id=\"decline\" type=\"button\" autofocus>No thanks</button>\n      <button id=\"enable\" class=\"primary\" type=\"button\">Enable uploads</button>\n    </div>\n  </dialog>\n  <script>\n    \"use strict\";\n    const base = \"/api/v1/plugins/shot-upload.reaplugin\";\n    const element = (id) => document.getElementById(id);\n    const automatic = element(\"automatic\");\n    const invitation = element(\"invitation\");\n    let state = { autoUpload: false, invitationSeen: false };\n    let loggedIn = false;\n    let ready = false;\n    let busy = false;\n    let returnFocus = automatic;\n\n    async function request(url, body) {\n      const response = await fetch(url, body === undefined ? {} : {\n        method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify(body),\n      });\n      if (!response.ok) throw new Error(\"Could not save or load upload settings. Try again.\");\n      return response.json();\n    }\n\n    function setBusy(value) {\n      busy = value;\n      automatic.disabled = busy || !ready || (!loggedIn && !state.autoUpload);\n      element(\"enable\").disabled = busy || !ready || !loggedIn;\n      element(\"decline\").disabled = busy;\n      element(\"upload\").disabled = busy || !ready || !loggedIn;\n      element(\"refresh\").disabled = busy;\n    }\n\n    function recentUploads(shots) {\n      const rows = (Array.isArray(shots) ? shots : []).map((shot) => {\n        const row = document.createElement(\"li\");\n        let url;\n        try {\n          const candidate = new URL(shot.url);\n          if (candidate.protocol === \"https:\" && candidate.hostname === \"decentespresso.com\" && !candidate.username && !candidate.password) url = candidate.href;\n        } catch (error) {}\n        const label = document.createElement(url ? \"a\" : \"span\");\n        label.textContent = shot.title || shot.id || \"Shot\";\n        if (url) { label.href = url; label.target = \"_blank\"; label.rel = \"noopener noreferrer\"; }\n        row.appendChild(label);\n        const meta = document.createElement(\"div\");\n        meta.className = \"meta\";\n        const date = new Date(shot.ts);\n        meta.textContent = [shot.sn ? `SN ${shot.sn}` : \"\", Number.isFinite(date.getTime()) ? date.toLocaleString() : \"\"].filter(Boolean).join(\" | \");\n        row.appendChild(meta);\n        return row;\n      });\n      if (!rows.length) {\n        const row = document.createElement(\"li\");\n        row.textContent = \"No shots uploaded yet.\";\n        row.className = \"muted\";\n        rows.push(row);\n      }\n      element(\"recent\").replaceChildren(...rows);\n    }\n\n    async function refresh() {\n      if (busy) return;\n      let openInvitation = false;\n      setBusy(true);\n      element(\"error\").textContent = \"\";\n      try {\n        const [status, account] = await Promise.all([request(`${base}/status`), request(\"/api/v1/account/decent\")]);\n        state = status;\n        loggedIn = account.loggedIn === true;\n        ready = true;\n        automatic.checked = state.autoUpload === true;\n        element(\"account\").textContent = loggedIn ? \"Decent account linked\" : \"Decent account not linked\";\n        element(\"accountHelp\").hidden = loggedIn;\n        element(\"invitationAccount\").hidden = loggedIn;\n        recentUploads(status.recentUploads);\n        if (!state.autoUpload && !state.invitationSeen && !invitation.open) {\n          const active = document.activeElement;\n          returnFocus = active && active !== document.body ? active : automatic;\n          openInvitation = true;\n        }\n      } catch (error) {\n        ready = false;\n        element(\"error\").textContent = \"Could not load upload status. Refresh to retry.\";\n      } finally {\n        setBusy(false);\n        if (openInvitation) {\n          invitation.showModal();\n          element(\"decline\").focus();\n        }\n      }\n    }\n\n    async function acknowledge() {\n      if (state.invitationSeen) return;\n      await request(`${base}/invitation`, {});\n      state = { ...state, invitationSeen: true };\n    }\n\n    async function saveAutomatic(enabled) {\n      try {\n        await request(`${base}/settings`, { AutoUpload: enabled });\n      } catch (error) {\n        if (enabled) {\n          try { await request(`${base}/settings`, { AutoUpload: false }); } catch (rollbackError) {\n            throw new Error(\"Upload settings could not be confirmed. Turn off automatic uploads in Decaid's native plugin settings before retrying.\");\n          }\n        }\n        throw error;\n      }\n      state = { ...state, autoUpload: enabled };\n      automatic.checked = enabled;\n    }\n\n    async function answerInvitation(enabled) {\n      if (busy || (enabled && (!ready || !loggedIn))) return;\n      setBusy(true);\n      element(\"invitationError\").textContent = \"\";\n      element(\"error\").textContent = \"\";\n      try {\n        await acknowledge();\n        if (enabled) await saveAutomatic(true);\n        invitation.close();\n      } catch (error) {\n        element(\"invitationError\").textContent = error.message;\n        element(\"error\").textContent = error.message;\n        automatic.checked = state.autoUpload === true;\n      } finally {\n        setBusy(false);\n        if (!invitation.open) (returnFocus.disabled ? element(\"refresh\") : returnFocus).focus();\n      }\n    }\n\n    automatic.addEventListener(\"change\", async () => {\n      const enabled = automatic.checked;\n      automatic.checked = state.autoUpload === true;\n      if (busy || !ready || (enabled && !loggedIn)) return;\n      setBusy(true);\n      element(\"error\").textContent = \"\";\n      try {\n        if (enabled) await acknowledge();\n        await saveAutomatic(enabled);\n      } catch (error) {\n        element(\"error\").textContent = error.message;\n      } finally {\n        automatic.checked = state.autoUpload === true;\n        setBusy(false);\n      }\n    });\n    element(\"decline\").addEventListener(\"click\", () => answerInvitation(false));\n    element(\"enable\").addEventListener(\"click\", () => answerInvitation(true));\n    invitation.addEventListener(\"cancel\", (event) => {\n      event.preventDefault();\n      return answerInvitation(false);\n    });\n    element(\"refresh\").addEventListener(\"click\", refresh);\n    element(\"upload\").addEventListener(\"click\", async () => {\n      if (busy || !ready || !loggedIn) return;\n      setBusy(true);\n      element(\"error\").textContent = \"\";\n      element(\"result\").textContent = \"Uploading...\";\n      try {\n        const result = await request(`${base}/upload`, {});\n        element(\"result\").textContent = result.ok ? \"Shot uploaded.\" : \"Shot not uploaded.\";\n        if (!result.ok) element(\"error\").textContent = result.error || \"No eligible shot available.\";\n      } catch (error) {\n        element(\"result\").textContent = \"\";\n        element(\"error\").textContent = \"Upload failed. Try again.\";\n      } finally {\n        setBusy(false);\n      }\n      await refresh();\n    });\n    refresh();\n  </script>\n</body>\n</html>\n";

/* shot-upload.reaplugin
 *
 * Uploads finished espresso shots to the user's Decent account at
 * decentespresso.com (POST support/api/shot_upload) through the authenticated
 * Decent proxy, reusing the account the user is already logged into. The proxy
 * attaches the account credentials in Dart and never exposes them to plugin JS;
 * the server verifies the account and that the captured machine's serial
 * belongs to it, then stores the shot.
 *
 * Opt-in: AutoUpload defaults to FALSE, so nothing is uploaded until the user
 * turns it on.
 *
 * The upload binds to the exact persisted shot via the `shotStored` event (fired
 * with the shot id after persistence), so there is no timer/`/shots/latest`
 * race, and machine identity is captured at shot start.
 *
 * Contract: must define createPlugin(host) returning {id, version, onLoad,
 * onUnload, onEvent}.
 */

function createPlugin(host) {
  "use strict";

  const NS = "shot-upload.reaplugin";
  const VERSION = "0.2.3";
  const LOCAL_API_URL = "http://localhost:8080/api/v1";
  const UPLOAD_PATH = "support/api/shot_upload"; // exact allowlisted proxy write path
  // Web view of an uploaded shot in the user's Decent account. The server returns
  // the stored shot id; combined with the machine serial it addresses the shot on
  // decentespresso.com. e.g. .../espressomachine?view=chart&sn=6262&id=<id>
  const SHOT_VIEW_BASE = "https://decentespresso.com/support/espressomachine";
  const RECENT_MAX = 10; // keep links to the most recent N uploads
  const RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const RECONCILE_PAGE_SIZE = 20;
  const RECONCILE_PAGE_LIMIT = 5;
  const RECONCILE_BATCH_SIZE = 5;
  const RECONCILE_PERIOD_MS = 5 * 60 * 1000;
  const RECONCILE_RETRY_MS = 60 * 1000;
  const RECONCILE_CONTINUE_MS = 30 * 1000;
  const SAFE_MACHINE_STATES = new Set(["idle", "schedIdle", "sleeping"]);
  const INVITATION_KEY = "uploadInvitationSeen";
  const invitationOperations = new Map();
  let invitationSeen = null;

  let isUploading = false;
  let isReconciling = false;
  let pendingLiveShots = [];
  const remotelyPostedShotIds = new Set();
  const permanentlyRejectedShotIds = new Set();
  let uploadedMachinesByShotId = new Map();
  let uploadedRevisionsByShotId = new Map();
  let pendingReplacementShotIds = new Set();
  let reconcileTimerId = null;
  let reconciliationPausedForConsent = false;
  let unloaded = false;
  let decaidVersion = null;

  const state = {
    autoUpload: false, // opt-in; see header
    lengthThreshold: 5,
    lastUploadedShot: null,
    lastResult: null,
    lastUrl: null,
    recentUploads: [], // [{id, localId, sn, url, title, ts}], newest first, max RECENT_MAX
    reconcileOffset: 0,
    machineState: null,
  };

  function log(msg) { try { host.log(`[shot-upload] ${msg}`); } catch (e) {} }

  // Web URL for a shot the server stored, e.g.
  // https://decentespresso.com/support/espressomachine?view=chart&sn=6262&id=<id>
  function shotUrl(sn, id) {
    if (!sn || !id) return null;
    return `${SHOT_VIEW_BASE}?view=chart&sn=${encodeURIComponent(sn)}&id=${encodeURIComponent(id)}`;
  }

  // Prepend an upload to the recent list (dedup by shot id), cap at RECENT_MAX,
  // and persist it so the links survive a restart.
  function recordRecentUpload(entry) {
    state.recentUploads = [entry, ...state.recentUploads.filter((e) => e && e.id !== entry.id)].slice(0, RECENT_MAX);
    try { host.storage({ type: "write", key: "recentUploads", data: state.recentUploads }); } catch (e) {}
  }

  async function fetchLocal(path) {
    const res = await fetch(`${LOCAL_API_URL}${path}`);
    if (!res.ok) { log(`local ${path} -> ${res.status}`); return null; }
    return await res.json();
  }

  async function updateShotExtras(shotId, extras) {
    const res = await fetch(`${LOCAL_API_URL}/shots/${shotId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations: { extras: extras } }),
    });
    if (!res || !res.ok) throw new Error(`mark ${shotId} -> HTTP ${res && res.status}`);
  }

  async function markUploaded(shotId) {
    try {
      await updateShotExtras(shotId, {
        uploaded_to_decent: Math.floor(Date.now() / 1000),
        decent_upload_rejected: null,
      });
    } catch (e) {
      log(`could not mark ${shotId} uploaded: ${e.message}`);
    }
  }

  async function markRejected(shotId, error) {
    try {
      await updateShotExtras(shotId, {
        decent_upload_rejected: {
          status: error.status,
          timestamp: Math.floor(Date.now() / 1000),
          ...(error.updatedAt ? { updatedAt: error.updatedAt } : {}),
        },
      });
    } catch (e) {
      log(`could not mark ${shotId} rejected: ${e.message}`);
    }
  }

  // Decaid app version (for provenance), cached.
  async function getDecaidVersion() {
    if (decaidVersion) return decaidVersion;
    const info = await fetchLocal("/info");
    decaidVersion = (info && (info.version || info.fullVersion)) || "unknown";
    return decaidVersion;
  }

  // seconds between first and last measurement
  function shotDuration(shot) {
    const m = shot && shot.measurements;
    if (!m || m.length < 2) return 0;
    const t0 = Date.parse(m[0].machine.timestamp);
    const t1 = Date.parse(m[m.length - 1].machine.timestamp);
    return isNaN(t0) || isNaN(t1) ? 0 : (t1 - t0) / 1000;
  }

  function capturedMachine(shot) {
    const machine = shot && shot.workflow && shot.workflow.machine;
    if (!machine || !machine.serialNumber || /^mock/i.test(String(machine.serialNumber))) return null;
    return {
      serialNumber: String(machine.serialNumber),
      ...(machine.firmwareVersion ? { firmwareVersion: String(machine.firmwareVersion) } : {}),
      ...(machine.model ? { model: String(machine.model) } : {}),
    };
  }

  function recordUploadedMachine(shotId, machine) {
    uploadedMachinesByShotId = new Map([...uploadedMachinesByShotId, [shotId, { ...machine }]]);
    try { host.storage({ type: "write", key: "uploadedMachines", data: Object.fromEntries(uploadedMachinesByShotId) }); } catch (e) {}
  }

  function recordUploadedRevision(shot) {
    if (!shot || typeof shot.updatedAt !== "string" || !shot.updatedAt) return;
    uploadedRevisionsByShotId = new Map([...uploadedRevisionsByShotId, [shot.id, shot.updatedAt]]);
    try { host.storage({ type: "write", key: "uploadedRevisions", data: Object.fromEntries(uploadedRevisionsByShotId) }); } catch (e) {}
  }

  async function withMachine(shot, manualRetry, replacementMachine) {
    const captured = shot && shot.workflow && shot.workflow.machine;
    let machine = capturedMachine(shot);
    if (captured && captured.serialNumber && !machine) return null;
    const hasProvenanceStatus = captured && Object.prototype.hasOwnProperty.call(captured, "provenanceStatus");
    if (hasProvenanceStatus) {
      if (captured.provenanceStatus === "captured" && !machine) return null;
      if (captured.provenanceStatus === "unavailable") {
        if (replacementMachine !== undefined) machine = replacementMachine;
        else {
          if (!manualRetry) return null;
          machine = null;
        }
      } else if (captured.provenanceStatus !== "captured") {
        return null;
      }
    }
    if (!machine && replacementMachine !== undefined) {
      if (!replacementMachine) return null;
      machine = replacementMachine;
    }
    if (!machine) {
      const current = await fetchLocal("/machine/info");
      if (!current || !current.serialNumber || /^mock/i.test(String(current.serialNumber))) return null;
      machine = {
        serialNumber: String(current.serialNumber),
        ...(current.version ? { firmwareVersion: String(current.version) } : {}),
        ...(current.model ? { model: String(current.model) } : {}),
      };
    }
    if (!machine) return null;
    return {
      ...shot,
      machine: machine,
      app: { name: "decaid", version: await getDecaidVersion(), sourceFormat: "decaid" },
      schemaVersion: 1,
    };
  }

  // POST the shot through the authenticated Decent proxy (reuses account login).
  async function postShot(shot, replace) {
    const body = JSON.stringify(shot);
    let lastErr = null;
    for (let i = 0; i < RETRIES; i++) {
      if (unloaded || ((isUploading || isReconciling) && !state.autoUpload)) {
        throw skipped("automatic upload stopped");
      }
      if (isReconciling && !reconciliationIsSafe()) {
        throw skipped("machine is active");
      }
      try {
        const res = await host.decentProxy(UPLOAD_PATH, {
          method: "POST",
          query: replace ? { replace: "1" } : {},
          body: body,
          contentType: "application/json",
          gzip: true,
        });
        const status = res && res.status;
        const text = (res && res.body) || "";
        if (status >= 200 && status < 300) {
          try { return JSON.parse(text); } catch (e) { return { ok: true }; }
        }
        const error = new Error(`HTTP ${status}: ${text}`);
        error.status = status;
        error.permanent = status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 408 && status !== 429;
        if (error.permanent) {
          throw error;
        }
        lastErr = error;
      } catch (e) {
        lastErr = e;
        if (e.code === "account_consent_denied") {
          e.consent = true;
          throw e;
        }
        if (e.permanent) throw e;
      }
      if (i < RETRIES - 1) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
    }
    throw lastErr || new Error("upload failed");
  }

  function extrasFor(shot) {
    return shot && shot.annotations && shot.annotations.extras || {};
  }

  function skipped(message, terminal = false) {
    const error = new Error(message);
    error.skipped = true;
    error.terminal = terminal;
    return error;
  }

  async function uploadShot(shotId, { manualRetry = false, replace = false } = {}) {
    if (!replace && remotelyPostedShotIds.has(shotId)) throw skipped(`shot ${shotId} already uploaded`, true);
    if (!replace && !manualRetry && permanentlyRejectedShotIds.has(shotId)) throw skipped(`shot ${shotId} was rejected`, true);
    const full = await fetchLocal(`/shots/${shotId}`);
    if (!full || !full.id) throw skipped(`shot ${shotId} not found`, true);

    const extras = extrasFor(full);
    if (!replace && extras.uploaded_to_decent) throw skipped(`shot ${shotId} already uploaded`, true);
    if (!replace && extras.decent_upload_rejected && !manualRetry) throw skipped(`shot ${shotId} was rejected`, true);
    if (extras.upload_skipped === "mock-device") throw skipped(`shot ${shotId} came from a mock device`, true);

    const dur = shotDuration(full);
    if (!replace && dur < state.lengthThreshold) {
      throw skipped(`shot too short (${dur.toFixed(1)}s < ${state.lengthThreshold}s)`, true);
    }

    const replacementMachine = replace ? (uploadedMachinesByShotId.get(full.id) || null) : undefined;
    const payload = await withMachine(full, manualRetry, replacementMachine);
    if (!payload) {
      const captured = full.workflow && full.workflow.machine;
      const hasProvenanceStatus = captured && Object.prototype.hasOwnProperty.call(captured, "provenanceStatus");
      const terminal = replace || (!manualRetry && Boolean(captured) && (hasProvenanceStatus
        ? captured.provenanceStatus !== "captured" || capturedMachine(full) === null
        : Boolean(captured.serialNumber) && capturedMachine(full) === null));
      throw skipped("no real machine serial available", terminal);
    }

    let result;
    try {
      result = await postShot(payload, replace);
    } catch (e) {
      if (e.permanent) {
        permanentlyRejectedShotIds.add(full.id);
        if (typeof full.updatedAt === "string" && full.updatedAt) e.updatedAt = full.updatedAt;
      }
      throw e;
    }
    remotelyPostedShotIds.add(full.id);
    recordUploadedMachine(full.id, payload.machine);
    recordUploadedRevision(full);
    await markUploaded(full.id);
    state.lastUploadedShot = full.id;
    state.lastResult = result;
    // Build the shot's web URL from the server's stored id + the machine serial,
    // record it in the recent list, and hand it back to the app via the event.
    const sn = payload.machine && payload.machine.serialNumber;
    const serverId = (result && result.id) || full.id;
    const url = shotUrl(sn, serverId);
    state.lastUrl = url;
    recordRecentUpload({
      id: serverId,
      localId: full.id,
      sn: sn || null,
      url: url,
      title: (full.workflow && full.workflow.profile && full.workflow.profile.title) || null,
      ts: Date.now(),
    });
    host.storage({ type: "write", key: "lastUploadedShot", data: full.id });
    host.emit("shotUploaded", { shotId: full.id, id: serverId, sn: sn || null, url: url, result: result, timestamp: Date.now() });
    return result;
  }

  function queueLiveShot(operation) {
    const queued = pendingLiveShots.find((item) => item.shotId === operation.shotId);
    pendingLiveShots = queued
      ? pendingLiveShots.map((item) => item.shotId === operation.shotId
        ? { shotId: item.shotId, replace: item.replace || operation.replace }
        : item)
      : [...pendingLiveShots, operation];
  }

  function takeLiveShot() {
    const operation = pendingLiveShots[0];
    pendingLiveShots = pendingLiveShots.slice(1);
    return operation;
  }

  function persistPendingReplacements() {
    try { host.storage({ type: "write", key: "pendingReplacementShotIds", data: [...pendingReplacementShotIds] }); } catch (e) {}
  }

  function markReplacementPending(shotId) {
    if (pendingReplacementShotIds.has(shotId)) return;
    pendingReplacementShotIds = new Set([...pendingReplacementShotIds, shotId]);
    persistPendingReplacements();
  }

  function clearReplacementPending(shotId) {
    if (!pendingReplacementShotIds.has(shotId)) return;
    pendingReplacementShotIds = new Set([...pendingReplacementShotIds].filter((id) => id !== shotId));
    persistPendingReplacements();
  }

  async function uploadAutomatically(operation) {
    const { shotId, replace } = operation;
    if (replace) markReplacementPending(shotId);
    if (!replace && shotId && shotId === state.lastUploadedShot) {
      log(`shot ${shotId} already uploaded`);
      return;
    }
    try {
      const r = await uploadShot(shotId, { replace });
      if (replace) {
        clearReplacementPending(shotId);
        permanentlyRejectedShotIds.delete(shotId);
      }
      log(`uploaded ${shotId} -> ${r && r.profile_ref ? r.profile_ref : "ok"}`);
      return null;
    } catch (e) {
      if (replace && e.skipped && e.terminal) clearReplacementPending(shotId);
      if (e.skipped) { log(`skipped ${shotId}: ${e.message}`); }
      else {
        if (e.permanent) {
          if (replace) clearReplacementPending(shotId);
          await markRejected(shotId, e);
        }
        log(`error uploading ${shotId}: ${e.message}`);
        host.emit("uploadError", { shotId: shotId, error: e.message, timestamp: Date.now() });
        if (e.consent) reconciliationPausedForConsent = true;
        else scheduleReconcile(RECONCILE_RETRY_MS);
      }
      return e;
    }
  }

  async function autoUpload(shotId, replace = false) {
    if (!state.autoUpload || reconciliationPausedForConsent || unloaded) return;
    const operation = { shotId, replace };
    if (isUploading || isReconciling) {
      queueLiveShot(operation);
      return;
    }
    isUploading = true;
    try {
      await uploadAutomatically(operation);
    } finally {
      isUploading = false;
      const nextOperation = takeLiveShot();
      if (nextOperation) autoUpload(nextOperation.shotId, nextOperation.replace);
    }
  }

  function applySettings(settings) {
    if (!settings) return;
    // Opt-in: default OFF unless the user explicitly enabled it.
    state.autoUpload = settings.AutoUpload === true;
    state.lengthThreshold = settings.LengthThreshold !== undefined ? settings.LengthThreshold : 5;
  }

  function scheduleReconcile(delay) {
    if (!state.autoUpload || reconciliationPausedForConsent || unloaded) return;
    if (reconcileTimerId !== null) clearTimeout(reconcileTimerId);
    reconcileTimerId = setTimeout(() => {
      reconcileTimerId = null;
      reconcile();
    }, delay);
  }

  function currentMachineState(snapshot) {
    return snapshot && snapshot.state && snapshot.state.state || null;
  }

  function reconciliationIsSafe() {
    return SAFE_MACHINE_STATES.has(state.machineState);
  }

  async function confirmReconciliationIsSafe() {
    const snapshot = await fetchLocal("/machine/state");
    state.machineState = currentMachineState(snapshot);
    return reconciliationIsSafe();
  }

  function reconcileCandidate(shot) {
    const extras = extrasFor(shot);
    const captured = shot && shot.workflow && shot.workflow.machine;
    const hasProvenanceStatus = captured && Object.prototype.hasOwnProperty.call(captured, "provenanceStatus");
    return !wasUploaded(shot) &&
      !permanentlyRejectedShotIds.has(shot.id) &&
      !extras.uploaded_to_decent &&
      !extras.decent_upload_rejected &&
      extras.upload_skipped !== "mock-device" &&
      (hasProvenanceStatus
        ? captured.provenanceStatus === "captured" && capturedMachine(shot) !== null
        : !captured || !captured.serialNumber || capturedMachine(shot) !== null);
  }

  function wasUploaded(shot) {
    return Boolean(shot && (
      remotelyPostedShotIds.has(shot.id) ||
      uploadedMachinesByShotId.has(shot.id) ||
      uploadedRevisionsByShotId.has(shot.id) ||
      extrasFor(shot).uploaded_to_decent
    ));
  }

  function reconciliationReplacement(shot) {
    if (!wasUploaded(shot) || typeof shot.updatedAt !== "string" || !shot.updatedAt) return false;
    const rejected = extrasFor(shot).decent_upload_rejected;
    if (rejected && rejected.updatedAt === shot.updatedAt) return false;
    const synced = uploadedRevisionsByShotId.get(shot.id);
    if (synced) return shot.updatedAt !== synced;
    const uploadedAt = Number(extrasFor(shot).uploaded_to_decent);
    const updatedAt = Date.parse(shot.updatedAt);
    if (uploadedAt > 0 && Number.isFinite(updatedAt) && Math.floor(updatedAt / 1000) > uploadedAt) return true;
    recordUploadedRevision(shot);
    return false;
  }

  function setReconcileOffset(offset) {
    state.reconcileOffset = offset;
    host.storage({ type: "write", key: "reconcileOffset", data: offset });
  }

  async function reconcile() {
    if (!state.autoUpload || reconciliationPausedForConsent || unloaded) return;
    if (isUploading || isReconciling) {
      scheduleReconcile(RECONCILE_RETRY_MS);
      return;
    }
    isReconciling = true;
    let nextDelay = RECONCILE_PERIOD_MS;
    try {
      if (!await confirmReconciliationIsSafe()) return;
      let pages = 0;
      let attempts = 0;
      for (const shotId of pendingReplacementShotIds) {
        if (attempts >= RECONCILE_BATCH_SIZE || !state.autoUpload || reconciliationPausedForConsent || unloaded || !reconciliationIsSafe()) break;
        const error = await uploadAutomatically({ shotId, replace: true });
        attempts++;
        if (error && !error.skipped && pendingReplacementShotIds.has(shotId)) throw error;
      }
      while (pages < RECONCILE_PAGE_LIMIT && attempts < RECONCILE_BATCH_SIZE && state.autoUpload && !reconciliationPausedForConsent && !unloaded && reconciliationIsSafe()) {
        const page = await fetchLocal(`/shots?limit=${RECONCILE_PAGE_SIZE}&offset=${state.reconcileOffset}&order=desc`);
        if (!page || !Array.isArray(page.items)) throw new Error("could not list local shots");
        if (page.items.length === 0 || state.reconcileOffset >= page.total) {
          setReconcileOffset(0);
          break;
        }
        let scanned = 0;
        for (const shot of page.items) {
          if (!state.autoUpload || reconciliationPausedForConsent || unloaded || !reconciliationIsSafe() || attempts >= RECONCILE_BATCH_SIZE) break;
          while (pendingLiveShots.length > 0 && attempts < RECONCILE_BATCH_SIZE && !reconciliationPausedForConsent) {
            await uploadAutomatically(takeLiveShot());
            attempts++;
          }
          if (reconciliationPausedForConsent || attempts >= RECONCILE_BATCH_SIZE) break;
          scanned++;
          const replace = reconciliationReplacement(shot);
          if (!replace && !reconcileCandidate(shot)) continue;
          try {
            await uploadShot(shot.id, { replace });
            attempts++;
          } catch (e) {
            if (e.skipped) continue;
            if (!e.permanent) throw e;
            await markRejected(shot.id, e);
            attempts++;
            log(`shot ${shot.id} rejected: ${e.message}`);
          }
        }
        setReconcileOffset(state.reconcileOffset + scanned);
        pages++;
        if (state.reconcileOffset >= page.total) {
          setReconcileOffset(0);
          break;
        }
      }
      if (attempts >= RECONCILE_BATCH_SIZE) nextDelay = RECONCILE_CONTINUE_MS;
    } catch (e) {
      log(`reconciliation paused: ${e.message}`);
      if (e.consent) reconciliationPausedForConsent = true;
      nextDelay = e.consent ? null : RECONCILE_RETRY_MS;
    } finally {
      isReconciling = false;
      const nextOperation = reconciliationPausedForConsent ? null : takeLiveShot();
      if (nextOperation) {
        autoUpload(nextOperation.shotId, nextOperation.replace);
        scheduleReconcile(RECONCILE_CONTINUE_MS);
      } else if (nextDelay !== null) {
        scheduleReconcile(nextDelay);
      }
    }
  }

  function jsonResponse(status, obj) {
    return { status: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
  }

  function finishInvitationOperation(type, error) {
    const operation = invitationOperations.get(type);
    if (!operation) return;
    invitationOperations.delete(type);
    clearTimeout(operation.timer);
    if (error) operation.reject(error);
    else operation.resolve();
  }

  function invitationStorageOperation(type) {
    if (unloaded) return Promise.reject(new Error("Plugin stopped. Try again."));
    if (invitationOperations.has(type)) return invitationOperations.get(type).promise;
    const requestId = `${Date.now()}-${Math.random()}`;
    const operation = { requestId };
    operation.promise = new Promise((resolve, reject) => {
      operation.resolve = resolve;
      operation.reject = reject;
    });
    invitationOperations.set(type, operation);
    operation.timer = setTimeout(() => {
      finishInvitationOperation(type, new Error("Upload invitation storage unavailable. Try again."));
    }, 5000);
    try {
      host.storage({
        type, key: INVITATION_KEY,
        ...(type === "write" ? { data: { uploadInvitationSeen: true, requestId } } : {}),
      });
    } catch (error) {
      finishInvitationOperation(type, new Error("Upload invitation storage unavailable. Try again."));
    }
    return operation.promise;
  }

  function isUploaderBookkeepingPatch(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
    if (Object.keys(patch).length !== 1 || !patch.annotations) return false;
    const annotations = patch.annotations;
    if (typeof annotations !== "object" || Array.isArray(annotations) || Object.keys(annotations).length !== 1 || !annotations.extras) return false;
    const extras = annotations.extras;
    if (typeof extras !== "object" || Array.isArray(extras)) return false;
    const keys = Object.keys(extras);
    return keys.length > 0 && keys.every((key) => key === "uploaded_to_decent" || key === "decent_upload_rejected" || key === "visualizerId");
  }

  async function handleShotUpdated(shotId) {
    const shot = await fetchLocal(`/shots/${shotId}`);
    if (!shot || !shot.id) return;
    const replace = wasUploaded(shot);
    if (replace) markReplacementPending(shotId);
    autoUpload(shotId, replace);
  }


  return {
    id: NS,
    version: VERSION,

    onLoad(settings) {
      unloaded = false;
      reconciliationPausedForConsent = false;
      applySettings(settings);
      if (state.autoUpload) {
        invitationSeen = true;
        try { host.storage({ type: "write", key: INVITATION_KEY, data: { uploadInvitationSeen: true } }); } catch (e) {}
      }
      // Storage reads are event-based: this triggers a `storageRead` event,
      // handled in onEvent, that restores lastUploadedShot.
      try { host.storage({ type: "read", key: "lastUploadedShot" }); } catch (e) {}
      try { host.storage({ type: "read", key: "reconcileOffset" }); } catch (e) {}
      try { host.storage({ type: "read", key: "recentUploads" }); } catch (e) {}
      try { host.storage({ type: "read", key: "uploadedMachines" }); } catch (e) {}
      try { host.storage({ type: "read", key: "uploadedRevisions" }); } catch (e) {}
      try { host.storage({ type: "read", key: "pendingReplacementShotIds" }); } catch (e) {}
      try { host.storage({ type: "read", key: INVITATION_KEY }); } catch (e) {}
      log(`loaded (autoUpload ${state.autoUpload})`);
      scheduleReconcile(1000);
    },

    onUnload() {
      unloaded = true;
      if (reconcileTimerId !== null) clearTimeout(reconcileTimerId);
      reconcileTimerId = null;
      pendingLiveShots = [];
      for (const type of invitationOperations.keys()) {
        finishInvitationOperation(type, new Error("Plugin stopped. Try again."));
      }
    },

    onEvent(event) {
      switch (event.name) {
        case "shotStored": {
          const id = event.payload && event.payload.id;
          if (id && state.autoUpload) autoUpload(id);
          break;
        }
        case "shotUpdated": {
          const payload = event.payload || {};
          // Marker PUTs emit shotUpdated too; only suppress patches exclusively owned by this uploader.
          if (payload.id && !isUploaderBookkeepingPatch(payload.patch)) {
            handleShotUpdated(payload.id).catch((e) => log(`could not classify updated shot ${payload.id}: ${e.message}`));
          }
          break;
        }
        case "storageRead":
          if (event.payload && event.payload.key === INVITATION_KEY) {
            invitationSeen = invitationSeen === true || Boolean(event.payload.value && event.payload.value.uploadInvitationSeen === true);
            finishInvitationOperation("read");
          }
          if (event.payload && event.payload.key === "lastUploadedShot") {
            state.lastUploadedShot = event.payload.value || null;
          }
          if (event.payload && event.payload.key === "reconcileOffset") {
            const offset = Number(event.payload.value);
            state.reconcileOffset = Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : 0;
          }
          if (event.payload && event.payload.key === "recentUploads") {
            const v = event.payload.value;
            state.recentUploads = Array.isArray(v) ? v.slice(0, RECENT_MAX) : [];
          }
          if (event.payload && event.payload.key === "uploadedMachines") {
            const v = event.payload.value;
            const stored = v && typeof v === "object" && !Array.isArray(v)
              ? Object.entries(v)
                .map(([shotId, machine]) => [shotId, capturedMachine({ workflow: { machine } })])
                .filter(([, machine]) => machine)
              : [];
            uploadedMachinesByShotId = new Map([...stored, ...uploadedMachinesByShotId]);
          }
          if (event.payload && event.payload.key === "uploadedRevisions") {
            const v = event.payload.value;
            const stored = v && typeof v === "object" && !Array.isArray(v)
              ? Object.entries(v).filter(([shotId, revision]) => shotId && typeof revision === "string" && revision)
              : [];
            uploadedRevisionsByShotId = new Map([...stored, ...uploadedRevisionsByShotId]);
          }
          if (event.payload && event.payload.key === "pendingReplacementShotIds") {
            const ids = Array.isArray(event.payload.value) ? event.payload.value.filter((id) => typeof id === "string" && id) : [];
            pendingReplacementShotIds = new Set([...pendingReplacementShotIds, ...ids]);
            if (pendingReplacementShotIds.size > 0) scheduleReconcile(0);
          }
          break;
        case "storageWrite": {
          const operation = invitationOperations.get("write");
          const payload = event.payload;
          if (operation && payload && payload.uploadInvitationSeen === true && payload.requestId === operation.requestId) {
            invitationSeen = true;
            finishInvitationOperation("write");
            finishInvitationOperation("read");
          }
          break;
        }
        case "stateUpdate": {
          const previousMachineState = state.machineState;
          state.machineState = currentMachineState(event.payload);
          if (state.machineState !== previousMachineState && reconciliationIsSafe()) {
            scheduleReconcile(0);
          }
          break;
        }
        case "settingsUpdated": {
          const wasEnabled = state.autoUpload;
          applySettings(event.payload);
          if (!state.autoUpload) {
            if (reconcileTimerId !== null) clearTimeout(reconcileTimerId);
            reconcileTimerId = null;
            pendingLiveShots = [];
          } else if (state.autoUpload) {
            if (!wasEnabled) {
              reconciliationPausedForConsent = false;
              setReconcileOffset(0);
            }
            scheduleReconcile(0);
          }
          break;
        }
      }
    },

    // Control endpoints. GET status; POST upload of the latest eligible shot.
    async __httpRequestHandler(request) {
      const endpoint = request && request.endpoint;
      const method = String(request && request.method || "GET").toUpperCase();
      const expectedMethod = endpoint === "invitation" || endpoint === "upload" ? "POST" : "GET";
      if (method !== expectedMethod) {
        return { ...jsonResponse(405, { error: "method not allowed" }), headers: { "Content-Type": "application/json", Allow: expectedMethod } };
      }
      if (endpoint === "invitation") {
        try {
          await invitationStorageOperation("write");
          return jsonResponse(200, { ok: true });
        } catch (error) {
          return jsonResponse(503, { error: error.message });
        }
      }
      if (endpoint === "status") {
        if (invitationSeen === null && !state.autoUpload) {
          try {
            await invitationStorageOperation("read");
          } catch (error) {
            return jsonResponse(503, { error: error.message });
          }
        }
        return jsonResponse(200, {
          autoUpload: state.autoUpload,
          invitationSeen: invitationSeen === true,
          lastUploaded: state.lastUploadedShot,
          lastResult: state.lastResult,
          lastUrl: state.lastUrl,
          recentUploads: state.recentUploads,
        });
      }
      // JSON list of the recent uploads with their links (for programmatic use).
      if (endpoint === "recent") {
        return jsonResponse(200, { ok: true, shots: state.recentUploads });
      }
      // Human-readable page listing the recent uploads as links.
      if (endpoint === "ui") {
        return {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
          body: SHOT_UPLOAD_UI,
        };
      }
      if (endpoint === "upload") {
        try {
          const latest = await fetchLocal("/shots/latest");
          if (!latest || !latest.id) return jsonResponse(404, { ok: false, error: "no shot available" });
          const result = await uploadShot(latest.id, { manualRetry: true });
          return jsonResponse(200, { ok: true, id: latest.id, url: state.lastUrl, result: result });
        } catch (e) {
          if (e.skipped) return jsonResponse(200, { ok: false, skipped: true, error: e.message });
          return jsonResponse(502, { ok: false, error: e.message });
        }
      }
      return jsonResponse(404, { error: "unknown endpoint" });
    },
  };
}
