import fs from 'node:fs';
import crypto from 'node:crypto';
const manifest = JSON.parse(fs.readFileSync(new URL('../public/vendor/opencv/manifest.json',import.meta.url)));
const data = fs.readFileSync(new URL('../public/vendor/opencv/'+manifest.file,import.meta.url));
const sha = crypto.createHash('sha256').update(data).digest('hex');
if (sha !== manifest.sha256) throw new Error('OpenCV SHA-256 mismatch');
console.log('OpenCV '+manifest.version+' integrity PASS ('+data.length+' bytes)');
