# Magpii

Local personal data detection and redaction.

## Structure

- `sdk/` — detection, masking, models, browser runtime, and engine tests. Package: `@intheopen/magpii`.
- `extension/` — Chrome side panel, review interface, and extension tests.

Both use npm workspaces and one lockfile. The SDK is the shared API for detection and redaction. Interfaces own their input, review, clipboard, and platform integration. The extension imports the SDK directly from the workspace.

## Getting started

Requires Node.js 24 or newer and npm 11 or newer. Run commands from the repository root:

```bash
npm ci
npm run check
```

## Commands

```bash
npm run dev:extension
npm run model:fetch
npm run model:verify
npm run build
npm test
npm run typecheck
npm run test:browser
npm run pack:sdk
npm run package:extension
```

Browser tests require Chromium: `npx playwright install chromium`.

The extension build is in `extension/dist/`. The extension package is `extension/store/magpii.zip`. `pack:sdk` creates a compiled SDK archive at the repository root.

See [sdk/README.md](sdk/README.md) for the SDK API and [extension/README.md](extension/README.md) for loading the extension. Software and model credits are in [sdk/NOTICE.txt](sdk/NOTICE.txt). Code is licensed under [MIT](LICENSE).
