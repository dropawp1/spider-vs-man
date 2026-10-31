// Inspect the actual instanced city geometry without a GPU or browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const R = require('./physics.js');
const context = {
  window: {},
  document: {
    documentElement: {},
    createElement: () => ({getContext: () => ({fillRect(){}, fillText(){}})})
  },
  getComputedStyle: () => ({getPropertyValue: () => ''}),
  console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/vendor/three-city.js','utf8'),context);
context.THREE = context.CityThree.THREE;
vm.runInContext(fs.readFileSync(__dirname+'/models.js','utf8'),context);
const T = context.THREE, scene = new T.Scene();
context.window.SpiderModels.city(scene,R);
const matrix = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
const boxes = [];
for(const mesh of scene.children){
  if(!mesh.isInstancedMesh || mesh.geometry.type!=='BoxGeometry')continue;
  for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);matrix.decompose(p,q,s);
    boxes.push({x:p.x,z:p.z,y:p.y,w:s.x,d:s.z,h:s.y,top:p.y+s.y/2,bottom:p.y-s.y/2});
  }
}
const near=(a,b)=>Math.abs(a-b)<.0001;
let checked=0;
for(const b of R.buildings.filter(b=>b.type===3)){
  const cx=b.x+b.w/2,cz=b.z+b.d/2;
  const local=boxes.filter(a=>near(a.x,cx)&&near(a.z,cz));
  const wall=local.find(a=>near(a.w,b.w*.65)&&near(a.d,b.d*.65)&&a.bottom>=b.h-.0001);
  const cap=local.find(a=>near(a.w,b.w*.65+.1)&&near(a.d,b.d*.65+.1)&&near(a.h,.3));
  assert.ok(wall&&cap,'penthouse walls and cap are rendered');
  assert.ok(cap.top-wall.top>.29,'roof top must not be coplanar with wall top');
  assert.ok(near(wall.top,cap.bottom),'walls meet underside of cap without a gap');
  const solid=R.solids.find(a=>a.parent===b.id&&near(a.w,b.w*.65));
  assert.ok(near(cap.top,solid.h),'visible top still matches collision height');
  checked++;
}
console.log(`PASS ${checked} penthouse roofs: no overlapping top faces, no gaps, collision heights unchanged`);
