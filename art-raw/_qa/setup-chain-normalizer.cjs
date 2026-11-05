const fs=require('node:fs');
let t=fs.readFileSync(__dirname+'/normalize-zac.cjs','utf8');
t=t.replace("'art-raw/heroes/zac'","'art-raw/heroes/chain'")
 .replace("'art-raw/_source/heroes/zac'","'art-raw/_source/heroes/chain'")
 .replace(/const landmarks = \{[\s\S]*?\n\};/, "const spec = JSON.parse(fs.readFileSync(path.join(__dirname,'chain-landmarks.json')));\nconst landmarks = spec.landmarks;")
 .replace('const targetHead = 640 * 166 / 747;', 'const targetHead = spec.targetHead;')
 .replace("m.group==='zac' && m.tier===1", "m.group==='chain' && m.tier===1 && (/^(portrait|icon)/.test(m.name) || landmarks[m.name])")
 .replace('zac-normalization.json','chain-normalization.json');
fs.writeFileSync(__dirname+'/normalize-chain.cjs',t);
if(!fs.existsSync(__dirname+'/chain-landmarks.json'))fs.writeFileSync(__dirname+'/chain-landmarks.json',JSON.stringify({targetHead:620*286/964,landmarks:{idle_1:[286,655]}},null,2));
