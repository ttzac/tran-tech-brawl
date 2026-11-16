const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'codex/manifest.json'),'utf8'));
const ids=['aiden/','david/','annemaree/'];
(async()=>{let changed=0;for(const m of manifest.filter(x=>ids.some(id=>x.id.startsWith(id)))){const file=path.join(root,m.out);if(!fs.existsSync(file))continue;const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});let n=0;for(let y=0;y<info.height;y+=2)for(let x=0;x<info.width;x+=2){const i=(y*info.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];const isKey=Math.abs(r-255)<55&&Math.abs(g)<55&&Math.abs(b-255)<55;if(!isKey&&r>200&&b>160&&g<120){data[i]=255;data[i+1]=0;data[i+2]=255;data[i+3]=255;n++;}}if(n){await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(file);console.log(`${m.id}: cleared ${n} sampled hot-pink pixels`);changed++;}}console.log(`Updated ${changed} images.`)})().catch(e=>{console.error(e);process.exit(1)});

