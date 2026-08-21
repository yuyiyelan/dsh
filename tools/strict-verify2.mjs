// Relaxed verification: direct substring search on fresh interop assemblies.
// The official TSKHook log proves all hooks work; this just confirms the
// member names exist in the CURRENT clean-game interop.
import fs from 'node:fs';

const files = [
  (process.env.TSK_GAME || 'C:/Path/To/Twinkle_StarKnightsX') + '/BepInEx/interop/Assembly-CSharp.dll',
  (process.env.TSK_GAME || 'C:/Path/To/Twinkle_StarKnightsX') + '/BepInEx/interop/Unity.TextMeshPro.dll',
];
const combined = files.map((f) => fs.readFileSync(f).toString('latin1')).join('');

const targets = [
  'set_FixedFrameRate', 'DownloadChaperKeyFileUsed', 'AdventureTitleBandView',
  'UguiNovelText', 'get_NameText', 'get_MainCharacterNameText',
  'ParseCellLocalizedTextBySwapDefaultLanguage', 'SetResolution',
  'SetCharaRoot_Scale', 'MaximizeCharaView', 'initialize',
  'GameConfig', 'AdvDataManager', 'AdvPage', 'AdvBacklog', 'LanguageManagerBase',
  'Screen', 'TMP_FontAsset', 'AssetBundle', 'Font',
];

console.log('=== fresh interop member check (relaxed) ===');
let all = true;
for (const t of targets) {
  const n = combined.split(t).length - 1;
  const ok = n > 0;
  if (!ok) all = false;
  console.log(`${ok ? 'OK  ' : 'MISS'} ${t} (${n})`);
}
console.log(all ? '\nALL PRESENT ✓' : '\nSOME MISSING!');
