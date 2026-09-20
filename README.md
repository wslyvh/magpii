# Magpii Chrome extension

Magpii is a fully local healthcare text-cleaning demo. Paste text, detect direct identifiers, review highlighted spans, mask them with typed placeholders, and copy the cleaned output.

User text stays in the browser. The extension has no backend, runtime API calls, accounts, telemetry, or text persistence.

## Load it in Chrome

```bash
npm install
npm run model:verify
npm run build
```

If the pinned model assets are not present, fetch them once during setup:

```bash
npm run model:fetch
npm run build
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
  -> highlight
  -> mask with typed placeholders
  -> copy
```

### Contextual detection

The bundled `nationaldesignstudio/rampart` Q4 ONNX model detects:

- `GIVEN_NAME` and `SURNAME` -> `[PERSON]`
- street, building, secondary-address, city, state, and postcode labels -> `[ADDRESS]`

Magpii masks city, state, and postcode as healthcare policy even though Rampart keeps coarse geography by default. Inference uses tokenizer-aware chunks of at most 510 content tokens with a 64-token overlap. The fixed internal confidence threshold is `0.4`.

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

- `src/core/`: browser-agnostic TypeScript detection, merge, highlight, and masking logic
- `src/inference/`: Rampart policy, tokenizer-aware chunking, worker client, and local ONNX inference
- `src/extension/`: Chrome side-panel shell and UI
- `public/models/`: pinned Rampart model and tokenizer assets
- `public/runtime/`: packaged ONNX Runtime Web WASM files

Chrome APIs do not appear in the detection core. User text exists only in side-panel and worker memory. Editing the input invalidates results, and closing the panel destroys its state.

The manifest requests only the `sidePanel` permission and no host permissions.

## Test cases

Dutch healthcare fixtures live in `src/test/healthcareCases.ts` and cover every supported type. They also assert that dates, medication, symptoms, lab values, doses, and measurements remain unchanged.

Example:

```text
Input:
Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. HbA1c is 72 mmol/mol.

Output:
[PERSON], geboren op 14-03-1968, woont aan de [ADDRESS]. HbA1c is 72 mmol/mol.
```

## Development commands

```bash
npm test                 # Core and UI unit tests
npm run typecheck        # TypeScript checks
npm run model:verify     # Verify pinned Rampart checksums
npm run build            # Produce dist/
npx playwright install chromium
npm run test:e2e         # Load dist/ as an unpacked extension and run the real model
```

Model provenance and third-party licenses are listed in `THIRD_PARTY_NOTICES.md`. The approved design is in `docs/superpowers/specs/2026-09-20-magpii-extension-mvp-design.md`.
