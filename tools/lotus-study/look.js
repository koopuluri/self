// Color and film-grain treatment of the original video. No generated imagery.
export function createFilmLook(video,canvas){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,powerPreference:'low-power'});
  if(!gl)return null;
  const vertex=`attribute vec2 position; varying vec2 uv;
  void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
  const fragment=`precision highp float;
  varying vec2 uv;uniform sampler2D footage;uniform vec2 resolution;
  uniform float pop;uniform float grain;uniform float frame;
  float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
  float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
  vec3 sampleFootage(vec2 p){
    if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)return vec3(0.);
    return texture2D(footage,p).rgb;
  }
  void main(){
    // Align the final bud: 5.64 px right at 1080 (previous offset minus 3 px), 2% up.
    vec2 imageUV=uv-vec2(5.64/1080.,.02);
    vec3 source=sampleFootage(imageUV);
    float light=luma(source);
    // Open the midtones, deepen the dark petals, and keep pale veins readable.
    vec3 color=pow(source,vec3(.88));
    float lum=luma(color);
    color=mix(vec3(lum),color,1.+pop*.32);
    color=(color-.38)*(1.+pop*.12)+.38;
    float flower=smoothstep(.018,.17,light);
    float shade=(1.-smoothstep(.10,.55,light))*flower;
    color+=vec3(.025,-.012,.075)*shade*pop;
    // Warm rose highlights and a gentle cel-like separation of midtone values.
    float highlight=smoothstep(.32,.78,light);
    color=mix(color,color*vec3(1.06,.98,.94),highlight*pop);
    float stepped=floor(lum*9.)/9.+.055;
    color*=mix(1.,(stepped+.06)/(lum+.06),pop*.18*flower);
    // A restrained bright-petal glow; the black background stays dark.
    vec2 pixel=1./resolution;
    vec3 glow=vec3(0.);
    for(int i=0;i<4;i++){
      float a=float(i)*1.5707963;
      vec3 neighbor=sampleFootage(imageUV+vec2(cos(a),sin(a))*pixel*3.);
      glow+=max(neighbor-.58,0.);
    }
    color+=glow*pop*.075;
    color=mix(source,clamp(color,0.,1.),pop);
    // Fresh fine and coarse grain per film frame, integrated with exposure.
    vec2 cell=floor(gl_FragCoord.xy/1.35);
    float fine=hash(vec3(cell,frame))-hash(vec3(cell+71.3,frame+19.));
    float coarse=hash(vec3(floor(gl_FragCoord.xy/2.7),frame+39.))-0.5;
    float texture=fine*.82+coarse*.34;
    float exposure=.18+.82*pow(clamp(luma(color),0.,1.),.35);
    color+=texture*grain*.19*exposure;
    // Very small chroma variation adds pigment noise without colored static.
    color+=vec3(fine,-coarse,coarse)*grain*.009*flower;
    gl_FragColor=vec4(clamp(color,0.,1.),1.);
  }`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  const uniforms=Object.fromEntries(['resolution','pop','grain','frame'].map(n=>[n,gl.getUniformLocation(program,n)]));
  let pop=.85,grain=.6,dirty=true,last=-1,active=true,previousTick=0,exportSize=0,afterDraw=null;
  function draw(){
    if(video.readyState<2||!active)return;
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,video);
    gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform1f(uniforms.pop,pop);gl.uniform1f(uniforms.grain,grain);gl.uniform1f(uniforms.frame,Math.floor(video.currentTime*24));
    gl.drawArrays(gl.TRIANGLES,0,6);afterDraw?.(canvas);canvas.parentElement.classList.add('graded');last=video.currentTime;dirty=false;
  }
  function resize(){const size=exportSize||Math.round(canvas.clientWidth*Math.min(devicePixelRatio,1.75));if(size&&canvas.width!==size){canvas.width=canvas.height=size;gl.viewport(0,0,size,size);dirty=true;}draw();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  function tick(now){if(active&&now-previousTick>31&&!document.hidden&&(dirty||video.currentTime!==last)){draw();previousTick=now;}requestAnimationFrame(tick);}
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;canvas.parentElement.classList.remove('graded');});
  video.addEventListener('seeked',draw);video.addEventListener('loadeddata',draw);
  requestAnimationFrame(tick);resize();
  return {set(next){pop=next.pop/100;grain=next.grain/100;dirty=true;draw();},exportSize(size){exportSize=size;resize();},onDraw(callback){afterDraw=callback;},draw};
}
