const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const generated='C:/Users/ZacSwallingTranTechC/.codex/generated_images/01a1d2a5-59c9-7bd1-92c0-77976505e553';
const rows=[
 ['ramvault/bg_far','exec-52e9af04-9a51-426c-b37d-66d25ef290af.png','stage'],
 ['ramvault/bg_mid','exec-eac93e98-057b-40e4-8336-731a7105d271.png','stage'],
 ['ramvault/bg_near','exec-7469817c-9647-4170-9a31-5f5680e3fefc.png','stage'],
 ['ramvault/plat_main','exec-0049123d-1ccd-44bd-9951-415d8a4ec07e.png','stage'],
 ['ramvault/plat_soft','exec-9be66024-990a-42eb-983d-b146b323933b.png','stage'],
 ['ramvault/plat_ledge','exec-950c943e-9bcf-4b40-abe3-c7391df8ca0f.png','stage']
];
const file=path.join(__dirname,'bec-batch-results.json');
const records=JSON.parse(fs.readFileSync(file,'utf8'));
for(const[id,image,kind]of rows){
 const[group,name]=id.split('/');
 const category=group==='global'?'fx':group==='ui'?'ui':'stages';
 const out=category==='fx'?'art-raw/fx/'+name+'.png':category==='ui'?'art-raw/ui/'+name+'.png':'art-raw/stages/'+id+'.png';
 const source=path.join(__dirname,group+'-'+name+'-candidate.png');
 const promptDir=category==='fx'?path.join(root,'codex/prompts/fx/global'):path.join(root,'codex/prompts',category,group);
 const text=fs.readFileSync(path.join(promptDir,name+'.txt'),'utf8').trim();
 fs.copyFileSync(path.join(generated,image),source);
 records.push({id,out,source,name,text,generationPrompt:text+(kind==='fx'?'\nSTRICT: standalone effect only, no person or character.':''),...(kind==='fx'?{kind:'fx'}:{})});
}
fs.writeFileSync(file,JSON.stringify(records,null,2));
console.log('Registered '+rows.length+' batch originals and prompts.');
