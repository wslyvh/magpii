# Magpii Chrome extension

Magpii is a fully local PII-cleaning tool. Paste text, clean personal identifiers, review what was found, and copy the cleaned text.

User text stays in the browser. The extension has no backend, runtime API calls, accounts, telemetry, or text persistence.

## Load it in Chrome

```bash
yarn
yarn model:verify
yarn build
```

If the pinned model assets are not present, fetch them once during setup:

```bash
yarn model:fetch
yarn build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `dist/` directory.
5. Select the Magpii toolbar action to open the side panel.

The setup command may download development dependencies and the pinned model. The built extension does not make network requests.

## Detection pipeline

```text
input
  -> Rampart in a Web Worker + structured detectors in parallel
  -> validate and merge spans
  -> found badges + masked output
  -> copy
```

Cleaning is one click. The original text stays in the input. Found identifiers appear as badges, and the cleaned output uses typed placeholders.

### Contextual detection

The bundled `nationaldesignstudio/rampart` Q4 ONNX model detects:

- `GIVEN_NAME` and `SURNAME` -> `[PERSON]`
- street, building, secondary-address, city, state, and postcode labels -> `[ADDRESS]`

Magpii treats city, state, and postcode as address information even though Rampart keeps coarse geography by default. Inference uses tokenizer-aware chunks of at most 510 content tokens with a 64-token overlap. The fixed internal confidence threshold is `0.4`.

Rampart does not emit organization or date labels. `ORGANIZATION` and `DATE` are therefore outside this MVP and absent from the core detection type.

### Structured detection

Magpii implements exactly five deterministic detectors:

| Type | Validation |
| --- | --- |
| `[EMAIL]` | Practical email pattern with a dotted domain |
| `[PHONE]` | `libphonenumber-js`, with `NL` as the default region |
| `[BSN]` | Dutch 11-test |
| `[IBAN]` | Standard MOD-97 checksum |
| `[CREDIT_CARD]` | Luhn checksum |

Structured detections beat overlapping model detections. Between detections from the same source, the longer span wins.

## Local-only architecture

- `src/core/`: browser-agnostic TypeScript detection, merge, and masking logic
- `src/inference/`: Rampart policy, tokenizer-aware chunking, worker client, and local ONNX inference
- `src/extension/`: page UI and the small Chrome action used to open it
- `public/models/`: pinned Rampart model and tokenizer assets
- `public/runtime/`: packaged ONNX Runtime Web WASM files

Chrome APIs do not appear in the detection core. User text exists only in side-panel and worker memory. Editing the input invalidates results, and closing the panel destroys its state.

The manifest requests only the `sidePanel` permission and no host permissions.

## Test cases

The Playwright extension test covers the Dutch demo sentence and the five structured detectors. Dates and ordinary reference values stay unchanged.

```text
Input:
Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. De vergadering blijft staan.

Output:
[PERSON], geboren op 14-03-1968, woont aan de [ADDRESS]. De vergadering blijft staan.
```

## Development commands

```bash
yarn test                # Core and UI unit tests
yarn typecheck           # TypeScript checks
yarn model:verify        # Verify pinned Rampart checksums
yarn build               # Produce dist/
yarn package             # Build dist/ and write store/magpii.zip
yarn store-screenshot    # 1280x800 Chrome Web Store screenshot from dist/
yarn playwright install chromium
yarn test:e2e            # Load dist/ as an unpacked extension and run the real model
```

`store/magpii.zip` is what you upload to the Chrome Web Store. The zip has `manifest.json` at the root. Source maps are excluded.

Listing assets live in `store/`: `icon-128.png`, `promo-440x280.png`, and `screenshot-1280x800.png`.

Magpii is licensed under the MIT License.

## Attribution

Magpii bundles these third-party components:

- **Rampart** (`nationaldesignstudio/rampart`, revision `b1993e4e68b082835b80ffc65acc03325ea2e501`). Copyright National Design Studio. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Model source](https://huggingface.co/nationaldesignstudio/rampart).
- **Transformers.js**. Copyright Hugging Face. Apache License 2.0. [Source](https://github.com/huggingface/transformers.js).
- **ONNX Runtime**. Copyright Microsoft Corporation. MIT License. [Source](https://github.com/microsoft/onnxruntime).
- **libphonenumber-js**. Copyright Nikolay Kuchumov. MIT License. [Source](https://github.com/catamphetamine/libphonenumber-js).
