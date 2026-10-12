# Decent shot upload plugin

`shot-upload.reaplugin` uploads eligible Decaid espresso shots to the signed-in user's Decent account. It keeps the live `shotStored` path and reconciles missed local shots while the machine is idle.

This repository is the plugin's source of truth. Decaid bundles a pinned, checksum-verified release and associates installed copies with this repository for later updates.

## Install

Download `shot-upload.reaplugin-vX.Y.Z.zip` from Releases and install it through Decaid's plugin settings.

Automatic upload is off by default. Open the shot-upload page to accept or decline
the first-use invitation. Acceptance enables uploads of new and eligible saved
shots to your linked Decent account for shot history and Decent's shot analysis.
Declining is remembered in Decaid's plugin storage. The page retains an **Upload
shots automatically** checkbox so you can change your choice later.

Link your account through Decaid's native Account settings before enabling uploads
on this page. Decaid's separate native account-access approval still applies.
Existing installations with automatic uploads enabled do not see another invitation.

The plugin requests gzip through `host.decentProxy` for uploads. Decaid compresses
bodies of at least 1,024 bytes only when smaller, with no separate user setting or
plain-body fallback. This requires the host option introduced in Decaid PR #982;
older hosts ignore the option and continue sending ordinary JSON.

## Links to uploaded shots

After a shot uploads, the plugin records a link to view it in the user's Decent
account — `https://decentespresso.com/support/espressomachine?view=chart&sn=<serial>&id=<id>`
(built from the machine serial and the shot id the server returns). The most
recent 10 links are kept and exposed through the plugin's HTTP endpoints:

- `GET /api/v1/plugins/shot-upload.reaplugin/status` — includes `autoUpload`, `invitationSeen`, `lastUrl`, and `recentUploads`. Invitation storage failures return 503 within five seconds when automatic uploads are off.
- `POST /api/v1/plugins/shot-upload.reaplugin/invitation` — remembers either invitation response; returns `{ok:true}` only after host storage confirms persistence. Does not change settings, reload the plugin, or upload a shot. GET returns 405.
- `POST /api/v1/plugins/shot-upload.reaplugin/upload` — deliberately uploads the latest eligible shot, even with automatic uploads off. GET returns 405.
- `GET /api/v1/plugins/shot-upload.reaplugin/recent` — JSON `{ok, shots:[{id, sn, url, title, ts}]}`.
- `GET /api/v1/plugins/shot-upload.reaplugin/ui` — upload controls, account status, and recent upload links.

The page acknowledges the invitation before saving `AutoUpload` through Decaid's
existing plugin settings endpoint. Storage errors leave uploads off and can be
retried. GET requests never change upload settings or submit shot data.

The `shotUploaded` event also carries `{id, sn, url}` for the just-uploaded shot.

## Development

Edit upload logic in `src/plugin.js` and the page in `src/ui.html`. The small,
dependency-free Node packaging step embeds the HTML into the required single
distributable script. Commit the generated `shot-upload.reaplugin/plugin.js` with
source changes. Do not edit the generated script by hand.

```bash
node scripts/build.js
node scripts/build.js --check
node --check src/plugin.js
node --check shot-upload.reaplugin/plugin.js
node --test test/*.test.js
```

The tests exercise the public plugin lifecycle and HTTP interfaces with an in-memory Decaid host.

For local native testing, use Decaid's `PUT
/api/v1/plugins/shot-upload.reaplugin/source` endpoint with `{manifest, plugin}`
from the distributable files and keep `AutoUpload` off until the account and test
shot are approved. Debug Decaid builds restore bundled plugin source on startup;
reapply the candidate after restarting. Invitation state remains in host storage.

The current Decaid GitHub branch installer accepts only one archive wrapper
level. This repository's nested `.reaplugin` directory does not resolve through
that installer yet; use the release ZIP or the local source endpoint instead.

## Release

1. Update `version` in `shot-upload.reaplugin/manifest.json`.
2. Update `VERSION` in `src/plugin.js` to the same value.
3. Run `node scripts/build.js`, validate, then commit and push the change.
4. Tag that commit as `vX.Y.Z` and push the tag.

GitHub Actions validates the committed versions, tests the plugin, packages the top-level `shot-upload.reaplugin/` directory, and publishes one ZIP release asset.

The committed version must never be lower than the latest release because Decaid also supports installing directly from `main`.
