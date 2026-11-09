// The video is the master clock. Music begins with the first visual frame.
export function createMusic(video,audio,onStatus){
  let context,gain,destination,enabled=false,starting=false,blocked=false;
  let settings={musicVolume:100,musicFade:1.5};
  const cue=()=>0;
  const label=text=>onStatus(text,cue());
  function sync(){
    if(audio.error){label('Music unavailable');return;}
    if(!enabled){label('Press Play with music');return;}
    const elapsed=video.currentTime-cue();
    // Let the excerpt finish at 10 seconds, including buffered samples.
    if(elapsed>=audio.duration&&!video.seeking&&(!video.paused||video.ended)&&audio.currentTime>audio.duration-.25){
      label('Natural ending');return;
    }
    const inside=elapsed>=0&&elapsed<audio.duration;
    const progress=settings.musicFade===0?1:Math.max(0,Math.min(1,elapsed/settings.musicFade));
    const level=inside?Math.sin(progress*Math.PI/2)*settings.musicVolume/100:0;
    gain.gain.setTargetAtTime(level,context.currentTime,.008);
    audio.playbackRate=video.playbackRate;
    const target=Math.max(0,Math.min(audio.duration||10,elapsed));
    // Correct discontinuities and meaningful drift, without seeking on every frame.
    if(audio.readyState>=1&&!audio.seeking&&Math.abs(audio.currentTime-target)>.12)audio.currentTime=target;
    if(video.paused||video.seeking||video.readyState<3||!inside||blocked){
      audio.pause();
      label(blocked?'Press Play with music':video.paused?'Music paused':elapsed<0?'Music enters at '+cue().toFixed(1)+' s':'Natural ending');
    }else{
      if(audio.paused&&!starting){
        starting=true;
        audio.play().catch(error=>{if(error.name!=='AbortError')blocked=true;}).finally(()=>{starting=false;});
      }
      label(settings.musicVolume===0?'Music muted':progress<1?'Music fading in':'Music playing');
    }
  }
  async function enable(){
    if(!context){
      context=new AudioContext();
      gain=context.createGain();gain.gain.value=0;
      context.createMediaElementSource(audio).connect(gain);
      gain.connect(context.destination);
      destination=context.createMediaStreamDestination();gain.connect(destination);
    }
    // Unlock both media playback and Web Audio inside the click gesture.
    const resume=context.resume();
    if(!enabled||blocked){
      gain.gain.value=0;
      await Promise.all([resume,audio.play()]);
      audio.pause();
    }else await resume;
    enabled=true;blocked=false;sync();
  }
  for(const event of ['loadedmetadata','play','pause','seeking','seeked','ratechange','waiting','playing','ended'])video.addEventListener(event,sync);
  for(const event of ['loadedmetadata','error'])audio.addEventListener(event,sync);
  audio.preservesPitch=true;
  return {
    enable,sync,
    set(next){settings={...settings,...next};sync();},
    async finish(){
      if(!audio.paused&&!audio.ended)await new Promise(resolve=>{
        const done=()=>{clearTimeout(timer);audio.removeEventListener('ended',done);resolve();};
        const timer=setTimeout(done,1000);
        audio.addEventListener('ended',done,{once:true});
      });
      // Drain Web Audio's output buffer before stopping MediaRecorder.
      await new Promise(resolve=>setTimeout(resolve,150));
    },
    // Stopping an export must not stop the reusable audio destination.
    exportTrack(){return destination.stream.getAudioTracks()[0].clone();}
  };
}
