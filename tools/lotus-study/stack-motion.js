// Media time drives both the live SVG and the exported canvas overlay.
export function stackOpacity(time,{fadeStart=2,fadeEnd=10,fadePower=3}={}){
  const progress=Math.max(0,Math.min(1,(time-fadeStart)/Math.max(.5,fadeEnd-fadeStart)));
  return progress**fadePower;
}
export function normalizeFade(settings,changed){
  settings.fadeStart=Math.max(0,Math.min(9.5,settings.fadeStart));
  settings.fadeEnd=Math.max(.5,Math.min(10,settings.fadeEnd));
  settings.fadePower=Math.max(1,Math.min(5,settings.fadePower));
  if(settings.fadeEnd-settings.fadeStart<.5){
    if(changed==='fadeStart')settings.fadeEnd=settings.fadeStart+.5;
    else settings.fadeStart=settings.fadeEnd-.5;
  }
}
