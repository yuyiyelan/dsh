// AutoTranslate: on-demand background API translation with persistent memory.
//
// Goal: when the game shows Japanese text that is missing from the local
// dictionaries, translate it automatically via the user-configured
// OpenAI-compatible API — WITHOUT blocking the game thread — and remember the
// result on disk so the next launch uses it instantly (no repeated API calls,
// no manual dictionary updates).
//
// Design:
//   - A background thread drains a queue of untranslated strings.
//   - Results are stored in a persistent JSON file (api_ui.json) which is
//     loaded at startup and merged into the UI dictionary.
//   - The same string is only requested once per session (in-flight set).
//   - A per-frame budget (e.g. 3 requests/second) prevents API abuse.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace TSKHook;

public static class AutoTranslate
{
    private static readonly Queue<string> Pending = new();
    private static readonly HashSet<string> InFlight = new();
    private static readonly object Sync = new();
    private static readonly Dictionary<string, string> Persistent = new();
    private static Thread Worker;
    private static bool Started;
    private static string PersistPath;
    private static DateTime LastWrite = DateTime.MinValue;

    private const int MaxQueue = 512;
    private const int BatchSize = 2;      // translations per API call (3 timed out too often)
    private const int MinLen = 4;
    private const int MaxLen = 300;
    private const int ApiTimeoutSec = 45;  // DeepSeek can take >20s on long batches

    /// <summary>Failed (timeout/HTTP) normalized keys with a back-off timestamp,
    /// so repeated failures don't hammer the API and burn quota (each retry
    /// waits at least FailBackoffSec).</summary>
    private static readonly Dictionary<string, DateTime> FailBackoff = new();
    private static readonly object BackoffLock = new();
    private const int FailBackoffSec = 60;

    /// <summary>
    /// One shared HttpClient for all API calls. Creating a client per batch
    /// (the old code) leaked one socket pair per request into TIME_WAIT and
    /// skipped connection reuse; at ~3 batches/sec a long session created
    /// thousands of clients. Timeout is enforced per request via CancellationTokenSource.
    /// </summary>
    private static readonly HttpClient ApiClient = CreateApiClient();

    private static HttpClient CreateApiClient()
    {
        var client = new HttpClient();
        client.Timeout = Timeout.InfiniteTimeSpan; // per-request CTS bounds the wait
        return client;
    }

    private static bool IsBackoff(string key)
    {
        lock (BackoffLock)
        {
            return FailBackoff.TryGetValue(key, out var t) && (DateTime.UtcNow - t).TotalSeconds < FailBackoffSec;
        }
    }

    private static void MarkBackoff(string key)
    {
        lock (BackoffLock)
        {
            FailBackoff[key] = DateTime.UtcNow;
            if (FailBackoff.Count > 512) FailBackoff.Clear();
        }
    }

    /// <summary>Normalize numeric runs into '#' placeholders (shared impl, see TextUtil).</summary>
    public static string NormalizeNumbers(string text) => TextUtil.NormalizeNumbers(text);

    /// <summary>Restore numeric runs into '#' placeholders (shared impl, see TextUtil).</summary>
    public static string RestoreNumbers(string template, string original) => TextUtil.RestoreNumbers(template, original);

    /// <summary>Replace rich-text tags (&lt;color=#XXXXXX&gt;, &lt;size&gt;, ...)
    /// with @@N@@ placeholders before AI translation so the model can never
    /// corrupt them (dropping '#', merging tags, etc). Plain-text placeholders
    /// are kept verbatim by the model (control-char placeholders were not).</summary>
    private static string ProtectTags(string text, List<string> tags)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var sb = new StringBuilder(text.Length);
        for (int i = 0; i < text.Length; i++)
        {
            if (text[i] == '<')
            {
                int end = text.IndexOf('>', i);
                if (end > i && end - i <= 64)
                {
                    string tag = text.Substring(i, end - i + 1);
                    sb.Append("@@").Append(tags.Count).Append("@@");
                    tags.Add(tag);
                    i = end;
                    continue;
                }
            }
            sb.Append(text[i]);
        }
        return sb.ToString();
    }

    private static string RestoreTags(string text, List<string> tags)
    {
        for (int i = 0; i < tags.Count; i++)
        {
            text = text.Replace("@@" + i + "@@", tags[i]);
        }
        return text;
    }

    private static bool HasJapaneseKana(string s) => TextUtil.HasJapaneseKana(s);

    private static int CountHashes(string s) => TextUtil.CountHashes(s);

    /// <summary>Normalize + verify a translation before persisting. When the
    /// number-placeholder counts line up, the pair is stored under the
    /// normalized template key so every dynamic variant reuses it. When they
    /// DON'T line up (the model dropped/merged a number, or wrote Chinese
    /// numerals), the old code threw the translation away entirely — instead
    /// the raw pair is stored under the exact source string, so at least that
    /// exact text is translated next time (Lookup tries the exact key first).</summary>
    private static string[] PreparePersist(string src, string tr)
    {
        var keyNorm = NormalizeNumbers(src);
        var valNorm = NormalizeNumbers(tr);
        int keyHashes = CountHashes(keyNorm);
        int valHashes = CountHashes(valNorm);
        if (keyHashes != valHashes)
        {
            Plugin.Global.Log.LogWarning($"[AutoTranslate] placeholder mismatch ({keyHashes} vs {valHashes}); storing exact-match only");
            return new[] { src, tr };
        }
        return new[] { keyNorm, valNorm };
    }

    /// <summary>Called once at plugin load.</summary>
    public static void Initialize()
    {
        try
        {
            var dir = Path.GetDirectoryName(typeof(Translation).Assembly.Location);
            PersistPath = Path.Combine(dir, "translation_zh_Hans", "api_ui.json");
            if (File.Exists(PersistPath))
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(PersistPath));
                if (dict != null)
                {
                    lock (Sync)
                    {
                        foreach (var kv in dict) Persistent[kv.Key] = kv.Value;
                    }
                    Plugin.Global.Log.LogInfo($"[AutoTranslate] loaded {dict.Count} persisted translations");
                }
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[AutoTranslate] init: " + e.Message);
        }
    }

    /// <summary>
    /// Look up a persisted translation (fast path, no API). Returns null when
    /// unknown, so callers fall back to the original text / queue it.
    /// First tries the exact text, then the number-normalized template so
    /// dynamic texts (skill values) reuse one translation.
    /// </summary>
    public static string Lookup(string text)
    {
        if (string.IsNullOrEmpty(text)) return null;
        lock (Sync)
        {
            if (Persistent.TryGetValue(text, out var v)) return v;
            var key = NormalizeNumbers(text);
            if (key != text && Persistent.TryGetValue(key, out var tpl))
            {
                return RestoreNumbers(tpl, text);
            }
            // trimmed variant (the game occasionally appends a trailing tab;
            // without this the SAME string would be re-translated once per
            // spelling — burning tokens)
            var trimmed = text.Trim();
            if (trimmed.Length != text.Length)
            {
                if (Persistent.TryGetValue(trimmed, out var tv)) return tv;
                var tkey = NormalizeNumbers(trimmed);
                if (tkey != trimmed && Persistent.TryGetValue(tkey, out var ttpl))
                {
                    return RestoreNumbers(ttpl, text);
                }
            }
        }
        return null;
    }

    /// <summary>Enqueue a string for background translation (dedup, capped).
    /// Already-translated content is never re-requested: exact match OR the
    /// number-normalized template match both skip the queue.</summary>
    public static void Request(string text)
    {
        if (!TSKConfig.ApiTranslationEnabled) return;
        if (string.IsNullOrEmpty(text)) return;
        text = text.Trim();
        if (text.Length < MinLen || text.Length > MaxLen) return;
        // skip pure ASCII / no-Japanese (shared scan, see TextUtil)
        if (!TextUtil.ContainsJapanese(text)) return;
        // Dictionary-first guard (belt-and-suspenders): never spend API tokens
        // on text the runtime dictionaries already cover. TranslateUi checks
        // before calling us, but the story path does not.
        if (Translation.nameDicts != null && Translation.nameDicts.TryGetValue(text, out var known) &&
            !string.IsNullOrEmpty(known))
        {
            return;
        }

        var key = NormalizeNumbers(text);
        lock (Sync)
        {
            if (Persistent.ContainsKey(text) || Persistent.ContainsKey(key)) return;
            if (InFlight.Contains(key)) return;
            if (IsBackoff(key)) return; // recent failure: don't re-request yet
            if (Pending.Count >= MaxQueue) return;
            InFlight.Add(key);
            Pending.Enqueue(text);
            EnsureWorker();
        }
    }

    private static void EnsureWorker()
    {
        if (Started) return;
        Started = true;
        try
        {
            Worker = new Thread(Loop) { IsBackground = true, Name = "TSKHookAutoTranslate" };
            Worker.Start();
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[AutoTranslate] worker start: " + e.Message);
            Started = false;
        }
    }

    private static void Loop()
    {
        while (true)
        {
            try
            {
                List<string> batch = null;
                lock (Sync)
                {
                    if (Pending.Count > 0)
                    {
                        batch = new List<string>();
                        int n = Math.Min(BatchSize, Pending.Count);
                        for (int i = 0; i < n; i++) batch.Add(Pending.Dequeue());
                    }
                }
                if (batch == null || batch.Count == 0)
                {
                    Thread.Sleep(500);
                    continue;
                }
                TranslateBatch(batch);
                Thread.Sleep(350); // ~3 batches/sec max
            }
            catch (Exception)
            {
                Thread.Sleep(1000);
            }
        }
    }

    private static void TranslateBatch(List<string> batch)
    {
        try
        {
            if (string.IsNullOrEmpty(TSKConfig.ApiUrl) || string.IsNullOrEmpty(TSKConfig.ApiKey)) return;

            // NiuTrans (小牛翻译) uses its own protocol, not OpenAI-compatible:
            //   POST /v2/text/translate  {from, to, apikey, src_text}
            //   -> {"tgt_text": "..."} (single string per call).
            if (TSKConfig.ApiUrl.Contains("niutrans", StringComparison.OrdinalIgnoreCase))
            {
                TranslateNiuTrans(batch);
                return;
            }

            // Protect rich-text tags so the model can't corrupt them.
            var protectedBatch = new List<string>();
            var batchTags = new List<List<string>>();
            foreach (var s in batch)
            {
                var tags = new List<string>();
                protectedBatch.Add(ProtectTags(s, tags));
                batchTags.Add(tags);
            }
            var joined = string.Join("\n---\n", protectedBatch);
            var payload = new
            {
                model = string.IsNullOrEmpty(TSKConfig.ApiModel) ? "gpt-4o-mini" : TSKConfig.ApiModel,
                temperature = 0.3,
                max_tokens = 2048,
                messages = new object[]
                {
                    new { role = "system", content = "You are a professional game localization translator. Translate each Japanese line into Simplified Chinese (简体中文). Preserve line structure: keep the '---' separators and translate each segment in order. Output only the translated lines, no explanations." },
                    new { role = "user", content = joined }
                }
            };
            var json = JsonSerializer.Serialize(payload);
            var req = new HttpRequestMessage(HttpMethod.Post, TSKConfig.ApiUrl);
            req.Headers.TryAddWithoutValidation("Authorization", "Bearer " + TSKConfig.ApiKey);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(ApiTimeoutSec));
            using var resp = ApiClient.Send(req, cts.Token);
            if (!resp.IsSuccessStatusCode)
            {
                Plugin.Global.Log.LogWarning($"[AutoTranslate] HTTP {(int)resp.StatusCode}");
                foreach (var s in batch) MarkBackoff(NormalizeNumbers(s));
                return;
            }
            using var doc = JsonDocument.Parse(resp.Content.ReadAsStringAsync().GetAwaiter().GetResult());
            var translated = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
            if (string.IsNullOrEmpty(translated)) return;

            var lines = translated.Split(new[] { "\n---\n" }, StringSplitOptions.None);
            if (lines.Length != batch.Count)
            {
                if (batch.Count == 1)
                {
                    // Single item: use the whole response (may contain the
                    // model's own newlines — they belong to this one string).
                    lines = new[] { translated.Trim() };
                }
                else
                {
                    // Batch alignment is unreliable when the model adds its own
                    // newlines (translations get assigned to the wrong source).
                    // Retry each item alone so results can never swap.
                    Plugin.Global.Log.LogWarning($"[AutoTranslate] segment mismatch ({batch.Count} in, {lines.Length} out); retrying individually");
                    foreach (var s in batch)
                    {
                        TranslateBatch(new List<string> { s });
                    }
                    return;
                }
            }
            bool changed = false;
            lock (Sync)
            {
                for (int i = 0; i < batch.Count && i < lines.Length; i++)
                {
                    var src = batch[i];
                    var tr = lines[i]?.Trim();
                    // Review: only persist translations that actually look
                    // translated (no Japanese kana left). Never store a failed /
                    // partial AI result so it can't corrupt the display.
                    if (!string.IsNullOrEmpty(tr) && tr != src && !HasJapaneseKana(tr))
                    {
                        // Reject meta-text outputs ("The translation of X is: …").
                        // Once persisted they corrupt the display; the dictionary
                        // editor is the right place for those fixes.
                        if (tr.Contains("的翻译") || tr.Contains("翻译如下") || tr.Contains("的翻訳"))
                        {
                            Plugin.Global.Log.LogWarning("[AutoTranslate] meta-text output rejected: " + Truncate(tr, 80));
                            continue;
                        }
                        // Restore protected rich-text tags (<color=#...> etc).
                        tr = RestoreTags(tr, batchTags[i]);
                        // Review: if the source had rich-text tags but the model
                        // dropped the placeholders, the result is corrupt —
                        // never store it (it would show "166 4 16" style garbage).
                        if (batchTags[i].Count > 0 && tr.IndexOf('<') < 0)
                        {
                            Plugin.Global.Log.LogWarning("[AutoTranslate] tag placeholders lost by model; dropping translation");
                            continue;
                        }
                        // Unify character names so AI translations match the
                        // bwiki authoritative names (莎夏/空贤/悠米 etc).
                        tr = UnifiedNameApplier.Apply(tr);
                        // Store BOTH key and value number-normalized so the
                        // '#' placeholders line up with the original's numbers
                        // (the model keeps some digits verbatim, e.g. "4CT").
                        var kv = PreparePersist(src, tr);
                        if (kv != null)
                        {
                            Persistent[kv[0]] = kv[1];
                            changed = true;
                        }
                    }
                }
            }
            if (changed)
            {
                // New translations landed: drop cached misses so the next
                // SetText picks up the translated text.
                PatchUi.InvalidateUiCache();
                Persist();
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[AutoTranslate] batch error: " + e.Message);
            // Back off failed keys so a slow/erroring API isn't re-hit on the
            // very next occurrence (avoids burning quota on repeated timeouts).
            try
            {
                lock (Sync)
                {
                    foreach (var s in batch) MarkBackoff(NormalizeNumbers(s));
                }
            }
            catch (Exception)
            {
            }
        }
        finally
        {
            lock (Sync)
            {
                // Remove by the SAME normalized key used at enqueue time —
                // removing the raw text would leak the in-flight marker forever
                // for any text containing numbers (A1).
                foreach (var s in batch) InFlight.Remove(NormalizeNumbers(s));
            }
        }
    }

    /// <summary>
    /// Translate a batch through the NiuTrans (小牛翻译) REST API.
    /// Protocol: POST {url} with JSON {from:"ja", to:"zh", apikey, src_text};
    /// response is {"tgt_text":"..."}. Each string is sent individually.
    /// </summary>
    private static void TranslateNiuTrans(List<string> batch)
    {
        try
        {
            foreach (var src0 in batch)
            {
                try
                {
                    var tags = new List<string>();
                    var src = ProtectTags(src0, tags);
                    var payload = new
                    {
                        from = "ja",
                        to = TSKConfig.TranslationLang == "zh_Hant" ? "cht" : "zh",
                        apikey = TSKConfig.ApiKey,
                        src_text = src,
                    };
                    var req = new HttpRequestMessage(HttpMethod.Post, TSKConfig.ApiUrl);
                    req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
                    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(ApiTimeoutSec));
                    using var resp = ApiClient.Send(req, cts.Token);
                    var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!resp.IsSuccessStatusCode)
                    {
                        Plugin.Global.Log.LogWarning($"[AutoTranslate] NiuTrans HTTP {(int)resp.StatusCode}: {Truncate(body, 200)}");
                        continue;
                    }
                    using var doc = JsonDocument.Parse(body);
                    if (doc.RootElement.TryGetProperty("tgt_text", out var tgt))
                    {
                        var tr = tgt.GetString()?.Trim();
                        if (!string.IsNullOrEmpty(tr) && tr != src && !HasJapaneseKana(tr) &&
                            !tr.Contains("的翻译") && !tr.Contains("翻译如下") && !tr.Contains("的翻訳"))
                        {
                            tr = RestoreTags(tr, tags);
                            if (tags.Count > 0 && tr.IndexOf('<') < 0)
                            {
                                Plugin.Global.Log.LogWarning("[AutoTranslate] NiuTrans tag placeholders lost; dropping translation");
                                continue;
                            }
                            tr = UnifiedNameApplier.Apply(tr);
                            var kv = PreparePersist(src0, tr);
                            if (kv != null)
                            {
                                lock (Sync)
                                {
                                    Persistent[kv[0]] = kv[1];
                                }
                                PatchUi.InvalidateUiCache();
                                Persist();
                            }
                        }
                    }
                    else if (doc.RootElement.TryGetProperty("errorMsg", out var em))
                    {
                        Plugin.Global.Log.LogWarning($"[AutoTranslate] NiuTrans error: {em.GetString()}");
                    }
                    else
                    {
                        Plugin.Global.Log.LogWarning($"[AutoTranslate] NiuTrans unexpected response: {Truncate(body, 200)}");
                    }
                }
                catch (Exception e)
                {
                    Plugin.Global.Log.LogWarning($"[AutoTranslate] NiuTrans item error: {e.Message}");
                }
                Thread.Sleep(200); // be gentle with rate limits
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[AutoTranslate] NiuTrans batch error: " + e.Message);
        }
        finally
        {
            // CRITICAL: always release in-flight markers (by the normalized key,
            // matching enqueue) otherwise failed batches would never be retried
            // (stuck forever in InFlight — A1).
            lock (Sync)
            {
                foreach (var s in batch) InFlight.Remove(NormalizeNumbers(s));
            }
        }
    }

    private static void Persist()
    {
        try
        {
            // throttle disk writes: at most once per 5 seconds
            if ((DateTime.UtcNow - LastWrite).TotalSeconds < 5) return;
            LastWrite = DateTime.UtcNow;
            Dictionary<string, string> snapshot;
            lock (Sync)
            {
                snapshot = new Dictionary<string, string>(Persistent);
            }
            var dir = Path.GetDirectoryName(PersistPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            // Atomic write: a crash/power loss mid-write must never corrupt
            // api_ui.json (all persisted memories would be lost). Write a
            // temp file, then move over the target.
            var tmp = PersistPath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(snapshot), new UTF8Encoding(false));
            File.Move(tmp, PersistPath, true);
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[AutoTranslate] persist: " + e.Message);
        }
    }

    /// <summary>Persist immediately (called on game quit / cache clear).</summary>
    public static void Flush()
    {
        LastWrite = DateTime.MinValue;
        Persist();
    }

    /// <summary>
    /// Clear in-memory translation state and reload persisted memory from disk
    /// (used by F10 so edited api_ui.json / new translations take effect).
    /// </summary>
    public static void InvalidateMemory()
    {
        lock (Sync)
        {
            Persistent.Clear();
            InFlight.Clear();
            Pending.Clear();
        }
        lock (BackoffLock)
        {
            FailBackoff.Clear();
        }
        Initialize(); // reload api_ui.json from disk
        PatchUi.InvalidateUiCache();
    }

    private static string Truncate(string s, int max)
    {
        if (string.IsNullOrEmpty(s) || s.Length <= max) return s ?? "";
        return s.Substring(0, max) + "...";
    }
}
