/* Visual-only prisoner procession. Classic script, no story/physics dependencies. */
(function (root) {
  'use strict';
  function create(options) {
    const T = options && options.THREE, scene = options && options.scene;
    if (!T || !scene || typeof scene.add !== 'function') throw new TypeError('PrisonerRelease requires THREE and scene');
    const group = new T.Group(); group.name = 'PrisonerRelease'; scene.add(group);
    const geometries = [new T.BoxGeometry(1, 1, 1), new T.SphereGeometry(1, 10, 7)];
    const colors = [0xb99179, 0x805d4d, 0xd4b09a, 0x8c9690, 0x657a82, 0x9b8874, 0x6e7461, 0x424d58, 0x363b40, 0x232628, 0x302921, 0x56504a];
    const materials = colors.map(color => new T.MeshStandardMaterial({color, roughness: .9}));
    let started = false, disposed = false, elapsed = 0, next = 0, total = 0, random;
    let exit, route = [], length = 0;
    const actors = [], batches = new Map();
    const INTERVAL = .85, SPEED = 1.18, MAX_COUNT = 24;
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
    function rng(seed) {
      let n = seed >>> 0;
      return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, n | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    }
    function part(parent, geometry, material, x, y, z, w, h, d, parts) {
      // Off-scene transform hierarchy; only the instanced batches are rendered.
      const node = new T.Object3D(); node.position.set(x, y, z); node.scale.set(w, h, d); parent.add(node);
      const key = geometry + ':' + material;
      let batch = batches.get(key);
      if (!batch) {
        const mesh = new T.InstancedMesh(geometries[geometry], materials[material], total * 8);
        mesh.name = 'PrisonerRelease/' + key; mesh.count = 0;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        // Moving world matrices invalidate static instance bounds. Small, capped crowds
        // avoid per-frame bounding-sphere work and remain correctly visible on any route.
        mesh.frustumCulled = false; group.add(mesh);
        batch = {mesh, used: 0}; batches.set(key, batch);
      }
      const index = batch.used++; batch.mesh.count = batch.used;
      parts.push({node, batch, index}); return node;
    }
    function spawn(index) {
      const rig = new T.Group(), body = new T.Group(); rig.add(body);
      const parts = [], legs = [], arms = [];
      const skin = Math.floor(random() * 3), cloth = 3 + index % 4, pants = 7 + index % 2;
      const tall = .91 + random() * .17, broad = .88 + random() * .24;
      rig.scale.set(broad, tall, 1); rig.position.set(exit.x, exit.y, exit.z);
      part(body, 1, cloth, 0, 1.14, 0, .29, .36, .18, parts);
      part(body, 0, pants, 0, .87, 0, .4, .2, .27, parts);
      part(body, 1, skin, 0, 1.68, 0, .18, .23, .17, parts);
      part(body, 0, skin, 0, 1.45, 0, .13, .13, .13, parts);
      // Hair, a protruding nose, varied shoulder width and garment hem read at distance.
      if (index % 3 !== 0) part(body, 1, 10 + index % 2, 0, 1.83, .025, .185, .095, .17, parts);
      part(body, 0, skin, 0, 1.68, -.17, .075, .09, .075, parts);
      if (index % 3 === 1) part(body, 0, cloth, 0, .92, .015, .48, .28, .3, parts);
      for (const side of [-1, 1]) {
        const leg = new T.Group(); leg.position.set(side * .115, .86, 0); body.add(leg); legs.push(leg);
        part(leg, 0, pants, 0, -.36, 0, .16, .72, .19, parts);
        part(leg, 0, 9, 0, -.8, -.055, .19, .12, .31, parts);
        const arm = new T.Group(); arm.position.set(side * (.31 + (index % 3) * .015), 1.37, 0); body.add(arm); arms.push(arm);
        part(arm, 0, cloth, 0, -.16, 0, .14, .34, .17, parts);
        part(arm, 1, skin, 0, -.42, 0, .075, .16, .075, parts);
      }
      // With no supplied route, each person still emerges at the exit, then
      // takes a short step aside rather than appearing at their standing place.
      let actorRoute = route, stop = Math.max(0, length - index * .72);
      if (!route.length) {
        const angle = index * 2.399963, radius = index ? .42 * Math.sqrt(index) : 0;
        actorRoute = [{x: exit.x + Math.cos(angle) * radius, y: exit.y,
          z: exit.z + Math.sin(angle) * radius}];
        stop = radius;
      }
      const actor = {rig, body, parts, legs, arms, route: actorRoute, segment: 0, distance: 0,
        stop, phase: random() * Math.PI * 2, moving: false};
      actors.push(actor); return actor;
    }
    function pose(actor, moving, dt) {
      actor.phase += dt * (moving ? 8 : 1.6);
      const swing = moving ? Math.sin(actor.phase) * .38 : 0;
      actor.legs[0].rotation.x = swing; actor.legs[1].rotation.x = -swing;
      actor.arms[0].rotation.x = -swing * .7; actor.arms[1].rotation.x = swing * .7;
      actor.body.position.y = moving ? Math.abs(Math.sin(actor.phase)) * .025 : Math.sin(actor.phase) * .006;
      actor.body.rotation.x = moving ? -.045 : 0;
      actor.rig.updateMatrixWorld(true);
      for (const p of actor.parts) p.batch.mesh.setMatrixAt(p.index, p.node.matrixWorld);
    }
    function advance(actor, dt) {
      let budget = Math.min(SPEED * dt, actor.stop - actor.distance);
      actor.moving = budget > 1e-8 && actor.segment < actor.route.length;
      while (budget > 1e-8 && actor.segment < actor.route.length) {
        const target = actor.route[actor.segment], pos = actor.rig.position;
        const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance < 1e-8) { actor.segment++; continue; }
        const step = Math.min(budget, distance), k = step / distance;
        pos.x += dx * k; pos.y += dy * k; pos.z += dz * k;
        if (Math.hypot(dx, dz) > 1e-8) actor.rig.rotation.y = Math.atan2(-dx, -dz);
        budget -= step; actor.distance += step;
        if (step >= distance) actor.segment++;
      }
      pose(actor, actor.moving, dt);
    }
    function start(config) {
      if (disposed || started) return;
      config = config || {};
      if (!point(config.exit)) throw new TypeError('PrisonerRelease.start: exit must contain finite x, y, z');
      if (config.waypoints !== undefined && !Array.isArray(config.waypoints)) throw new TypeError('PrisonerRelease.start: waypoints must be an array');
      if ((config.waypoints || []).length > 128 || !(config.waypoints || []).every(point)) throw new TypeError('PrisonerRelease.start: use at most 128 finite world-space waypoints');
      if (config.count !== undefined && (!Number.isFinite(config.count) || config.count < 0)) throw new TypeError('PrisonerRelease.start: count must be finite and non-negative');
      exit = {x: config.exit.x, y: config.exit.y, z: config.exit.z};
      route = (config.waypoints || []).map(p => ({x: p.x, y: p.y, z: p.z}));
      let previous = exit; length = 0;
      for (const p of route) { length += Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z); previous = p; }
      total = Math.min(MAX_COUNT, Math.floor(config.count === undefined ? 10 : config.count));
      random = rng(Number.isFinite(config.seed) ? config.seed : 7);
      started = true;
      if (total) { pose(spawn(next++), false, 0); }
    }
    function update(deltaSeconds) {
      if (!started || disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      const before = elapsed; elapsed += deltaSeconds;
      for (const actor of actors) advance(actor, deltaSeconds);
      while (next < total && next * INTERVAL <= elapsed) {
        const born = next * INTERVAL, actor = spawn(next++);
        advance(actor, elapsed - Math.max(before, born));
      }
      for (const batch of batches.values()) batch.mesh.instanceMatrix.needsUpdate = true;
    }
    function reset() {
      if (disposed) return;
      for (const batch of batches.values()) { group.remove(batch.mesh); batch.mesh.dispose(); }
      batches.clear(); actors.length = 0; started = false; elapsed = 0; next = 0; total = 0; route = []; length = 0;
    }
    function dispose() {
      if (disposed) return;
      reset(); scene.remove(group);
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); disposed = true;
    }
    return {start, update, reset, dispose};
  }
  root.PrisonerRelease = {create};
})(typeof window !== 'undefined' ? window : globalThis);
