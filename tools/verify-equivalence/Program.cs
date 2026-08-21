
// Equivalence harness: prove the first-char-index rewrites of HanConverter and
// SimToHanConverter produce IDENTICAL output to the previous substring-probing
// algorithms over real dictionary corpora (plus the one documented intentional
// change: HanConverter now honors phrase keys longer than 6 chars).
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using TSKHook;

class Program
{
    static int failures = 0;
    // HanConverter intentionally changed: phrase keys longer than 6 chars now
    // participate. Old-vs-new differences are EXPECTED only on inputs that
    // contain one of these keys.
    static readonly List<string> LongHanKeys = new();

    // ---------------- reference (OLD) algorithms ----------------
    static string OldHanToSimplified(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var sb = new StringBuilder(text.Length);
        int i = 0, n = text.Length;
        while (i < n)
        {
            bool matched = false;
            int maxLen = Math.Min(6, n - i);
            for (int len = maxLen; len >= 2; len--)
            {
                var key = text.Substring(i, len);
                if (HanConverterData.PhraseMap.TryGetValue(key, out var value))
                {
                    if (value == key) continue;
                    sb.Append(value);
                    i += len;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;
            var ch = text[i].ToString();
            sb.Append(HanConverterData.CharMap.TryGetValue(ch, out var cval) ? cval : ch);
            i++;
        }
        return sb.ToString();
    }

    static string OldSimNoSet(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var sb = new StringBuilder(text.Length + 8);
        int i = 0, n = text.Length;
        while (i < n)
        {
            bool matched = false;
            int max = Math.Min(12, n - i);
            if (max >= 2)
            {
                for (int len = max; len >= 2; len--)
                {
                    if (SimToHanData.PhraseMap.TryGetValue(text.Substring(i, len), out var repl))
                    {
                        sb.Append(repl);
                        i += len;
                        matched = true;
                        break;
                    }
                }
            }
            if (!matched)
            {
                char c = text[i];
                sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) ? rc : c);
                i++;
            }
        }
        return sb.ToString();
    }

    static string OldSimWithSet(string text, HashSet<int> set)
    {
        var sb = new StringBuilder(text.Length + 8);
        int i = 0, n = text.Length;
        while (i < n)
        {
            bool matched = false;
            int max = Math.Min(12, n - i);
            if (max >= 2)
            {
                for (int len = max; len >= 2; len--)
                {
                    if (SimToHanData.PhraseMap.TryGetValue(text.Substring(i, len), out var repl))
                    {
                        if (AllInSet(text, i, len, set)) { sb.Append(text, i, len); i += len; matched = true; break; }
                        if (AllInSet(repl, 0, repl.Length, set)) { sb.Append(repl); i += len; matched = true; break; }
                        AppendMapped(sb, text, i, len, set);
                        i += len;
                        matched = true;
                        break;
                    }
                }
            }
            if (!matched)
            {
                char c = text[i];
                if (set.Contains(c)) { sb.Append(c); }
                else if (SimToHanData.JpMap.TryGetValue(c, out var jps))
                {
                    char jp = '\0';
                    for (int k = 0; k < jps.Length; k++) if (set.Contains(jps[k])) { jp = jps[k]; break; }
                    if (jp != '\0') sb.Append(jp);
                    else sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                }
                else sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                i++;
            }
        }
        return sb.ToString();
    }

    static bool AllInSet(string s, int start, int len, HashSet<int> set)
    {
        for (int k = 0; k < len; k++) if (!set.Contains(s[start + k])) return false;
        return true;
    }

    static void AppendMapped(StringBuilder sb, string s, int start, int len, HashSet<int> set)
    {
        for (int k = 0; k < len; k++)
        {
            char c = s[start + k];
            if (set.Contains(c)) sb.Append(c);
            else if (SimToHanData.JpMap.TryGetValue(c, out var jps))
            {
                char jp = '\0';
                for (int j = 0; j < jps.Length; j++) if (set.Contains(jps[j])) { jp = jps[j]; break; }
                if (jp != '\0') sb.Append(jp);
                else sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
            }
            else sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
        }
    }

    // ---------------- NEW SimToHan logic (mirrors SimToHanConverter.cs) ----------------
    static readonly Dictionary<char, KeyValuePair<string, string>[]> SimIndex = BuildIndex(SimToHanData.PhraseMap);

    static Dictionary<char, KeyValuePair<string, string>[]> BuildIndex(Dictionary<string, string> phrases)
    {
        var byFirst = new Dictionary<char, List<KeyValuePair<string, string>>>();
        foreach (var kv in phrases)
        {
            if (string.IsNullOrEmpty(kv.Key) || kv.Key.Length < 2) continue;
            if (!byFirst.TryGetValue(kv.Key[0], out var list)) byFirst[kv.Key[0]] = list = new List<KeyValuePair<string, string>>();
            list.Add(kv);
        }
        var index = new Dictionary<char, KeyValuePair<string, string>[]>();
        foreach (var pair in byFirst)
        {
            var arr = pair.Value.ToArray();
            Array.Sort(arr, (a, b) => b.Key.Length - a.Key.Length);
            index[pair.Key] = arr;
        }
        return index;
    }

    static bool MatchAt(string text, int i, string key)
    {
        return i + key.Length <= text.Length &&
               string.Compare(text, i, key, 0, key.Length, StringComparison.Ordinal) == 0;
    }

    static string NewSimNoSet(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var sb = new StringBuilder(text.Length + 8);
        int i = 0, n = text.Length;
        while (i < n)
        {
            bool matched = false;
            if (SimIndex.TryGetValue(text[i], out var cands))
            {
                foreach (var kv in cands)
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
                sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) ? rc : c);
                i++;
            }
        }
        return sb.ToString();
    }

    static string NewSimWithSet(string text, HashSet<int> set)
    {
        var sb = new StringBuilder(text.Length + 8);
        int i = 0, n = text.Length;
        while (i < n)
        {
            bool matched = false;
            if (SimIndex.TryGetValue(text[i], out var cands))
            {
                foreach (var kv in cands)
                {
                    if (!MatchAt(text, i, kv.Key)) continue;
                    var repl = kv.Value;
                    int len = kv.Key.Length;
                    if (AllInSet(text, i, len, set)) sb.Append(text, i, len);
                    else if (AllInSet(repl, 0, repl.Length, set)) sb.Append(repl);
                    else AppendMapped(sb, text, i, len, set);
                    i += len;
                    matched = true;
                    break;
                }
            }
            if (!matched)
            {
                char c = text[i];
                if (set.Contains(c)) { sb.Append(c); }
                else if (SimToHanData.JpMap.TryGetValue(c, out var jps))
                {
                    char jp = '\0';
                    for (int k = 0; k < jps.Length; k++) if (set.Contains(jps[k])) { jp = jps[k]; break; }
                    if (jp != '\0') sb.Append(jp);
                    else sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                }
                else sb.Append(SimToHanData.CharMap.TryGetValue(c, out var rc) && set.Contains(rc) ? rc : c);
                i++;
            }
        }
        return sb.ToString();
    }

    static void Compare(string label, string input, string oldOut, string newOut, bool allowExpectedHanDiff = false)
    {
        if (oldOut == newOut) return;
        if (allowExpectedHanDiff && ContainsLongHanKey(input)) return;
        failures++;
        if (failures <= 20)
        {
            Console.WriteLine("DIFF [" + label + "] in=" + input.Substring(0, Math.Min(60, input.Length)) + "\n  old=" + oldOut.Substring(0, Math.Min(60, oldOut.Length)) + "\n  new=" + newOut.Substring(0, Math.Min(60, newOut.Length)));
        }
    }

    static bool ContainsLongHanKey(string input)
    {
        foreach (var key in LongHanKeys)
        {
            if (input.Contains(key)) return true;
        }
        return false;
    }

    static List<string> LoadCorpus()
    {
        var corpus = new List<string>();
        var dir = "E:/dsh/TSKHook/translation_zh_Hans";
        int fileCount = 0;
        foreach (var f in Directory.GetFiles(dir, "*.json"))
        {
            if (fileCount++ >= 200) break;
            try
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(f));
                if (dict == null) continue;
                foreach (var v in dict.Values)
                {
                    if (string.IsNullOrEmpty(v) || v.Length > 200) continue;
                    corpus.Add(v);
                    if (corpus.Count >= 30000) return corpus;
                }
            }
            catch { }
        }
        return corpus;
    }

    static void Main()
    {
        Console.WriteLine("HanConverterData: chars=" + HanConverterData.CharMap.Count + " phrases=" + HanConverterData.PhraseMap.Count);
        Console.WriteLine("SimToHanData: chars=" + SimToHanData.CharMap.Count + " jp=" + SimToHanData.JpMap.Count + " phrases=" + SimToHanData.PhraseMap.Count);

        // pre-compute the Han phrase keys longer than 6 chars (intentional change)
        foreach (var kv in HanConverterData.PhraseMap)
        {
            if (kv.Key != null && kv.Key.Length > 6) LongHanKeys.Add(kv.Key);
        }
        Console.WriteLine("long Han phrase keys (>6 chars): " + LongHanKeys.Count);

        var corpus = LoadCorpus();
        Console.WriteLine("corpus values: " + corpus.Count);

        // glyph sets: everything, nothing, only-traditional-forms, random subsets
        var allSet = new HashSet<int>();
        var tradSet = new HashSet<int>();
        foreach (var kv in SimToHanData.PhraseMap) foreach (var c in kv.Value) tradSet.Add(c);
        foreach (var kv in SimToHanData.CharMap) { allSet.Add(kv.Key); allSet.Add(kv.Value); }
        var emptySet = new HashSet<int>();
        var rnd = new Random(12345);
        var randSet = new HashSet<int>();
        for (int i = 0; i < 30000; i++) randSet.Add(rnd.Next(0x4E00, 0x9FFF));
        var sets = new (string name, HashSet<int> set)[] { ("all", allSet), ("empty", emptySet), ("trad", tradSet), ("rand", randSet) };

        int checkedSim = 0, checkedHan = 0;
        foreach (var text in corpus)
        {
            // SimToHan: no-set path
            Compare("sim-noset", text, OldSimNoSet(text), NewSimNoSet(text));
            checkedSim++;
            foreach (var s in sets)
            {
                Compare("sim-" + s.name, text, OldSimWithSet(text, s.set), NewSimWithSet(text, s.set));
                checkedSim++;
            }
            // HanConverter: trad output of old sim as input (realistic TW-ish text)
            var trad = OldSimNoSet(text);
            Compare("han", trad, OldHanToSimplified(trad), HanConverter.ToSimplified(trad), true);
            checkedHan++;
        }

        // random generated texts from the maps' own chars/phrases
        var pool = new List<string>();
        foreach (var kv in SimToHanData.PhraseMap) if (kv.Key.Length <= 12) pool.Add(kv.Key);
        foreach (var kv in SimToHanData.CharMap) pool.Add(kv.Key.ToString());
        var rng = new Random(999);
        for (int i = 0; i < 10000; i++)
        {
            var sb = new StringBuilder();
            int parts = rng.Next(1, 8);
            for (int p = 0; p < parts; p++) sb.Append(pool[rng.Next(pool.Count)]);
            var t = sb.ToString();
            Compare("sim-rand", t, OldSimNoSet(t), NewSimNoSet(t));
            Compare("sim-rand-set", t, OldSimWithSet(t, randSet), NewSimWithSet(t, randSet));
            Compare("han-rand", t, OldHanToSimplified(t), HanConverter.ToSimplified(t), true);
            checkedSim += 2;
            checkedHan++;
        }

        Console.WriteLine("compared SimToHan cases: " + checkedSim + ", HanConverter cases: " + checkedHan);
        Console.WriteLine(failures == 0 ? "ALL EQUIVALENT ✓" : failures + " DIFFERENCES ✗");
        Environment.Exit(failures == 0 ? 0 : 1);
    }
}
