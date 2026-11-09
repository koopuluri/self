import * as THREE from './vendor/three.module.js';
import {DEFAULTS,sanitize,normalizedPhase} from './math.js';
import {petalVertex,petalFragment,paperVertex,paperFragment} from './shaders.js';

const $=id=>document.getElementById(id);
const storageKey='ghost-personhood-lotus-v1';
let settings={...DEFAULTS};
try{
  const hash=new URLSearchParams(location.hash.slice(1)).get('study');
  settings=sanitize(hash?JSON.parse(atob(hash)):JSON.parse(localStorage.getItem(storageKey)||'{}'));
}catch{}
let phase=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=performance.now(),error=null;
const canvas=$('scene'),stage=$('stage');
let renderer,flower,scene,camera,uniforms;

function makePetals(){
  // One draw call contains ten self-similar flowers, each with 30 curved petals.
  const template=new THREE.PlaneGeometry(1,1,40,16);
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.index=template.index;
  geometry.attributes.position=template.attributes.position;
  geometry.attributes.uv=template.attributes.uv;
  const attrs={aIndex:[],aAngle:[],aRing:[],aLength:[],aWidth:[]};
  for(let index=-5;index<=4;index++){
    for(let ring=0;ring<3;ring++){
      const count=[12,10,8][ring];
      for(let p=0;p<count;p++){
        attrs.aIndex.push(index);attrs.aRing.push(ring);
        attrs.aAngle.push(p/count*Math.PI*2+[.18,.40,.12][ring]);
        attrs.aLength.push([1.48,1.16,.83][ring]);
        attrs.aWidth.push([.48,.41,.34][ring]);
      }
    }
  }
  for(const [key,data] of Object.entries(attrs))geometry.setAttribute(key,new THREE.InstancedBufferAttribute(new Float32Array(data),1));
  geometry.instanceCount=attrs.aIndex.length;
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:petalVertex,fragmentShader:petalFragment,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;return mesh;
}

function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  renderer.setClearColor('#f4edd5');
  scene=new THREE.Scene();
  const halfHeight=1.75;
  camera=new THREE.OrthographicCamera(-halfHeight*4/3,halfHeight*4/3,halfHeight,-halfHeight,.1,100);
  camera.position.z=15;
  uniforms={uPhase:{value:0},uZoom:{value:settings.zoom},uBloom:{value:settings.bloom},uCurl:{value:settings.curl},uGrain:{value:settings.grain},uContrast:{value:settings.contrast},uPaper:{value:new THREE.Vector3(244/255,237/255,213/255)}};
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShaderMaterial({uniforms,vertexShader:paperVertex,fragmentShader:paperFragment,depthWrite:false}));
  paper.position.z=-5;paper.renderOrder=-1;scene.add(paper);
  flower=makePetals();scene.add(flower);
  renderer.debug.onShaderError=(gl,program,vs,fs)=>{
    fail('The drawing shader could not start. Please reload the page.');
    console.error(gl.getProgramInfoLog(program),gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));
  };
  new ResizeObserver(resize).observe(stage);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('The graphics context was interrupted. Reload to resume the study.');});
  resize();apply();render();$('loading').hidden=true;$('loading').style.display='none';
  $('status').textContent='Live · seamless loop';
}
function fail(message){error=message;playing=false;$('error').textContent=message;$('error').hidden=false;$('loading').style.display='none';$('status').textContent='Preview paused';}
function resize(){
  if(!renderer)return;renderer.setSize(stage.clientWidth,stage.clientHeight,false);render();
}
function apply(){
  if(!uniforms)return;
  for(const [key,value]of Object.entries(settings))if(uniforms['u'+key[0].toUpperCase()+key.slice(1)])uniforms['u'+key[0].toUpperCase()+key.slice(1)].value=value;
  flower.visible=settings.lotus;
  $('figure').style.display=settings.figure?'block':'none';
  $('figure-transform').setAttribute('transform',`translate(500 375) scale(${settings.figureSize}) translate(-500 -415)`);
  $('human-outline').setAttribute('stroke-width',settings.line);
  syncControls();render();
}
function syncControls(){
  for(const key of Object.keys(DEFAULTS)){
    if(typeof settings[key]!=='number')continue;
    $(key).value=settings[key];
    const out=document.querySelector(`output[data-for="${key}"]`);
    const format={duration:v=>v.toFixed(1)+' s',zoom:v=>v.toFixed(2)+'×',bloom:v=>v===0?'Balanced':v<0?'Later':'Earlier',curl:v=>Math.round(v*100)+'%',figureSize:v=>Math.round(v*100)+'%',line:v=>v.toFixed(2),grain:v=>Math.round(v*100)+'%',contrast:v=>Math.round(v*100)+'%'};
    out.textContent=format[key](settings[key]);
  }
  $('show-figure').checked=settings.figure;$('show-lotus').checked=settings.lotus;
}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}}
function updateTransport(){
  $('timeline').value=Math.round(phase*1000);
  $('time').textContent=`${(phase*settings.duration).toFixed(2)} / ${settings.duration.toFixed(1)}s`;
  $('play-icon').textContent=playing?'Ⅱ':'▷';
  $('play').setAttribute('aria-label',playing?'Pause animation':'Play animation');
}
function render(){if(!renderer||error)return;uniforms.uPhase.value=phase;renderer.render(scene,camera);updateTransport();}
function tick(now){
  const dt=Math.min((now-last)/1000,.1);last=now;
  if(playing&&!document.hidden){phase=normalizedPhase(phase+dt/settings.duration);render();}
  requestAnimationFrame(tick);
}
function togglePlay(){playing=!playing;last=performance.now();updateTransport();}
for(const key of Object.keys(DEFAULTS))if(typeof DEFAULTS[key]==='number')$(key).addEventListener('input',e=>{settings[key]=Number(e.target.value);apply();persist();});
for(const key of ['figure','lotus'])$('show-'+key).addEventListener('change',e=>{settings[key]=e.target.checked;apply();persist();});
$('play').addEventListener('click',togglePlay);
$('restart').addEventListener('click',()=>{phase=0;render();});
$('timeline').addEventListener('input',e=>{playing=false;phase=Number(e.target.value)/1000;render();});
$('reset').addEventListener('click',()=>{settings={...DEFAULTS};phase=0;apply();persist();});
function focus(){document.body.classList.toggle('focus-mode');$('focus').innerHTML=document.body.classList.contains('focus-mode')?'Show controls <span>↙</span>':'Hide controls <span>↗</span>';requestAnimationFrame(resize);}
$('focus').addEventListener('click',focus);
addEventListener('keydown',e=>{
  if(e.target.matches('input,button,textarea'))return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  if(e.key.toLowerCase()==='h')focus();
});
$('copy').addEventListener('click',async()=>{
  const url=new URL(location.href);url.hash=new URLSearchParams({study:btoa(JSON.stringify(settings))}).toString();
  try{await navigator.clipboard.writeText(url.href);$('copy').textContent='Link copied ✓';setTimeout(()=>$('copy').innerHTML='Copy study link <span>↗</span>',1600);}
  catch{prompt('Copy this study link:',url.href);}
});
$('save').addEventListener('click',async()=>{
  const button=$('save');button.disabled=true;
  try{
    render();const out=document.createElement('canvas');out.width=1200;out.height=900;const ctx=out.getContext('2d');ctx.drawImage(canvas,0,0,1200,900);
    if(settings.figure){
      const svg=$('figure').cloneNode(true);svg.setAttribute('width','1200');svg.setAttribute('height','900');svg.style.opacity='.88';svg.style.display='block';
      const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
      try{const img=new Image();img.src=url;await img.decode();ctx.drawImage(img,0,0,1200,900);}finally{URL.revokeObjectURL(url);}
    }
    out.toBlob(blob=>{const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download='personhood-lotus.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
  }finally{button.disabled=false;}
});
try{init();requestAnimationFrame(tick);}catch(e){console.error(e);fail('This study needs WebGL 2. Please open the link in a recent Chrome or Safari browser.');}
// Small read-only diagnostics and controlled timeline access support repeatable visual checks.
window.lotusStudy={
  getState:()=>({settings:{...settings},phase,playing,error,aspect:stage.clientWidth/stage.clientHeight,drawCalls:renderer?.info.render.calls}),
  seek:p=>{playing=false;phase=Math.max(0,Math.min(1,p));render();},
  sample:()=>{const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,w,h};}
};
const events=new EventSource('/__events');events.onmessage=e=>{if(e.data==='reload')location.reload();};
