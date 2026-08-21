using System;
using System.Text.Json;
using Il2CppSystem.IO;
using Il2CppSystem.Text;

namespace TSKHook;

public class TSKConfig
{
    public static double Speed;
    public static int FPS;
    public static bool TranslationEnabled;
    public static int width;
    public static int height;
    public static float zoom;

    /// <summary>Translation output language: "zh_Hans" (Simplified, default) or "zh_Hant" (Traditional).</summary>
    public static string TranslationLang = "zh_Hans";

    /// <summary>Optional OpenAI-compatible translation API for strings missing from dictionaries.</summary>
    public static bool ApiTranslationEnabled;
    public static string ApiUrl = "";
    public static string ApiKey = "";
    public static string ApiModel = "gpt-4o-mini";

    /// <summary>Diagnostic collectors (TextAsset capture, 60s asset scans,
    /// web-request URL logging, glyph dumps, global-metadata fragment scan).
    /// Default OFF (RULES: extra features off by default); the game ships
    /// without them writing 20MB+ dump files and log spam every session.</summary>
    public static bool DiagnosticsEnabled;

    public static void Read()
    {
        try
        {
            ReadCore();
        }
        catch (Exception e)
        {
            // A malformed config.json must never crash the plugin: fall back
            // to defaults and rewrite a valid file. C6: back up the original
            // first so a parse failure can never silently drop the API key.
            Plugin.Global.Log.LogWarning("config.json parse error: " + e.Message);
            Plugin.Global.Log.LogWarning("Using default config.");
            try
            {
                if (System.IO.File.Exists("./BepInEx/plugins/config.json"))
                {
                    System.IO.File.Copy("./BepInEx/plugins/config.json", "./BepInEx/plugins/config.json.bak", true);
                }
            }
            catch (Exception)
            {
            }
            Speed = 0.5;
            FPS = 60;
            TranslationEnabled = true;
            width = 1280;
            height = 720;
            zoom = 1.0f;
            TranslationLang = "zh_Hans";
            ApiTranslationEnabled = false;
            ApiUrl = "";
            ApiKey = "";
            ApiModel = "gpt-4o-mini";
            DiagnosticsEnabled = false;
            WriteJsonFile(0.5, 60, true, width, height, zoom, TranslationLang);
        }
    }

    private static void ReadCore()
    {
        if (File.Exists("./BepInEx/plugins/config.json"))
        {
            var content = File.InternalReadAllText("./BepInEx/plugins/config.json", Encoding.UTF8);
            using var doc = JsonDocument.Parse(content);
            var config = doc.RootElement;

            var needWrite = false;

            if (config.TryGetProperty("speed", out var sValue))
            {
                Speed = sValue.GetDouble();
            }
            else
            {
                Speed = 0.5;
                needWrite = true;
            }

            if (config.TryGetProperty("fps", out var fValue))
            {
                FPS = fValue.GetInt32();
            }
            else
            {
                FPS = 60;
                needWrite = true;
            }

            if (config.TryGetProperty("translation", out var tValue))
            {
                TranslationEnabled = tValue.GetBoolean();
            }
            else
            {
                TranslationEnabled = true;
                needWrite = true;
            }

            if (config.TryGetProperty("width", out var wValue))
            {
                width = wValue.GetInt32();
            }
            else
            {
                width = 1280;
                needWrite = true;
            }

            if (config.TryGetProperty("height", out var hValue))
            {
                height = hValue.GetInt32();
            }
            else
            {
                height = 720;
                needWrite = true;
            }

            if (config.TryGetProperty("zoom", out var zValue))
            {
                zoom = (float)zValue.GetDouble();
            }
            else
            {
                zoom = 1.0f;
                needWrite = true;
            }

            // ---- new: translation language ----
            if (config.TryGetProperty("translationLang", out var langValue))
            {
                var lang = langValue.GetString();
                if (lang == "zh_Hant" || lang == "zh_Hans")
                {
                    TranslationLang = lang;
                }
                else
                {
                    TranslationLang = "zh_Hans";
                    needWrite = true;
                }
            }
            else
            {
                TranslationLang = "zh_Hans";
                needWrite = true;
            }

            // ---- new: optional translation API (OpenAI-compatible) ----
            if (config.TryGetProperty("translationApi", out var apiValue) && apiValue.ValueKind == JsonValueKind.Object)
            {
                if (apiValue.TryGetProperty("enabled", out var apiEnabled))
                {
                    ApiTranslationEnabled = apiEnabled.GetBoolean();
                }
                if (apiValue.TryGetProperty("url", out var apiUrl))
                {
                    ApiUrl = apiUrl.GetString() ?? "";
                }
                if (apiValue.TryGetProperty("key", out var apiKey))
                {
                    ApiKey = apiKey.GetString() ?? "";
                }
                if (apiValue.TryGetProperty("model", out var apiModel))
                {
                    ApiModel = apiModel.GetString() ?? "gpt-4o-mini";
                }
            }
            else
            {
                ApiTranslationEnabled = false;
                ApiUrl = "";
                ApiKey = "";
                ApiModel = "gpt-4o-mini";
            }

            // ---- diagnostics switch (default off) ----
            if (config.TryGetProperty("diagnostics", out var diagValue))
            {
                DiagnosticsEnabled = diagValue.GetBoolean();
            }
            else
            {
                DiagnosticsEnabled = false;
            }

            if (needWrite) WriteJsonFile(Speed, FPS, TranslationEnabled, width, height, zoom, TranslationLang);

            Plugin.Global.Log.LogInfo("Current setting:");
            Plugin.Global.Log.LogInfo("Game speed(each step): " + Speed);
            Plugin.Global.Log.LogInfo("FPS: " + FPS);
            Plugin.Global.Log.LogInfo("Translation: " + (TranslationEnabled ? "Enabled" : "Disabled"));
            Plugin.Global.Log.LogInfo("Translation language: " + TranslationLang);
            Plugin.Global.Log.LogInfo("Zoom ratio: " + zoom);
        }
        else
        {
            Plugin.Global.Log.LogWarning("config.json not found!!!");
            Plugin.Global.Log.LogWarning("Using default config.");
            Speed = 0.5;
            FPS = 60;
            TranslationEnabled = true;
            width = 1280;
            height = 720;
            zoom = 1.0f;
            TranslationLang = "zh_Hans";
            ApiTranslationEnabled = false;
            ApiUrl = "";
            ApiKey = "";
            ApiModel = "gpt-4o-mini";

            // Create default JSON file
            WriteJsonFile(0.5, 60, true, width, height, zoom, TranslationLang);
        }
    }

    public static void WriteJsonFile(double speed, int fps, bool enabled, int w, int h, float z, string lang)
    {
        var config = new config
        {
            speed = speed,
            fps = fps,
            translation = enabled,
            width = w,
            height = h,
            zoom = z,
            translationLang = lang,
            translationApi = new config.api
            {
                enabled = ApiTranslationEnabled,
                url = ApiUrl,
                key = ApiKey,
                model = ApiModel
            }
        };

        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText("./BepInEx/plugins/config.json", json);
    }

    public class config
    {
        public double speed { get; set; }
        public int fps { get; set; }
        public bool translation { get; set; }
        public int width { get; set; }
        public int height { get; set; }
        public float zoom { get; set; }
        public string translationLang { get; set; }
        public api translationApi { get; set; }

        public class api
        {
            public bool enabled { get; set; }
            public string url { get; set; }
            public string key { get; set; }
            public string model { get; set; }
        }
    }
}
