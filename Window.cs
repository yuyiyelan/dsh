using UnityEngine;

namespace TSKHook;

/// <summary>
/// Applies the configured window size / refresh rate to the game window.
/// </summary>
public class Window
{
    /// <summary>
    /// Apply window size from config (width/height).
    /// NOTE: uses the 3-arg overload — the 4th parameter of SetResolution is
    /// the monitor REFRESH RATE in Hz; passing FPS there forced 60Hz on 144Hz
    /// displays (A5). Frame rate is controlled via Application.targetFrameRate.
    /// </summary>
    public static void Init()
    {
        Screen.SetResolution(TSKConfig.width, TSKConfig.height, false);
        Plugin.Global.Log.LogInfo("Game window size: " + TSKConfig.width + "x" + TSKConfig.height);
    }
}
