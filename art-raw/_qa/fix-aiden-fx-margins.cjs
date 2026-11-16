const sharp = require('sharp');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const names = [
  'fx_ultimate_a_1', 'fx_ultimate_a_2', 'fx_ultimate_a_3', 'fx_ultimate_a_4',
  'fx_ultimate_b_1', 'fx_ultimate_b_2', 'fx_ultimate_b_3',
  'fx_ultimate_b_4', 'fx_ultimate_b_5', 'fx_ultimate_b_6',
];

(async () => {
  for (const name of names) {
    const source = path.join(root, 'art-raw/_source/heroes/aiden', `${name}.png`);
    const output = path.join(root, 'art-raw/heroes/aiden', `${name}.png`);
    const fitted = await sharp(source)
      .resize(880, 880, { fit: 'inside', withoutEnlargement: true, kernel: 'nearest' })
      .png()
      .toBuffer();
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ff00ff' } })
      .composite([{ input: fitted, gravity: 'centre' }])
      .png()
      .toFile(output);
    console.log(`${name} resized into 1024x1024 with 72px minimum margin`);
  }
})().catch(error => { console.error(error); process.exit(1); });
