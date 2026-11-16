const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../..');
const base='C:\\Users\\ZacSwallingTranTechC\\.codex\\generated_images\\01a1af81-33a0-7f71-8404-d0a438b0fde2\\';
const items={
'aiden/fx_melee_hit_4':'exec-9e72b5d8-4dc9-4a8a-a854-38e8c303a7c5.png',
'aiden/fx_special_proj_1':'exec-0a7ab64e-08d8-4a7b-a56e-e52ae614cd46.png',
'aiden/fx_special_proj_2':'exec-38342723-8c9b-4af1-889a-55229b92ddde.png',
'aiden/fx_special_proj_3':'exec-1d995c7b-70bd-456c-8dc3-6e7370fbdce4.png',
'aiden/fx_special_proj_4':'exec-8302eb66-641f-45bd-afe5-a63cb61a75e1.png',
'aiden/fx_special_hit_1':'exec-20aea62f-5100-4000-bafd-6f5c8f1dbbcb.png',
'aiden/fx_special_hit_2':'exec-7d3c2e87-301d-4a0f-b743-e15d2ea845ea.png',
'aiden/fx_special_hit_3':'exec-814ca19a-bca3-4aaf-b32f-a2f7e403b7a0.png',
'aiden/fx_special_hit_4':'exec-9af40bc2-7467-4e7d-9b83-5109d38ef71b.png',
'david/portrait_hurt':'exec-a9297052-e2e9-4560-8d40-6b6b64e3fbd9.png'};
const records=Object.entries(items).map(([id,file])=>{const [group,name]=id.split('/'),m={id,out:`art-raw/heroes/${group}/${name}.png`,source:base+file,name,text:fs.readFileSync(path.join(root,`codex/prompts/heroes/${group}/${name}.txt`),'utf8')};if(name.startsWith('fx_'))m.kind='fx';return m;});
fs.writeFileSync(path.join(__dirname,'autopilot-results.json'),JSON.stringify(records));
