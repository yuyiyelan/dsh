// Scans the game's global-metadata.dat (background thread) for untranslated
// Japanese text fragments and persists them to plugins/font/tsk_meta_new.txt.
// After a game update this runs automatically — no need to visit screens.
// Translations are then produced offline.
//
// Gated behind the diagnostics config switch (default OFF, see PluginBehavior):
// normal sessions skip the multi-MB metadata read + regex scan entirely.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace TSKHook;

public static class MetaScanner
{
    private static bool Started;

    public static void Start()
    {
        if (Started) return;
        Started = true;
        try
        {
            var t = new System.Threading.Thread(Scan);
            t.IsBackground = true;
            t.Name = "TSKHookMetaScan";
            t.Start();
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[MetaScanner] start threw: " + e.Message);
        }
    }

    private static void Scan()
    {
        try
        {
            string metaPath = null;
            try
            {
                var dataPath = UnityEngine.Application.dataPath; // .../twinkle_starknightsX_Data
                metaPath = Path.Combine(dataPath, "il2cpp_data", "Metadata", "global-metadata.dat");
            }
            catch (Exception)
            {
            }
            if (metaPath == null || !File.Exists(metaPath))
            {
                Plugin.Global.Log.LogWarning("[MetaScanner] global-metadata.dat not found.");
                return;
            }
            // Safety: skip absurdly large metadata files (would stall startup
            // with a multi-hundred-MB read). Normal files are tens of MB.
            try
            {
                var info = new FileInfo(metaPath);
                if (info.Length > 300L * 1024 * 1024)
                {
                    Plugin.Global.Log.LogWarning($"[MetaScanner] metadata too large ({info.Length / 1024 / 1024}MB), skipping.");
                    return;
                }
            }
            catch (Exception)
            {
            }

            byte[] bytes;
            try
            {
                bytes = File.ReadAllBytes(metaPath);
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[MetaScanner] read failed: " + e.Message);
                return;
            }
            // Whole-file UTF-8 decode (invalid sequences -> replacement chars)
            string text;
            try
            {
                text = new UTF8Encoding(false, true).GetString(bytes);
            }
            catch (DecoderFallbackException)
            {
                text = new UTF8Encoding(false, false).GetString(bytes);
            }
            catch (Exception)
            {
                text = new UTF8Encoding(false, false).GetString(bytes);
            }

            // Collect continuous Japanese fragments (same logic as the offline
            // scanner). BUGFIX: the old pattern `[...][\s\S]{0,399}?` used a LAZY
            // quantifier with nothing after it, so every match was a single
            // character and the 2..300 length filter dropped them all — the
            // scanner always reported "0 fragments, 0 untranslated". The new
            // pattern matches runs of Japanese chars/punctuation plus embedded
            // ASCII digits (e.g. "500％のダメージ" stays one fragment).
            var fragRe = new Regex(
                "[0-9A-Za-z%％.\\-+\uFF10-\uFF19" +
                "\u3040-\u30FF\u4E00-\u9FFF\u3001\u3002\u300C\u300D\u30FB\u30FC\uFF01\uFF1F\uFF08\uFF09\uFF0C\u3005]{2,400}",
                RegexOptions.Compiled);
            var found = new HashSet<string>();
            foreach (Match m in fragRe.Matches(text))
            {
                string frag = m.Value.Trim();
                if (frag.Length < 2 || frag.Length > 300) continue;
                if (!ContainsJp(frag)) continue;
                if (found.Add(frag) && found.Count >= 50000)
                {
                    // Safety cap: binary-decoded metadata can produce a huge
                    // number of candidate runs; enough for offline dictionary work.
                    break;
                }
            }

            // Filter out editor/inspector configuration strings (noise).
            var candidates = new List<string>();
            foreach (var s in found)
            {
                if (IsNoise(s)) continue;
                if (IsTranslated(s)) continue;
                candidates.Add(s);
            }
            candidates.Sort(StringComparer.Ordinal);

            var outPath = Path.Combine(Path.GetDirectoryName(typeof(Plugin).Assembly.Location), "font", "tsk_meta_new.txt");
            try
            {
                File.WriteAllLines(outPath, candidates, new UTF8Encoding(false));
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[MetaScanner] write failed: " + e.Message);
                return;
            }
            Plugin.Global.Log.LogInfo("[MetaScanner] scan done: " + found.Count + " fragments, " + candidates.Count + " untranslated -> " + outPath);
        }
        catch (Exception e)
        {
            Plugin.Global.Log.LogWarning("[MetaScanner] scan threw: " + e.Message);
        }
    }

    private static bool ContainsJp(string s)
    {
        foreach (var c in s)
        {
            int cp = c;
            if (cp >= 0x3040 && cp <= 0x30FF) return true;
            if (cp >= 0x4E00 && cp <= 0x9FFF) return true;
        }
        return false;
    }

    private static bool IsNoise(string s)
    {
        // Editor/inspector configuration strings: prefix markers like
        // * - . : digits, or containing typical config words.
        char first = s[0];
        if (first == '*' || first == '-' || first == '.' || first == ':' || first == '<' || first == '>' ||
            first == '&' || first == '(' || first == ')' || first == '[' || first == ']' || first == '\\' ||
            first == '/' || first == '=' || first == '+' || first == 'V' || first == 'B' || first == 'H' ||
            first == 'F' || first == 'D' || first == 'T' || first == 'N' || first == 'P' || first == 'R' ||
            first == 'Z' || first == 'j' || first == 'l' || first == 'd' || first == 'b' || first == 'f' ||
            first == 'x' || first == 'z' || first == 'p' || first == 'r' || first == 'n' || first == 'M' ||
            first == 'L' || first == 'G' || first == 'X' || first == 'Y' || first == 'O' || first == 'J' ||
            first == 'K' || first == 'W' || first == 'E' || first == 'U' || first == 'C' || first == 'S' ||
            first == 'A' || first == 'I' || first == 'Q')
        {
            return true;
        }
        if (first >= '0' && first <= '9') return true;
        if (s.Contains("設定") && s.Length < 12) return true;
        if (s.Contains("関連") && s.Length < 12) return true;
        if (s.Contains("（秒）") || s.Contains("（度") || s.Contains("（ワールド単位）") || s.Contains("（グリッド数）")) return true;
        if (s.Contains("Addressable") || s.Contains("Prefab") || s.Contains("SpriteRenderer") || s.Contains("Transform")) return true;
        return false;
    }

    private static bool IsTranslated(string s)
    {
        if (UiDict.Entries.ContainsKey(s)) return true;
        if (UiDictExt.Entries.ContainsKey(s)) return true;
        if (UiDictMeta.Entries.ContainsKey(s)) return true;
        if (UiDictTask.Entries.ContainsKey(s)) return true;
        // also check normalized template coverage
        var norm = PatchUi.NormalizeForTemplate(s);
        if (UiDictExt.Templates.ContainsKey(norm)) return true;
        if (UiDictTask.Templates.ContainsKey(norm)) return true;
        return false;
    }
}
