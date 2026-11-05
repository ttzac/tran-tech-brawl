const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const stdout=cp.execFileSync(process.execPath,['codex/next.mjs','10'],{cwd:root,encoding:'utf8'});
const ids=[...stdout.matchAll(/^\d+\. (.+)$/gm)].map(m=>m[1].trim());
const manifest=JSON.parse(fs.readFileSync(path.join(root,'codex/manifest.json')));
const batch=ids.map(id=>{const m=manifest.find(x=>x.id===id);return {...m,text:fs.readFileSync(path.join(root,'codex',m.prompt),'utf8'),refs:m.refs.map(r=>r.replace(/ \(.*\)$/, '')).filter(r=>fs.existsSync(path.join(root,r)))};});
console.log(JSON.stringify({stdout,batch}));
