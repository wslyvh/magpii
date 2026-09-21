# Magpii local Chrome extension MVP design

Date: 2026-09-20
Status: Approved

## Purpose

Magpii is a local PII-removal tool. A user pastes sensitive text, runs local detection, reviews highlighted identifiers, masks them with typed placeholders, and copies the cleaned text.

The extension never sends user text, detections, or model input outside the browser. It has no backend, accounts, telemetry, text persistence, or runtime network dependency.

## MVP scope

The MVP detects and masks these types:

```ts
type Detection = {
  start: number
  end: number
  type:
    | 'PERSON'
    | 'ADDRESS'
    | 'EMAIL'
    | 'PHONE'
    | 'BSN'
    | 'IBAN'
    | 'CREDIT_CARD'
  source: 'model' | 'structured'
}
```

`ORGANIZATION` and `DATE` are not part of this MVP. Rampart does not emit either label. Dates and organizations remain unchanged.

The MVP also excludes aliases, reversible mappings, custom model training, extra structured detectors, and generic recognizer infrastructure.

## Architecture

Use plain TypeScript with three boundaries:

1. `core/` is browser-agnostic. It defines detections, structured detectors, detection orchestration, span policy, masking, and display segments. It contains no Chrome API references.
2. `inference/` adapts Rampart through Transformers.js in a Web Worker. It uses standard browser APIs and bundled model assets. It contains no Chrome API references.
3. `extension/` contains the side-panel UI, Manifest V3 configuration, and the small Chrome action integration needed to open the panel.

Vite builds a load-unpacked `dist/` directory. The side panel imports the same core that a later extension page, Firefox sidebar, or standalone local web UI can reuse. The MVP does not add a cross-browser framework.

The normal flow is:

```text
input
  -> Rampart model detection + structured detection in parallel
  -> normalize and merge spans
  -> highlighted preview
  -> typed placeholder masking
  -> copied output
```

## Local model inference

Use `nationaldesignstudio/rampart` directly through Transformers.js. Bundle the quantized ONNX model, tokenizer, configuration, and ONNX Runtime Web assets inside the extension.

Runtime model downloads are disabled. The extension manifest has no host permissions. The content security policy allows only packaged extension resources.

The side panel starts loading Rampart in a dedicated worker when it opens. The worker keeps one model-load promise for its lifetime. Concurrent calls share the promise. A failed load clears the promise so a user retry can initialize the model again.

WASM is the compatibility baseline. WebGPU may be selected when it is available and works with the same adapter, but it must not introduce a second architecture or different behavior. WASM remains the fallback.

Use Rampart's fixed `0.4` confidence threshold. Do not expose scores or threshold controls in the UI.

### Token-aware chunking

Rampart accepts at most 512 tokens. Tokenize the full input before inference, use tokenizer offsets to preserve original character positions, and reserve capacity for the model's special tokens.

Each inference chunk contains at most 510 content tokens. Consecutive chunks overlap by 64 content tokens. Slice chunks from the original text with tokenizer offsets, run inference, rebase detections to original character offsets, and deduplicate overlap through the normal merge policy.

This avoids character-count assumptions and prevents ordinary entities at chunk boundaries from being lost.

### Rampart label policy

Map Rampart labels to Magpii types:

- `GIVEN_NAME`, `SURNAME` -> `PERSON`
- `STREET_NAME`, `BUILDING_NUMBER`, `SECONDARY_ADDRESS`, `CITY`, `STATE`, `ZIP_CODE` -> `ADDRESS`

Mapping `CITY`, `STATE`, and `ZIP_CODE` to `ADDRESS` is Magpii's PII masking policy. Rampart's own default policy keeps coarse geography.

Name components may join across whitespace or a narrow Dutch surname-particle set such as `de`, `van`, `van de`, and `van der`.

Address joining is conservative. Address components join only when they touch, are separated by whitespace or a comma, or when a street-line component is followed by a city or postcode component across the exact connector `in` or `te`. The detector does not expand into surrounding prose or determiners. Uncertain components remain separate highlights.

## Structured detection

Run exactly five deterministic detectors:

### Email

Use a practical, bounded email pattern for normal input. Require a valid local part, `@`, and a dotted domain. Do not treat surrounding punctuation as part of the address.

### Phone

Use `libphonenumber-js`. Parse text with `NL` as the default region and accept only candidates that the library reports as valid. Support Dutch national forms and valid international forms.

### BSN

Find bounded 8- or 9-digit candidates with common visual separators. Normalize to nine digits, reject an all-zero value, and accept only values that pass the Dutch 11-test.

### IBAN

Find bounded 15- to 34-character IBAN-shaped candidates. Remove spaces, normalize to uppercase, validate the shape, and accept only values whose standard MOD-97 result equals 1.

### Credit card

Find bounded 13- to 19-digit candidates with spaces or hyphens. Normalize to digits, reject an all-zero value, and accept only values that pass the Luhn checksum.

Do not add any other deterministic detector.

## Span normalization and merge

Before merging, reject empty, inverted, non-integer, or out-of-range spans.

Resolve overlaps with these rules:

1. A structured detection always wins over an overlapping model detection.
2. For detections from the same source, keep the longer span.
3. For equal spans from the same source, use a fixed type precedence. Put checksum-backed identifiers ahead of the broader phone detector.
4. Return accepted detections in original text order.

The result contains no overlapping spans.

## Highlighting and masking

Convert the source text and non-overlapping detections into display segments. The side panel renders detected segments as accessible highlighted marks with visible type labels.

Mask from the end of the string toward the start so earlier offsets stay valid. Replace each detected value with its exact typed placeholder:

- `[PERSON]`
- `[ADDRESS]`
- `[EMAIL]`
- `[PHONE]`
- `[BSN]`
- `[IBAN]`
- `[CREDIT_CARD]`

Do not number placeholders or store the original values. Preserve every undetected character exactly.

Example:

```text
Input:
Jan de Vries, geboren op 14-03-1968, woont aan de Zijlweg 12 in Haarlem. De vergadering blijft staan.

Expected MVP output:
[PERSON], geboren op 14-03-1968, woont aan de [ADDRESS]. De vergadering blijft staan.
```

The date remains because date detection is outside this MVP. The exact address span depends on conservative Rampart boundaries; the extension may show adjacent `ADDRESS` highlights instead of widening across uncertain text.

## Side-panel experience

The responsive side panel contains:

- a Magpii header and visible `Local only` status
- the statement `Your text stays in this browser.`
- a general-purpose sensitive-text input area
- a model-loading and detection status area
- a primary `Detect` action
- a read-only highlighted preview
- a `Mask` action enabled after successful detection
- an editable masked-output area
- a `Copy` action with accessible success feedback

The user flow is `Paste -> Detect -> review highlights -> Mask -> Copy`.

Editing the input invalidates previous detections and masked output. Closing the side panel destroys the page and its in-memory text. The extension does not write text, detections, or masked output to local storage, sync storage, IndexedDB, cookies, logs, or analytics.

## Failure behavior

- Preserve invalid structured lookalikes rather than masking them.
- If Rampart cannot initialize or inference fails, show a clear local error and do not present structured-only output as complete detection.
- Allow a model-load retry after failure.
- If WebGPU initialization fails, use the bundled WASM path.
- Never fall back to a remote model or API.
- Never log user text.

## Manifest and permissions

Use Manifest V3 with a side-panel page and the minimum Chrome action code needed to open it.

Allow only the `sidePanel` permission. Do not request host, storage, telemetry, identity, clipboard, or network permissions. Clipboard writes occur only from the user's `Copy` click through the page clipboard API.

Package every script, stylesheet, model file, tokenizer file, icon, and WASM binary in `dist/`. Do not load executable code from a CDN.

## Testing

Use Vitest for the browser-agnostic core and Playwright with Chromium for the packaged extension.

Unit coverage includes:

- valid and invalid email candidates
- Dutch and international phone parsing
- valid and invalid BSNs under the 11-test
- valid and invalid IBANs under MOD-97
- valid and invalid cards under Luhn
- tokenizer-aware chunk planning and rebased offsets
- name joining and conservative address joining
- structured-over-model priority
- same-source longest-span behavior
- malformed span rejection
- exact highlighting segments
- right-to-left typed-placeholder masking
- preservation of unsupported values and punctuation

Dutch PII fixtures cover every supported type: `PERSON`, `ADDRESS`, `EMAIL`, `PHONE`, `BSN`, `IBAN`, and `CREDIT_CARD`. Negative fixtures cover invalid checksums and ordinary data that must remain.

A real browser smoke test verifies that the packaged Rampart model loads with remote model access disabled and detects a Dutch person and address. An extension end-to-end test loads `dist/` unpacked and exercises `Detect -> highlight -> Mask -> Copy`.

## Build and delivery

Provide npm scripts for:

- installing dependencies
- fetching or verifying the pinned Rampart build assets during development
- unit tests
- browser smoke and end-to-end tests
- type checking
- production build

Commit the pinned model revision or checksum information needed to make the build reproducible. Produce a complete `dist/` directory that Chrome can load through `chrome://extensions` in developer mode.

The README explains setup, the detection pipeline, supported and unsupported types, local-only guarantees, test commands, and unpacked installation.

## Acceptance criteria

The MVP is complete when:

1. Chrome loads `dist/` as an unpacked extension and opens Magpii in a side panel.
2. The UI completes the required paste, detect, highlight, mask, and copy flow.
3. Rampart and all structured detectors run locally in parallel.
4. Only the seven supported output types can be emitted.
5. Structured checks reject invalid BSN, IBAN, and card values.
6. Phone validation uses `libphonenumber-js`.
7. Overlap resolution follows the approved source and length rules.
8. User text is not persisted, logged, or sent over the network.
9. The model and runtime assets are packaged in `dist/`.
10. Unit, browser smoke, end-to-end, typecheck, and build checks pass.
