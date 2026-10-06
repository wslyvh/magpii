# Magpii SDK

`@intheopen/magpii` provides local personal data detection and redaction. Version 0.2 uses the pinned Masker Mini INT4 model in the browser.

## Core API

```ts
import { redactText } from "@intheopen/magpii";

const result = await redactText("Email jan@example.nl");
console.log(result.redactedText); // Email [EMAIL]
```

The core detects emails, phone numbers, HTTP(S) URLs, Dutch BSNs, IBANs, and payment cards with structured rules. A contextual detector supplies names, address components, generic government IDs, dates, and ages. Model and rule candidates are combined through hybrid detection. Model candidates for structured categories must pass the SDK validators. Identical rule matches take precedence. Numeric candidates are rejected when their text is a valid date, time range, IP address or explicitly labelled invoice/order/reference number. Neither source has to agree for a valid detection to survive. A generic government ID is not reclassified as a BSN.

### Entities and selection

| Entities | Meaning |
| --- | --- |
| `GIVEN_NAME`, `SURNAME` | Name components. `PERSON` is a whole-name fallback for models without components. |
| `STREET`, `BUILDING_NUMBER`, `POSTAL_CODE`, `CITY` | Address components. `ADDRESS` is a whole-address or location fallback. A standalone postal code can be detected without a full address. |
| `EMAIL`, `PHONE`, `URL`, `IBAN`, `CREDIT_CARD`, `BSN` | Structured identifiers. URL detection currently covers explicit HTTP(S) links. |
| `GOVERNMENT_ID` | A model-detected ID, without assuming its country or identifier scheme. |
| `DATE`, `AGE` | General dates and person ages. A date does not establish a date of birth. |

`detectText` returns all supported candidates, including overlaps, with original UTF-16 offsets and their detection source. `redactText` also returns all candidates in `detections`, but masks only selected types. **DATE, AGE, and URL are off by default.** All other types are selected by default.

```ts
import { DEFAULT_REDACTION_TYPES, redactText } from "@intheopen/magpii";

const result = await redactText(text, {
  detector,
  redactionTypes: [...DEFAULT_REDACTION_TYPES, "DATE"],
});
```

Review interfaces can use `detectText` and `maskText` separately. Pass only selected detections to `maskText`. It resolves those overlaps, prioritizes structured identifiers, and preserves any uncovered portions of overlapping entities. Placeholders use the entity name, such as `[GIVEN_NAME]` or `[POSTAL_CODE]`.

## Browser detection

The package includes a compiled worker, model, and WASM runtime. Copy them into a dedicated static directory. The installer replaces generated model/runtime files:

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

Host assets on the application's own origin. Detection runs locally and can miss personal information, so review before sharing. No remote inference or asset fallback is used.

Mini model files are checksum-verified and saved in browser storage for later visits when storage is available. The model still needs to be loaded into memory each visit. Browser storage can be cleared or evicted, and unavailable storage does not prevent detection.

The pinned Tokenizers.js implementation tokenizes once. Long text uses overlapping windows of the original token IDs, bounded by the model's context limit. Normalized token surfaces are aligned back to original grapheme boundaries and UTF-16 offsets. Unsupported alignment rejects the operation instead of returning guessed positions.

`@intheopen/magpii/inference` exports shared BIO/BIOES decoding, token windows, canonical model candidates, and the Masker tokenizer/runtime interface for other local integrations. Model revisions and asset checksums are in the exported `model-lock.json`.

### Optional Full model demo

Version 0.2.1 adds an experimental Full v2 INT4 backend. The standard SDK archive and extension still include only Mini. Full is a separate download of about 250 MB including its tokenizer. It uses FP32 computation with selected MatMul and Gather weights stored in INT4. It has lower coverage than the unquantized reference and can still miss personal information.

Create a Python environment and install `scripts/requirements-export.txt`, then run:

```bash
python scripts/export-full.py
```

The recipe downloads and verifies the pinned Full source weights, exports dynamic-length ONNX, quantizes without calibration data, records the toolchain/recipe/checksums in `assets/full-model-lock.json`, and creates `full-model-assets.zip`. Unpack that separate bundle on a static asset host, preserving the `onnx/` directory and external-data filename. Full assets stay outside the standard SDK package and application build.

The static host must allow CORS if hosted on another origin. Text is never sent to the asset host. The worker and WASM runtime stay on the application's own origin.

```ts
const detector = createBrowserDetector({
  assetBaseUrl: "/magpii/",
  model: "full",
  fullModelBaseUrl: "/full-model/",
  onProgress: ({ loaded, total }) => console.log(loaded / total),
});
```

Initialize Full only after an explicit user action. Call `dispose()` to cancel downloading/inference and release the worker. Full assets are checksum-verified and saved through the browser Cache API when storage allows it. `isFullModelCached(baseUrl)` checks availability and `clearFullModelCache()` removes saved Full assets. Browser storage can be evicted; caching failures do not prevent a session from running. Full can use substantially more memory than its download size, so test target devices.

### Upgrading from 0.1

Names and addresses now retain components rather than becoming only `PERSON` and `ADDRESS`. Update exhaustive entity labels and use `DEFAULT_REDACTION_TYPES` for initial review selections. `detectText` retains overlapping candidates until selection. The browser bundle ships Masker Mini instead of Rampart. The old `./rampart` inference entry point has been replaced by `./inference`. Use `createBrowserDetector` or `BrowserDetectorClient` for browser integration.

## Development

Run from the repository root:

```bash
npm run model:fetch
npm run model:verify
npm run check
npm run test:browser
npm run pack:sdk
```

`model:fetch` downloads or repairs pinned model files and verifies hashes. Builds also verify hashes, compile the SDK and worker, and bundle browser assets. `dist/` and `assets/browser/` are generated. The extension consumes the SDK through the workspace.

See [NOTICE.txt](NOTICE.txt) for software and model credits and [LICENSE](LICENSE) for licensing.
