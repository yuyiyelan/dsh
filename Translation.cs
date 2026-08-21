using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace TSKHook;

public class Translation
{
    public static HttpClient client = new();
    public static Dictionary<string, string> nameDicts = [];
    public static Dictionary<string, Dictionary<string, string>> chapterDicts = [];
    /// <summary>Guards chapterDicts writes (background fetch) vs F10 clear (main thread).</summary>
    public static readonly object ChapterLock = new();

    // ------------------------------------------------------------------
    // Local dictionary (offline) support
    // ------------------------------------------------------------------
    public const string LocalDictDir = "./BepInEx/plugins/translation_zh_Hans";

    static Translation()
    {
        client.DefaultRequestHeaders.UserAgent.ParseAdd($"{MyPluginInfo.PLUGIN_NAME}/{MyPluginInfo.PLUGIN_VERSION}");
        // do not hang forever on a dead network
        client.Timeout = TimeSpan.FromSeconds(15);
    }

    /// <summary>
    /// Build the remote base URL for a component.
    /// CRITICAL: the upstream platform ONLY hosts zh_Hant (Traditional Chinese).
    /// Requesting zh_Hans returns a 302 redirect to an HTML page, which would
    /// break JSON parsing. We ALWAYS request zh_Hant; the conversion to
    /// Simplified Chinese is done locally by HanConverter (see NormalizeDict).
    /// </summary>
    private static string RemoteUrl(string label)
    {
        return $"https://translation.lolida.best/download/tsk/{label}/zh_Hant/?format=json";
    }

    /// <summary>
    /// Safely read a JSON dictionary from an HTTP response. The upstream may
    /// answer 200 with an HTML error page (e.g. a 404/429 page); this returns
    /// an empty dict in that case instead of throwing.
    /// </summary>
    private static async Task<Dictionary<string, string>> ReadJsonDictSafeAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            if (response == null) return [];
            var raw = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(raw) || raw.TrimStart()[0] != '{')
            {
                return [];
            }
            return JsonSerializer.Deserialize<Dictionary<string, string>>(raw) ?? [];
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[Translator] JSON read failed (safe fallback): " + e.Message);
            return [];
        }
    }

    public static async Task InitAsync(CancellationToken cancellationToken = default)
    {
        if (!TSKConfig.TranslationEnabled) return;

        var lang = TSKConfig.TranslationLang; // "zh_Hans" or "zh_Hant"

        // 1. try offline local dictionary first (fully Simplified, shipped with the mod)
        if (LoadLocalNameDicts())
        {
            Plugin.Global.Log.LogInfo($"[Translator] Local simplified dictionary loaded. Total: {nameDicts.Count}");
            return;
        }

        // 2. remote: ALWAYS fetch zh_Hant (only language hosted upstream) and
        //    convert to Simplified locally. Build into a LOCAL dict and publish
        //    it with a single reference assignment at the end. This keeps the
        //    field atomic so a timed-out background InitAsync can never race
        //    with the main thread's reads.
        var merged = new Dictionary<string, string>();

        using var response =
            await client.GetAsync(RemoteUrl("tsk_name"), cancellationToken).ConfigureAwait(false);

        if (response.IsSuccessStatusCode)
        {
            var loaded = await ReadJsonDictSafeAsync(response, cancellationToken).ConfigureAwait(false);
            foreach (var pair in NormalizeDict(loaded))
            {
                merged[pair.Key] = pair.Value;
            }

            Plugin.Global.Log.LogInfo("[Translator] Character name translation loaded. Total: " + merged.Count);
        }
        else
        {
            Plugin.Global.Log.LogWarning(
                "[Translator] Character name translation failed to load, character name wouldn't translate.");
        }

        using var response2 =
            await client.GetAsync(RemoteUrl("tsk_subname"), cancellationToken).ConfigureAwait(false);

        if (response2.IsSuccessStatusCode)
        {
            var subNameDicts = await ReadJsonDictSafeAsync(response2, cancellationToken).ConfigureAwait(false);

            foreach (var pair in NormalizeDict(subNameDicts))
            {
                merged[pair.Key] = pair.Value;
            }

            Plugin.Global.Log.LogInfo("[Translator] Rando name translation loaded. Total: " + subNameDicts.Count);
        }
        else
        {
            Plugin.Global.Log.LogWarning(
                "[Translator] Rando name translation failed to load, rando name wouldn't translate.");
        }

        // 3. slang / terminology dict (place names, items, terms, etc.)
        using var response3 =
            await client.GetAsync(RemoteUrl("slang"), cancellationToken).ConfigureAwait(false);

        if (response3.IsSuccessStatusCode)
        {
            var slangDict = await ReadJsonDictSafeAsync(response3, cancellationToken).ConfigureAwait(false);
            foreach (var pair in NormalizeDict(slangDict))
            {
                merged[pair.Key] = pair.Value;
            }
            Plugin.Global.Log.LogInfo("[Translator] Slang/terminology translation loaded. Total: " + slangDict.Count);
        }
        else
        {
            Plugin.Global.Log.LogWarning(
                "[Translator] Slang translation failed to load.");
        }

        // publish atomically
        nameDicts = merged;

        // persist a local copy so the game works offline next time
        SaveLocalNameDicts();
    }

    /// <summary>
    /// Convert a raw dict into the target form:
    /// - zh_Hans: convert zh_Hant values to Simplified Chinese.
    /// - zh_Hant: keep as-is.
    /// Also override entries with the unified (community-reviewed) name list.
    /// </summary>
    private static Dictionary<string, string> NormalizeDict(Dictionary<string, string> dict)
    {
        if (dict == null) return [];

        var result = new Dictionary<string, string>(dict.Count);
        foreach (var pair in dict)
        {
            var value = pair.Value;
            if (TSKConfig.TranslationLang == "zh_Hans")
            {
                value = HanConverter.ToSimplified(value);
                // unified name override (community-reviewed simplified names)
                if (UnifiedNames.Overrides.TryGetValue(pair.Key, out var unified) && !string.IsNullOrEmpty(unified))
                {
                    value = unified;
                }
            }
            result[pair.Key] = value;
        }
        return result;
    }

    /// <summary>
    /// Reload the local name dictionary from disk (used by F10 so edits made
    /// with the dictionary editor take effect without a game restart).
    /// Safe to call when the files are missing: leaves the current dict intact.
    /// </summary>
    public static void ReloadNameDicts()
    {
        try
        {
            if (LoadLocalNameDicts())
            {
                Plugin.Global.Log.LogInfo("[Translator] Local name dictionary reloaded. Total: " + nameDicts.Count);
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[Translator] Name dictionary reload failed: " + e.Message);
        }
    }

    // ------------------------------------------------------------------
    // Local dictionary persistence
    // ------------------------------------------------------------------
    private static bool LoadLocalNameDicts()
    {
        try
        {
            if (!Directory.Exists(LocalDictDir)) return false;

            var nameFile = Path.Combine(LocalDictDir, "names.json");
            var subFile = Path.Combine(LocalDictDir, "subnames.json");
            var slangFile = Path.Combine(LocalDictDir, "slang.json");
            // B6: accept the shipped tsk_subname.json name too.
            if (!File.Exists(subFile))
            {
                var alt = Path.Combine(LocalDictDir, "tsk_subname.json");
                if (File.Exists(alt)) subFile = alt;
            }

            var loaded = 0;
            var result = new Dictionary<string, string>();
            if (File.Exists(nameFile))
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(nameFile));
                if (dict != null)
                {
                    foreach (var pair in dict) result[pair.Key] = pair.Value;
                    loaded += dict.Count;
                }
            }
            if (File.Exists(subFile))
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(subFile));
                if (dict != null)
                {
                    foreach (var pair in dict) result[pair.Key] = pair.Value;
                    loaded += dict.Count;
                }
            }
            if (File.Exists(slangFile))
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(slangFile));
                if (dict != null)
                {
                    foreach (var pair in dict) result[pair.Key] = pair.Value;
                    loaded += dict.Count;
                }
            }
            if (loaded > 0)
            {
                nameDicts = result;
                return true;
            }
            return false;
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[Translator] Failed to load local dictionary: " + e.Message);
            return false;
        }
    }

    private static void SaveLocalNameDicts()
    {
        try
        {
            if (nameDicts.Count == 0) return;
            Directory.CreateDirectory(LocalDictDir);
            var nameFile = Path.Combine(LocalDictDir, "names.json");

            // Save the whole merged dict; loader also accepts subnames.json/slang.json
            // (shipped offline package format).
            File.WriteAllText(nameFile, JsonSerializer.Serialize(nameDicts, new JsonSerializerOptions { WriteIndented = true }));
            Plugin.Global.Log.LogInfo("[Translator] Local dictionary saved to " + LocalDictDir);
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[Translator] Failed to save local dictionary: " + e.Message);
        }
    }

    // ------------------------------------------------------------------
    // Chapter (scenario) translation
    // ------------------------------------------------------------------
    public static async Task FetchChapterTranslationAsync(string label, CancellationToken cancellationToken = default)
    {
        // NEVER throw from here: this is called from a Harmony prefix on the
        // game's main thread (via .Wait()). Any exception would propagate into
        // the game's chapter-switch logic and break the story flow.
        try
        {
            // try offline local chapter dict first
            var localFile = Path.Combine(LocalDictDir, label + ".json");
            if (File.Exists(localFile))
            {
                try
                {
                    var local = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(localFile));
                    if (local != null && local.Count > 0)
                    {
                        lock (ChapterLock)
                        {
                            chapterDicts[label] = local;
                        }
                        Plugin.Global.Log.LogInfo($"[Translator] Chapter translation loaded from local cache: {label} ({local.Count})");
                        return;
                    }
                }
                catch { /* fall through to remote */ }
            }

            // ALWAYS request zh_Hant (only language hosted upstream); the
            // Simplified conversion happens in NormalizeDict below.
            using var response = await client.GetAsync(RemoteUrl(label), cancellationToken).ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                var responseContent = response.Content;
                var raw = await responseContent.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

                // The upstream may answer 200 with an HTML error page (404/429
                // page). Only parse when the body actually starts with '{'.
                if (string.IsNullOrWhiteSpace(raw) || raw.TrimStart()[0] != '{')
                {
                    // A6: don't cache an empty result — mark for retry instead.
                    MarkChapterFailed(label);
                    Plugin.Global.Log.LogWarning(
                        $"[Translator] Chapter '{label}' returned non-JSON content (HTTP {(int)response.StatusCode}), skipped.");
                    return;
                }

                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(raw);
                var normalized = NormalizeDict(dict);
                lock (ChapterLock)
                {
                    chapterDicts[label] = normalized;
                }
                Plugin.Global.Log.LogInfo("[Translator] Chapter translation loaded. Total: " + normalized.Count);

                // persist local copy
                try
                {
                    Directory.CreateDirectory(LocalDictDir);
                    File.WriteAllText(localFile, JsonSerializer.Serialize(normalized, new JsonSerializerOptions { WriteIndented = true }));
                }
                catch { }
            }
            else
            {
                // A6: don't cache an empty result — mark for retry instead.
                MarkChapterFailed(label);
                Plugin.Global.Log.LogWarning(
                    "[Translator] Chapter translation failed to load, chapter text wouldn't translate.");
            }
        }
        catch (Exception e)
        {
            // safety net: never let a network/parse error break the game
            MarkChapterFailed(label);
            Plugin.Global.Log.LogWarning($"[Translator] Chapter '{label}' load error (safe fallback): " + e.Message);
        }
    }

    public static string currentAdvId;

    // ---- A6: failed chapter fetches get a short retry back-off instead of a
    // permanent empty cache entry (which made the session never retry). ----
    private static readonly Dictionary<string, DateTime> ChapterFailTimes = new();
    private static readonly object ChapterFailLock = new();

    public static bool IsChapterRetryBlocked(string label)
    {
        lock (ChapterFailLock)
        {
            return ChapterFailTimes.TryGetValue(label, out var t) && (DateTime.UtcNow - t).TotalSeconds < 60;
        }
    }

    private static void MarkChapterFailed(string label)
    {
        lock (ChapterFailLock)
        {
            ChapterFailTimes[label] = DateTime.UtcNow;
        }
    }
}
