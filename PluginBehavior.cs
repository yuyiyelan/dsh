using System;
using UnityEngine;
using Utage;

namespace TSKHook;

public class PluginBehavior : MonoBehaviour
{
    private static readonly float WaitTime = 1.0f;
    private static readonly float CtrlWaitTime = 0.1f;
    public static bool IsGameSpeedChanged { get; set; }
    public static float CurrentGameSpeed { get; set; }
    private static float LastGSExecuteTime { get; set; }
    private static float LastFPSExecuteTime { get; set; }
    private static float LastSkipExecuteTime { get; set; }
    private static float LastTextScanTime { get; set; }
    private static readonly System.Collections.Generic.HashSet<string> ScannedTexts = new();
    private static int ScannedTextCount;
    private static readonly string TextDumpPath =
        System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(Plugin).Assembly.Location), "font", "tsk_api_responses.txt");

    /// <summary>
    /// Periodically enumerate every loaded TextAsset (works regardless of how
    /// the game loads them — no hooks needed) and persist Japanese-containing
    /// text for offline full translation.
    /// </summary>
    private void ScanTextAssets()
    {
        if (!TSKConfig.DiagnosticsEnabled) return; // C1: diagnostic collector off by default
        try
        {
            var objs = Resources.FindObjectsOfTypeAll(Il2CppInterop.Runtime.Il2CppType.Of<UnityEngine.TextAsset>());
            if (objs == null) return;
            int added = 0;
            for (int i = 0; i < objs.Length; i++)
            {
                try
                {
                    var ta = objs[i].TryCast<UnityEngine.TextAsset>();
                    if (ta == null) continue;
                    string name;
                    try { name = ta.name; } catch (Exception) { name = "?"; }
                    // Skip TextAssets already collected: reading .text on every
                    // 60s pass is wasteful for large assets (skel files etc).
                    if (!TextAssetScanned.Add(name)) continue;
                    var text = ta.text;
                    if (string.IsNullOrEmpty(text) || text.Length < 50) continue;
                    bool hasJp = false;
                    int scan = text.Length < 2000 ? text.Length : 2000;
                    for (int k = 0; k < scan; k++)
                    {
                        char c = text[k];
                        if (c >= 0x3040 && c <= 0x30FF || c >= 0x4E00 && c <= 0x9FFF)
                        {
                            hasJp = true;
                            break;
                        }
                    }
                    if (!hasJp) continue;
                    var key = name + "|" + text.Length;
                    lock (ScannedTexts)
                    {
                        if (!ScannedTexts.Add(key)) continue;
                        ScannedTextCount++;
                        added++;
                        try
                        {
                            System.IO.File.AppendAllText(TextDumpPath,
                                "===== TextAsset '" + name + "' (" + text.Length + " chars) =====\n" + text + "\n",
                                System.Text.Encoding.UTF8);
                        }
                        catch (Exception)
                        {
                        }
                    }
                }
                catch (Exception)
                {
                }
            }
            if (added > 0)
            {
                Plugin.Global.Log.LogInfo("[Scan] TextAssets collected: +" + added + " (total " + ScannedTextCount + ") -> " + TextDumpPath);
            }
        }
        catch (Exception)
        {
        }

        // Also scan ScriptableObjects whose names suggest text/data content for
        // string fields (some game text lives in SO assets, not TextAssets).
        try
        {
            var so = Resources.FindObjectsOfTypeAll(Il2CppInterop.Runtime.Il2CppType.Of<UnityEngine.ScriptableObject>());
            if (so != null)
            {
                int added2 = 0;
                for (int i = 0; i < so.Length && i < 400; i++)
                {
                    try
                    {
                        var obj = so[i];
                        if (obj == null) continue;
                        string name;
                        try { name = obj.name; } catch (Exception) { continue; }
                        if (string.IsNullOrEmpty(name)) continue;
                        bool interesting = name.IndexOf("Text", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Data", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Master", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Table", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Csv", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Scenario", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Localize", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Quest", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Skill", StringComparison.OrdinalIgnoreCase) >= 0;
                        if (!interesting) continue;
                        if (SOSeen.Add(name))
                        {
                            Plugin.Global.Log.LogInfo("[Scan] SO asset: " + name);
                        }
                        // Skip SOs we already reflection-scanned: reflection on
                        // every field is expensive and this is a one-shot
                        // diagnostic collector.
                        if (!SOScanned.Add(name)) continue;
                        var tr = HarmonyLib.Traverse.Create(obj);
                        foreach (var fieldName in tr.Fields())
                        {
                            try
                            {
                                var val = tr.Field(fieldName).GetValue();
                                if (val is string s && s.Length >= 20 && s.Length <= 4000 && ContainsJp(s))
                                {
                                    var key = name + "|" + fieldName + "|" + s.Length;
                                    lock (ScannedTexts)
                                    {
                                        if (!ScannedTexts.Add(key)) continue;
                                        ScannedTextCount++;
                                        added2++;
                                        System.IO.File.AppendAllText(TextDumpPath,
                                            "===== SO '" + name + "'." + fieldName + " (" + s.Length + " chars) =====\n" + s + "\n",
                                            System.Text.Encoding.UTF8);
                                    }
                                }
                            }
                            catch (Exception)
                            {
                            }
                        }
                    }
                    catch (Exception)
                    {
                    }
                }
                if (added2 > 0)
                {
                    Plugin.Global.Log.LogInfo("[Scan] SO strings collected: +" + added2 + " (total " + ScannedTextCount + ")");
                }
            }
        }
        catch (Exception)
        {
        }
    }

    private static bool ContainsJp(string s)
    {
        int scan = s.Length < 2000 ? s.Length : 2000;
        for (int i = 0; i < scan; i++)
        {
            char c = s[i];
            if (c >= 0x3040 && c <= 0x30FF || c >= 0x4E00 && c <= 0x9FFF) return true;
        }
        return false;
    }

    private static readonly System.Collections.Generic.HashSet<string> SOSeen = new();
    private static readonly System.Collections.Generic.HashSet<string> SOScanned = new();
    private static readonly System.Collections.Generic.HashSet<string> TextAssetScanned = new();

    private void Start()
    {
        // Scan global-metadata.dat on a background thread for untranslated
        // Japanese text after game updates; writes plugins/font/tsk_meta_new.txt.
        // Diagnostic collector: follows the same default-OFF config gate as the
        // other collectors (C1) so normal sessions skip the multi-MB read+scan.
        if (TSKConfig.DiagnosticsEnabled) MetaScanner.Start();
        try
        {
            Plugin.Global.Log.LogInfo("[TSKHook] persistentDataPath: " + Application.persistentDataPath);
        }
        catch (Exception)
        {
        }
    }

    private void OnDestroy()
    {
        // Persist any pending auto-translations on game exit.
        try
        {
            AutoTranslate.Flush();
        }
        catch (Exception)
        {
        }
    }

    private static float LastFallbackRefreshTime { get; set; }

    private void Update()
    {
        // Periodically dump every loaded TextAsset (Japanese-containing) for
        // offline full-text translation. Kept at a low rate: enumeration is
        // expensive and the scan is only a diagnostic collector.
        if (Time.unscaledTime - LastTextScanTime >= 60f)
        {
            LastTextScanTime = Time.unscaledTime;
            ScanTextAssets();
        }

        // Re-inject cross-font fallbacks when more TMP fonts load (e.g. the
        // story font notosanscjktc), so the UI font falls back to it for any
        // glyph it lacks. Runs at a low rate (NOT on every translation):
        // FindObjectsOfTypeAll is expensive, and the injector short-circuits
        // when the font set is unchanged.
        if (Time.unscaledTime - LastFallbackRefreshTime >= 60f)
        {
            LastFallbackRefreshTime = Time.unscaledTime;
            SimToHanConverter.InjectFallbacks();
        }

        if (Input.GetKeyDown(KeyCode.F8))
        {
            CurrentGameSpeed = Time.timeScale + (float)TSKConfig.Speed;
            Time.timeScale += (float)TSKConfig.Speed;
            // C6: float comparison — (int) cast truncated 1.5x to 1.
            IsGameSpeedChanged = Math.Abs(Time.timeScale - 1f) > 0.001f;
            LastGSExecuteTime = Time.deltaTime;
            var currSpeed = Time.timeScale.ToString();
            var text = "游戏加速中，当前速度：" + currSpeed + "x";
            Plugin.Global.Log.LogInfo(text);

            Notification.Popup("游戏速度", text);
        }

        if (Input.GetKeyDown(KeyCode.F7))
        {
            CurrentGameSpeed = Time.timeScale - (float)TSKConfig.Speed;
            Time.timeScale -= (float)TSKConfig.Speed;
            IsGameSpeedChanged = Math.Abs(Time.timeScale - 1f) > 0.001f;
            LastGSExecuteTime = Time.deltaTime;
            var currSpeed = Time.timeScale.ToString();
            var text = "游戏减速中，当前速度：" + currSpeed + "x";
            Plugin.Global.Log.LogInfo(text);

            Notification.Popup("游戏速度", text);
        }

        if (Input.GetKeyDown(KeyCode.F6))
        {
            CurrentGameSpeed = 1.0f;
            Time.timeScale = 1.0f;
            // C6: epsilon compare (the (int) cast reported 1.0 as unchanged even
            // when a tiny float drift kept the speed off by a hair).
            IsGameSpeedChanged = Math.Abs(Time.timeScale - 1f) > 0.001f;
            var currSpeed = Time.timeScale.ToString();
            var text = "游戏速度已恢复。当前速度：" + currSpeed + "x";
            Plugin.Global.Log.LogInfo(text);

            Notification.Popup("游戏速度", text);
        }

        if (Input.GetKeyDown(KeyCode.F5))
        {
            CurrentGameSpeed = 0.0f;
            Time.timeScale = 0.0f;
            IsGameSpeedChanged = Math.Abs(Time.timeScale - 1f) > 0.001f;
            LastGSExecuteTime = Time.deltaTime;
            var currSpeed = Time.timeScale.ToString();
            var text = "游戏已暂停。当前速度：" + currSpeed + "x";
            Plugin.Global.Log.LogInfo(text);

            Notification.Popup("游戏速度", text);
        }

        if (Input.GetKeyDown(KeyCode.F10))
        {
            lock (Translation.ChapterLock)
            {
                Translation.chapterDicts = new();
            }
            // Clear ALL in-memory translation caches so edited dictionaries /
            // new AutoTranslate memories take effect immediately. Also reload
            // the local name dictionary so names.json edits (dictionary editor)
            // apply without a restart.
            PatchUi.InvalidateUiCache();
            Patch.ClearNameCache();
            AutoTranslate.InvalidateMemory();
            Translation.ReloadNameDicts();
            Plugin.Global.Log.LogInfo("[Translator] cache cleared.");
            Notification.Popup("翻译", "翻译缓存已清除");
        }

        if (Input.GetKeyDown(KeyCode.F11))
        {
            TSKConfig.TranslationEnabled = !TSKConfig.TranslationEnabled;
            Plugin.Global.Log.LogInfo("Translation: " + (TSKConfig.TranslationEnabled ? "Enabled" : "Disabled"));
            Notification.Popup("翻译", TSKConfig.TranslationEnabled ? "翻译功能已开启" : "翻译功能已关闭");
        }

        if (Input.GetKeyDown(KeyCode.F12))
        {
            try
            {
                var username = Environment.UserName;
                var timeFormat = DateTime.Now.ToString("yyyyMMdd_HHmmssff");
                // C6: use the real Pictures folder instead of a hardcoded C:\ path.
                var pictures = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
                if (string.IsNullOrEmpty(pictures)) pictures = "C:\\Users\\" + username + "\\Pictures";
                var location = System.IO.Path.Combine(pictures, "tsk_" + timeFormat + ".png");
                ScreenCapture.CaptureScreenshot(location);
                Notification.SsPopup(location);
            }
            catch (Exception e)
            {
                Plugin.Global.Log.LogWarning("[TSKHook] screenshot failed: " + e.Message);
            }
        }

        if (Input.GetKeyDown(KeyCode.F1))
        {
            TSKConfig.Read();
            Window.Init();
            Plugin.Global.Log.LogInfo("[Config] reloaded.");
        }

        LastSkipExecuteTime += Time.deltaTime;
        if (LastSkipExecuteTime >= CtrlWaitTime && Input.GetKey(KeyCode.LeftControl) || LastSkipExecuteTime >= CtrlWaitTime && Input.GetKey(KeyCode.RightControl))
        {
            LastSkipExecuteTime = 0.0f;
            try
            {
                AdvEngine advEngine = FindObjectOfType<AdvEngine>() as AdvEngine;
                if (advEngine != null)
                {
                    advEngine.page.EndPage();
                }
            }
            catch (Exception e)
            {
                // C6: never spam the log every 0.1s when the page is in a
                // transient state.
                if (UnityEngine.Random.value < 0.01f)
                {
                    Plugin.Global.Log.LogWarning("[TSKHook] EndPage threw: " + e.Message);
                }
            }
        }

        LastGSExecuteTime += Time.deltaTime;
        if (IsGameSpeedChanged && LastGSExecuteTime >= WaitTime && Time.timeScale != CurrentGameSpeed)
        {
            LastGSExecuteTime = 0.0f;
            Time.timeScale = CurrentGameSpeed;
            Plugin.Global.Log.LogInfo("Game speed changed. Reset to: " + CurrentGameSpeed + "x");
        }

        LastFPSExecuteTime += Time.deltaTime;
        if (TSKConfig.FPS > 60 && LastFPSExecuteTime >= WaitTime && Application.targetFrameRate < TSKConfig.FPS)
        {
            LastFPSExecuteTime = 0.0f;
            Application.targetFrameRate = TSKConfig.FPS;
            Plugin.Global.Log.LogInfo("FPS changed. Reset to: " + TSKConfig.FPS);
        }
    }
}
