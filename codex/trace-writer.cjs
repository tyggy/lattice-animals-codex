// Optional compressed audit stream. Never blocks command submission for disk I/O.
const fs=require('node:fs'),zlib=require('node:zlib');
function createTrace(file,{maxQueuedBytes=2*1024*1024,onError=()=>{}}={}){
 if(!file)return {record(){},close:async()=>{},dropped:()=>0};
 const output=fs.createWriteStream(file,{flags:'ax'}),zip=zlib.createGzip();
 let failed=false,dropped=0,ended=false;
 const fail=e=>{if(!failed){failed=true;onError(e);}zip.destroy();output.destroy();};
 output.on('error',fail);zip.on('error',fail);zip.pipe(output);
 return {
  record(event,details){
   if(failed||ended)return;
   if(zip.writableLength>maxQueuedBytes){dropped++;return;}
   const skipped=dropped;dropped=0;
   zip.write(JSON.stringify({at:new Date().toISOString(),event,...details,...(skipped?{droppedSinceLast:skipped}:{})})+'\n');
  },
  dropped:()=>dropped,
  close(){if(ended||failed)return Promise.resolve();ended=true;return new Promise(resolve=>{output.once('finish',resolve);output.once('close',resolve);zip.end();});}
 };
}
module.exports={createTrace};
