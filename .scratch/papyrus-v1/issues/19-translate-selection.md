# Translate a selection in the reader

Status: done
Blocked by: 11

Spec: [Papyrus v1 spec](../../papyrus/spec.md)

## Scope

A Translate action in the reader's selection bar. Asked for by the user on 2026-10-30, who chose DeepL through the server and Czech as the default target.

## Comments

- 2026-10-30: done.
  - **Server**: `src/translate/` handles translation.
    - It is on only when `PAPYRUS_DEEPL_API_KEY` is set. Free-plan keys (`:fx`) go to `api-free.deepl.com`, others to `api.deepl.com`, and `PAPYRUS_DEEPL_URL` overrides the host.
    - `GET /api/translate/status` → `{enabled}`.
    - `POST /api/translate {text ≤ 5000, target}` → `{text, detectedSource}`. It returns 503 `translation_off` without a key and 502 `translation_failed` with DeepL's reason (bad key, quota used up, busy).
    - The key never reaches the browser. An in-memory LRU of 500 results saves quota when the same words are selected again.
  - **Shared**: `TRANSLATE_TARGETS` (DeepL target codes with names), `DEFAULT_TRANSLATE_TARGET = 'CS'` and `TRANSLATE_TEXT_MAX`.
  - **Reader**: "Translate" in the selection bar, shown only when the server has a key. It opens `TranslationCard` under the selection (above it near the bottom) with the detected source language, a target picker, the translation, Copy and close. The card closes on a page turn or a tap.
    - The target is remembered per Profile and device under its own localStorage key, not in `ReaderPrefs`, which restyle the book whenever they change.
    - Selections over 5000 characters are cut, with a note.
  - **Tests**: 7 server tests (host choice, header and body, cache, failures, off without a key, validation, needs a Profile). e2e `fake-services.ts` (was `fake-openlibrary.ts`) also fakes `/v2/translate`, and the test translates a selection into Czech, then German.
