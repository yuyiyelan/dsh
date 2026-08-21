// Applies the alias -> unified name mapping so story/UI translations match
// the name bar (get_NameText). Aliases longer than 2 chars are replaced;
// single chars are skipped to avoid corrupting normal words.
// Performance: a cheap first-char bloom check skips texts that cannot contain
// any alias, avoiding the O(n*m) replace loop on every translation.
using System;
using System.Collections.Generic;
using System.Text;

namespace TSKHook;

public static class UnifiedNameApplier
{
    private static readonly KeyValuePair<string, string>[] Sorted =
        BuildSorted();

    // First character of every alias key (for the fast reject path).
    private static readonly HashSet<char> AliasFirstChars = BuildFirstChars();

    // Result cache: input text -> applied text (bounded).
    private static readonly Dictionary<string, string> Cache = new();
    private static readonly object CacheLock = new();
    private const int CacheMax = 4096;

    private static KeyValuePair<string, string>[] BuildSorted()
    {
        var list = new List<KeyValuePair<string, string>>();
        foreach (var kv in UnifiedNamesData.AliasToUnified)
        {
            if (kv.Key == null || kv.Value == null || kv.Key.Length < 2) continue;
            if (kv.Key == kv.Value) continue;
            list.Add(kv);
        }
        list.Sort((a, b) => b.Key.Length - a.Key.Length); // longest first
        return list.ToArray();
    }

    private static HashSet<char> BuildFirstChars()
    {
        var set = new HashSet<char>();
        foreach (var kv in UnifiedNamesData.AliasToUnified)
        {
            if (kv.Key != null && kv.Key.Length > 0) set.Add(kv.Key[0]);
        }
        return set;
    }

    public static string Apply(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        if (Sorted.Length == 0) return text;

        // Fast reject: no alias's first character appears in the text.
        if (!ContainsAnyFirstChar(text)) return text;

        lock (CacheLock)
        {
            if (Cache.TryGetValue(text, out var cached)) return cached;
        }

        var sb = new StringBuilder(text.Length + 8);
        sb.Append(text);
        foreach (var kv in Sorted)
        {
            sb.Replace(kv.Key, kv.Value);
        }
        var result = sb.ToString();

        lock (CacheLock)
        {
            if (Cache.Count >= CacheMax) Cache.Clear();
            Cache[text] = result;
        }
        return result;
    }

    private static bool ContainsAnyFirstChar(string text)
    {
        for (int i = 0; i < text.Length; i++)
        {
            if (AliasFirstChars.Contains(text[i])) return true;
        }
        return false;
    }
}
