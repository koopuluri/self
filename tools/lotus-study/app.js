import {createFilmLook} from './look.js';
import {stackOpacity,normalizeFade} from './stack-motion.js';
import {createMusic} from './music.js';
import {createStackStyle} from './stack-style.js';
const $=id=>document.getElementById(id);
const video=$('lotus');
const defaults={pop:84,grain:91,speed:1,fadeStart:2,fadeEnd:10,fadePower:3,musicVolume:100,musicFade:1.5,iconWeight:135,iconSize:100};
const stackStyle=createStackStyle($('stack-icons'));
stackStyle.ready.catch(error=>{console.error(error);$('status').textContent=error.message;});
const music=createMusic(video,$('music'),(status,cue)=>{
  $('music-status').textContent=status;
  $('music-cue').textContent=cue.toFixed(1)+' s';
});
let film=null,exporting=false;
const storageKey='ghost-personhood-color-v3';
let settings={...defaults};
try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
  for(const key of ['pop','grain'])if(Number.isFinite(saved[key]))settings[key]=Math.min(100,Math.max(0,saved[key]));
  if([.5,.75,1,1.5].includes(saved.speed))settings.speed=saved.speed;
  for(const key of ['fadeStart','fadeEnd','fadePower'])if(Number.isFinite(saved[key]))settings[key]=saved[key];
  if(Number.isFinite(saved.musicVolume))settings.musicVolume=Math.min(100,Math.max(0,saved.musicVolume));
  if(Number.isFinite(saved.musicFade))settings.musicFade=Math.min(4,Math.max(0,saved.musicFade));
  if(Number.isFinite(saved.iconWeight))settings.iconWeight=Math.min(220,Math.max(75,saved.iconWeight));
  if(Number.isFinite(saved.iconSize))settings.iconSize=Math.min(160,Math.max(70,saved.iconSize));
  normalizeFade(settings);
}catch{}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}
function apply(){
  $('colorPop').value=settings.pop;$('pop-label').textContent=settings.pop+'%';
  $('grain').value=settings.grain;$('grain-label').textContent=settings.grain+'%';
  film?.set(settings);
  $('speed').value=settings.speed;video.playbackRate=settings.speed;
  for(const key of ['fadeStart','fadeEnd','fadePower']){
    $(key).value=settings[key];$(key+'-label').textContent=settings[key].toFixed(1)+(key==='fadePower'?'':' s');
  }
  $('fadeStart').max=settings.fadeEnd-.5;$('fadeEnd').min=settings.fadeStart+.5;
  $('musicVolume').value=settings.musicVolume;$('musicVolume-label').textContent=settings.musicVolume+'%';
  $('musicFade').value=settings.musicFade;$('musicFade-label').textContent=settings.musicFade.toFixed(1)+' s';
  music.set(settings);
  for(const key of ['iconWeight','iconSize']){
    $(key).value=settings[key];$(key+'-label').textContent=settings[key]+'%';
  }
  stackStyle.set(settings);
  syncStack();
}
function syncStack(){
  const opacity=stackOpacity(video.currentTime,settings);
  $('stack-icons').style.opacity=opacity;
  $('stack-visibility').textContent=Math.round(opacity*100)+'%';
}
function animateStack(){syncStack();music.sync();requestAnimationFrame(animateStack);}
requestAnimationFrame(animateStack);
function format(t){if(!Number.isFinite(t))return '0:00';return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
function sync(){
  syncStack();
  const playing=!video.paused;
  $('play').textContent=playing?'Ⅱ':'▷';$('play').setAttribute('aria-label',playing?'Pause video':'Play video');
  $('timeline').value=Number.isFinite(video.duration)?Math.round(video.currentTime/video.duration*1000):0;
  $('time').textContent=format(video.currentTime)+' / '+format(video.duration);
  if(!video.error&&!exporting)$('status').textContent=playing?'Looping · color & grain':'Paused';
}
async function play(){try{await video.play();}catch{if(!video.error)$('status').textContent='Press play to begin';}sync();}
function toggle(){video.paused?play():video.pause();}
$('play').addEventListener('click',toggle);
$('restart').addEventListener('click',()=>{video.currentTime=0;sync();});
$('timeline').addEventListener('input',e=>{if(Number.isFinite(video.duration)){video.pause();video.currentTime=Number(e.target.value)/1000*video.duration;sync();}});
$('colorPop').addEventListener('input',e=>{settings.pop=Number(e.target.value);apply();persist();});
$('grain').addEventListener('input',e=>{settings.grain=Number(e.target.value);apply();persist();});
$('speed').addEventListener('change',e=>{settings.speed=Number(e.target.value);apply();persist();});
for(const key of ['musicVolume','musicFade'])$(key).addEventListener('input',e=>{
  settings[key]=Number(e.target.value);apply();persist();
});
for(const key of ['iconWeight','iconSize'])$(key).addEventListener('input',e=>{
  settings[key]=Number(e.target.value);apply();persist();
});
$('music-play').addEventListener('click',async()=>{
  video.pause();video.currentTime=0;
  try{await music.enable();await play();}
  catch(error){$('music-status').textContent='Music could not start. Try again.';console.error(error);}
});
for(const key of ['fadeStart','fadeEnd','fadePower'])$(key).addEventListener('input',e=>{
  settings[key]=Number(e.target.value);normalizeFade(settings,key);apply();persist();
});
$('reset').addEventListener('click',()=>{settings={...defaults};apply();persist();});
function focus(){const active=document.body.classList.toggle('focus-mode');$('focus').innerHTML=(active?'Show':'Hide')+' controls <span>'+(active?'↙':'↗')+'</span>';$('focus').setAttribute('aria-pressed',String(active));}
$('focus').addEventListener('click',focus);
addEventListener('keydown',e=>{if(e.target.matches('input,button,select,textarea')||e.metaKey||e.ctrlKey||e.altKey)return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.key.toLowerCase()==='h')focus();});
for(const event of ['loadedmetadata','timeupdate','play','pause','seeked'])video.addEventListener(event,sync);
video.addEventListener('error',()=>{$('error').textContent='The video could not load. Refresh this page to try again.';$('error').hidden=false;$('status').textContent='Video unavailable';});
try{film=createFilmLook(video,$('film'));}catch(error){console.error('Film treatment unavailable:',error);}
video.muted=true;apply();
if(matchMedia('(prefers-reduced-motion: reduce)').matches){video.autoplay=false;video.pause();sync();}else play();
const events=new EventSource('/__events');events.onmessage=e=>{if(e.data==='reload')location.reload();};

$('export').addEventListener('click',async()=>{
  if(!film||exporting)return;
  exporting=true;
  const controls=[...document.querySelectorAll('button,input,select')];controls.forEach(el=>el.disabled=true);
  const original={loop:video.loop,time:video.currentTime,playing:!video.paused};
  let stream,recorder,resultMessage;
  try{
    // Unlock audio in the export click gesture, before loading or seeking.
    const musicReady=music.enable();
    video.pause();video.loop=false;
    await musicReady;
    if(video.readyState<2)await new Promise((resolve,reject)=>{video.addEventListener('loadeddata',resolve,{once:true});video.addEventListener('error',reject,{once:true});});
    if(video.currentTime!==0)await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=0;});
    film.exportSize(1080);film.draw();
    const mime=['video/mp4;codecs=avc1.640028,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw new Error('This browser cannot record the video.');
    // Composite the same SVG into exports, at the exact on-screen proportions.
    await stackStyle.ready;
    await $('stack-icons').decode();
    const composite=document.createElement('canvas');composite.width=composite.height=1080;
    const ctx=composite.getContext('2d');
    const overlay=$('stack-icons'),stage=$('stage').getBoundingClientRect(),icon=overlay.getBoundingClientRect();
    const iconWidth=icon.width/stage.width*1080,iconHeight=icon.height/stage.height*1080;
    film.onDraw(frame=>{
      ctx.drawImage(frame,0,0,1080,1080);
      ctx.save();ctx.globalAlpha=stackOpacity(video.currentTime,settings);
      ctx.drawImage(overlay,(1080-iconWidth)/2,(1080-iconHeight)/2,iconWidth,iconHeight);
      ctx.restore();
    });
    film.draw();stream=composite.captureStream(24);
    stream.addTrack(music.exportTrack());
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:24000000,audioBitsPerSecond:256000});
    const chunks=[];
    recorder.addEventListener('dataavailable',e=>{if(e.data.size)chunks.push(e.data);});
    const stopped=new Promise((resolve,reject)=>{recorder.addEventListener('stop',resolve,{once:true});recorder.addEventListener('error',reject,{once:true});});
    const ended=new Promise(resolve=>video.addEventListener('ended',resolve,{once:true}));
    $('status').textContent='Exporting one full loop…';
    recorder.start(1000);film.draw();await video.play();await ended;await music.finish();
    recorder.stop();await stopped;
    $('status').textContent='Saving the rendered video…';
    const type=mime.startsWith('video/mp4')?'video/mp4':'video/webm';
    const blob=new Blob(chunks,{type});
    const response=await fetch(`/__export?pop=${settings.pop}&grain=${settings.grain}`,{method:'POST',headers:{'Content-Type':type},body:blob});
    if(!response.ok)throw new Error('The rendered file could not be saved.');
    const result=await response.json();
    resultMessage='Saved · '+result.filename;$('status').textContent=resultMessage;
    $('export').textContent='Exported ✓';
  }catch(error){console.error(error);resultMessage='Export failed: '+error.message;$('status').textContent=resultMessage;}
  finally{
    if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(track=>track.stop());
    video.pause();film.onDraw(null);video.loop=original.loop;video.currentTime=original.time;film.exportSize(0);
    controls.forEach(el=>el.disabled=false);exporting=false;
    // Keep the completed result visible. The user can resume playback.
    sync();if(resultMessage)$('status').textContent=resultMessage;
  }
});
