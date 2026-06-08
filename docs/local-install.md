# Local install

Build the plugin and install only the runtime files:

```bash
npm install
npm run build
mkdir -p "/Users/viggomeesters/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault/.obsidian/plugins/script-viewer"
cp main.js manifest.json styles.css "/Users/viggomeesters/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault/.obsidian/plugins/script-viewer/"
```

Then enable `script-viewer` in `.obsidian/community-plugins.json` or through the Community plugins settings screen.
