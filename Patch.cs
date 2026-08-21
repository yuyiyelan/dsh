using System.IO;
using BepInEx;
using HarmonyLib;
using TMPro;
using UnityEngine;
using Utage;
using UtageExtensions;

namespace TSKHook;

/// <summary>
/// Core Harmony patches. Every target method has been verified against the
/// current game build (BepInEx/interop/Assembly-CSharp.dll):
///   - FPS override (GameConfig.set_FixedFrameRate)
///   - chapter change hook (AdvDataManager.DownloadChaperKeyFileUsed): loads
///     the chapter dictionary and the CJK font on demand
///   - chapter title translation (AdventureTitleBandView.Initialize)
///   - dialogue font replacement (UguiNovelText.OnEnable)
///   - character / backlog name translation (AdvPage, AdvBacklog)
///   - dialogue body translation (LanguageManagerBase.ParseCellLocalizedTextBySwapDefaultLanguage)
///   - window size lock (Screen.SetResolution) and picture-book zoom (MaximizeCharaView)
/// </summary>
public class Patch
{
    /// <summary>Fallback CJK font bundle name inside BepInEx/plugins/font.</summary>
    public static string fontName = "notosanscjktc";
    public static Font TranslateFont;
    public static TMP_FontAsset TMPTranslateFont;

    /// <summary>Dynamic Simplified-Chinese system font (Microsoft YaHei), used by UGUI Text components.</summary>
    public static Font SimplifiedFont;

    /// <summary>
    /// Install all Harmony patches. Core patches are applied unconditionally.
    /// </summary>
    public static void Initialize()
    {
        var harmony = new Harmony("com.tskhook.main");

        // Core patches (verified against the game): if any of these fail the
        // mod is incompatible with the current game build.
        try
        {
            harmony.PatchAll(typeof(Patch));
            Plugin.Global.Log.LogInfo("[Patch] PatchAll OK (all hooks installed).");
        }
        catch (System.Exception e)
        {
            // A failing patch must never take down the rest of the plugin.
            Plugin.Global.Log.LogError("[Patch] PatchAll failed: " + e);
        }

        // NOTE: PatchExtra is intentionally empty. Its former targets
        // (AdvPage.get_Text / AdvBacklog.get_Text) do not exist in the current
        // game build; chapter text translation is fully covered by
        // ParseCellLocalizedTextBySwapDefaultLanguage.
    }

    /// <summary>Override the game's fixed frame rate when the configured FPS &gt; 60.</summary>
    [HarmonyPrefix]
    [HarmonyPatch(typeof(GameConfig), "set_FixedFrameRate")]
    public static void set_FixedFrameRate(ref int value)
    {
        if (TSKConfig.FPS > 60)
        {
            value = TSKConfig.FPS;
            Plugin.Global.Log.LogInfo("FPS setting was overridden: " + value);
        }
    }

    /// <summary>
    /// Fired when the game enters a new chapter/scenario: lazily loads the CJK
    /// font and the chapter's translation dictionary (local cache first, then
    /// remote, with a bounded HttpClient timeout).
    /// </summary>
    [HarmonyPrefix]
    [HarmonyPatch(typeof(AdvDataManager), "DownloadChaperKeyFileUsed")]
    public static void DownloadChaperKeyFileUsed(ref string scenarioLabel)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        if (scenarioLabel != null)
        {
            try
            {
                if (TranslateFont == null || TMPTranslateFont == null)
                {
                    LoadFontBundle();
                }

                Translation.currentAdvId = scenarioLabel.ToLowerInvariant();
                if (!Translation.chapterDicts.ContainsKey(Translation.currentAdvId) &&
                    !Translation.IsChapterRetryBlocked(Translation.currentAdvId))
                {
                    Translation.FetchChapterTranslationAsync(Translation.currentAdvId).Wait();
                }
                Plugin.Global.Log.LogInfo(scenarioLabel);
            }
            catch (System.Exception e)
            {
                // safety net: a dictionary problem must never break the game's
                // chapter-switch flow (the game would fall back to Japanese text)
                Plugin.Global.Log.LogWarning("[Patch] Chapter hook error (safe fallback): " + e.Message);
            }
        }
    }

    /// <summary>
    /// Load the CJK font for translated text.
    /// IMPORTANT: only the plugin-shipped notosanscjktc bundle is used. The
    /// NotoSansSC bundle in the game root is AutoTranslator's own TMP font
    /// (TMP 1.1.0 vs game TMP 1.4.0 mismatch); assigning it to game text
    /// components corrupts rendering (overlapping/garbled glyphs). The
    /// plugin-shipped bundle is game-compatible (verified against the build).
    /// Asset names are enumerated at runtime so internal names do not matter.
    /// </summary>
    private static void LoadFontBundle()
    {
        var path = $"{Paths.PluginPath}/font/{fontName}";

        try
        {
            if (!File.Exists(path))
            {
                Plugin.Global.Log.LogWarning("[Patch] Font bundle not found: " + path);
                return;
            }

            var bundle = AssetBundle.LoadFromFile(path);
            if (bundle == null)
            {
                Plugin.Global.Log.LogWarning("[Patch] Failed to load font bundle: " + path);
                return;
            }

            Font font = null;
            TMP_FontAsset tmpFont = null;

            foreach (var assetName in bundle.GetAllAssetNames())
            {
                var asset = bundle.LoadAsset(assetName);
                if (asset == null) continue;

                if (tmpFont == null)
                {
                    var tmp = asset.TryCast<TMP_FontAsset>();
                    if (tmp != null) tmpFont = tmp;
                }
                if (font == null)
                {
                    var f = asset.TryCast<Font>();
                    if (f != null) font = f;
                }
                if (font != null && tmpFont != null) break;
            }

            bundle.Unload(false);

            if (font != null || tmpFont != null)
            {
                TranslateFont = font;
                TMPTranslateFont = tmpFont;
                Plugin.Global.Log.LogInfo("[Patch] Font loaded from: " + path +
                                          (font != null ? " (Font)" : "") +
                                          (tmpFont != null ? " (TMP SDF)" : ""));
                return;
            }

            Plugin.Global.Log.LogWarning("[Patch] No Font/TMP_FontAsset found in: " + path);
        }
        catch (System.Exception e)
        {
            Plugin.Global.Log.LogWarning("[Patch] Font load error for " + path + ": " + e.Message);
        }
    }

    /// <summary>
    /// NOTE: the former dynamic-YaHei fallback (TryAddSimplifiedFallbackFont)
    /// was removed: FontEngine.LoadFontFace cannot load OS dynamic fonts in
    /// this game (Invalid_File), so dynamic TMP fonts are impossible. Displayed
    /// text is instead converted to Traditional glyphs (SimToHanConverter) so
    /// the bundled Traditional font renders everything.
    /// </summary>

    [HarmonyPrefix]
    [HarmonyPatch(typeof(AdventureTitleBandView), "Initialize")]
    public static void AdvIniPre(AdventureTitleBandView __instance)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        // currentAdvId may still be null before the first chapter download;
        // Dictionary.TryGetValue(null) throws, so guard it.
        if (Translation.currentAdvId == null)
        {
            return;
        }

        string value;
        if (Translation.chapterDicts.ContainsKey(Translation.currentAdvId) && Translation.chapterDicts[Translation.currentAdvId].TryGetValue(__instance.TitleText, out value))
        {
            var t = value.IsNullOrEmpty() ? __instance.TitleText : SimToHanConverter.ToTraditionalGlyphs(value);
            __instance.TitleText = UnifiedNameApplier.Apply(t);
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(AdventureTitleBandView), "Initialize")]
    public static void AdvInitPost(AdventureTitleBandView __instance)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        if (TMPTranslateFont != null)
        {
            __instance.upTextComp.text.font = TMPTranslateFont;
            __instance.donwTextComp.text.font = TMPTranslateFont;

            for (int i = 0; i < __instance.titleText.Length; i++)
            {
                __instance.titleText[i].font = TMPTranslateFont;
            }

            for (int i = 0; i < __instance.donwTextObject.Length; i++)
            {
                TKSTextTMPGUI component = __instance.donwTextObject[i].GetComponent<TKSTextTMPGUI>();
                if (component != null && component.text != null) // C6: null guard
                {
                    component.text.font = TMPTranslateFont;
                }
            }
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(UguiNovelText), "OnEnable")]
    public static void FontPatch(ref UguiNovelText __instance)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        if (TranslateFont != null)
        {
            __instance.font = TranslateFont;
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(AdvPage), "get_NameText")]
    public static void get_NameText(ref string __result)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        // guard null result: Dictionary.TryGetValue(null) would throw
        if (string.IsNullOrEmpty(__result))
        {
            return;
        }

        // Name-bar cache: names repeat constantly (same speaker for whole
        // scenes); avoid re-running conversion on every access.
        // Fast path first (lock-free read), fall back to locked write on miss.
        string cachedName;
        bool cacheHit;
        lock (NameCacheLock)
        {
            cacheHit = NameCache.TryGetValue(__result, out cachedName);
        }
        if (cacheHit)
        {
            __result = cachedName;
            return;
        }

        string value;
        string result;
        // CorrectNames overrides wrong entries in names.json for the name bar.
        if (UnifiedNamesData.CorrectNames.TryGetValue(__result, out var correct))
        {
            result = SimToHanConverter.ToTraditionalGlyphs(correct, SimToHanConverter.UiFont);
        }
        else if (Translation.nameDicts.TryGetValue(__result, out value))
        {
            var t = value.IsNullOrEmpty() ? __result : SimToHanConverter.ToTraditionalGlyphs(value, SimToHanConverter.UiFont);
            result = UnifiedNameApplier.Apply(t);
        }
        else
        {
            result = __result;
        }

        lock (NameCacheLock)
        {
            if (NameCache.Count >= NameCacheMax) NameCache.Clear();
            NameCache[__result] = result;
        }
        __result = result;
    }

    private static readonly System.Collections.Generic.Dictionary<string, string> NameCache = new();
    private static readonly object NameCacheLock = new();
    private const int NameCacheMax = 1024;

    /// <summary>Clear the name-bar cache (used by F10 so edited dictionaries apply).</summary>
    public static void ClearNameCache()
    {
        lock (NameCacheLock)
        {
            NameCache.Clear();
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(AdvBacklog), "get_MainCharacterNameText")]
    public static void get_MainCharacterNameText(ref string __result)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        if (string.IsNullOrEmpty(__result))
        {
            return;
        }

        string value;
        // CorrectNames overrides wrong entries in names.json for the name bar.
        if (UnifiedNamesData.CorrectNames.TryGetValue(__result, out var correct))
        {
            __result = SimToHanConverter.ToTraditionalGlyphs(correct, SimToHanConverter.UiFont);
            return;
        }
        if (Translation.nameDicts.TryGetValue(__result, out value))
        {
            var t = value.IsNullOrEmpty() ? __result : SimToHanConverter.ToTraditionalGlyphs(value, SimToHanConverter.UiFont);
            __result = UnifiedNameApplier.Apply(t);
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(LanguageManagerBase), "ParseCellLocalizedTextBySwapDefaultLanguage")]
    public static void ParseCellLocalizedTextBySwapDefaultLanguage(ref StringGridRow row, ref string defaultColumnName,
        ref string __result)
    {
        if (!TSKConfig.TranslationEnabled)
        {
            return;
        }

        // Collect ALL cells of every parsed row (dedup, persisted) so the full
        // language-table text set can be translated offline without visiting
        // every screen.
        CollectParseRow(row);

        // guard: Dictionary.TryGetValue(null) throws
        if (string.IsNullOrEmpty(__result))
        {
            return;
        }

        // 1) chapter dict lookup (exact first, then trimmed — the game
        //    occasionally appends a trailing tab to story lines)
        string value;
        var storyKey = __result.Trim();
        if (Translation.currentAdvId != null &&
            Translation.chapterDicts.TryGetValue(Translation.currentAdvId, out var chapter) &&
            (chapter.TryGetValue(__result, out value) ||
             (storyKey != __result && chapter.TryGetValue(storyKey, out value))))
        {
            // Story font (notosanscjktc) is a FULL CJK font that includes
            // Simplified glyphs — convert with its glyph set so Simplified
            // text stays Simplified (A4: plain full-Traditional conversion
            // was making the whole story display in traditional forms).
            var t = value.IsNullOrEmpty() ? __result : SimToHanConverter.ToTraditionalGlyphs(value, TMPTranslateFont);
            __result = UnifiedNameApplier.Apply(t);
            return;
        }

        // 2) on-demand translation for strings missing from dictionaries:
        //    check persisted memory first, else queue a background API
        //    translation (non-blocking — the story keeps showing the original
        //    until the translation arrives, then it's picked up on replay).
        if (TSKConfig.ApiTranslationEnabled && __result.Length <= 120)
        {
            var remembered = AutoTranslate.Lookup(__result);
            if (remembered != null)
            {
                var t2 = SimToHanConverter.ToTraditionalGlyphs(remembered, TMPTranslateFont);
                __result = UnifiedNameApplier.Apply(t2);
                return;
            }
            AutoTranslate.Request(__result);
        }
    }

    private static readonly object ParseLock = new object();
    private static readonly System.Collections.Generic.HashSet<string> ParseSeen = new();
    private static int ParseCount;
    private static readonly string ParsePath =
        System.IO.Path.Combine(Paths.PluginPath, "font", "tsk_parse_all.txt");

    private static void CollectParseRow(StringGridRow row)
    {
        if (!TSKConfig.DiagnosticsEnabled) return; // C1
        try
        {
            // Fast path: identical row instances (same native pointer) were
            // already collected — skip the per-string JP scan entirely.
            long ptr = 0;
            try { ptr = row.Pointer.ToInt64(); } catch (System.Exception) { }
            if (ptr != 0)
            {
                lock (ParseLock)
                {
                    if (!ParseRowsSeen.Add(ptr)) return;
                    if (ParseRowsSeen.Count > 4096) ParseRowsSeen.Clear();
                }
            }
            var strings = row.Strings;
            if (strings == null || strings.Length == 0) return;
            var batch = new System.Collections.Generic.List<string>();
            for (int i = 0; i < strings.Length; i++)
            {
                string s;
                try { s = strings[i]; }
                catch (System.Exception) { continue; }
                if (string.IsNullOrEmpty(s) || s.Length < 2 || s.Length > 400) continue;
                bool hasJp = false;
                for (int k = 0; k < s.Length; k++)
                {
                    char c = s[k];
                    if (c >= 0x3040 && c <= 0x30FF || c >= 0x4E00 && c <= 0x9FFF)
                    {
                        hasJp = true;
                        break;
                    }
                }
                if (!hasJp) continue;
                lock (ParseLock)
                {
                    if (ParseSeen.Add(s))
                    {
                        batch.Add(s);
                    }
                }
            }
            if (batch.Count > 0)
            {
                lock (ParseLock)
                {
                    try
                    {
                        System.IO.File.AppendAllLines(ParsePath, batch);
                        ParseCount += batch.Count;
                        if (ParseCount % 200 == 0)
                        {
                            Plugin.Global.Log.LogInfo("[Patch] Parse collection total: " + ParseCount);
                        }
                    }
                    catch (System.Exception)
                    {
                    }
                }
            }
        }
        catch (System.Exception)
        {
        }
    }

    private static readonly System.Collections.Generic.HashSet<long> ParseRowsSeen = new();

    [HarmonyPrefix]
    [HarmonyPatch(typeof(Screen), "SetResolution", new[] { typeof(int), typeof(int), typeof(bool) })]
    public static bool SetWindowSize(ref int width, ref int height, ref bool fullscreen)
    {
        return false;
    }

    /// <summary>
    /// Diagnostic: log game web requests (URLs) to understand the network
    /// layer, so master-data responses can be intercepted for full translation.
    /// Gated behind the diagnostics config switch (default OFF): every session
    /// was flooding LogOutput with 40+ URL lines even in normal play.
    /// </summary>
    private static readonly char[] QuerySeparators = { '?', '#' };

    [HarmonyPrefix]
    [HarmonyPatch(typeof(UnityEngine.Networking.UnityWebRequest), "SendWebRequest")]
    public static void SendWebRequestDiag(UnityEngine.Networking.UnityWebRequest __instance)
    {
        if (!TSKConfig.DiagnosticsEnabled || WebDiagCount >= 40) return;
        try
        {
            WebDiagCount++;
            var url = __instance.url;
            // SECURITY: strip query strings (auth tokens, session params) so
            // shared logs never leak credentials. Only the scheme+host+path is
            // logged, truncated to 150 chars.
            string safe = url;
            if (!string.IsNullOrEmpty(url))
            {
                int q = url.IndexOfAny(QuerySeparators);
                if (q >= 0) safe = url.Substring(0, q);
                if (safe.Length > 150) safe = safe.Substring(0, 150);
            }
            Plugin.Global.Log.LogInfo("[Web] " + (safe ?? ""));
        }
        catch (System.Exception)
        {
        }
    }

    private static int WebDiagCount;

    /// <summary>
    /// Capture TextAsset contents whenever the game reads them (master data
    /// CSVs, UI tables, story assets) — the read itself is intercepted.
    /// </summary>
    [HarmonyPostfix]
    [HarmonyPatch(typeof(UnityEngine.TextAsset), "get_text")]
    public static void TextAssetTextPost(UnityEngine.TextAsset __instance, ref string __result)
    {
        if (!TSKConfig.DiagnosticsEnabled) return; // C1: diagnostic collector off by default
        try
        {
            if (string.IsNullOrEmpty(__result) || __result.Length < 50) return;
            bool hasJp = false;
            int scan = __result.Length < 2000 ? __result.Length : 2000;
            for (int i = 0; i < scan; i++)
            {
                char c = __result[i];
                if (c >= 0x3040 && c <= 0x30FF || c >= 0x4E00 && c <= 0x9FFF)
                {
                    hasJp = true;
                    break;
                }
            }
            if (!hasJp) return;
            string name;
            try { name = __instance.name; } catch (System.Exception) { name = "?"; }
            var key = name + "|" + __result.Length;
            lock (NetLock)
            {
                if (!NetSeenTexts.Add(key)) return;
                NetTextCount++;
                System.IO.File.AppendAllText(NetTextPath,
                    "===== TextAsset '" + name + "' (" + __result.Length + " chars) =====\n" + __result + "\n",
                    System.Text.Encoding.UTF8);
            }
            Plugin.Global.Log.LogInfo("[Net] captured TextAsset '" + name + "' (" + __result.Length + " chars)");
        }
        catch (System.Exception)
        {
        }
    }

    /// <summary>
    /// Capture text assets loaded from AssetBundles: hook AssetBundleRequest
    /// getters and persist TextAsset contents (master data CSVs, UI tables)
    /// for offline full-text extraction.
    /// </summary>
    [HarmonyPostfix]
    [HarmonyPatch(typeof(UnityEngine.AssetBundleRequest), "get_asset")]
    public static void BundleAssetPost(UnityEngine.AssetBundleRequest __instance, ref UnityEngine.Object __result)
    {
        if (!TSKConfig.DiagnosticsEnabled) return; // C1
        try
        {
            if (__result == null) return;
            var ta = __result.TryCast<UnityEngine.TextAsset>();
            if (ta != null)
            {
                SaveTextAsset(ta);
            }
            else
            {
                LogAssetType(__result);
            }
        }
        catch (System.Exception)
        {
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(UnityEngine.AssetBundleRequest), "get_allAssets")]
    public static void BundleAllAssetsPost(UnityEngine.AssetBundleRequest __instance,
        ref Il2CppInterop.Runtime.InteropTypes.Arrays.Il2CppReferenceArray<UnityEngine.Object> __result)
    {
        try
        {
            if (__result == null) return;
            for (int i = 0; i < __result.Length; i++)
            {
                try
                {
                    var ta = __result[i].TryCast<UnityEngine.TextAsset>();
                    if (ta != null)
                    {
                        SaveTextAsset(ta);
                    }
                    else
                    {
                        LogAssetType(__result[i]);
                    }
                }
                catch (System.Exception)
                {
                }
            }
        }
        catch (System.Exception)
        {
        }
    }

    private static void SaveTextAsset(UnityEngine.TextAsset ta)
    {
        try
        {
            var text = ta.text;
            if (string.IsNullOrEmpty(text) || text.Length < 50) return;
            bool hasJp = false;
            int scan = text.Length < 2000 ? text.Length : 2000;
            for (int i = 0; i < scan; i++)
            {
                char c = text[i];
                if (c >= 0x3040 && c <= 0x30FF || c >= 0x4E00 && c <= 0x9FFF)
                {
                    hasJp = true;
                    break;
                }
            }
            if (!hasJp) return;
            string name;
            try { name = ta.name; } catch (System.Exception) { name = "?"; }
            var key = name + "|" + text.Length;
            lock (NetLock)
            {
                if (!NetSeenTexts.Add(key)) return;
                NetTextCount++;
                System.IO.File.AppendAllText(NetTextPath,
                    "===== TextAsset '" + name + "' (" + text.Length + " chars) =====\n" + text + "\n",
                    System.Text.Encoding.UTF8);
            }
            Plugin.Global.Log.LogInfo("[Net] captured TextAsset '" + name + "' (" + text.Length + " chars)");
        }
        catch (System.Exception)
        {
        }
    }

    private static readonly System.Collections.Generic.HashSet<string> AssetTypesSeen = new();
    private static int AssetTypeLogCount;

    private static void LogAssetType(UnityEngine.Object obj)
    {
        if (AssetTypeLogCount >= 30) return;
        try
        {
            var typeName = obj.GetType().FullName;
            if (AssetTypesSeen.Add(typeName ?? "?"))
            {
                AssetTypeLogCount++;
                Plugin.Global.Log.LogInfo("[Net] bundle asset type: " + typeName);
            }
        }
        catch (System.Exception)
        {
        }
    }

    private static readonly object NetLock = new object();
    private static int NetTextCount;
    private static readonly System.Collections.Generic.HashSet<string> NetSeenTexts = new();
    private static readonly string NetTextPath = System.IO.Path.Combine(Paths.PluginPath, "font", "tsk_api_responses.txt");
    private static readonly string NetBundleDir = System.IO.Path.Combine(Paths.PluginPath, "font", "bundles");

    [HarmonyPrefix]
    [HarmonyPatch(typeof(MaximizeCharaView), "SetCharaRoot_Scale")]
    public static void SetCharaRoot_Scale(ref MaximizeZoomEventData _zoomData)
    {
        if (_zoomData.PinchData > 0)
        {
            _zoomData.PinchData = TSKConfig.zoom;
        }
        else
        {
            _zoomData.PinchData = -TSKConfig.zoom;
        }
    }

    [HarmonyPostfix]
    [HarmonyPatch(typeof(MaximizeCharaView), "initialize")]
    public static void CharaViewInit(ref MaximizeCharaView __instance)
    {
        __instance.maximizeMinSize = 0.1f;
    }
}
