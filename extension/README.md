# Magpii Chrome extension

A Chrome side panel for the Magpii SDK. Paste text, redact personal identifiers, review the matches, and copy the result. Text processing runs locally.

## Build and load

Run from the repository root:

```bash
npm ci
npm run build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose `extension/dist/`.
4. Select the Magpii toolbar action to open the side panel.

The extension imports the SDK from the workspace. Its build includes the SDK's worker, model, and runtime assets.

## Commands

Run from the repository root:

```bash
npm run dev:extension
npm run check
npm run test:browser
npm run package:extension
npm run store-screenshot
```

`package:extension` creates `extension/store/magpii.zip` for the Chrome Web Store. The zip includes `manifest.json` at its root and excludes source maps. Listing assets are in `extension/store/`.

Software and model credits are included in the build at `magpii/NOTICE.txt`.
