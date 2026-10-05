# Magpii SDK

`@intheopen/magpii` provides local personal data detection and redaction.

## Core API

```ts
import { redactText } from "@intheopen/magpii";

const result = await redactText("Email jan@example.nl");
console.log(result.redactedText); // Email [EMAIL]
```

The core detects emails, phone numbers, Dutch BSNs, IBANs, and payment cards without a model. Names and addresses require a contextual detector. Pass a `detector` to `redactText` for names and addresses. `detectText` and `maskText` are also available separately for review interfaces.

## Browser detection

The package includes a compiled worker, model, and WASM runtime. The `magpii-assets` command copies them into a static directory:

```bash
magpii-assets --out public/magpii
```

```ts
import { redactText } from "@intheopen/magpii";
import { createBrowserDetector } from "@intheopen/magpii/browser";

const detector = createBrowserDetector({ assetBaseUrl: "/magpii/" });
try {
  await detector.warmup();
  const result = await redactText(text, { detector });
} finally {
  detector.dispose();
}
```

Host the assets on the application's own origin. Detection runs locally and can miss personal information, so review the result before sharing.

## Development

Run from the repository root:

```bash
npm run model:fetch
npm run model:verify
npm run build:sdk
npm run check
npm run test:browser
npm run pack:sdk
```

`model:fetch` downloads or repairs the pinned model files and checks their hashes. `model:verify` checks the existing files without downloading. The build also verifies the model checksums, compiles the SDK and worker, and bundles the browser assets. `dist/` and `assets/browser/` are generated. The extension uses this SDK through the workspace.

See [NOTICE.txt](NOTICE.txt) for software and model credits and [LICENSE](LICENSE) for licensing.
