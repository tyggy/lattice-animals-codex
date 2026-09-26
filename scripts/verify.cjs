const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../codex/releases');let files=0;
for(const release of fs.readdirSync(root)){
 const dir=path.join(root,release),m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 for(const [file,expected] of Object.entries(m.files)){
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex');
  if(actual!==expected)throw Error(`${release}/${file}: hash mismatch`);files++;
 }
}
console.log(`Verified ${files} frozen files.`);
