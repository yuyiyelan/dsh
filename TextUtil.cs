// Shared rich-text / number-template utilities.
//
// WHY THIS CLASS EXISTS: the "# placeholder" + "<color=#XXXXXX> tag" handling
// was implemented separately in AutoTranslate (RestoreNumbers) and PatchUi
// (FillTemplate). The same bug (treating the '#' inside a color tag as a
// placeholder) was fixed three times in one of the two copies before the
// duplication was noticed. Single implementation = single fix.
using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace TSKHook;

public static class TextUtil
{
    /// <summary>Max length of a rich-text tag we recognize (&lt;color=#…&gt;, &lt;size&gt;, …).</summary>
    private const int MaxTagLen = 64;

    /// <summary>Index of the closing '>' for the tag starting at `start`, or -1.</summary>
    private static int FindTagEnd(string s, int start)
    {
        int end = s.IndexOf('>', start);
        if (end > start && end - start <= MaxTagLen) return end;
        return -1;
    }

    /// <summary>True when the text contains Japanese kana (hiragana/katakana).
    /// Kanji-only text is NOT flagged (shared with Simplified Chinese).</summary>
    public static bool HasJapaneseKana(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        foreach (char c in s)
        {
            if (c >= 0x3040 && c <= 0x30FF) return true;
        }
        return false;
    }

    /// <summary>True when the text contains kana OR CJK ideographs (broader
    /// "is this Japanese text" test used for scanning/collecting).</summary>
    public static bool ContainsJapanese(string s)
    {
        if (string.IsNullOrEmpty(s)) return false;
        foreach (char c in s)
        {
            if (c >= 0x3040 && c <= 0x30FF || c >= 0x4E00 && c <= 0x9FFF) return true;
        }
        return false;
    }

    /// <summary>
    /// Collapse numeric runs (digits + '.') into '#' placeholders so dynamic
    /// texts (skill values 80%/160%/288%…) share ONE template translation.
    /// Rich-text tags are kept verbatim — hex digits inside &lt;color=#…&gt;
    /// are NOT values.
    /// </summary>
    public static string NormalizeNumbers(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        var sb = new StringBuilder(text.Length);
        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (c == '<')
            {
                int end = FindTagEnd(text, i);
                if (end >= 0)
                {
                    sb.Append(text, i, end - i + 1);
                    i = end;
                    continue;
                }
            }
            if (c >= '0' && c <= '9')
            {
                sb.Append('#');
                while (i + 1 < text.Length && (char.IsDigit(text[i + 1]) || text[i + 1] == '.')) i++;
            }
            else
            {
                sb.Append(c);
            }
        }
        return sb.ToString();
    }

    /// <summary>Count '#' placeholders (used to verify template alignment).</summary>
    public static int CountHashes(string s)
    {
        if (string.IsNullOrEmpty(s)) return 0;
        int n = 0;
        for (int i = 0; i < s.Length; i++)
        {
            if (s[i] == '#') n++;
        }
        return n;
    }

    /// <summary>
    /// Substitute the numeric runs of `original` (in order) into the '#'
    /// placeholders of `template`. Numbers inside rich-text tags (hex color
    /// codes) are skipped on BOTH sides, and '#' inside tags is never treated
    /// as a placeholder — this is the single canonical implementation.
    /// </summary>
    public static string RestoreNumbers(string template, string original)
    {
        // 1) numeric runs of the original, skipping tags
        var nums = new List<string>();
        for (int i = 0; i < original.Length; i++)
        {
            if (original[i] == '<')
            {
                int end = FindTagEnd(original, i);
                if (end >= 0) { i = end; continue; }
            }
            if (char.IsDigit(original[i]))
            {
                int j = i;
                while (j < original.Length && (char.IsDigit(original[j]) || original[j] == '.')) j++;
                nums.Add(original.Substring(i, j - i));
                i = j - 1;
            }
        }
        // 2) fill the template, keeping tags verbatim
        var sb = new StringBuilder(template.Length + 8);
        int k = 0;
        for (int i = 0; i < template.Length; i++)
        {
            if (template[i] == '<')
            {
                int end = FindTagEnd(template, i);
                if (end >= 0)
                {
                    sb.Append(template, i, end - i + 1);
                    i = end;
                    continue;
                }
            }
            if (template[i] == '#')
            {
                sb.Append(k < nums.Count ? nums[k] : "#");
                k++;
            }
            else
            {
                sb.Append(template[i]);
            }
        }
        return sb.ToString();
    }

    // Compiled once (SanitizeRichTags runs on every translated string that
    // contains a rich-text tag; per-call Regex.Replace re-parses the pattern).
    private static readonly Regex Color6Regex =
        new("<color=([0-9A-Fa-f]{6})>", RegexOptions.Compiled);
    private static readonly Regex Color8Regex =
        new("<color=([0-9A-Fa-f]{8})>", RegexOptions.Compiled);
    private static readonly Regex UnclosedColorRegex =
        new("<color[^>]*$", RegexOptions.Compiled);

    /// <summary>
    /// Display-time guard: repair malformed rich-text color tags (missing '#',
    /// e.g. "&lt;color=1616C97B&gt;") so TMP renders the value instead of the
    /// raw tag. Also drops an unclosed trailing &lt;color…&gt;.
    /// </summary>
    public static string SanitizeRichTags(string text)
    {
        if (string.IsNullOrEmpty(text) || text.IndexOf('<') < 0) return text;
        if (text.IndexOf("<color", StringComparison.Ordinal) < 0) return text;
        // #RRGGBB (6 hex) and #RRGGBBAA (8 hex) are the TMP-valid forms.
        text = Color6Regex.Replace(text, "<color=#$1>");
        text = Color8Regex.Replace(text, "<color=#$1>");
        // Drop unclosed trailing <color... (no closing '>') so it can't render raw.
        text = UnclosedColorRegex.Replace(text, "");
        return text;
    }
}
