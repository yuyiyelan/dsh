using HarmonyLib;
using Utage;
using UtageExtensions;

namespace TSKHook;

/// <summary>
/// Best-effort extra patches that increase translation coverage.
/// Applied independently in a try/catch: if a game build lacks one of these
/// members, only this class is skipped and the rest of the mod keeps working.
/// NOTE: verified against the current game build (Assembly-CSharp.dll) —
/// only members that exist are patched here.
/// </summary>
public class PatchExtra
{
    // The original idea was to also translate AdvPage.get_Text / AdvBacklog.get_Text,
    // but those members do NOT exist in the current game build, so Harmony would
    // reject them (see logs: "Could not find method for type Utage.AdvPage and
    // name get_Text"). Patching non-existent members is pointless and noisy.
    // The chapter text translation is already fully covered by
    // Patch.ParseCellLocalizedTextBySwapDefaultLanguage (the Utage
    // LanguageManagerBase path that the game actually uses).
    //
    // Future additions to this class must be verified against
    // BepInEx/interop/Assembly-CSharp.dll before being enabled.
}
