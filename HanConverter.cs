using System;
using System.Collections.Generic;
using System.Text;

namespace TSKHook;

/// <summary>
/// Traditional Chinese -> Simplified Chinese converter.
/// Uses phrase-level (longest match first) + single-char mapping from OpenCC data.
/// </summary>
public static class HanConverter
{
    /// <summary>
    /// PhraseMap indexed by first char, sorted longest-first. The old loop
    /// probed `text.Substring(i, len)` for every length 6..2 (up to 5 string
    /// allocations per char, and — as a side effect — silently disabled the 59
    /// phrase keys longer than 6 chars). The match test is now a zero-allocation
    /// string.Compare and every generated phrase key participates.
    /// </summary>
    private static readonly Dictionary<char, KeyValuePair<string, string>[]> PhraseIndex =
        BuildPhraseIndex();

    /// <summary>
    /// CharMap as char->string: keys are always single chars, but VALUES may be
    /// supplementary-plane characters (e.g. 頫 -> 𫖯) which are surrogate PAIRS
    /// in UTF-16 (string.Length == 2). Keeping the value as string preserves
    /// those conversions exactly.
    /// </summary>
    private static readonly Dictionary<char, string> CharFast = BuildCharFast();

    private static Dictionary<char, KeyValuePair<string, string>[]> BuildPhraseIndex()
    {
        var byFirst = new Dictionary<char, List<KeyValuePair<string, string>>>();
        foreach (var kv in HanConverterData.PhraseMap)
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

    private static Dictionary<char, string> BuildCharFast()
    {
        var map = new Dictionary<char, string>();
        foreach (var kv in HanConverterData.CharMap)
        {
            // Multi-unit keys (surrogate pairs) could never match in the old
            // char-by-char algorithm either (text[i] is one UTF-16 unit), so
            // skipping them preserves behavior.
            if (kv.Key != null && kv.Key.Length == 1 && !string.IsNullOrEmpty(kv.Value))
            {
                map[kv.Key[0]] = kv.Value;
            }
        }
        return map;
    }

    /// <summary>Convert Traditional Chinese text to Simplified Chinese.</summary>
    public static string ToSimplified(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;

        var sb = new StringBuilder(text.Length);
        int i = 0;
        int n = text.Length;

        while (i < n)
        {
            // longest phrase match first (first-char index, sorted longest-first)
            bool matched = false;
            if (PhraseIndex.TryGetValue(text[i], out var candidates))
            {
                foreach (var kv in candidates)
                {
                    if (i + kv.Key.Length > n) continue;
                    if (string.Compare(text, i, kv.Key, 0, kv.Key.Length, StringComparison.Ordinal) != 0) continue;
                    // Identity phrase (e.g. 參加者 => 參加者) means "keep as-is":
                    // fall through to the next (shorter) candidate / single-char
                    // conversion instead of blocking it.
                    if (kv.Value == kv.Key) continue;
                    sb.Append(kv.Value);
                    i += kv.Key.Length;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;

            // single char (fast char->string map; values may be surrogate pairs)
            char ch = text[i];
            if (CharFast.TryGetValue(ch, out var cval))
            {
                sb.Append(cval);
            }
            else
            {
                sb.Append(ch);
            }
            i++;
        }

        return sb.ToString();
    }

    /// <summary>Convert a dictionary of Traditional Chinese values to Simplified Chinese.</summary>
    public static Dictionary<string, string> DictToSimplified(Dictionary<string, string> dict)
    {
        var result = new Dictionary<string, string>(dict.Count);
        foreach (var pair in dict)
        {
            result[pair.Key] = ToSimplified(pair.Value);
        }
        return result;
    }
}
