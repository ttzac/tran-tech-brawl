const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const generated=path.join(process.env.USERPROFILE,'.codex','generated_images','01a1d2a5-59c9-7bd1-92c0-77976505e553');
const ids=['caleb/taunt_2','caleb/victory_2','caleb/victory_3','caleb/fx_ultimate_a_1','caleb/fx_ultimate_a_2','caleb/fx_ultimate_a_3','caleb/fx_ultimate_a_4','caleb/fx_ultimate_b_1','caleb/fx_ultimate_b_2','caleb/fx_ultimate_b_3'];
const files=['exec-e37c8a60-b27c-40e1-aab1-e906fba496d6.png','exec-e59ebdb1-f200-48f5-8c18-f9a014c4a9e8.png','exec-638ec4fc-8358-4c46-8885-fa1c8a99f355.png','exec-a0acaf83-d77b-4a38-9170-ac4391162f6d.png','exec-50383385-7d29-4370-81cd-1ded4de3e82e.png','exec-673bb46d-2573-4e47-9ea8-3e2d5c650dcf.png','exec-06ca07a6-d0e3-4989-9e31-4924b398f225.png','exec-fd2ee376-7ddb-4f04-881b-dc2950ea8181.png','exec-86b37000-ae2c-4ea3-91df-ed0bd80238a0.png','exec-6342f967-9710-4145-ac5c-8ac153e172d4.png'];
const loader=JSON.parse(cp.execFileSync(process.execPath,['art-raw/_qa/autopilot-load.cjs'],{cwd:root,encoding:'utf8',maxBuffer:30e6}).replace(/^Warning:.*\n/,'')).batch;
const byId=new Map(loader.map(x=>[x.id,x]));
const resultsPath=path.join(__dirname,'bec-batch-results.json');const records=JSON.parse(fs.readFileSync(resultsPath));
for(let i=0;i<ids.length;i++){const m=byId.get(ids[i]);if(!m)throw Error('Missing prompt '+ids[i]);const candidate=path.join(__dirname,`${ids[i].replace('/','-')}-candidate.png`);fs.copyFileSync(path.join(generated,files[i]),candidate);records.push({id:m.id,out:m.out,source:candidate,name:m.id.split('/')[1],text:m.text,generationPrompt:m.text,...(m.id.includes('/fx_')?{kind:'fx'}:{landmarks:[240,600],targetHead:145})});}
fs.writeFileSync(resultsPath,JSON.stringify(records,null,2));console.log('Recorded '+ids.length+' Caleb assets');
