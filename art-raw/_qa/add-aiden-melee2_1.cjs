const fs=require('node:fs'),path=require('node:path');
const p=path.join(__dirname,'autopilot-results.json');
const d=JSON.parse(fs.readFileSync(p,'utf8'));
d.push({id:'aiden/melee2_1',out:'art-raw/heroes/aiden/melee2_1.png',source:'C:\\Users\\ZacSwallingTranTechC\\.codex\\generated_images\\01a1af81-33a0-7f71-8404-d0a438b0fde2\\exec-6aa2307d-6c1d-419f-8cd6-477a63cb11e7.png',landmarks:[280,640],targetHead:173,text:fs.readFileSync(path.join(__dirname,'../../codex/prompts/heroes/aiden/melee2_1.txt'),'utf8'),name:'melee2_1'});
fs.writeFileSync(p,JSON.stringify(d));
