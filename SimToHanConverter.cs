// Converts Simplified-Chinese translated text to display-ready glyphs:
// a character renders in Simplified if the text's actual TMP font contains
// that glyph; otherwise it falls back to the Japanese kanji (JIS new form,
// e.g. 亜/撃/状 — which JIS fonts like FOT-RodinNTLGPro-B contain), then to
// the Traditional glyph. No boxes, no garbling, no font swapping — and as
// much Simplified Chinese as the fonts allow.
//
// Per-font glyph sets are collected from each TMP_FontAsset's characterTable
// (plus its fallback chain) and cached by native pointer. Text without a known
// font context (story/name hooks) is converted fully to Traditional glyphs,
// which the story font (notosanscjktc) covers completely.
using System;
using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;

namespace TSKHook;

public static class SimToHanConverter
{
    private static readonly Dictionary<string, string> Phrases = SimToHanData.PhraseMap;
    private static readonly Dictionary<char, char> Chars = SimToHanData.CharMap;
    private static readonly Dictionary<char, char[]> Jp = SimToHanData.JpMap;

    /// <summary>
    /// PhraseMap indexed by first char, sorted longest-first. The hot conversion
    /// loop previously probed lengths 12..2 with `text.Substring(i, len)` per
    /// position (up to 11 string allocations per char); this index turns the
    /// probe into a zero-allocation `string.Compare` against the handful of
    /// phrases that actually start with the current char. Same longest-match
    /// semantics, same output.
    /// </summary>
    private static readonly Dictionary<char, KeyValuePair<string, string>[]> PhraseIndex =
        BuildPhraseIndex();

    private static Dictionary<char, KeyValuePair<string, string>[]> BuildPhraseIndex()
    {
        var byFirst = new Dictionary<char, List<KeyValuePair<string, string>>>();
        foreach (var kv in Phrases)
        {
            if (string.IsNullOrEmpty(kv.Key) || kv.Key.Length < 2) continue;
            if (!byFirst.TryGetValue(kv.Key[0], out var list))
            {
                byFirst[kv.Key[0]] = list = new List<KeyValuePair<string, string>>();
            }
            list.Add(kv);
        }
        var index = new Dictionary<char, KeyValuePair<string, string>[]>();
        foreach (var pair in byFirst)
        {
            var arr = pair.Value.ToArray();
            Array.Sort(arr, (a, b) => b.Key.Length - a.Key.Length); // longest match first
            index[pair.Key] = arr;
        }
        return index;
    }

    /// <summary>True when `key` occurs in `text` at offset `i` (no allocation).</summary>
    private static bool MatchAt(string text, int i, string key)
    {
        return i + key.Length <= text.Length &&
               string.Compare(text, i, key, 0, key.Length, StringComparison.Ordinal) == 0;
    }

    // Per-font glyph sets are rebuilt on demand and kept fresh with a TTL:
    // dynamic TMP fonts bake new glyphs at runtime, so an immutable cache would
    // go stale; the old "clear everything when a new font appears" policy
    // instead rebuilt the SAME font's set over and over during startup (see the
    // repeated `[SimToHan] Glyph set` lines in LogOutput).
    private sealed class GlyphCacheEntry
    {
        public readonly HashSet<int> Glyphs;
        public long BuiltAtTicks;

        public GlyphCacheEntry(HashSet<int> glyphs)
        {
            Glyphs = glyphs;
            BuiltAtTicks = DateTime.UtcNow.Ticks;
        }
    }

    private const long GlyphCacheTtlTicks = 5L * 60 * 10000000; // 5 minutes

    private static readonly Dictionary<long, GlyphCacheEntry> FontGlyphCache = new();
    private static readonly object GlyphLock = new object();

    /// <summary>
    /// The UI font (FOT-RodinNTLGPro-B SDF) seen by the first TMP translation
    /// hit; used for glyph decisions on text without a component context
    /// (character names), which renders in that font.
    /// </summary>
    public static TMP_FontAsset UiFont;

    /// <summary>
    /// Set when the ARIALUNI (Arial Unicode MS, full CJK) fallback font is
    /// loaded. While true, glyph mapping is DISABLED and translated Simplified
    /// text is kept verbatim — characters the original font lacks render
    /// through the ARIALUNI fallback chain. This makes dictionary edits
    /// display EXACTLY what the user typed (e.g. 托瓦老师 stays 托瓦老师
    /// instead of being re-shaped into 託瓦老師).
    /// </summary>
    public static bool KeepSimplified;

    private static bool FallbacksInjected;
    private static int LastFallbackFontCount = -1;

    /// <summary>
    /// Cross-register every loaded TMP font as a fallback of every other one
    /// (deduplicated). This makes FOT-RodinNTLGPro-B (7181 glyphs) fall back to
    /// notosanscjktc (21435 glyphs) for any character it lacks, so remaining
    /// missing glyphs render instead of showing boxes. Called on glyph-set
    /// build and periodically from Update.
    /// </summary>
    public static void InjectFallbacks()
    {
        try
        {
            var objs = Resources.FindObjectsOfTypeAll(Il2CppInterop.Runtime.Il2CppType.Of<TMP_FontAsset>());
            int count = objs?.Length ?? 0;
            if (FallbacksInjected && count == LastFallbackFontCount) return;
            LastFallbackFontCount = count;
            FallbacksInjected = true;
            // NOTE: FontGlyphCache is intentionally NOT cleared here. A new
            // font appearing does not invalidate another font's glyph set
            // (each entry is keyed by native pointer and built from that
            // font's own characterTable); clearing it forced every font's set
            // to be rebuilt on each startup wave. Entries self-refresh via a
            // TTL so runtime-baked glyphs of dynamic fonts are picked up.

            var fonts = new System.Collections.Generic.List<TMP_FontAsset>();
            if (objs != null)
            {
                for (int i = 0; i < objs.Length; i++)
                {
                    try
                    {
                        var f = objs[i].TryCast<TMP_FontAsset>();
                        if (f != null && !fonts.Contains(f)) fonts.Add(f);
                    }
                    catch (Exception)
                    {
                    }
                }
            }
            int added = 0;
            for (int a = 0; a < fonts.Count; a++)
            {
                for (int b = 0; b < fonts.Count; b++)
                {
                    if (a == b) continue;
                    try
                    {
                        var table = fonts[a].fallbackFontAssetTable;
                        if (table == null)
                        {
                            fonts[a].fallbackFontAssetTable = new Il2CppSystem.Collections.Generic.List<TMP_FontAsset>();
                            table = fonts[a].fallbackFontAssetTable;
                        }
                        if (!table.Contains(fonts[b]))
                        {
                            table.Add(fonts[b]);
                            added++;
                        }
                    }
                    catch (Exception)
                    {
                    }
                }
            }
            Plugin.Global.Log.LogInfo("[SimToHan] Fallbacks injected across " + fonts.Count + " TMP fonts (" + added + " links).");
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[SimToHan] InjectFallbacks threw: " + e);
        }
    }

    /// <summary>
    /// Convert for a known TMP font: keep Simplified glyphs the font has,
    /// substitute Japanese-kanji / Traditional for the ones it lacks.
    /// </summary>
    public static string ToTraditionalGlyphs(string text, TMP_FontAsset font)
    {
        if (string.IsNullOrEmpty(text)) return text;
        if (KeepSimplified) return text;
        if (Chars.Count == 0 && Phrases.Count == 0) return text;
        HashSet<int> set = null;
        if (font != null)
        {
            try
            {
                // NOTE: InjectFallbacks() is intentionally NOT called here.
                // It enumerates all TMP fonts via Resources.FindObjectsOfTypeAll
                // which is very expensive; it is invoked only from the periodic
                // Update loop (see PluginBehavior) and from glyph-set builds.
                set = GetFontGlyphs(font);
            }
            catch (Exception)
            {
                set = null;
            }
        }
        if (set == null || set.Count == 0)
        {
            // No font context / unknown font: full Traditional conversion is
            // safe (story font covers all Traditional glyphs).
            return ToTraditionalGlyphs(text);
        }
        return ConvertWithSet(text, set);
    }

    /// <summary>
    /// Convert without a font context: map every Simplified char to its
    /// Traditional glyph (the story font notosanscjktc covers all of them).
    /// </summary>
    public static string ToTraditionalGlyphs(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        if (KeepSimplified) return text;
        if (Chars.Count == 0 && Phrases.Count == 0) return text;

        var sb = new StringBuilder(text.Length + 8);
        int i = 0;
        int n = text.Length;
        while (i < n)
        {
            bool matched = false;
            if (PhraseIndex.TryGetValue(text[i], out var candidates))
            {
                foreach (var kv in candidates)
                {
                    if (!MatchAt(text, i, kv.Key)) continue;
                    sb.Append(kv.Value);
                    i += kv.Key.Length;
                    matched = true;
                    break;
                }
            }
            if (!matched)
            {
                char c = text[i];
                sb.Append(Chars.TryGetValue(c, out var rc) ? rc : c);
                i++;
            }
        }
        return sb.ToString();
    }

    private static string ConvertWithSet(string text, HashSet<int> set)
    {
        var sb = new StringBuilder(text.Length + 8);
        int i = 0;
        int n = text.Length;
        while (i < n)
        {
            bool matched = false;
            if (PhraseIndex.TryGetValue(text[i], out var candidates))
            {
                foreach (var kv in candidates)
                {
                    if (!MatchAt(text, i, kv.Key)) continue;
                    var repl = kv.Value;
                    int len = kv.Key.Length;
                    // prefer the Simplified phrase if all its glyphs exist
                    if (AllInSet(text, i, len, set))
                    {
                        sb.Append(text, i, len);
                    }
                    // else the Traditional phrase if its glyphs exist
                    else if (AllInSet(repl, 0, repl.Length, set))
                    {
                        sb.Append(repl);
                    }
                    else
                    {
                        // else map char by char
                        AppendMapped(sb, text, i, len, set);
                    }
                    i += len;
                    matched = true;
                    break;
                }
            }
            if (!matched)
            {
                char c = text[i];
                if (set.Contains(c))
                {
                    sb.Append(c);
                }
                else if (Jp.TryGetValue(c, out var jps))
                {
                    char jp = '\0';
                    for (int k = 0; k < jps.Length; k++)
                    {
                        if (set.Contains(jps[k]))
                        {
                            jp = jps[k];
                            break;
                        }
                    }
                    if (jp != '\0')
                    {
                        sb.Append(jp);
                    }
                    else
                    {
                        sb.Append(Chars.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                    }
                }
                else
                {
                    sb.Append(Chars.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                }
                i++;
            }
        }
        return sb.ToString();
    }

    private static HashSet<int> GetFontGlyphs(TMP_FontAsset font)
    {
        long key = font.Pointer.ToInt64();
        long nowTicks = DateTime.UtcNow.Ticks;
        // Lock-free fast path: entries are replaced, never mutated, so a
        // reference read without the lock is safe; worst case we rebuild once
        // more under the lock below. The TTL refreshes dynamic fonts whose
        // characterTable grows as new glyphs are baked.
        if (FontGlyphCache.TryGetValue(key, out var cachedFast) &&
            nowTicks - cachedFast.BuiltAtTicks < GlyphCacheTtlTicks)
        {
            return cachedFast.Glyphs;
        }
        lock (GlyphLock)
        {
            if (FontGlyphCache.TryGetValue(key, out var cached) &&
                DateTime.UtcNow.Ticks - cached.BuiltAtTicks < GlyphCacheTtlTicks)
            {
                return cached.Glyphs;
            }
            var set = new HashSet<int>();
            AddFontGlyphs(set, font);
            // NOTE: intentionally NOT merging fallback glyphs here. ConvertWithSet
            // must only see the ORIGINAL font's own glyphs, so Simplified chars
            // get mapped to the original font's Japanese-kanji/traditional forms
            // whenever possible (original-font rendering, consistent styling).
            // Characters that still have no glyph are left Simplified and are
            // rendered by the ARIALUNI fallback chain (TMP handles that).
            if (FontGlyphCache.Count > 24)
            {
                FontGlyphCache.Clear();
            }
            FontGlyphCache[key] = new GlyphCacheEntry(set);
            Plugin.Global.Log.LogInfo("[SimToHan] Glyph set for '" + font.name + "': " + set.Count + " codepoints.");
            return set;
        }
    }

    private static void AddFontGlyphs(HashSet<int> set, TMP_FontAsset font)
    {
        var table = font.characterTable;
        if (table == null) return;
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

    private static bool AllInSet(string s, int start, int len, HashSet<int> set)
    {
        for (int k = 0; k < len; k++)
        {
            if (!set.Contains(s[start + k])) return false;
        }
        return true;
    }

    private static void AppendMapped(StringBuilder sb, string s, int start, int len, HashSet<int> set)
    {
        for (int k = 0; k < len; k++)
        {
            char c = s[start + k];
            if (set.Contains(c))
            {
                sb.Append(c);
            }
            else if (Jp.TryGetValue(c, out var jps))
            {
                char jp = '\0';
                for (int j = 0; j < jps.Length; j++)
                {
                    if (set.Contains(jps[j]))
                    {
                        jp = jps[j];
                        break;
                    }
                }
                if (jp != '\0')
                {
                    sb.Append(jp);
                }
                else
                {
                    sb.Append(Chars.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                }
            }
            else
            {
                sb.Append(Chars.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
            }
        }
    }
}
