/* ============================================================
   translationService.js
   No machine-translation backend exists yet. translateText() is a
   stable, wireable contract: it persists a cache entry per
   (sourceHash, targetLang) under the user's data so a real MT API
   (Google Translate / DeepL / an LLM call) can be dropped in later
   without touching the UI. Until then it returns the original text
   annotated so testers can tell it's a passthrough, not a real
   translation.
   Contract:
     translateText(text, targetLang) -> Promise<string>
   ============================================================ */
(function (global) {
  const FC = global.FirebaseClient;
  const cache = {};

  function hashKey(text, targetLang) {
    let h = 0;
    for (let i = 0; i < text.length; i++) { h = ((h << 5) - h + text.charCodeAt(i)) | 0; }
    return targetLang + ':' + h;
  }

  async function translateText(text, targetLang) {
    if (!text) return text;
    if (targetLang === 'vi') return text; // source content is authored in VI by default
    const key = hashKey(text, targetLang);
    if (cache[key]) return cache[key];
    // TODO(AI engineer): replace with a real translation call, e.g.
    //   POST /translate { text, targetLang } -> { translated }
    const result = '[EN] ' + text;
    cache[key] = result;
    const col = FC.userCol('translationCache');
    if (col) col.add({ sourceText: text, targetLang, result, createdAt: FC.serverTimestamp() }).catch(() => {});
    return result;
  }

  global.TranslationService = { translateText };
})(window);
