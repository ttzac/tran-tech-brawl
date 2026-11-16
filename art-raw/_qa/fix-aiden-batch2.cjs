const sharp=require('sharp'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const files=['ultimate_1','ultimate_5'];
(async()=>{
 for(const n of files){const p=path.join(root,`art-raw/heroes/aiden/${n}.png`);const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let i=0;i<data.length;i+=4){if(data[i]>200&&data[i+2]>160&&data[i+1]<120){data[i]=255;data[i+1]=0;data[i+2]=255;data[i+3]=255;}}await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(p);}
 for(const n of ['fx_melee_hit_2','fx_melee_hit_3']){const p=path.join(root,`art-raw/heroes/aiden/${n}.png`);const {data,info}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});let x0=info.width,y0=info.height,x1=-1,y1=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(Math.abs(r-255)<55&&Math.abs(g)<55&&Math.abs(b-255)<55)continue;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}const bw=x1-x0+1,bh=y1-y0+1,s=Math.min(944/bw,944/bh),w=Math.round(bw*s),h=Math.round(bh*s),left=Math.round((1024-w)/2),top=Math.round((1024-h)/2);const sprite=await sharp(p).extract({left:x0,top:y0,width:bw,height:bh}).resize(w,h,{kernel:'nearest'}).png().toBuffer();await sharp({create:{width:1024,height:1024,channels:3,background:'#ff00ff'}}).composite([{input:sprite,left,top}]).png().toFile(p);}
 console.log('cleaned pink key bleed and centered hit effects with 40px margins');
})().catch(e=>{console.error(e);process.exit(1)});
