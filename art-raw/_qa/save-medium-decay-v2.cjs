const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
(async()=>{for(const m of JSON.parse(fs.readFileSync(path.join(__dirname,'medium-decay-results-v2.json')))){
const name='fx_hit_medium_'+m.n,root=path.resolve(__dirname,'../..'),out=path.join(root,'art-raw/fx',name+'.png'),old=path.join(root,'art-raw/_old/fx',name+'-before-decay-v2.png'),src=path.join(root,'art-raw/_source/fx',name+'-decay-v2.png');
fs.mkdirSync(path.dirname(old),{recursive:true});fs.copyFileSync(out,old);fs.copyFileSync(m.source,src);fs.writeFileSync(src+'.prompt.txt',m.prompt);
const {data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let i=0;i<data.length;i+=4){if(data[i]>200&&data[i+1]<120&&data[i+2]>160){data[i]=255;data[i+1]=0;data[i+2]=255;data[i+3]=255;}}
await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).resize(1024,1024,{kernel:'nearest'}).flatten({background:'#ff00ff'}).png().toFile(out);console.log(out);
}})().catch(e=>{console.error(e);process.exit(1)});
