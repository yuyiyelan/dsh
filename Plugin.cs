using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;

namespace TSKHook;

/// <summary>
/// TSKHook entry point (BepInEx IL2CPP plugin).
/// Load order: read config -> set window size -> load translation dictionaries
/// (bounded 20s wait; local dicts load instantly) -> install Harmony patches ->
/// attach the per-frame behaviour (hotkeys).
/// </summary>
[BepInPlugin(MyPluginInfo.PLUGIN_GUID, MyPluginInfo.PLUGIN_NAME, MyPluginInfo.PLUGIN_VERSION)]
public class Plugin : BasePlugin
{
    public override void Load()
    {
        if (Console.LargestWindowWidth > 0)
        {
            Console.OutputEncoding = Encoding.UTF8;
        }

        Global.Log = Log;
        Log.LogInfo($"Plugin {MyPluginInfo.PLUGIN_GUID} is loaded!");

        TSKConfig.Read();
        Window.Init();

        // Load translation dictionaries without ever freezing startup.
        //   - Offline dictionaries present (shipped package, the normal case):
        //     they load in milliseconds, so wait with a short bound.
        //   - No offline dictionary (fresh install): let the remote fetch run
        //     on the background thread instead of blocking the main thread for
        //     up to 20s; InitAsync publishes nameDicts with a single atomic
        //     reference assignment, so it cannot race with main-thread reads.
        try
        {
            var localReady = Directory.Exists(Translation.LocalDictDir) &&
                             File.Exists(Path.Combine(Translation.LocalDictDir, "names.json"));
            var initTask = Translation.InitAsync();
            if (localReady)
            {
                if (!initTask.Wait(TimeSpan.FromSeconds(5)))
                {
                    Log.LogWarning("[Translator] Dictionary load timed out; continuing without it.");
                }
            }
            else
            {
                Log.LogInfo("[Translator] No local dictionary; loading in background.");
            }
        }
        catch (Exception e)
        {
            Log.LogWarning("[Translator] Dictionary load failed: " + e.Message);
        }

        Patch.Initialize();
        PatchUi.Initialize();
        AutoTranslate.Initialize();

        AddComponent<PluginBehavior>();
    }

    /// <summary>Shared log handle used across the whole plugin.</summary>
    public class Global
    {
        public static ManualLogSource Log { get; set; }
    }
}
