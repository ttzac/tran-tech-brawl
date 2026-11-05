const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const group = path.join(root, 'art-raw/heroes/chain');
const source = path.join(root, 'art-raw/_source/heroes/chain');
// Hair-to-chin landmarks in generated source pixels; hips are pelvic centers.
// Uniform scaling preserves the artwork; articulated pose height is not used as scale.
const spec = JSON.parse(fs.readFileSync(path.join(__dirname,'chain-landmarks.json')));
const landmarks = spec.landmarks;
const targetHead = spec.targetHead;
function maskAndBox(data,w,h) {
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*4;
    if(data[i]>200 && data[i+1]<55 && data[i+2]>200) {
      data[i]=255; data[i+1]=0; data[i+2]=255; data[i+3]=0;
    } else if(data[i+3]) {
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
    }
  }
  if(x1<0) throw Error('Empty image');
  return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
}
(async()=>{
  fs.mkdirSync(source,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'codex/manifest.json')));
  const entries=manifest.filter(m=>m.group==='chain' && m.tier===1 && (/^(portrait|icon)/.test(m.name) || landmarks[m.name]));
  const report=[];
  for(const entry of entries) {
    const name=entry.name, input=path.join(group,name+'.png'), original=path.join(source,name+'.png');
    if(!fs.existsSync(input)) throw Error('Missing '+input);
    if(!fs.existsSync(original)) fs.copyFileSync(input,original);
    const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const box=maskAndBox(data,info.width,info.height);
    let png,detail;
    if(/^(portrait|icon)/.test(name)) {
      png=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
        .resize(1024,1024,{kernel:'nearest'}).flatten({background:'#ff00ff'}).png().toBuffer();
      detail={name,sourceSize:[info.width,info.height],output:[1024,1024],mode:'canvas-resize'};
    } else {
      const [head,hipX,hipY]=landmarks[name];
      const airborne=hipY!==undefined;
      const desired=targetHead/head;
      const maxX=Math.min(472/Math.max(1,hipX-box.left),472/Math.max(1,box.left+box.width-hipX));
      const maxY=airborne?Math.min(600/Math.max(1,hipY-box.top),344/Math.max(1,box.top+box.height-hipY)):920/box.height;
      const scale=Math.min(desired,maxX,maxY);
      const width=Math.max(1,Math.round(box.width*scale)),height=Math.max(1,Math.round(box.height*scale));
      const left=Math.round(512-(hipX-box.left)*scale);
      const top=airborne?Math.round(640-(hipY-box.top)*scale):961-height;
      const crop=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
        .extract(box).resize(width,height,{kernel:'nearest'}).png().toBuffer();
      if(left<40||top<40||left+width>985||top+height>985) throw Error('Margin failed '+name);
      png=await sharp({create:{width:1024,height:1024,channels:4,background:'#ff00ff'}})
        .composite([{input:crop,left,top}]).png().toBuffer();
      detail={name,sourceSize:[info.width,info.height],sourceBox:box,sourceHead:head,sourceHip:[hipX,hipY??null],scale,headPixels:head*scale,output:[1024,1024],box:[left,top,width,height],feet:airborne?null:960,hipTarget:airborne?[512,640]:[512,null],constrained:scale<desired*.95};
    }
    fs.writeFileSync(input,png); report.push(detail);
  }
  fs.writeFileSync(path.join(__dirname,'chain-normalization.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.map(x=>({name:x.name,feet:x.feet,head:x.headPixels&&+x.headPixels.toFixed(1),constrained:x.constrained})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
