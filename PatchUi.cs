// v0.27: load the ARIALUNI TMP font (Arial Unicode MS — full CJK incl. all
// Simplified glyphs) from the XUnity.AutoTranslator AssetBundle using the
// same GetAllAssetNames + LoadAsset + TryCast pattern that Patch.LoadFontBundle
// verifiably uses for notosanscjktc. When loaded, translated text swaps to it
// and renders in Simplified Chinese directly; it is also registered as a
// global + per-font fallback so any other text missing glyphs renders too.
// The glyph-mapping route (SimToHanConverter) stays as a fallback when the
// bundle cannot be loaded.
using System;
using System.Collections.Generic;
using System.IO;
using HarmonyLib;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace TSKHook;

public class PatchUi
{
    /// <summary>Dynamic Simplified-Chinese TMP font asset (Microsoft YaHei / SimHei).</summary>
    public static TMP_FontAsset SimplifiedTmpFont;
    /// <summary>Dynamic Simplified-Chinese UGUI font.</summary>
    public static Font SimplifiedUguiFont;

    /// <summary>AssetBundle-provided Simplified-Chinese TMP font (arialuni_sdf_u2021).</summary>
    public static TMP_FontAsset BundleTmpFont;

    private const string FontBundleName = "arialuni_sdf_u2021";
    private static readonly string[] FontBundleCandidates =
    {
        // Order matters: u2018 is the first bundle whose asset Unity visibly
        // recognized as a TMP font ("Upgrading font asset [ARIALUNI SDF] to
        // version 1.1.0."), i.e. it matches this game's TMP 1.4.0 script GUIDs.
        "arialuni_sdf_u2018",
        "arialuni_sdf-u55to2017",
        "arialuni_sdf_u2019",
        "arialuni_sdf_u2021",
        "arialuni_sdf_u2022",
        "arialuni_sdf_u6000",
    };
    private static readonly object FontLock = new object();
    private static bool ArialuniAttempted;

    public static void Initialize()
    {
        // Font handling note: all runtime font creation/swapping was removed.
        // The game's own fonts render everything because translated text is
        // mapped to Traditional glyphs (SimToHanConverter) before display.

        try
        {
            var h1 = new Harmony("com.tskhook.ui.ugui");
            h1.PatchAll(typeof(UguiHooks));
            Plugin.Global.Log.LogInfo("[PatchUi] UGUI hooks installed (prefix).");
        }
        catch (System.Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] UGUI install failed: " + e.Message);
        }

        try
        {
            var h2 = new Harmony("com.tskhook.ui.tmp");
            h2.PatchAll(typeof(TmpHooks));
            Plugin.Global.Log.LogInfo("[PatchUi] TMP hooks installed (prefix).");
        }
        catch (System.Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] TMP install failed: " + e.Message);
        }
    }

    /// <summary>
    /// Match the ARIALUNI font's faceInfo.scale to the game's main UI font
    /// (FOT). Fallback glyphs render at the fallback font's baked scale, which
    /// makes them visibly smaller than the main font; aligning the scale fixes
    /// that.
    /// </summary>
    private static void TryMatchFaceInfoScale(TMP_FontAsset target)
    {
        try
        {
            var loaded = Resources.FindObjectsOfTypeAll(Il2CppInterop.Runtime.Il2CppType.Of<TMP_FontAsset>());
            TMP_FontAsset refFont = null;
            if (loaded != null)
            {
                for (int i = 0; i < loaded.Length; i++)
                {
                    try
                    {
                        var f = loaded[i].TryCast<TMP_FontAsset>();
                        if (f != null && f.name.Contains("FOT"))
                        {
                            refFont = f;
                            break;
                        }
                    }
                    catch (Exception)
                    {
                    }
                }
            }
            if (refFont == null)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] FaceInfo ref font (FOT) not found.");
                return;
            }
            var refScale = refFont.faceInfo.scale;
            var fi = target.faceInfo;
            var before = fi.scale;
            fi.scale = refScale;
            target.faceInfo = fi;
            Plugin.Global.Log.LogInfo("[PatchUi] FaceInfo scale matched: " + before + " -> " + refScale + " (ref '" + refFont.name + "').");
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] TryMatchFaceInfoScale threw: " + e);
        }
    }

    /// <summary>
    /// Ensure the ARIALUNI (Arial Unicode MS — full CJK incl. all Simplified
    /// glyphs) TMP font is loaded from the bundled AssetBundle. Loaded once,
    /// synchronously, on the first translation hit. When present, translated
    /// text renders in Simplified Chinese directly (no glyph mapping needed)
    /// and any other text missing glyphs falls back to it.
    /// </summary>
    public static void EnsureArialuniFont()
    {
        if (SimplifiedTmpFont != null || ArialuniAttempted) return;
        lock (FontLock)
        {
            if (SimplifiedTmpFont != null || ArialuniAttempted) return;
            ArialuniAttempted = true;
            TryLoadArialuni();
        }
    }

    private static void TryLoadArialuni()
    {
        var baseDir = Path.GetDirectoryName(typeof(PatchUi).Assembly.Location);
        foreach (var name in FontBundleCandidates)
        {
            string path = null;
            try
            {
                var c1 = Path.Combine(baseDir, "TSKHook", "font", name);
                var c2 = Path.Combine(baseDir, "font", name);
                if (File.Exists(c1)) path = c1;
                else if (File.Exists(c2)) path = c2;
            }
            catch (Exception)
            {
            }
            if (path == null) continue;

            Plugin.Global.Log.LogInfo("[PatchUi] ARIALUNI trying: " + path);
            AssetBundle bundle = null;
            try
            {
                bundle = AssetBundle.LoadFromFile(path);
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] ARIALUNI LoadFromFile threw: " + e);
            }
            if (bundle == null)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] ARIALUNI LoadFromFile returned null: " + path);
                continue;
            }
            try
            {
                // Same loading pattern as Patch.LoadFontBundle (verified to work
                // for notosanscjktc): enumerate names, load each asset, TryCast.
                var names = bundle.GetAllAssetNames();
                foreach (var assetName in names)
                {
                    try
                    {
                        var asset = bundle.LoadAsset(assetName);
                        if (asset == null) continue;
                        var font = asset.TryCast<TMP_FontAsset>();
                        if (font != null)
                        {
                            SimplifiedTmpFont = font;
                            BundleTmpFont = font;
                            FixFontAssetMaterial(font);
                            TryMatchFaceInfoScale(font);
                            RegisterGlobalFallback(font);
                            RegisterPerFontFallback(font);
                            // Full-CJK fallback active: keep translated Simplified
                            // text verbatim (exact dictionary edits, no glyph re-shaping).
                            SimToHanConverter.KeepSimplified = true;
                            // Names cached before this point may hold glyph-mapped
                            // (traditional) forms; drop them so the next access
                            // re-renders in Simplified.
                            Patch.ClearNameCache();
                            // Glyph dumps are offline-analysis diagnostics:
                            // they wrote 9 tsk_glyphs_*.txt files on EVERY launch.
                            if (TSKConfig.DiagnosticsEnabled) DumpAllGlyphs();
                            string ver = "?";
                            try { ver = font.version; }
                            catch (Exception) { }
                            Plugin.Global.Log.LogInfo("[PatchUi] ARIALUNI font loaded: '" + font.name + "' version=" + ver + " (from " + name + ")");
                            return; // keep bundle alive
                        }
                    }
                    catch (Exception e)
                    {
                        Plugin.Global.Log.LogWarning("[PatchUi] ARIALUNI asset load threw: " + e.Message);
                    }
                }
                Plugin.Global.Log.LogWarning("[PatchUi] ARIALUNI: no TMP_FontAsset in " + path);
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] ARIALUNI enumeration threw: " + e);
            }
            try { bundle.Unload(true); } catch (Exception) { }
        }
        Plugin.Global.Log.LogWarning("[PatchUi] ARIALUNI: all bundles failed.");
    }

    private static void RegisterGlobalFallback(TMP_FontAsset font)
    {
        try
        {
            var fallbacks = TMP_Settings.fallbackFontAssets;
            if (fallbacks != null)
            {
                if (!fallbacks.Contains(font))
                {
                    fallbacks.Add(font);
                }
                Plugin.Global.Log.LogInfo("[PatchUi] Registered into TMP_Settings.fallbackFontAssets (count=" + fallbacks.Count + ").");
            }
            else
            {
                Plugin.Global.Log.LogWarning("[PatchUi] TMP_Settings.fallbackFontAssets is null.");
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] TMP_Settings fallback Add threw: " + e);
        }
    }

    private static void RegisterPerFontFallback(TMP_FontAsset font)
    {
        try
        {
            var loaded = Resources.FindObjectsOfTypeAll(Il2CppInterop.Runtime.Il2CppType.Of<TMP_FontAsset>());
            if (loaded != null)
            {
                for (int i = 0; i < loaded.Length; i++)
                {
                    try
                    {
                        var f = loaded[i].TryCast<TMP_FontAsset>();
                        if (f == null || f == font) continue;
                        var table = f.fallbackFontAssetTable;
                        if (table == null)
                        {
                            f.fallbackFontAssetTable = new Il2CppSystem.Collections.Generic.List<TMP_FontAsset>();
                            table = f.fallbackFontAssetTable;
                        }
                        if (!table.Contains(font))
                        {
                            table.Add(font);
                            Plugin.Global.Log.LogInfo("[PatchUi] Added fallback to font '" + f.name + "'.");
                        }
                    }
                    catch (Exception e)
                    {
                        Plugin.Global.Log.LogWarning("[PatchUi] per-font fallback Add threw: " + e.Message);
                    }
                }
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] per-font fallback enumeration threw: " + e);
        }
    }

    /// <summary>Dump every loaded TMP font's unicode glyph set to font/tsk_glyphs_*.txt for offline analysis.</summary>
    public static void DumpAllGlyphs()
    {
        try
        {
            var loaded = Resources.FindObjectsOfTypeAll(Il2CppInterop.Runtime.Il2CppType.Of<TMP_FontAsset>());
            if (loaded == null) return;
            for (int i = 0; i < loaded.Length; i++)
            {
                try
                {
                    var f = loaded[i].TryCast<TMP_FontAsset>();
                    if (f == null) continue;
                    var set = new System.Collections.Generic.SortedSet<int>();
                    var table = f.characterTable;
                    if (table != null)
                    {
                        for (int j = 0; j < table.Count; j++)
                        {
                            try
                            {
                                var ch = table[j];
                                if (ch != null) set.Add((int)ch.unicode);
                            }
                            catch (Exception)
                            {
                            }
                        }
                    }
                    var baseDir = Path.GetDirectoryName(typeof(PatchUi).Assembly.Location);
                    var safeName = string.Join("_", f.name.Split(Path.GetInvalidFileNameChars()));
                    if (safeName.Length > 60) safeName = safeName.Substring(0, 60);
                    var path = Path.Combine(baseDir, "font", "tsk_glyphs_" + safeName + ".txt");
                    var sb = new System.Text.StringBuilder();
                    foreach (var cp in set)
                    {
                        sb.Append(cp.ToString("X4")).Append('\n');
                    }
                    File.WriteAllText(path, sb.ToString());
                    Plugin.Global.Log.LogInfo("[PatchUi] Dumped glyphs (" + set.Count + ") -> " + path);
                }
                catch (Exception e)
                {
                    Plugin.Global.Log.LogWarning("[PatchUi] DumpAllGlyphs item threw: " + e.Message);
                }
            }
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] DumpAllGlyphs threw: " + e);
        }
    }

    /// <summary>
    /// Force an opaque white face color on the font asset's shared material.
    /// The ARIALUNI bundle material otherwise renders pale/translucent.
    /// </summary>
    private static void FixFontAssetMaterial(TMP_FontAsset fontAsset)
    {
        try
        {
            var mat = fontAsset.material;
            if (mat == null)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] font material is null.");
                return;
            }
            var before = "?";
            try { before = mat.GetColor("_FaceColor").ToString(); }
            catch (Exception) { }
            mat.SetColor("_FaceColor", UnityEngine.Color.white);
            if (mat.HasProperty("_FaceAlpha"))
            {
                mat.SetFloat("_FaceAlpha", 1f);
            }
            Plugin.Global.Log.LogInfo("[PatchUi] Fixed font material face color (" + before + " -> white).");
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] FixFontAssetMaterial threw: " + e);
        }
    }

    /// <summary>Ensure a text component's material renders the font opaque white.</summary>
    private static void FixFontMaterial(TMP_Text t)
    {
        try
        {
            var m = t.fontMaterial;
            if (m == null) return;
            m.SetColor("_FaceColor", UnityEngine.Color.white);
            if (m.HasProperty("_FaceAlpha"))
            {
                m.SetFloat("_FaceAlpha", 1f);
            }
        }
        catch (Exception)
        {
            // non-fatal
        }
    }

    /// <summary>
    /// Ensure the UGUI Simplified font exists (created once). The TMP dynamic
    /// font routes were removed: FontEngine.LoadFontFace cannot load OS dynamic
    /// fonts in this game (Invalid_File), so TMP Simplified text must come from
    /// the pre-baked AssetBundle font (see StartFontBundleLoad / PollFontBundleLoad).
    /// </summary>
    public static void EnsureSimplifiedFonts()
    {
        if (SimplifiedUguiFont != null) return;
        lock (FontLock)
        {
            if (SimplifiedUguiFont != null) return;
            CreateUguiFont();
        }
    }

    private static void CreateUguiFont()
    {
        try
        {
            Font uguiFont = null;
            try
            {
                uguiFont = Font.CreateDynamicFontFromOSFont(
                    new[] { "Microsoft YaHei", "SimHei", "Arial" }, 32);
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] CreateDynamicFontFromOSFont threw: " + e);
            }
            if (uguiFont == null)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] Failed to create dynamic OS font (all names).");
                return;
            }
            SimplifiedUguiFont = uguiFont;
            Plugin.Global.Log.LogInfo("[PatchUi] UGUI Simplified font ready: " + uguiFont.name);
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[PatchUi] UGUI font creation error: " + e);
        }
    }

    private static readonly System.Text.RegularExpressions.Regex NumRegex =
        new(@"\d+(?:[,.]\d+)*", System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>UiDictMeta/UiDictTask template keys normalized once ({0} -> #) for lookup.</summary>
    private static readonly Dictionary<string, string> MetaTemplates = BuildMetaTemplates();

    /// <summary>UiDictExt.Templates normalized at startup with the SAME
    /// NormalizeForTemplate used at lookup time (％→% ～→~ ×→x etc.), otherwise
    /// keys with full-width symbols never match (A2).</summary>
    private static readonly Dictionary<string, string> UiDictExtTemplates = BuildUiDictExtTemplates();

    private static Dictionary<string, string> BuildUiDictExtTemplates()
    {
        var d = new Dictionary<string, string>();
        foreach (var kv in UiDictExt.Templates)
        {
            d[NormalizeForTemplate(kv.Key)] = kv.Value;
        }
        return d;
    }

    private static Dictionary<string, string> BuildMetaTemplates()
    {
        var d = new Dictionary<string, string>();
        foreach (var kv in UiDictMeta.Templates)
        {
            d[NormalizeForTemplate(kv.Key)] = kv.Value;
        }
        foreach (var kv in UiDictTask.Templates)
        {
            d[NormalizeForTemplate(kv.Key)] = kv.Value;
        }
        foreach (var kv in UiDictBatch.Templates)
        {
            d[NormalizeForTemplate(kv.Key)] = kv.Value;
        }
        return d;
    }

    /// <summary>Normalize text for template lookup: digit runs/{n} -> #, ％->%, ×->x, ～->~.</summary>
    public static string NormalizeForTemplate(string s)
    {
        var sb = new System.Text.StringBuilder(s.Length + 4);
        bool lastHash = false;
        for (int idx = 0; idx < s.Length; idx++)
        {
            char c = s[idx];
            if (c == '{' && idx + 2 < s.Length && char.IsDigit(s[idx + 1]) && s[idx + 2] == '}')
            {
                if (!lastHash)
                {
                    sb.Append('#');
                    lastHash = true;
                }
                idx += 2;
            }
            else if (c >= '0' && c <= '9' || c >= '０' && c <= '９')
            {
                if (!lastHash)
                {
                    sb.Append('#');
                    lastHash = true;
                }
            }
            else
            {
                lastHash = false;
                if (c == '％') sb.Append('%');
                else if (c == '×') sb.Append('x');
                else if (c == '～') sb.Append('~');
                else sb.Append(c);
            }
        }
        return sb.ToString();
    }

    /// <summary>Fill a template's # placeholders with the original text's numbers
    /// in order (shared impl, see TextUtil — rich-text tags are kept verbatim).</summary>
    private static string FillTemplate(string tmpl, string original) => TextUtil.RestoreNumbers(tmpl, original);

    // Result cache for TranslateUi: same UI text is set repeatedly every frame
    // (banners, timers, tab labels) — caching avoids re-running the multi-dict
    // lookup + template normalization + name unification on every set.
    // The cached value depends on whether the ARIALUNI (Simplified-capable)
    // font was loaded (before: glyph-mapped Traditional; after: Simplified),
    // so the entry is tagged with the font state and discarded when it changes.
    // Misses are cached as-is (text->text) so repeated untranslated strings
    // skip the 7-dict walk each frame; AutoTranslate.InvalidateCache() clears
    // the cache when a background translation lands.
    private static readonly Dictionary<string, string> UiCache = new();
    private static readonly object UiCacheLock = new();
    private const int UiCacheMax = 8192;
    private static bool UiCacheFontState;
    private static bool UiCacheFontStateSet;

    /// <summary>Clear the UI translation cache (called when new translations arrive).</summary>
    public static void InvalidateUiCache()
    {
        lock (UiCacheLock)
        {
            UiCache.Clear();
        }
    }

    /// <summary>Display-time guard: repair malformed rich-text color tags
    /// (shared impl, see TextUtil).</summary>
    private static string SanitizeRichTags(string text) => TextUtil.SanitizeRichTags(text);

    /// <summary>
    /// Dictionary-first lookup with two tolerance rules that turn API misses
    /// into dictionary hits (fewer tokens over time):
    ///   1. trim — surrounding whitespace/tabs/newlines are ignored (NoHit logs
    ///      showed keys arriving with a trailing '\t').
    ///   2. brackets — '嵐を翔る射手' also matches '[嵐を翔る射手]' /
    ///      '【嵐を翔る射手】' and vice versa (titles appear with and without
    ///      decoration on different screens).
    /// The EXACT key always wins; variants are only consulted on a miss, and an
    /// empty dictionary value counts as a miss (so the chain can fall through
    /// to the next dictionary instead of blocking it), which never changes
    /// behavior for keys that already match.
    /// </summary>
    private static bool TryLookupDict(string text, Dictionary<string, string> dict, out string value)
    {
        if (dict == null || dict.Count == 0)
        {
            value = null;
            return false;
        }
        // 1) exact match
        if (dict.TryGetValue(text, out value) && !string.IsNullOrEmpty(value)) return true;
        // 2) trimmed match
        var trimmed = text.Trim();
        if (trimmed.Length != text.Length &&
            dict.TryGetValue(trimmed, out value) && !string.IsNullOrEmpty(value))
        {
            return true;
        }
        // 3) bracket variants (titles with/without decoration)
        return TryLookupBracketVariants(trimmed, dict, out value);
    }

    private static bool TryLookupBracketVariants(string t, Dictionary<string, string> dict, out string value)
    {
        if (t.Length >= 2 && IsBracketPair(t))
        {
            var inner = t.Substring(1, t.Length - 2);
            if (dict.TryGetValue(inner, out value) && !string.IsNullOrEmpty(value)) return true;
            var other = t[0] == '[' ? "【" + inner + "】" : "[" + inner + "]";
            if (dict.TryGetValue(other, out value) && !string.IsNullOrEmpty(value)) return true;
        }
        else
        {
            var sq = "[" + t + "]";
            if (dict.TryGetValue(sq, out value) && !string.IsNullOrEmpty(value)) return true;
            var cn = "【" + t + "】";
            if (dict.TryGetValue(cn, out value) && !string.IsNullOrEmpty(value)) return true;
        }
        value = null;
        return false;
    }

    private static bool IsBracketPair(string s)
    {
        return (s[0] == '[' && s[s.Length - 1] == ']') ||
               (s[0] == '【' && s[s.Length - 1] == '】');
    }

    private static string TranslateUi(string text, TMP_FontAsset font)
    {
        if (string.IsNullOrEmpty(text)) return text;
        if (text.Length > 300) return text;
        if (IsAsciiOnly(text)) return text;

        bool fontState = SimplifiedTmpFont != null;
        lock (UiCacheLock)
        {
            if (UiCacheFontStateSet && UiCacheFontState == fontState)
            {
                if (UiCache.TryGetValue(text, out var cached)) return cached;
            }
            else
            {
                // font state changed: cache is stale
                UiCache.Clear();
                UiCacheFontState = fontState;
                UiCacheFontStateSet = true;
            }
        }

        string translated;
        if (TryLookupDict(text, UiDict.Entries, out var ui))
        {
            translated = ui;
        }
        else if (TryLookupDict(text, UiDictExt.Entries, out var ui2))
        {
            translated = ui2;
        }
        else if (TryLookupDict(text, UiDictMeta.Entries, out var ui3))
        {
            translated = ui3;
        }
        else if (TryLookupDict(text, UiDictTask.Entries, out var ui4))
        {
            translated = ui4;
        }
        else if (TryLookupDict(text, UiDictBatch.Entries, out var ui5))
        {
            translated = ui5;
        }
        else if (TryLookupDict(text, UiDictEquip.Entries, out var ui6))
        {
            translated = ui6;
        }
        else if (TryLookupDict(text, Translation.nameDicts, out var named))
        {
            translated = named;
        }
        else
        {
            var trimmedText = text.Trim();
            var norm = NormalizeForTemplate(trimmedText);
            string tpl = null;
            if (UiDictExtTemplates.TryGetValue(norm, out var t1)) tpl = t1;
            else if (MetaTemplates.TryGetValue(norm, out var t2)) tpl = t2;
            if (tpl != null)
            {
                translated = FillTemplate(tpl, text);
            }
            else
            {
                // Auto-translate: check persisted memory first, else queue the
                // string for background API translation (non-blocking). While
                // pending, the original text shows. Cache the miss (text->text)
                // so repeated SetText of the same string skips the dict walk;
                // AutoTranslate invalidates the cache when a result lands.
                var remembered = AutoTranslate.Lookup(text);
                if (remembered != null)
                {
                    translated = remembered;
                }
                else
                {
                    AutoTranslate.Request(text);
                    lock (UiCacheLock)
                    {
                        if (UiCache.Count >= UiCacheMax) UiCache.Clear();
                        UiCache[text] = text;
                    }
                    return text;
                }
            }
        }
        if (translated == text)
        {
            // Dict hit but identity translation: try persisted memory, else
            // queue for background translation.
            var remembered = AutoTranslate.Lookup(text);
            if (remembered != null)
            {
                translated = remembered;
            }
            else
            {
                AutoTranslate.Request(text);
                lock (UiCacheLock)
                {
                    if (UiCache.Count >= UiCacheMax) UiCache.Clear();
                    UiCache[text] = text;
                }
                return text;
            }
        }
        // Unify character names across all translation paths.
        translated = UnifiedNameApplier.Apply(translated);
        // Prefer the game's ORIGINAL font: map Simplified chars to glyphs the
        // original font actually has (Japanese-kanji / traditional forms), so
        // text styling matches the rest of the game UI. The ARIALUNI fallback
        // covers only the remaining characters the original font lacks.
        string result = SimToHanConverter.ToTraditionalGlyphs(translated, font);
        lock (UiCacheLock)
        {
            if (UiCache.Count >= UiCacheMax) UiCache.Clear();
            UiCache[text] = result;
        }
        return result;
    }

    private static bool IsAsciiOnly(string s)
    {
        foreach (var c in s)
        {
            if (c > 0x7F) return false;
        }
        return true;
    }

    public class UguiHooks
    {
        [HarmonyPrefix]
        [HarmonyPatch(typeof(Text), "set_text")]
        public static void UiTextSet(Text __instance, ref string value)
        {
            if (!TSKConfig.TranslationEnabled) return;
            var translated = TranslateUi(value, null);
            if (translated != value)
            {
                try
                {
                    if (!__instance.supportRichText) __instance.supportRichText = true;
                }
                catch (Exception) { }
                translated = SanitizeRichTags(translated);
                if (UiLogCount < 20)
                {
                    UiLogCount++;
                    Plugin.Global.Log.LogInfo($"[UiHit] '{value}' -> '{translated}'");
                }
                value = translated;
            }
        }

        private static int UiLogCount;
    }

    public class TmpHooks
    {
        [HarmonyPrefix]
        [HarmonyPatch(typeof(TMP_Text), "set_text")]
        public static void TmpTextSet(TMP_Text __instance, ref string value)
        {
            if (!TSKConfig.TranslationEnabled) return;
            TMP_FontAsset font = null;
            try
            {
                font = __instance.font;
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[PatchUi] TmpTextSet: font getter threw: " + e.Message);
                font = null;
            }
            if (TmpFontDiagCount < 5)
            {
                TmpFontDiagCount++;
                Plugin.Global.Log.LogInfo("[PatchUi] TmpTextSet font: " + (font == null ? "NULL" : "'" + font.name + "'"));
            }
            if (font != null && SimToHanConverter.UiFont == null)
            {
                SimToHanConverter.UiFont = font;
            }
            // Prefer the game's main story font for glyph adaptation of names:
            // a numeric/UI-only font (e.g. Jost) would give a wrong glyph set.
            else if (font != null && font.name.Contains("Rodin") && !SimToHanConverter.UiFont.name.Contains("Rodin"))
            {
                SimToHanConverter.UiFont = font;
            }
            if (font != null && SeenFonts.Count < 20)
            {
                var key = font.name;
                if (!SeenFonts.Contains(key))
                {
                    SeenFonts.Add(key);
                    Plugin.Global.Log.LogInfo("[PatchUi] TmpTextSet font (new): '" + key + "'");
                }
            }
            var translated = TranslateUi(value, font);
            if (translated != value)
            {
                // Guard: some TMP components may have rich text disabled —
                // force it on so <color>/<emoji> tags render, not show as text.
                try
                {
                    if (!__instance.richText) __instance.richText = true;
                }
                catch (Exception) { }
                translated = SanitizeRichTags(translated);
                if (TmpLogCount < 20)
                {
                    TmpLogCount++;
                    Plugin.Global.Log.LogInfo($"[TmpHit] '{value}' -> '{translated}'");
                }
                value = translated;
                // NOTE: do NOT swap __instance.font to ARIALUNI — direct font
                // swapping renders garbled/invisible in this game (SDF material
                // mismatch). Instead ARIALUNI is registered as a global +
                // per-font FALLBACK (see EnsureArialuniFont), which renders
                // correctly through the game's own material pipeline.
                EnsureArialuniFont();
            }
            else
            {
                // Collect untranslated Japanese text for dictionary building.
                CollectNoHit(value);
            }
        }

        private static int TmpLogCount;
        private static int TmpFontDiagCount;
        private static readonly System.Collections.Generic.HashSet<string> SeenFonts = new();
        private static readonly System.Collections.Generic.HashSet<string> NoHitSeen = new();
        private static int NoHitCount;

        /// <summary>Log untranslated Japanese UI text (dedup, capped) for dictionary building.</summary>
        private static void CollectNoHit(string text)
        {
            if (string.IsNullOrEmpty(text) || text.Length < 4 || text.Length > 300) return;
            bool hasKana = false;
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];
                if ((c >= 0x3040 && c <= 0x30FF) || c == 0x30FB || c == 0x30FC || c == 0x309B || c == 0x309C)
                {
                    hasKana = true;
                    break;
                }
            }
            if (!hasKana) return;
            if (NoHitCount >= 500) return;
            if (!NoHitSeen.Add(text)) return;
            NoHitCount++;
            Plugin.Global.Log.LogInfo($"[NoHit] '{text}'");
            // Persist for offline dictionary building (dedup via NoHitSeen).
            try
            {
                lock (NoHitLock)
                {
                    System.IO.File.AppendAllText(NoHitPath, text + "\n");
                }
            }
            catch (Exception)
            {
            }
        }

        private static readonly object NoHitLock = new();
        private static readonly string NoHitPath =
            System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(PatchUi).Assembly.Location), "font", "tsk_nohit.txt");
    }
}
