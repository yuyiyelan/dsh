// Verification harness: compile HanConverter + data + UnifiedNames and run conversion tests
using System;
using System.Collections.Generic;
using TSKHook;

class Program
{
    static int failures = 0;

    static void Check(string input, string expected, string label)
    {
        var got = HanConverter.ToSimplified(input);
        var ok = got == expected;
        if (!ok) failures++;
        Console.WriteLine($"{(ok ? "PASS" : "FAIL")} [{label}] {input} => {got}" + (ok ? "" : $"  (expected: {expected})"));
    }

    static void Main()
    {
        Console.WriteLine("HanConverterData chars: " + HanConverterData.CharMap.Count);
        Console.WriteLine("HanConverterData phrases: " + HanConverterData.PhraseMap.Count);
        Console.WriteLine("UnifiedNames overrides: " + UnifiedNames.Overrides.Count);

        Console.WriteLine("\n--- single char conversion ---");
        Check("菲歐娜", "菲欧娜", "欧");
        Check("菲歐娜（魔王覺醒）", "菲欧娜（魔王觉醒）", "觉");
        Check("維納斯", "维纳斯", "维");
        Check("艾莉西雅", "艾莉西雅", "unchanged");
        Check("莎夏（覺醒）", "莎夏（觉醒）", "觉2");
        Check("阿波羅", "阿波罗", "罗");
        Check("蘇菲亞", "苏菲亚", "苏");
        Check("克洛托", "克洛托", "unchanged2");
        Check("輕浮男", "轻浮男", "轻");
        Check("女學生A", "女学生A", "学");
        Check("咖啡店店長", "咖啡店店长", "长");
        Check("雙重阿妮瑪", "双重阿妮玛", "双/玛");
        Check("米涅露瓦", "米涅露瓦", "unchanged3");

        Console.WriteLine("\n--- phrase conversion (TW wording) ---");
        Check("軟體", "软件", "软件");
        Check("滑鼠", "鼠标", "鼠标");
        Check("程式", "程序", "程序");
        Check("網路", "网络", "网络");
        Check("檔案", "文件", "文件");
        Check("資料", "资料", "资料");
        Check("這裡", "这里", "这里");
        Check("為什麼", "为什么", "为什么");
        Check("我們", "我们", "我们");
        Check("他們", "他们", "他们");
        Check("什麼", "什么", "什么");
        Check("遊戲", "游戏", "游戏");
        Check("時間", "时间", "时间");
        Check("學園", "学园", "学园");
        Check("學生", "学生", "学生");
        Check("會長", "会长", "会长");
        Check("辦公", "办公", "办公");
        Check("書類", "书类", "书类");
        Check("推薦", "推荐", "推荐");
        Check("謝謝", "谢谢", "谢谢");
        Check("練習", "练习", "练习");
        Check("頑張", "顽张", "顽张(no match)");
        Check("花式滑冰", "花式滑冰", "滑冰 unchanged");
        Check("緋宮", "绯宫", "绯宫");
        Check("轉入", "转入", "转入");
        Check("編入", "编入", "编入");
        Check("入學費用", "入学费用", "入学费用");
        Check("打工", "打工", "打工");
        Check("籌措", "筹措", "筹措");
        Check("辛苦了", "辛苦了", "辛苦了");
        Check("會計", "会计", "会计");
        Check("書記", "书记", "书记");
        Check("學園祭", "学园祭", "学园祭");
        Check("流星學園", "流星学园", "流星学园");

        Console.WriteLine("\n--- sentence level ---");
        Check("「啊，緋宮會長午安。我正好在喝茶，你要不要一起喝？」",
              "「啊，绯宫会长午安。我正好在喝茶，你要不要一起喝？」", "sentence1");
        Check("「這裡是流星、新星兩間學園的學生休憩之處呢。蘇打拿鐵很受歡迎，但我也推薦咖啡摩卡哦。」",
              "「这里是流星、新星两间学园的学生休憩之处呢。苏打拿铁很受欢迎，但我也推荐咖啡摩卡哦。」", "sentence2");

        Console.WriteLine("\n--- identity phrase fallback ---");
        Check("參加者", "参加者", "identity 參加者");
        Check("參觀的女子", "参观的女子", "identity 參觀");
        Check("鏡像", "镜像", "identity 鏡像");

        Console.WriteLine("\n--- unified names ---");
        Console.WriteLine("コハルコ => " + (UnifiedNames.Overrides.TryGetValue("コハルコ", out var v1) ? v1 : "MISSING"));
        Console.WriteLine("フィオナ => " + (UnifiedNames.Overrides.TryGetValue("フィオナ", out var v2) ? v2 : "MISSING"));
        Console.WriteLine("サーシャ => " + (UnifiedNames.Overrides.TryGetValue("サーシャ", out var v3) ? v3 : "MISSING"));
        Console.WriteLine("みんな => " + (UnifiedNames.Overrides.TryGetValue("みんな", out var v4) ? v4 : "MISSING"));

        Console.WriteLine("\n" + (failures == 0 ? "ALL PASS" : $"{failures} FAILURES"));
        Environment.Exit(failures == 0 ? 0 : 1);
    }
}
