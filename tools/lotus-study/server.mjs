import http from 'node:http';
import {stat,writeFile} from 'node:fs/promises';
import {watch,createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const ghostAssets=path.resolve(root,'../../<3/assets');
const media=new Map([
  ['/media/lotus-square.mp4',path.join(ghostAssets,'lotus-bloom-square-10s.mp4')],
  ['/media/lotus-poster.jpg',path.join(ghostAssets,'lotus-bloom-poster.jpg')],
  ['/media/announcement-music.wav',path.join(ghostAssets,'lotus-announcement-music-37-47.wav')]
]);
const clients=new Set();
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.wav':'audio/wav'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/__export'&&req.method==='POST'){
      const expectedOrigin=`http://127.0.0.1:${server.address().port}`;
      const type=req.headers['content-type'];
      if(req.headers.origin!==expectedOrigin||!['video/mp4','video/webm'].includes(type)){res.writeHead(403);res.end('Invalid export');return;}
      const pop=Number(url.searchParams.get('pop')),grain=Number(url.searchParams.get('grain'));
      if(![pop,grain].every(n=>Number.isInteger(n)&&n>=0&&n<=100)){res.writeHead(400);res.end('Invalid settings');return;}
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>100*1024*1024){res.writeHead(413);res.end('Export too large');return;}chunks.push(chunk);}
      const extension=type==='video/mp4'?'mp4':'webm';
      const filename=`lotus-pop${pop}-grain${grain}-recording-${Date.now()}.${extension}`;
      await writeFile(path.join(ghostAssets,filename),Buffer.concat(chunks),{flag:'wx'});
      res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify({filename}));return;
    }
    if(url.pathname==='/__events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
    }
    if(url.pathname==='/__health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"scene":"lotus-video"}');return;}
    const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const mapped=media.get(relative);
    const file=mapped||path.resolve(root,'.'+relative);
    if(!mapped&&!file.startsWith(root+path.sep)){res.writeHead(404);res.end('Not found');return;}
    const info=await stat(file);
    if(!info.isFile()){res.writeHead(404);res.end('Not found');return;}
    const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
    let start=0,end=info.size-1,status=200;
    if(req.headers.range){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!range||(!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      if(!range[1])start=Math.max(0,info.size-Number(range[2]));
      else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
      if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);
    if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{if(!res.headersSent){res.writeHead(404);res.end('Not found');}else res.destroy();}
});
let debounce;
watch(root,{recursive:true},(_,file)=>{
  if(!file||file.startsWith('vendor/')||file.startsWith('previous-procedural/')||!/\.(html|css|js)$/.test(file))return;
  clearTimeout(debounce);debounce=setTimeout(()=>clients.forEach(c=>c.write('data: reload\n\n')),150);
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM',()=>{for(const client of clients)client.end();server.close(()=>process.exit());});
