using System;
using System.Diagnostics;
using System.Text;

namespace TSKHook;

public class Notification
{
    public static void Popup(string title, string text)
    {
        // Build the script; pass it via -EncodedCommand (Base64 UTF-16LE) so
        // Chinese text never gets mangled by the ANSI command-line encoding.
        var script =
            "$headlineText = @'\n" + title + "\n'@;\n" +
            "$bodyText = @'\n" + text + "\n'@;\n" +
            "$ToastText02 = [Windows.UI.Notifications.ToastTemplateType, Windows.UI.Notifications, ContentType = WindowsRuntime]::ToastText02;" +
            "$TemplateContent = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]::GetTemplateContent($ToastText02);" +
            "$TemplateContent.SelectSingleNode('//text[@id=\"1\"]').InnerText = $headlineText;" +
            "$TemplateContent.SelectSingleNode('//text[@id=\"2\"]').InnerText = $bodyText;" +
            "$AppId = 'Twinkle Star Knight';" +
            "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($TemplateContent);";

        var encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));

        var start = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            Arguments = "-NoProfile -EncodedCommand " + encoded
        };
        Process.Start(start);
    }

    public static void SsPopup(string location)
    {
        // Quote the path so user names with spaces (e.g. "John Doe") work.
        var scriptArgs = "-ExecutionPolicy Bypass -F \"./BepInEx/plugins/SS_Notification.ps1\" \"" + location + "\"";

        var start = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            Arguments = scriptArgs
        };
        Process.Start(start);
    }
}
