if($Args.Count -gt 0) {
    $location = $args[0];
    $xml = '
    <toast activationType="protocol" launch="file:///'+$location+'" >
      <visual>
        <binding template="ToastGeneric">
          <text>点击查看</text>
          <text>截图已保存至 '+$location+'</text>
        </binding>
      </visual>
    </toast>
    '
    $XmlDocument = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]::New()
    $XmlDocument.loadXml($xml)
    $AppId = 'Twinkle Star Knight'
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]::CreateToastNotifier($AppId).Show($XmlDocument)
}
