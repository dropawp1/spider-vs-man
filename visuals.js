/* Shared surface finish and the existing Open Cells ending's evacuation shot. */
(function(global){
  'use strict';
  global.GameVisuals={create(T,scene){
    // Camera-centred sky: analytic moon, halo, sparse stars and horizon haze.
    // One unlit draw, no render targets or per-frame city reflections.
    const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{},vertexShader:`varying vec3 skyDirection;
      void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 skyDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec3 d=normalize(skyDirection);float h=max(d.y,0.0);
        vec3 color=mix(vec3(.065,.095,.15),vec3(.009,.018,.045),smoothstep(0.0,.75,h));
        vec3 moon=normalize(vec3(-80.,140.,60.));float angle=length(d-moon);
        float disc=1.0-smoothstep(.011,.013,angle);
        float craters=.88+.12*sin(d.x*2200.)*sin(d.z*1800.);
        color+=vec3(.65,.77,1.)*(disc*craters*2.0+.025*exp(-angle*19.));
        vec2 uv=vec2(atan(d.z,d.x),asin(d.y))*180.;vec2 cell=floor(uv);
        float star=step(.996,hash(cell))*(1.0-smoothstep(.04,.22,length(fract(uv)-.5)));
        color+=vec3(.5,.65,.85)*star*smoothstep(.08,.4,h);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    const skyDome=new T.Mesh(new T.SphereGeometry(480,32,16),skyMaterial);skyDome.name='moonlit-sky';skyDome.frustumCulled=false;scene.add(skyDome);
    function updateSky(camera){skyDome.position.copy(camera.position);skyDome.updateMatrix();}
    // Deterministic, mipmapped surface data: one shared 256px texture rather
    // than per-pixel 3D hash noise on every wall/window/interior in the city.
    const size=256,data=new Uint8Array(size*size*4);let seed=173;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const n=random(),grit=random(),i=(y*size+x)*4;
      data[i]=Math.round(105+n*42);data[i+1]=Math.round(105+grit*45);data[i+2]=Math.round(125+grit*65);data[i+3]=255;
    }
    const surface=new T.DataTexture(data,size,size,T.RGBAFormat);
    surface.wrapS=surface.wrapT=T.RepeatWrapping;surface.magFilter=T.LinearFilter;
    surface.minFilter=T.LinearMipmapLinearFilter;surface.generateMipmaps=true;surface.needsUpdate=true;
    function environment(renderer){
      // Analytic night-sky radiance, prefiltered once. Gives metal/glass a
      // coherent reflection without realtime cube cameras or network assets.
      if(!T.PMREMGenerator)return;
      const w=128,h=64,pixels=new Uint8Array(w*h*4);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const horizon=Math.exp(-Math.pow((y/h-.5)*9,2)),i=(y*w+x)*4;
        pixels[i]=12+horizon*30;pixels[i+1]=19+horizon*27;pixels[i+2]=31+horizon*24;pixels[i+3]=255;
      }
      const sky=new T.DataTexture(pixels,w,h,T.RGBAFormat);sky.mapping=T.EquirectangularReflectionMapping;sky.needsUpdate=true;
      const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(sky);
      scene.environment=target.texture;scene.environmentIntensity=.45;sky.dispose();pmrem.dispose();
    }
    const release=global.PrisonerRelease.create({THREE:T,scene});
    const exitSet=new T.Group();scene.add(exitSet);exitSet.visible=false;
    const wall=new T.MeshStandardMaterial({color:0x667578,roughness:.86});
    const metal=new T.MeshStandardMaterial({color:0x344147,metalness:.65,roughness:.38});
    const dark=new T.MeshBasicMaterial({color:0x030609});
    function box(x,y,z,w,h,d,mat){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=true;exitSet.add(mesh);}
    // Three-sided roof access shelter, with a genuine open front and a dark recess.
    box(-1.55,1.5,0,.3,3,3,wall);box(1.55,1.5,0,.3,3,3,wall);
    box(0,1.5,1.4,3.2,3,.2,dark);box(0,3.1,0,3.5,.2,3.2,metal);
    box(-1.25,1.5,-1.55,.15,3,.15,metal);box(1.25,1.5,-1.55,.15,3,.15,metal);
    const lamp=new T.PointLight(0xffdcb0,0,18,2);scene.add(lamp);
    let anchor=null;
    function prepare(g,R){
      if(anchor||!g.story||!g.story.rescue)return;
      const b=R.buildings[g.story.rescue.building];
      anchor={x:b.x+2.2,y:b.h,z:b.z+4};exitSet.position.set(anchor.x,anchor.y,anchor.z);exitSet.visible=true;
      lamp.position.set(anchor.x,anchor.y+3.5,anchor.z-3);lamp.intensity=35;
    }
    function start(g,R){prepare(g,R);if(!anchor)return;
      release.reset();release.start({exit:{x:anchor.x,y:anchor.y,z:anchor.z-.5},waypoints:[{x:anchor.x,y:anchor.y,z:anchor.z-3},{x:anchor.x+8,y:anchor.y,z:anchor.z-3}],count:10+(g.story.convoyRescued||0),seed:7});
    }
    function shot(camera,t){if(!anchor)return;camera.position.set(anchor.x+8,anchor.y+4,anchor.z-9);camera.lookAt(anchor.x+2,anchor.y+1,anchor.z-2);release.update(t);}
    function reset(){release.reset();anchor=null;exitSet.visible=false;lamp.intensity=0;}
    // Closed opaque surfaces cast shadows; glass planes and glow overlays do not.
    // Low-contrast value noise avoids the former periodic facade bands. Derivative
    // filtering fades subpixel grain instead of letting it shimmer in motion.
    function finish(){const seen=new Set();scene.traverse(o=>{if(!o.isMesh)return;
      const list=Array.isArray(o.material)?o.material:[o.material];
      o.receiveShadow=list.some(m=>m&&m.isMeshStandardMaterial&&!m.transparent);
      o.castShadow=o.receiveShadow&&o.geometry.type!=='PlaneGeometry'&&list.every(m=>m&&!m.transparent&&!(m.emissiveIntensity>0&&m.emissive&&m.emissive.getHex()!==0));
      for(const m of list){
        if(!m||!m.isMeshStandardMaterial||seen.has(m)||m.userData.surfaceFinish)continue;seen.add(m);
        if(m.transparent||m.roughness<.55||(m.emissive&&m.emissive.getHex()!==0&&m.emissiveIntensity>0))continue;
        m.userData.surfaceFinish=true;
        const previousCompile=m.onBeforeCompile,previousKey=m.customProgramCacheKey();
        m.onBeforeCompile=function(shader,renderer){
          previousCompile.call(this,shader,renderer);
          shader.uniforms.surfaceData={value:surface};
          shader.uniforms.surfaceStyle={value:m.userData.surfaceStyle||0};
          shader.uniforms.surfaceWet={value:m.userData.surfaceWet||0};
          shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurface;\nvarying vec3 vSurfaceNormal;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 surfacePosition=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nsurfacePosition=instanceMatrix*surfacePosition;\n#endif\nvSurface=(modelMatrix*surfacePosition).xyz;\nvSurfaceNormal=inverseTransformDirection(transformedNormal,viewMatrix);');
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
            varying vec3 vSurface;
            varying vec3 vSurfaceNormal;
            uniform sampler2D surfaceData;
            uniform float surfaceStyle;
            uniform float surfaceWet;`)
            .replace('#include <color_fragment>',`#include <color_fragment>
              vec3 axis=abs(vSurfaceNormal);
              vec2 surfaceUV=axis.y>max(axis.x,axis.z)?vSurface.xz:(axis.x>axis.z?vSurface.zy:vSurface.xy);
              vec3 grain=texture2D(surfaceData,surfaceUV*.45).rgb;
              float stain=texture2D(surfaceData,surfaceUV*.018).r-.5;
              float surfaceHeight=grain.g*.045;
              float seam=0.0;
              if(surfaceStyle>0.5){
                vec2 tileSize=surfaceStyle<1.5?vec2(3.6,1.8):(surfaceStyle<2.5?vec2(.6,.3):vec2(.8));
                vec2 tiled=surfaceUV/tileSize;
                vec2 edge=min(fract(tiled),1.0-fract(tiled));
                vec2 aa=max(fwidth(tiled),vec2(.001));
                seam=1.0-min(smoothstep(vec2(.005),vec2(.005)+aa,edge).x,smoothstep(vec2(.005),vec2(.005)+aa,edge).y);
                surfaceHeight-=seam*.012;
              }
              float wetPatch=surfaceWet*smoothstep(.44,.56,texture2D(surfaceData,surfaceUV*.035).g)*smoothstep(.6,.95,axis.y);
              diffuseColor.rgb*=(.95+(grain.r-.5)*.30+stain*.22)*(1.0-seam*.2)*(1.0-wetPatch*.32);`)
            .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(mix(roughnessFactor+(grain.b-.5)*.22,.13,wetPatch),.1,1.0);')
            .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
              vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
              vec3 rx=cross(dy,normal),ry=cross(normal,dx);
              float determinant=dot(dx,rx);
              vec3 gradient=sign(determinant)*(dFdx(surfaceHeight)*rx+dFdy(surfaceHeight)*ry);
              normal=normalize(max(abs(determinant),.0000001)*normal-gradient*.16);`);
        };m.customProgramCacheKey=()=>previousKey+'|surface-pbr-v5';m.needsUpdate=true;
      }
    });}
    return {prepare,start,shot,reset,finish,environment,updateSky};
  }};
})(window);
