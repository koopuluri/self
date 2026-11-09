export const DEFAULTS = Object.freeze({duration:5, zoom:3.8, bloom:0, curl:.65, figureSize:1, line:1.55, grain:.6, contrast:.65, figure:true, lotus:true});
export function smoothstep(a,b,x) {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
export function bloomAt(index,phase,ring,bias=0){return smoothstep(-1.7,.65,index+phase+(.65-ring*.34)+bias);}
export function scaleAt(index,phase,zoom){return Math.pow(zoom,index+phase);}
export function normalizedPhase(p){return ((p%1)+1)%1;}
export function sanitize(input={}){
  const out={...DEFAULTS};
  const bounds={duration:[3,16],zoom:[2.8,5],bloom:[-1,1],curl:[0,1.4],figureSize:[.65,1.25],line:[.5,3],grain:[0,1.5],contrast:[0,1]};
  for(const [key,[lo,hi]] of Object.entries(bounds))if(Number.isFinite(Number(input[key])))out[key]=Math.max(lo,Math.min(hi,Number(input[key])));
  for(const key of ['figure','lotus'])if(typeof input[key]==='boolean')out[key]=input[key];
  return out;
}
