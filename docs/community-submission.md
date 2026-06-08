# Community Submission Checklist

Current release target: `0.1.0`

## Repository

- [ ] Public GitHub repository exists.
- [x] `README.md` describes what the plugin does and how to use it.
- [x] `LICENSE` exists.
- [x] `manifest.json` exists at repository root.
- [x] `manifest.json.id` is unique and does not contain the product name prefix.
- [x] `manifest.json.version` uses `x.y.z`.
- [x] `versions.json` maps plugin version to minimum app version.

## Release

- [ ] GitHub release tag equals `manifest.json.version`.
- [ ] Release assets include `main.js`.
- [ ] Release assets include `manifest.json`.
- [ ] Release assets include `styles.css`.

## Local validation

- [ ] `npm run build` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm test` passes.

## Directory Submission

- [ ] Sign in to https://community.obsidian.md.
- [ ] Link the GitHub account that owns the repository.
- [ ] Open **Plugins -> New plugin**.
- [ ] Submit `https://github.com/viggomeesters/obsidian-script-viewer`.
- [ ] Confirm developer policies and support commitment.
- [ ] Address automated review feedback.

These final steps require the repository owner's account.
