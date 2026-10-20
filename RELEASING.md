# Releasing & updates

Installed apps update themselves from the GitHub repo set in **Settings → Updates**. They read
`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`, which
`.github/workflows/release.yml` attaches to each release, and only install builds signed with the
private key that matches `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.

## One-time setup

1. Push this repo to GitHub. It has to be **public**, because installed apps download releases
   without logging in.
2. Add the repository secret `TAURI_SIGNING_PRIVATE_KEY` (Settings → Secrets and variables →
   Actions) containing everything in `~/.tauri/ihatebills.key`. On macOS, run
   `pbcopy < ~/.tauri/ihatebills.key` to copy it.
   Back the key up. If it's lost, already-installed apps can't update any more and have to be
   reinstalled by hand.

## Cutting a release

```sh
pnpm version patch          # or minor / major / 1.2.3 — bumps package.json, commits, tags v<version>
git push --follow-tags
```

The workflow builds the macOS (Apple Silicon and Intel) and Windows apps, uploads them to a draft
release, and publishes the release once every build has succeeded. Installed apps see the new
version from then on. To add release notes, edit the release on GitHub; they're shown in Settings
before the user installs.

## First install

- **Windows:** run `ihatebills_<version>_x64-setup.exe`. SmartScreen may warn because the app
  isn't code-signed: click *More info → Run anyway*.
- **macOS:** open the `.dmg` and drag the app to Applications. The app isn't notarized by Apple, so
  the first launch may say it "is damaged" or "can't be opened". Run
  `xattr -cr /Applications/ihatebills.app` once, or right-click → Open. Updates installed by the
  app itself don't run into this.

## Building it yourself / forks

`pnpm tauri build` works without any keys. It just doesn't produce update files. A build you made
yourself still updates from the official releases, because it carries the same public key.

To publish your own releases from a fork, generate your own key
(`pnpm tauri signer generate -w ~/.tauri/ihatebills.key`), put the new `.pub` contents into
`plugins.updater.pubkey`, add the private key as the secret above, and point Settings at your fork.
Apps built with the original key won't accept your updates (that's the point of the signature),
so install your own build once first.

To build signed update files locally: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/ihatebills.key)" pnpm tauri build --config src-tauri/tauri.release.conf.json`
