export const petalVertex = /* glsl */`
  uniform float uPhase, uZoom, uBloom, uCurl;
  attribute float aIndex, aAngle, aRing, aLength, aWidth;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vOpening, vFade, vRing;
  const float PI = 3.141592653589793;
  vec3 petal(float u, float v, float opening) {
    float stem = mix(.38,.15,aRing*.5);
    float spread = mix(.27,1.,opening);
    float radius = stem + aLength * u * spread;
    float width = aWidth * pow(max(sin(PI*u),.00001),.78) * (1.-.21*u) * mix(.48,1.,opening);
    float side = v*width;
    float cup = uCurl*(.23*sin(PI*u) + .17*v*v*sin(PI*u));
    float height = (1.-opening)*aLength*.65*u + cup - .09*opening*u*u*u;
    float wave = .012*sin(u*PI*2.+aAngle*3.)*sin(PI*u)*v;
    return vec3(radius,side,height+wave);
  }
  void main() {
    vUv=uv;
    float age=aIndex+uPhase;
    float opening=smoothstep(-1.7,.65,age+.65-aRing*.34+uBloom);
    vOpening=opening;vRing=aRing;
    float s=pow(uZoom,age);
    vFade=smoothstep(.002,.008,s);
    float u=uv.x, v=uv.y*2.-1.;
    vec3 p=petal(u,v,opening);
    vec3 tangent=petal(min(u+.001,1.),v,opening)-petal(max(u-.001,0.),v,opening);
    vec3 across=petal(u,min(v+.001,1.),opening)-petal(u,max(v-.001,-1.),opening);
    vec3 normal=normalize(cross(tangent,across));
    mat2 turn=mat2(cos(aAngle),sin(aAngle),-sin(aAngle),cos(aAngle));
    p.xy=turn*p.xy*s;
    normal.xy=turn*normal.xy;
    // Orthographic travel keeps the foreground and paper independent of the zoom.
    p.z=p.z*.17+aRing*.055-aIndex*.28;
    vNormal=normal;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }
`;

export const petalFragment = /* glsl */`
  uniform float uGrain,uContrast,uPhase;
  uniform vec3 uPaper;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying float vOpening,vFade,vRing;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  void main(){
    float side=abs(vUv.y*2.-1.);
    float coverage=(1.-smoothstep(.945,1.,side))*vFade;
    if(hash(gl_FragCoord.xy) > coverage) discard;
    vec3 n=normalize(vNormal);
    float shade=1.-max(0.,dot(n,normalize(vec3(-.45,.35,1.))));
    float edge=pow(side,10.)*.13;
    float crease=exp(-pow((vUv.y-.5)*26.,2.))*.025;
    float root=(1.-smoothstep(.02,.32,vUv.x))*.035;
    float grainA=hash(gl_FragCoord.xy);
    float grainB=hash(gl_FragCoord.xy+71.37);
    float grain=mix(grainA,grainB,.5+.5*sin(uPhase*6.2831853));
    float vein=sin(vUv.y*190.+sin(vUv.x*10.)*.7)*.0035;
    float ink=(.035+shade*.26+edge+crease+root+vein)*(.5+uContrast*1.6);
    ink+=(grain-.5)*uGrain*.14;
    ink=clamp(ink,.005,.52);
    vec3 color=mix(uPaper,vec3(.31,.34,.30),ink);
    gl_FragColor=vec4(color,1.);
  }
`;

export const paperVertex = /* glsl */`
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
export const paperFragment = /* glsl */`
  uniform vec3 uPaper;
  uniform float uGrain,uPhase;
  varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  void main(){
    float tooth=hash(gl_FragCoord.xy)-.5;
    float fine=hash(gl_FragCoord.xy+100.1)-.5;
    float live=mix(tooth,fine,.12+.08*sin(uPhase*6.2831853));
    float vignette=length((vUv-.5)*vec2(1.,.75));
    gl_FragColor=vec4(uPaper+live*uGrain*.038-vignette*.007,1.);
  }
`;
