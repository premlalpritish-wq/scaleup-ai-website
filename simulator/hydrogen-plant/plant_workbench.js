/**
 * plant_workbench.js - Full 5-Battery 3D WebGL Digital Twin
 * Ellesmere Port 120,000 Nm³/h Hydrogen Production Facility
 *
 * Built with Three.js (Industrial Scientific CAD Architecture)
 * Supports raycasting, animated flow particles, battery camera presets,
 * and deep-dive inspection of R-102 and plant equipment.
 */

(function () {
  'use strict';

  let scene, camera, renderer, controls;
  let container;
  let raycaster, mouse;
  let clickableObjects = [];
  let flowParticleSystems = [];
  let currentHovered = null;

  // Camera presets for batteries
  const CAMERA_PRESETS = {
    overview: { pos: [65, 55, 75], target: [0, 8, 0] },
    batteryA: { pos: [-38, 18, 30], target: [-35, 6, 0] },
    batteryB: { pos: [-15, 30, 40], target: [-10, 14, 0] },
    batteryC: { pos: [12, 22, 35], target: [12, 8, 0] },
    batteryD: { pos: [32, 20, 25], target: [30, 8, 0] },
    batteryE: { pos: [52, 20, 30], target: [50, 7, 0] }
  };

  // Materials Library
  let materials = {};

  function initMaterials() {
    materials = {
      ground: new THREE.MeshStandardMaterial({ color: 0x0f141c, roughness: 0.9, metalness: 0.1 }),
      pad: new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.7, metalness: 0.2 }),
      steelStructure: new THREE.MeshStandardMaterial({ color: 0x3d4a5d, roughness: 0.5, metalness: 0.8 }),
      vesselSteel: new THREE.MeshStandardMaterial({ color: 0x8a99ad, roughness: 0.35, metalness: 0.75 }),
      vesselHighlight: new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.2, metalness: 0.9, emissive: 0x003344 }),
      insulation: new THREE.MeshStandardMaterial({ color: 0xd8d0c5, roughness: 0.8, metalness: 0.1 }),
      furnaceRefractory: new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.6, metalness: 0.4 }),
      furnaceGlow: new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.8, roughness: 0.3 }),
      pipeNG: new THREE.MeshStandardMaterial({ color: 0xe6a117, roughness: 0.4, metalness: 0.6 }), // Gold
      pipeSteam: new THREE.MeshStandardMaterial({ color: 0x00bcd4, roughness: 0.3, metalness: 0.7 }), // Cyan
      pipeSyngas: new THREE.MeshStandardMaterial({ color: 0x26a69a, roughness: 0.4, metalness: 0.6 }), // Teal
      pipeFlue: new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.5, metalness: 0.5 }), // Grey
      pipeH2: new THREE.MeshStandardMaterial({ color: 0x7c4dff, roughness: 0.3, metalness: 0.8 }), // Violet
      pipeHP: new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.2, metalness: 0.9 }), // Electric Cyan
      pipeWater: new THREE.MeshStandardMaterial({ color: 0x1e88e5, roughness: 0.3, metalness: 0.7 }), // Blue
      valveBody: new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.4, metalness: 0.8 }),
      valveHandwheel: new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5, metalness: 0.4 })
    };
  }

  // Helper to register clickable object
  function registerClickable(mesh, meta) {
    mesh.userData = meta;
    clickableObjects.push(mesh);
    // Also traverse children if group
    if (mesh.children && mesh.children.length > 0) {
      mesh.children.forEach(c => {
        c.userData = meta;
        clickableObjects.push(c);
      });
    }
  }

  // --- Geometry Helpers ---
  function createDishedVessel(radius, height, mat, meta) {
    const group = new THREE.Group();
    // Cylinder body
    const cylGeo = new THREE.CylinderGeometry(radius, radius, height, 32);
    const cyl = new THREE.Mesh(cylGeo, mat);
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    group.add(cyl);

    // Top 2:1 Ellipsoidal Head
    const headGeo = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    headGeo.scale(1, 0.5, 1);
    const topHead = new THREE.Mesh(headGeo, mat);
    topHead.position.y = height / 2;
    topHead.castShadow = true;
    group.add(topHead);

    // Bottom 2:1 Ellipsoidal Head
    const botHead = new THREE.Mesh(headGeo, mat);
    botHead.rotation.x = Math.PI;
    botHead.position.y = -height / 2;
    botHead.castShadow = true;
    group.add(botHead);

    registerClickable(group, meta);
    return group;
  }

  function createHorizontalExchanger(radius, length, mat, meta) {
    const group = new THREE.Group();
    const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 32);
    const cyl = new THREE.Mesh(cylGeo, mat);
    cyl.rotation.z = Math.PI / 2;
    cyl.castShadow = true;
    group.add(cyl);

    // End caps
    const headGeo = new THREE.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    headGeo.scale(1, 0.5, 1);
    const leftHead = new THREE.Mesh(headGeo, mat);
    leftHead.rotation.z = Math.PI / 2;
    leftHead.position.x = -length / 2;
    group.add(leftHead);

    const rightHead = new THREE.Mesh(headGeo, mat);
    rightHead.rotation.z = -Math.PI / 2;
    rightHead.position.x = length / 2;
    group.add(rightHead);

    // Saddle supports
    const saddleGeo = new THREE.BoxGeometry(0.3, radius * 1.2, radius * 2.2);
    const s1 = new THREE.Mesh(saddleGeo, materials.steelStructure);
    s1.position.set(-length * 0.3, -radius * 0.8, 0);
    const s2 = new THREE.Mesh(saddleGeo, materials.steelStructure);
    s2.position.set(length * 0.3, -radius * 0.8, 0);
    group.add(s1);
    group.add(s2);

    registerClickable(group, meta);
    return group;
  }

  function createPipeSpool(points, radius, mat, meta) {
    const curvePoints = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.1);
    const tubeGeo = new THREE.TubeGeometry(curve, points.length * 8, radius, 16, false);
    const tube = new THREE.Mesh(tubeGeo, mat);
    tube.castShadow = true;
    registerClickable(tube, meta);

    // Attach flow particle system
    createFlowParticles(curve, meta ? meta.particleColor : 0x00e5ff);

    return tube;
  }

  function createFlowParticles(curve, colorHex) {
    const count = 40;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const progress = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      progress[i] = i / count;
      const pt = curve.getPointAt(progress[i]);
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: colorHex || 0x00e5ff,
      size: 0.35,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    const pSystem = new THREE.Points(geo, mat);
    scene.add(pSystem);

    flowParticleSystems.push({
      points: pSystem,
      curve: curve,
      progress: progress,
      speed: 0.003
    });
  }

  // --- Plant Batteries Assembly ---
  function buildPlant() {
    // 1. Ground & Foundations
    const groundGeo = new THREE.PlaneGeometry(160, 100);
    const ground = new THREE.Mesh(groundGeo, materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(150, 75, 0x00e5ff, 0x1f2a38);
    grid.position.y = 0.02;
    scene.add(grid);

    // Battery Concrete Pads
    const padsData = [
      { x: -35, z: 0, w: 22, d: 24, name: 'Battery A: Feed & Desulphurisation' },
      { x: -10, z: 0, w: 26, d: 30, name: 'Battery B: Reforming & Convection Duct' },
      { x: 14, z: 0, w: 20, d: 24, name: 'Battery C: Shift & Condensate Train' },
      { x: 32, z: 0, w: 18, d: 22, name: 'Battery D: 4-Bed PSA Unit' },
      { x: 52, z: 0, w: 22, d: 24, name: 'Battery E: 3-Stage Compression Building' }
    ];

    padsData.forEach(p => {
      const padGeo = new THREE.BoxGeometry(p.w, 0.6, p.d);
      const padMesh = new THREE.Mesh(padGeo, materials.pad);
      padMesh.position.set(p.x, 0.3, p.z);
      padMesh.receiveShadow = true;
      scene.add(padMesh);
    });

    // ----------------------------------------------------
    // BATTERY A: FEED & DESULPHURISATION
    // ----------------------------------------------------
    // E-101 Natural Gas Feed Preheater
    const e101 = createHorizontalExchanger(1.1, 5.0, materials.vesselSteel, {
      type: 'equipment',
      tag: 'E-101',
      name: 'Feed Natural Gas Preheater',
      battery: 'Battery A (DSU)',
      streamIn: 'Stream 1 (25°C, 45 bar)',
      streamOut: 'Stream 2 (400°C, 44.9 bar)',
      duty: '8,950 kW',
      notes: 'Counterflow crossflow against hot flue gas (Stream 27 -> 28).'
    });
    e101.position.set(-40, 2.5, -4);
    scene.add(e101);

    // R-101A and R-101B ZnO Desulphurisation Twin Towers
    const r101A = createDishedVessel(1.3, 6.5, materials.vesselSteel, {
      type: 'equipment',
      tag: 'R-101A',
      name: 'ZnO Desulphurisation Reactor (Lead Bed)',
      battery: 'Battery A (DSU)',
      streamIn: 'Stream 2 (400°C, 44.9 bar)',
      streamOut: 'Stream 3 (400°C, 44.75 bar)',
      reaction: 'ZnO + H2S -> ZnS + H2O (ΔG = -61.3 kJ/mol)',
      dimensions: 'Volume: 32 m³, ID: 2.6 m, Bed: 6.5 m',
      notes: 'Reduces H2S from 3.0 ppm to < 0.1 ppm to protect nickel catalysts.'
    });
    r101A.position.set(-32, 4.5, -4);
    scene.add(r101A);

    const r101B = createDishedVessel(1.3, 6.5, materials.vesselSteel, {
      type: 'equipment',
      tag: 'R-101B',
      name: 'ZnO Desulphurisation Reactor (Standby / Guard Bed)',
      battery: 'Battery A (DSU)',
      streamIn: 'Stream 2',
      streamOut: 'Stream 3',
      notes: 'Secondary guard bed for continuous on-line switchover during sorbent replacement.'
    });
    r101B.position.set(-28, 4.5, -4);
    scene.add(r101B);

    // Natural Gas Feed Header (Stream 1)
    createPipeSpool([
      [-48, 1.5, -4],
      [-42.5, 1.5, -4]
    ], 0.22, materials.pipeNG, {
      type: 'stream', id: 1, name: 'Natural Gas Battery Limits', particleColor: 0xe6a117
    });

    // Desulphurised Gas to Reforming (Stream 5)
    createPipeSpool([
      [-30, 8.0, -4],
      [-30, 9.5, -4],
      [-21, 9.5, -4],
      [-21, 5.0, 2],
      [-18, 5.0, 2]
    ], 0.20, materials.pipeNG, {
      type: 'stream', id: 5, name: 'Process Natural Gas to Reforming', particleColor: 0xe6a117
    });

    // ----------------------------------------------------
    // BATTERY B: REFORMING SKID & SMR FURNACE
    // ----------------------------------------------------
    // M-101 Static Mixer
    const m101Geo = new THREE.CylinderGeometry(0.35, 0.35, 2.2, 16);
    const m101 = new THREE.Mesh(m101Geo, materials.steelStructure);
    m101.rotation.z = Math.PI / 2;
    m101.position.set(-17, 5.0, 2);
    registerClickable(m101, {
      type: 'equipment',
      tag: 'M-101',
      name: 'Static Process Mixer',
      battery: 'Battery B (Reforming)',
      streamIn: 'Stream 5 (NG: 8.0 kg/s) + Stream 35 (Steam: 21.78 kg/s)',
      streamOut: 'Stream 6 (225.2°C, 38.91 bar)',
      notes: 'Kenics helical elements ensure > 99.8% radial mixing uniformity prior to preheater.'
    });
    scene.add(m101);

    // E-102 Pre-Reformer Preheater
    const e102 = createHorizontalExchanger(1.2, 5.5, materials.vesselSteel, {
      type: 'equipment',
      tag: 'E-102',
      name: 'Pre-Reformer Preheater (Flue Gas Exchanger)',
      battery: 'Battery B (Reforming)',
      streamIn: 'Stream 6 (225.2°C, 38.91 bar)',
      streamOut: 'Stream 7 (478.3°C, 38.91 bar)',
      duty: '18,450 kW',
      specs: 'U = 65.0 W/m²K, 636 tubes, 2 passes, Flue Gas 960°C -> 827.5°C'
    });
    e102.position.set(-13, 3.5, 4);
    scene.add(e102);

    // R-102 Samar's Pre-Reformer (Primary Showcase Vessel)
    const r102 = createDishedVessel(0.85, 4.5, materials.insulation, {
      type: 'equipment',
      tag: 'R-102',
      name: 'Adiabatic Pre-Reformer (AR-401 Bed)',
      battery: 'Battery B (Reforming)',
      streamIn: 'Stream 7 (478.3°C, 38.91 bar, 29.78 kg/s)',
      streamOut: 'Stream 8 (424.0°C, 38.79 bar)',
      isR102Primary: true,
      specs: 'ID: 1.70 m, Active Bed: 1.156 m, Top Inert: 0.077 m, Bot Inert: 0.089 m, Wall: 88.9 mm 316N + 77 mm insulation',
      notes: 'CLICK TO OPEN SAMAR R-102 DEEP-DIVE MODAL with 58-slice laser scanner & Euler audit.'
    });
    r102.position.set(-7, 4.0, 5);
    scene.add(r102);

    // Piping Stream 7: E-102 to R-102
    createPipeSpool([
      [-10.5, 3.5, 4],
      [-7, 3.5, 4],
      [-7, 6.8, 5]
    ], 0.20, materials.pipeSyngas, {
      type: 'stream', id: 7, name: 'Pre-Reformer Preheated Inlet', particleColor: 0x26a69a
    });

    // Piping Stream 8: R-102 Outlet to SMR Feed Preheater E-103
    createPipeSpool([
      [-7, 1.2, 5],
      [-7, 1.0, 5],
      [-5, 1.0, 5],
      [-5, 12.0, -2],
      [-7, 12.0, -2]
    ], 0.20, materials.pipeSyngas, {
      type: 'stream', id: 8, name: 'Pre-Reformed Syngas Effluent', particleColor: 0x26a69a
    });

    // B-101 / R-103 Primary Steam Methane Reformer Furnace
    const furnaceBoxGeo = new THREE.BoxGeometry(10, 11, 12);
    const furnaceBox = new THREE.Mesh(furnaceBoxGeo, materials.furnaceRefractory);
    furnaceBox.position.set(-8, 6.0, -8);
    furnaceBox.castShadow = true;
    registerClickable(furnaceBox, {
      type: 'equipment',
      tag: 'B-101 / R-103',
      name: 'Primary Steam Methane Reformer (Radiant Box)',
      battery: 'Battery B (Reforming)',
      streamIn: 'Stream 9 (650°C, 38.8 bar) + Fuel (Stream 22 + 38)',
      streamOut: 'Stream 10 (Raw Syngas: 900°C, 38.8 bar)',
      duty: 'Radiant Heat Duty: 79.2 MW',
      flameTemp: '1051°C adiabatic flame temperature',
      tubes: '336 catalyst-filled HK-40 tubes, Ni/Al2O3 catalyst',
      notes: 'Converts 74.9% of CH4 to syngas via endothermic reforming: CH4 + H2O <-> CO + 3H2.'
    });
    scene.add(furnaceBox);

    // Glowing observation ports on furnace
    for (let i = -3; i <= 3; i += 2) {
      const portGeo = new THREE.BoxGeometry(0.8, 1.2, 0.2);
      const port = new THREE.Mesh(portGeo, materials.furnaceGlow);
      port.position.set(-8 + i, 6.0, -1.9);
      scene.add(port);
    }

    // Overhead Convection Flue Gas Duct & Heat Recovery Train
    const ductGeo = new THREE.BoxGeometry(7, 3.5, 14);
    const duct = new THREE.Mesh(ductGeo, materials.steelStructure);
    duct.position.set(-8, 13.5, -7);
    registerClickable(duct, {
      type: 'equipment',
      tag: 'Convection Section',
      name: 'Flue Gas Heat Recovery Convection Bank',
      battery: 'Battery B',
      components: 'E-103 (SMR Preheater 650°C), E-102 (Pre-Reformer Preheater 478°C), E-105 (Steam Superheater), E-104 (Air Preheater 400°C)',
      flueGasIn: 'Stream 24 (1051°C, 154.7 kg/s)',
      flueGasStack: 'Stream 29 (128.5°C to stack)'
    });
    scene.add(duct);

    // 45-Meter Exhaust Stack
    const stackGeo = new THREE.CylinderGeometry(1.2, 1.6, 28, 24);
    const stack = new THREE.Mesh(stackGeo, materials.steelStructure);
    stack.position.set(-13, 14.5, -14);
    stack.castShadow = true;
    registerClickable(stack, {
      type: 'equipment',
      tag: 'Stack',
      name: 'Flue Gas Exhaust Stack (45m)',
      battery: 'Battery B',
      emission: 'Stream 29: 128.5°C, 1.1 bar, 154.7 kg/s',
      notes: 'Continuous emissions monitoring system (CEMS) for NOx and CO2.'
    });
    scene.add(stack);

    // ----------------------------------------------------
    // BATTERY C: WATER-GAS SHIFT & CONDENSATE TRAIN
    // ----------------------------------------------------
    // E-107 Syngas Waste Heat Boiler (900°C -> 400°C)
    const e107 = createHorizontalExchanger(1.3, 6.0, materials.vesselSteel, {
      type: 'equipment',
      tag: 'E-107',
      name: 'Syngas Waste Heat Boiler (WHB)',
      battery: 'Battery C (Shift Train)',
      streamIn: 'Stream 10 (Raw Syngas: 900°C, 38.8 bar)',
      streamOut: 'Stream 11 (400°C, 38.71 bar)',
      duty: '82,700 kW (Generates HP Saturated Steam)',
      notes: 'Quenches syngas rapidly to prevent Boudouard carbon formation.'
    });
    e107.position.set(4, 3.5, -4);
    scene.add(e107);

    // Stream 10 Piping: SMR Exit to E-107 WHB
    createPipeSpool([
      [-3, 2.0, -8],
      [1, 2.0, -8],
      [1, 3.5, -4],
      [2.5, 3.5, -4]
    ], 0.28, materials.pipeSyngas, {
      type: 'stream', id: 10, name: 'Raw Synthesis Gas (SMR Exit)', particleColor: 0x26a69a
    });

    // R-104 High-Temperature Shift (HTS) Reactor
    const r104 = createDishedVessel(1.4, 6.0, materials.vesselSteel, {
      type: 'equipment',
      tag: 'R-104',
      name: 'High-Temperature Shift Reactor (HTS)',
      battery: 'Battery C (Shift Train)',
      streamIn: 'Stream 11 (400°C, 38.71 bar)',
      streamOut: 'Stream 12 (462.9°C, 38.61 bar)',
      catalyst: 'Fe3O4 / Cr2O3 catalyst',
      conversion: '58.91% CO conversion (CO: 7.49 -> 3.08 kg/s)',
      reaction: 'CO + H2O <-> CO2 + H2 (ΔH = -41.2 kJ/mol, ΔT = +62.9°C adiabatic exotherm)'
    });
    r104.position.set(10, 4.5, -4);
    scene.add(r104);

    // E-106 Inter-Shift Cooler
    const e106 = createHorizontalExchanger(1.1, 4.8, materials.vesselSteel, {
      type: 'equipment',
      tag: 'E-106',
      name: 'Inter-Shift Syngas Cooler',
      battery: 'Battery C (Shift Train)',
      streamIn: 'Stream 12 (462.9°C, 38.61 bar)',
      streamOut: 'Stream 13 (200°C, 38.51 bar)',
      duty: '27,400 kW (Preheats Boiler Feed Water)'
    });
    e106.position.set(16, 3.0, -4);
    scene.add(e106);

    // R-105 Low-Temperature Shift (LTS) Reactor
    const r105 = createDishedVessel(1.3, 5.5, materials.vesselSteel, {
      type: 'equipment',
      tag: 'R-105',
      name: 'Low-Temperature Shift Reactor (LTS)',
      battery: 'Battery C (Shift Train)',
      streamIn: 'Stream 13 (200°C, 38.51 bar)',
      streamOut: 'Stream 14 (246.1°C, 38.51 bar)',
      catalyst: 'Cu / ZnO / Al2O3 catalyst',
      conversion: '88.11% residual CO conversion (CO: 3.08 -> 0.366 kg/s)',
      notes: 'Yields final syngas H2 flow of 3.000 kg/s (120,000 Nm³/h equivalent).'
    });
    r105.position.set(22, 4.2, -4);
    scene.add(r105);

    // E-108 Fin-Fan Syngas Condenser Bank (Elevated)
    const e108Geo = new THREE.BoxGeometry(6, 1.2, 5);
    const e108 = new THREE.Mesh(e108Geo, materials.steelStructure);
    e108.position.set(18, 7.5, 4);
    registerClickable(e108, {
      type: 'equipment',
      tag: 'E-108',
      name: 'Syngas Fin-Fan Condenser Cooler',
      battery: 'Battery C',
      streamIn: 'Stream 14 (246.1°C, 38.51 bar)',
      streamOut: 'Stream 16 (27°C, 33 bar)',
      duty: '49,800 kW',
      notes: 'Subcools syngas below dew point to condense 8.22 kg/s process water.'
    });
    scene.add(e108);

    // S-102 Knockout Flash Drum
    const s102 = createDishedVessel(0.9, 4.8, materials.vesselSteel, {
      type: 'equipment',
      tag: 'S-102',
      name: 'Syngas Knockout Flash Vessel',
      battery: 'Battery C (Condensate)',
      streamIn: 'Stream 16 (27°C, 33 bar, 29.78 kg/s)',
      gasOut: 'Stream 17 (Dehydrated Syngas: 21.56 kg/s to PSA)',
      liquidOut: 'Stream 36 (Process Condensate: 8.22 kg/s to BFW pump)',
      notes: 'Equipped with wire-mesh demister pad and liquid level controller.'
    });
    s102.position.set(12, 3.8, 5);
    scene.add(s102);

    // Condensate Recycle Pump Skid P-101A/B
    const p101Geo = new THREE.BoxGeometry(1.6, 1.0, 1.4);
    const p101 = new THREE.Mesh(p101Geo, materials.steelStructure);
    p101.position.set(12, 0.8, 9);
    registerClickable(p101, {
      type: 'equipment',
      tag: 'P-101A/B',
      name: 'Process Condensate Booster Pumps',
      battery: 'Battery C',
      streamIn: 'Stream 36 (8.22 kg/s, 33 bar)',
      streamOut: 'Stream 37 (8.22 kg/s, 39.95 bar)',
      power: '22 kW',
      notes: 'Recycles de-oxygenated condensate directly back into high-pressure steam drum header.'
    });
    scene.add(p101);

    // ----------------------------------------------------
    // BATTERY D: 4-BED PSA ADSORPTION CAROUSEL (V-101)
    // ----------------------------------------------------
    const psaGroup = new THREE.Group();
    const psaPositions = [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5]
    ];

    psaPositions.forEach((pos, idx) => {
      const col = createDishedVessel(0.9, 5.5, materials.vesselSteel, {
        type: 'equipment',
        tag: `V-101${String.fromCharCode(65 + idx)}`,
        name: `PSA Adsorption Column ${String.fromCharCode(65 + idx)}`,
        battery: 'Battery D (PSA Unit)',
        adsorbent: 'Activated carbon + Zeolite 5A layer',
        cycleSteps: 'Adsorption (33 bar) -> Depressurisation -> Purge (1.5 bar) -> Re-pressurisation',
        recovery: '99.9% net H2 recovery, yielding 3.01 kg/s pure H2 (120,000 Nm³/h)',
        notes: 'Rejects 18.54 kg/s CO2/CH4/CO into low-pressure Tail Gas (Stream 38).'
      });
      col.position.set(pos[0], 3.8, pos[1]);
      psaGroup.add(col);
    });

    // PSA Valve Manifold Trellis
    const psaRackGeo = new THREE.BoxGeometry(8, 0.4, 8);
    const psaRack = new THREE.Mesh(psaRackGeo, materials.steelStructure);
    psaRack.position.set(0, 7.2, 0);
    psaGroup.add(psaRack);

    psaGroup.position.set(32, 0, 0);
    scene.add(psaGroup);

    // Stream 17 Dehydrated Syngas from S-102 to PSA V-101
    createPipeSpool([
      [12, 6.2, 5],
      [12, 7.5, 5],
      [24, 7.5, 5],
      [24, 4.0, 0],
      [28, 4.0, 0]
    ], 0.22, materials.pipeSyngas, {
      type: 'stream', id: 17, name: 'Dehydrated Syngas to PSA Unit', particleColor: 0x26a69a
    });

    // Stream 38 PSA Tail Gas Recycle back to B-101 Furnace
    createPipeSpool([
      [32, 1.5, -4],
      [32, 1.5, -9],
      [-3, 1.5, -9]
    ], 0.24, materials.pipeFlue, {
      type: 'stream', id: 38, name: 'PSA Low-Pressure Tail Gas Fuel', particleColor: 0x78909c
    });

    // ----------------------------------------------------
    // BATTERY E: 3-STAGE COMPRESSION & EXPORT (C-101..103)
    // ----------------------------------------------------
    // Compressor Shelter Open Building
    const compShedGeo = new THREE.BoxGeometry(16, 7, 16);
    const wireframeMat = new THREE.MeshBasicMaterial({ color: 0x3d4a5d, wireframe: true });
    const compShed = new THREE.Mesh(compShedGeo, wireframeMat);
    compShed.position.set(52, 4.0, 0);
    scene.add(compShed);

    // 3 Compressors (C-101, C-102, C-103)
    const stages = [
      { tag: 'C-101', name: 'Stage 1 H2 Compressor', pr: '3.2 -> 80 bar', p: -4 },
      { tag: 'C-102', name: 'Stage 2 H2 Compressor', pr: '80 -> 160 bar', p: 0 },
      { tag: 'C-103', name: 'Stage 3 H2 Compressor', pr: '160 -> 400 bar', p: 4 }
    ];

    stages.forEach(st => {
      const compBodyGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.8, 24);
      const compMesh = new THREE.Mesh(compBodyGeo, materials.steelStructure);
      compMesh.rotation.z = Math.PI / 2;
      compMesh.position.set(50, 1.8, st.p);

      // Motor drive
      const motorGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.0, 24);
      const motorMat = new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.4 });
      const motorMesh = new THREE.Mesh(motorGeo, motorMat);
      motorMesh.rotation.z = Math.PI / 2;
      motorMesh.position.set(53.2, 1.8, st.p);

      registerClickable(compMesh, {
        type: 'equipment',
        tag: st.tag,
        name: st.name,
        battery: 'Battery E (Compression)',
        ratio: st.pr,
        efficiency: 'η_is = 85%',
        notes: 'Centrifugal barrel casing designed for supercritical hydrogen containment. Thermodynamic shaft work verified.'
      });

      scene.add(compMesh);
      scene.add(motorMesh);
    });

    // Stream 18 Pure Product H2 from PSA to C-101
    createPipeSpool([
      [36, 4.0, 0],
      [42, 4.0, 0],
      [42, 2.0, -4],
      [48, 2.0, -4]
    ], 0.18, materials.pipeH2, {
      type: 'stream', id: 18, name: 'Pure Product Hydrogen (PSA Exit)', particleColor: 0x7c4dff
    });

    // Stream 19 High-Pressure 400-Bar Export Header
    createPipeSpool([
      [52, 2.5, 4],
      [58, 2.5, 4],
      [58, 2.5, 12],
      [64, 2.5, 12]
    ], 0.16, materials.pipeHP, {
      type: 'stream', id: 19, name: 'Final 400-Bar Export Hydrogen (To Storage)', particleColor: 0x00e5ff
    });
  }

  // --- Lighting & Environment ---
  function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xddeeff, 0.65);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight1.position.set(50, 80, 50);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 10;
    dirLight1.shadow.camera.far = 200;
    dirLight1.shadow.camera.left = -80;
    dirLight1.shadow.camera.right = 80;
    dirLight1.shadow.camera.top = 80;
    dirLight1.shadow.camera.bottom = -80;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x00e5ff, 0.4);
    dirLight2.position.set(-60, 40, -40);
    scene.add(dirLight2);

    const furnaceLight = new THREE.PointLight(0xff6600, 2.0, 25);
    furnaceLight.position.set(-8, 6.0, -2);
    scene.add(furnaceLight);
  }

  // --- Animation Loop ---
  function animate() {
    requestAnimationFrame(animate);

    // Update flow particle positions
    flowParticleSystems.forEach(ps => {
      const posAttr = ps.points.geometry.attributes.position;
      const count = ps.progress.length;
      for (let i = 0; i < count; i++) {
        ps.progress[i] = (ps.progress[i] + ps.speed) % 1.0;
        const pt = ps.curve.getPointAt(ps.progress[i]);
        posAttr.setXYZ(i, pt.x, pt.y, pt.z);
      }
      posAttr.needsUpdate = true;
    });

    controls.update();
    renderer.render(scene, camera);
  }

  // --- Raycasting Interaction ---
  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);

    if (intersects.length > 0) {
      const topObj = intersects[0].object;
      if (topObj.userData && (topObj.userData.type === 'equipment' || topObj.userData.type === 'stream')) {
        document.body.style.cursor = 'pointer';
        return;
      }
    }
    document.body.style.cursor = 'default';
  }

  function onPointerClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(clickableObjects, true);

    if (intersects.length > 0) {
      const topObj = intersects[0].object;
      if (topObj.userData) {
        if (topObj.userData.isR102Primary) {
          // Open Samar R-102 Deep-Dive Modal
          if (window.openR102Modal) {
            window.openR102Modal();
          }
        } else if (topObj.userData.type === 'equipment') {
          if (window.showEquipmentDrawer) {
            window.showEquipmentDrawer(topObj.userData);
          }
        } else if (topObj.userData.type === 'stream') {
          if (window.selectStreamById) {
            window.selectStreamById(topObj.userData.id);
          }
        }
      }
    }
  }

  // Camera preset animation
  function setCameraPreset(presetKey) {
    const p = CAMERA_PRESETS[presetKey];
    if (!p) return;

    const startPos = camera.position.clone();
    const targetPos = new THREE.Vector3(...p.pos);
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(...p.target);

    const startTime = performance.now();
    const duration = 1200; // ms

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);

      camera.position.lerpVectors(startPos, targetPos, ease);
      controls.target.lerpVectors(startTarget, endTarget, ease);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // --- Initialization ---
  function initWorkbench(containerId) {
    container = document.getElementById(containerId);
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d14);
    scene.fog = new THREE.FogExp2(0x0a0d14, 0.007);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.5, 500);
    camera.position.set(65, 55, 75);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // keep above ground
    controls.target.set(0, 8, 0);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    initMaterials();
    setupLighting();
    buildPlant();

    renderer.domElement.addEventListener('pointermove', onPointerMove, false);
    renderer.domElement.addEventListener('click', onPointerClick, false);

    window.addEventListener('resize', onWindowResize, false);
    animate();
  }

  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // Export to global scope
  window.PlantWorkbench = {
    init: initWorkbench,
    setCameraPreset: setCameraPreset
  };
})();
