/* Volumetric silk, reusing instanced segments instead of rebuilding geometry each frame.
   Realism: the strand visibly shoots out (~90 ms), tapers towards the anchor, sags when slack,
   and leaves a glue "splat" of radiating fibres on the surface it stuck to. */
(function(root){
  'use strict';
  const SEGMENTS=32, SPLAT=14, TRAVEL_MS=90;
  function points(start,end,length,time=0){
    const distance=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z);
    const slack=Math.max(0,length-distance),sag=Math.min(4,Math.sqrt(slack*Math.max(distance,1))*.3);
    return Array.from({length:SEGMENTS+1},(_,i)=>{
      const u=i/SEGMENTS,bow=Math.sin(Math.PI*u);
      return {x:start.x+(end.x-start.x)*u+Math.sin(time*3+u*8)*bow*sag*.025,
        y:start.y+(end.y-start.y)*u-sag*bow,z:start.z+(end.z-start.z)*u};
    });
  }
  // Fraction of the strand already flown towards the anchor, ms since the shot.
  function travel(ms){return Math.max(0,Math.min(1,ms/TRAVEL_MS));}
  class Renderer{
    constructor(scene,T,rules){
      this.T=T;this.rules=rules;this.last=null;this.brokenAt=-Infinity;this.shot=null;this.shotAt=0;
      const geometry=new T.CylinderGeometry(1,1,1,8,1,true);
      // Silk is a dielectric bundle, not an emissive metal cable.
      const material=new T.MeshPhysicalMaterial({color:0xdce8df,roughness:.26,metalness:0,ior:1.54,clearcoat:.25,clearcoatRoughness:.32,sheen:.65,sheenColor:0xc5d7d0,sheenRoughness:.45});
      this.thread=new T.InstancedMesh(geometry,material,SEGMENTS);
      this.broken=new T.InstancedMesh(geometry,material.clone(),SEGMENTS);this.broken.material.transparent=true;
      this.splat=new T.InstancedMesh(geometry,new T.MeshPhysicalMaterial({color:0xcddbd2,roughness:.36,metalness:0,sheen:.5,transparent:true,opacity:.8,depthWrite:false}),SPLAT);
      this.fibers=new T.InstancedMesh(geometry,material.clone(),SEGMENTS*4);this.fibers.name='silk-microfilaments';this.fibers.frustumCulled=false;this.fibers.visible=false;
      const lineGeometry=new T.BufferGeometry();lineGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array((SEGMENTS+1)*3),3));
      this.glint=new T.Line(lineGeometry,new T.LineBasicMaterial({color:0xb4d0c6,transparent:true,opacity:.22,depthWrite:false}));this.glint.frustumCulled=false;this.glint.visible=false;
      this.thread.frustumCulled=this.broken.frustumCulled=this.splat.frustumCulled=false;
      this.thread.visible=this.broken.visible=this.splat.visible=false;
      scene.add(this.thread,this.broken,this.splat,this.fibers,this.glint);
      this.dummy=new T.Object3D();this.up=new T.Vector3(0,1,0);this.direction=new T.Vector3();
      this.anchor=new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshPhysicalMaterial({color:0xd7e9dc,roughness:.25,clearcoat:.6,transparent:true,opacity:.8,depthWrite:false}));this.anchor.scale.set(.035,.012,.035);
      scene.add(this.anchor);this.anchor.visible=false;
    }
    filaments(path,time){
      const T=this.T,axis=new T.Vector3().subVectors(path.at(-1),path[0]).normalize();
      const side=new T.Vector3().crossVectors(axis,Math.abs(axis.y)>.9?new T.Vector3(1,0,0):this.up).normalize(),other=new T.Vector3().crossVectors(axis,side);
      const offset=(p,i,strand)=>{const u=i/SEGMENTS,envelope=Math.sin(Math.PI*u),angle=strand*Math.PI/2+u*28+time*.35,r=.0022*envelope;return new T.Vector3(p.x,p.y,p.z).addScaledVector(side,Math.cos(angle)*r).addScaledVector(other,Math.sin(angle)*r);};
      for(let strand=0;strand<4;strand++)for(let i=0;i<SEGMENTS;i++){
        const a=offset(path[i],i,strand),b=offset(path[i+1],i+1,strand),o=this.dummy;o.position.copy(a).add(b).multiplyScalar(.5);this.direction.subVectors(b,a);o.scale.set(.00065,this.direction.length(),.00065);if(this.direction.lengthSq()>1e-12)o.quaternion.setFromUnitVectors(this.up,this.direction.normalize());o.updateMatrix();this.fibers.setMatrixAt(strand*SEGMENTS+i,o.matrix);
      }
      this.fibers.instanceMatrix.needsUpdate=true;
      const pos=this.glint.geometry.attributes.position;path.forEach((p,i)=>pos.setXYZ(i,p.x,p.y,p.z));pos.needsUpdate=true;
    }
    segments(mesh,path,radius,split=false){
      for(let i=0;i<SEGMENTS;i++){
        const a=path[i],b=path[i+1],o=this.dummy,r=radius*(1-.45*(i+.5)/SEGMENTS);
        o.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
        this.direction.set(b.x-a.x,b.y-a.y,b.z-a.z);
        o.scale.set(r,split&&i===SEGMENTS/2?0:this.direction.length(),r);
        if(this.direction.lengthSq()>1e-12)o.quaternion.setFromUnitVectors(this.up,this.direction.normalize());
        o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
    // Radiating glue fibres lying on the hit surface (normal sx/sy/sz from physics aim()).
    placeSplat(w){
      const T=this.T,n=new T.Vector3(w.sx||0,w.sy||0,w.sz||0);if(n.lengthSq()<.5)n.set(0,1,0);
      const a=Math.abs(n.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0);
      const u=new T.Vector3().crossVectors(n,a).normalize(),v=new T.Vector3().crossVectors(n,u);
      for(let i=0;i<SPLAT;i++){
        const ang=i/SPLAT*Math.PI*2+(w.shot||0),len=.12+((i*37+(w.shot||0)*11)%10)/40;
        const dir=u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v,Math.sin(ang));
        const o=this.dummy;
        o.position.set(w.x+n.x*.02+dir.x*len/2,w.y+n.y*.02+dir.y*len/2,w.z+n.z*.02+dir.z*len/2);
        o.scale.set(.0018,len,.0018);o.quaternion.setFromUnitVectors(this.up,dir);o.updateMatrix();
        this.splat.setMatrixAt(i,o.matrix);
      }
      this.splat.instanceMatrix.needsUpdate=true;
    }
    update(game,start,now){
      const w=game.web;
      this.thread.visible=!!w;
      this.fibers.visible=this.glint.visible=!!w;
      if(w){
        if(this.shot!==w.shot){this.shot=w.shot;this.shotAt=now;this.placeSplat(w);}
        const k=travel(now-this.shotAt),stuck=k>=1;
        const end=stuck?w:{x:start.x+(w.x-start.x)*k,y:start.y+(w.y-start.y)*k,z:start.z+(w.z-start.z)*k};
        let path=points(start,end,stuck?w.len:0,now/1000);
        // Decorative slack must not introduce a strand through a building.
        if(path.some((p,i)=>i>0&&this.rules.webBlocked(path[i-1],p)))path=points(start,end,0);
        this.segments(this.thread,path,.003);this.filaments(path,now/1000);
        this.anchor.visible=this.splat.visible=stuck;
        this.anchor.position.set(w.x,w.y,w.z);
        const normal=new this.T.Vector3(w.sx||0,w.sy||0,w.sz||0);if(normal.lengthSq()<.5)normal.set(0,1,0);this.anchor.quaternion.setFromUnitVectors(this.up,normal.normalize());
        this.splat.material.opacity=.9;
        this.last=path;this.brokenAt=-Infinity;
      }else if(this.last){
        this.released=this.last;this.last=null;this.brokenAt=now;this.anchor.visible=false;
      }
      const age=(now-this.brokenAt)/1000;
      this.broken.visible=age>=0&&age<.55;
      // The glue splat lingers on the wall a little longer than the falling strand.
      if(!w){this.splat.visible=age>=0&&age<2.5;if(this.splat.visible)this.splat.material.opacity=.9*(1-age/2.5);}
      if(this.broken.visible){
        const path=this.released.map((p,i)=>{
          const u=i/SEGMENTS,free=i<=SEGMENTS/2?u*2:(1-u)*2;
          const end=i<=SEGMENTS/2?this.released[0]:this.released[SEGMENTS];
          return {x:p.x+(end.x-p.x)*age*.65,y:p.y-6*age*age*free,z:p.z+(end.z-p.z)*age*.65};
        });
        this.segments(this.broken,path,.003,true);this.broken.material.opacity=1-age/.55;
      }
    }
    dispose(){const geometries=new Set(),materials=new Set();for(const mesh of [this.thread,this.broken,this.splat,this.fibers,this.glint,this.anchor]){mesh.removeFromParent();geometries.add(mesh.geometry);materials.add(mesh.material);if(mesh.isInstancedMesh)mesh.dispose();}for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
  }
  const api={points,travel,Renderer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderWeb=api;
})(typeof window!=='undefined'?window:globalThis);
