const sharp=require('sharp');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 for(const group of ['bec','caleb','cameron','jared','lachlan','ryan'])
  for(const kind of ['a','b'])
   for(let i=1;i<=6;i++){
    const name=`fx_ultimate_${kind}_${i}`;
    const source=path.join(root,`art-raw/_source/heroes/${group}`,`${name}.png`);
    if(!fs.existsSync(source))continue;
    const output=path.join(root,`art-raw/heroes/${group}`,`${name}.png`);
    const{data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let p=0;p<data.length;p+=4){
     if(data[p]>200&&data[p+1]<120&&data[p+2]>160){data[p]=255;data[p+1]=0;data[p+2]=255;}
    }
    const fitted=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).resize(880,880,{fit:'inside',withoutEnlargement:true,kernel:'nearest'}).png().toBuffer();
    await sharp({create:{width:1024,height:1024,channels:3,background:'#ff00ff'}}).composite([{input:fitted,gravity:'centre'}]).png().toFile(output);
    console.log(`${group}/${name} key-cleaned and inset`);
   }
})().catch(e=>{console.error(e);process.exit(1)});
