// Final verification: load TSKHook.dll metadata, verify assembly identity & types
using System;
using System.IO;
using System.Reflection;

class Program
{
    static int Main()
    {
        var dll = @"E:\dsh\TSKHook-zh-Hans-发布包\BepInEx\plugins\TSKHook.dll";
        if (!File.Exists(dll)) { Console.WriteLine("DLL NOT FOUND"); return 1; }

        // metadata-only load (does not execute, no dependencies needed)
        var asm = Assembly.ReflectionOnlyLoadFrom(dll);
        var name = asm.GetName();
        Console.WriteLine($"Assembly: {name.Name} v{name.Version}");
        Console.WriteLine($"GUID: {name.GetPublicKeyToken() == null} (no strong name)");

        var types = asm.GetTypes();
        Console.WriteLine($"Types ({types.Length}):");
        foreach (var t in types)
        {
            Console.WriteLine($"  {t.FullName} ({(t.IsClass ? "class" : "other")})");
        }

        // check key plugin type
        var plugin = types.FirstOrDefault(t => t.Name == "Plugin");
        if (plugin == null) { Console.WriteLine("FAIL: Plugin type missing"); return 1; }
        Console.WriteLine("\nPlugin type OK");

        // check static entry
        var load = plugin.GetMethod("Load");
        Console.WriteLine($"Plugin.Load() exists: {load != null}");

        // verify all source files are embedded (no missing references in metadata)
        Console.WriteLine("\nChecking key types exist...");
        string[] expected = ["Translation", "Patch", "PatchExtra", "HanConverter", "HanConverterData", "UnifiedNames", "TSKConfig", "PluginBehavior", "Notification", "Window", "MyPluginInfo"];
        int missing = 0;
        foreach (var e in expected)
        {
            var ok = types.Any(t => t.Name == e);
            if (!ok) { Console.WriteLine($"  MISSING: {e}"); missing++; }
            else Console.WriteLine($"  OK: {e}");
        }
        Console.WriteLine(missing == 0 ? "\nALL TYPES PRESENT ✓" : $"\n{missing} types missing!");
        return missing == 0 ? 0 : 1;
    }
}
