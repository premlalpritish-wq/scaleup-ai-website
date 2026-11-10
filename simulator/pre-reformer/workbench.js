/**
 * ScaleUp AI - 3D WebGL Process Workbench
 * Model: Steam Methane Reforming Pre-Reformer Skid (M-101 + E-102 + R-102)
 * Dimensions & Geometry: CAPE3000 Pre-Reformer Design Report (Samarpit Nag, 2024)
 * Architecture: Three.js r128 with OrbitControls & Procedural Cutaways
 */

class PreReformerWorkbench {
  constructor(canvasContainerId, solver) {
    this.container = document.getElementById(canvasContainerId);
    this.solver = solver;
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // 3D Objects references
    this.probeRing = null;
    this.probePlane = null;
    this.catalystBedMesh = null;
    this.particles = null;
    this.particlePositions = [];
    this.vesselCutawayGroup = null;
    this.fullVesselGroup = null;

    // View options
    this.viewMode = 'cutaway'; // 'cutaway' | 'thermal' | 'full'
    this.probeZ = 0.02; // meters along bed
    this.animating = true;

    this.initScene();
    this.buildSkid();
    this.buildMixerM101();
    this.buildExchangerE102();
    this.buildReactorR102();
    this.buildPipingAndValves();
    this.buildProbeMarker();
    this.buildFlowParticles();

    this.setupResizeListener();
    this.animate();
  }

  initScene() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a0e); // ScaleUp --ink-900
    this.scene.fog = new THREE.FogExp2(0x070a0e, 0.035);

    // Camera: positioned for isometric overview of skid
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100.0);
    this.camera.position.set(5.5, 4.2, 7.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // do not go below ground
      this.controls.minDistance = 2.0;
      this.controls.maxDistance = 25.0;
      this.controls.target.set(0.5, 2.2, 0.0);
    }

    // Industrial Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xdde5ed, 0.55);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(8.0, 12.0, 6.0);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 30.0;
    dirLight1.shadow.camera.left = -6;
    dirLight1.shadow.camera.right = 6;
    dirLight1.shadow.camera.top = 6;
    dirLight1.shadow.camera.bottom = -6;
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x4ecdc4, 0.35); // Cyan rim light
    dirLight2.position.set(-8.0, 4.0, -6.0);
    this.scene.add(dirLight2);

    const groundLight = new THREE.DirectionalLight(0xe0b155, 0.15); // Warm floor bounce
    groundLight.position.set(0, -5, 0);
    this.scene.add(groundLight);
  }

  buildSkid() {
    // Floor Grating & Steel Structural Frame (Ellesmere Port petrochemical skid)
    const floorGeo = new THREE.PlaneGeometry(16, 12);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0e141c,
      roughness: 0.88,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Industrial Grid Lines
    const gridHelper = new THREE.GridHelper(16, 32, 0x1f2937, 0x111823);
    gridHelper.position.y = 0.005;
    this.scene.add(gridHelper);

    // Steel I-Beams for Skid Base
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1f2733, metalness: 0.6, roughness: 0.5 });
    const beamGeoX = new THREE.BoxGeometry(11.0, 0.25, 0.25);
    const beamGeoZ = new THREE.BoxGeometry(0.25, 0.25, 6.0);

    const b1 = new THREE.Mesh(beamGeoX, beamMat);
    b1.position.set(0.0, 0.125, -2.5);
    const b2 = new THREE.Mesh(beamGeoX, beamMat);
    b2.position.set(0.0, 0.125, 2.5);
    const b3 = new THREE.Mesh(beamGeoZ, beamMat);
    b3.position.set(-5.0, 0.125, 0.0);
    const b4 = new THREE.Mesh(beamGeoZ, beamMat);
    b4.position.set(5.0, 0.125, 0.0);
    const b5 = new THREE.Mesh(beamGeoZ, beamMat);
    b5.position.set(0.0, 0.125, 0.0);

    [b1, b2, b3, b4, b5].forEach(b => {
      b.receiveShadow = true;
      b.castShadow = true;
      this.scene.add(b);
    });

    // Safety yellow structural posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9e7520, roughness: 0.6 });
    for (const [px, pz] of [[-4.9, -2.4], [4.9, -2.4], [-4.9, 2.4], [4.9, 2.4]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), postMat);
      post.position.set(px, 0.5, pz);
      this.scene.add(post);
    }
  }

  buildMixerM101() {
    // Mixer M-101: Located at x = -4.0, y = 1.0, z = 0.0
    const mixerGroup = new THREE.Group();
    mixerGroup.position.set(-3.8, 1.1, 0.0);

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x7a8b9e,
      metalness: 0.8,
      roughness: 0.25
    });

    // Mixer Body
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 24);
    const body = new THREE.Mesh(bodyGeo, steelMat);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    mixerGroup.add(body);

    // Natural Gas Inlet Flange (Stream 5)
    const ngInletGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.45, 16);
    const ngInlet = new THREE.Mesh(ngInletGeo, steelMat);
    ngInlet.position.set(-0.4, 0.35, 0.0);
    mixerGroup.add(ngInlet);

    // Steam Inlet Flange (Stream 35)
    const steamInletGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.45, 16);
    const steamInlet = new THREE.Mesh(steamInletGeo, steelMat);
    steamInlet.position.set(0.0, 0.35, 0.0);
    mixerGroup.add(steamInlet);

    // Support legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3543 });
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.5), legMat);
    leg1.position.set(-0.4, -0.6, 0.0);
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.5), legMat);
    leg2.position.set(0.4, -0.6, 0.0);
    mixerGroup.add(leg1, leg2);

    // Mixer Tag Label
    this.createTagMesh("M-101 (Gas/Steam Mixer)", mixerGroup, [0.0, 0.8, 0.0]);

    this.scene.add(mixerGroup);
  }

  buildExchangerE102() {
    // Heat Exchanger E-102: Two-pass crossflow shell-and-tube
    // Center at x = -1.6, y = 1.6, z = 0.0
    // Samar Specs: 636 tubes, U = 65 W/m2K, bundle diameter 1330 mm
    const hxGroup = new THREE.Group();
    hxGroup.position.set(-1.6, 1.5, 0.0);

    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x566573,
      metalness: 0.75,
      roughness: 0.3,
      transparent: true,
      opacity: 0.88
    });

    const headMat = new THREE.MeshStandardMaterial({
      color: 0x415b76,
      metalness: 0.85,
      roughness: 0.2
    });

    // Cylindrical Shell (1.33 m bundle diameter, 2.6 m long)
    const shellGeo = new THREE.CylinderGeometry(0.665, 0.665, 2.6, 32, 1, true);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.rotation.z = Math.PI / 2;
    shell.castShadow = true;
    hxGroup.add(shell);

    // Channel Heads on both ends (Two-pass configuration)
    const frontHeadGeo = new THREE.SphereGeometry(0.665, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const frontHead = new THREE.Mesh(frontHeadGeo, headMat);
    frontHead.rotation.z = -Math.PI / 2;
    frontHead.position.x = -1.3;
    hxGroup.add(frontHead);

    const rearHead = new THREE.Mesh(frontHeadGeo, headMat);
    rearHead.rotation.z = Math.PI / 2;
    rearHead.position.x = 1.3;
    hxGroup.add(rearHead);

    // Internal Tube Bundle Visualization (BS-3606 Steel Tubes)
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 0.9, roughness: 0.15 });
    const tubeGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.5, 8);
    for (let r = 0.15; r <= 0.55; r += 0.12) {
      const count = Math.floor(r * 24);
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(0.0, Math.sin(theta) * r, Math.cos(theta) * r);
        hxGroup.add(tube);
      }
    }

    // Flue Gas Utility Duct Nozzles (Stream 25 In @ 960°C, Stream 26 Out @ 827.5°C)
    const flueMat = new THREE.MeshStandardMaterial({ color: 0xb33939, metalness: 0.6, roughness: 0.4 });
    const flueIn = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.55, 16), flueMat);
    flueIn.position.set(-0.4, 0.85, 0.0);
    hxGroup.add(flueIn);

    const flueOut = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.55, 16), flueMat);
    flueOut.position.set(0.4, -0.85, 0.0);
    hxGroup.add(flueOut);

    // Saddle Supports
    const saddleMat = new THREE.MeshStandardMaterial({ color: 0x222e3c });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.4), saddleMat);
    s1.position.set(-0.8, -0.8, 0.0);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.4), saddleMat);
    s2.position.set(0.8, -0.8, 0.0);
    hxGroup.add(s1, s2);

    // Label
    this.createTagMesh("E-102 (Crossflow Flue Gas Preheater)", hxGroup, [0.0, 1.3, 0.0]);

    this.scene.add(hxGroup);
  }

  buildReactorR102() {
    // Pre-Reformer Reactor R-102: Center at x = 2.2, z = 0.0
    // Samar Specs: 1.70 m ID, 88.9 mm 316N wall, 77 mm mineral wool insulation
    // Overall Height: 6.712 m, Catalyst Bed: 1.156 m, Top/Bottom Inerts: 0.077m / 0.089m
    const rGroup = new THREE.Group();
    rGroup.position.set(2.2, 0.0, 0.0);

    const R_inner = 0.85; // 1.70 m ID / 2
    const t_steel = 0.0889; // 88.9 mm
    const t_ins = 0.077; // 77 mm
    const R_outer_steel = R_inner + t_steel; // 0.9389 m
    const R_outer_ins = R_outer_steel + t_ins; // 1.0159 m
    const H_total = 6.712; // 6.712 m total height

    // Materials
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x8896a6,
      metalness: 0.85,
      roughness: 0.25,
      side: THREE.DoubleSide
    });

    const insMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Mineral wool golden insulation tone
      roughness: 0.92,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const laggingCladMat = new THREE.MeshStandardMaterial({
      color: 0x6e7b8b, // Galvanized aluminum/steel outer cladding
      metalness: 0.75,
      roughness: 0.3,
      side: THREE.DoubleSide
    });

    // 1. Full Outer Cladding Shell (Back half)
    // We create a cutaway: only render theta from Math.PI/2 to 2*Math.PI (leaving front quadrant open)
    const cutawayTheta = Math.PI * 1.5; // 270 degrees visible, 90 degrees cutaway
    const shellGeo = new THREE.CylinderGeometry(R_outer_ins, R_outer_ins, 4.8, 48, 1, true, 0, cutawayTheta);
    const outerClad = new THREE.Mesh(shellGeo, laggingCladMat);
    outerClad.position.y = 2.8;
    outerClad.rotation.y = Math.PI * 0.75;
    rGroup.add(outerClad);

    // Cutaway wall cross-section showing 88.9 mm steel + 77 mm insulation thickness
    const wallCrossGeo = new THREE.BoxGeometry(t_steel + t_ins, 4.8, 0.02);
    const wallCut1 = new THREE.Mesh(wallCrossGeo, steelMat);
    wallCut1.position.set(R_inner + (t_steel + t_ins) / 2, 2.8, 0.0);
    rGroup.add(wallCut1);

    // 2. Top 2:1 Ellipsoidal Head (ASME Section VIII Div 1)
    const headGeo = new THREE.SphereGeometry(R_outer_ins, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const topHead = new THREE.Mesh(headGeo, laggingCladMat);
    topHead.scale.set(1.0, 0.5, 1.0); // 2:1 ellipsoidal ratio
    topHead.position.y = 5.2;
    rGroup.add(topHead);

    // Top Manway & Inlet Nozzle
    const topNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 16), steelMat);
    topNozzle.position.y = 5.7;
    rGroup.add(topNozzle);

    const topFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), steelMat);
    topFlange.position.y = 6.0;
    rGroup.add(topFlange);

    // Pressure Relief Valve PRV-01 (Crosby J-Series, Fail Open)
    const prvGroup = new THREE.Group();
    prvGroup.position.set(0.5, 5.5, 0.4);
    const prvBody = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xb83227 }));
    const prvBonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    prvBonnet.position.y = 0.22;
    const prvVent = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), steelMat);
    prvVent.position.set(0.15, 0.35, 0.0);
    prvGroup.add(prvBody, prvBonnet, prvVent);
    rGroup.add(prvGroup);
    this.createTagMesh("PRV-01 (Crosby J-Series Relief)", prvGroup, [0.0, 0.8, 0.0]);

    // 3. Bottom 2:1 Ellipsoidal Head & 0.51 m Catalyst Dropout Nozzle
    const botHead = new THREE.Mesh(headGeo, laggingCladMat);
    botHead.scale.set(1.0, -0.5, 1.0);
    botHead.position.y = 0.5;
    rGroup.add(botHead);

    // Catalyst Dropout Nozzle (0.51 m ID as calculated in Samar Chapter 4.3, p. 46)
    const dropoutNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.6, 20), steelMat);
    dropoutNozzle.position.y = 0.0;
    rGroup.add(dropoutNozzle);

    // 4 Support Lugs / Brackets (at 1.0 m elevation, Section 4.3, p. 46)
    const lugMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.4), lugMat);
      lug.position.set(Math.cos(ang) * (R_outer_ins + 0.15), 1.0, Math.sin(ang) * (R_outer_ins + 0.15));
      lug.rotation.y = -ang;
      
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 0.2), lugMat);
      column.position.set(Math.cos(ang) * (R_outer_ins + 0.15), 0.5, Math.sin(ang) * (R_outer_ins + 0.15));
      rGroup.add(lug, column);
    }

    // ==========================================
    // INTERNAL PACKED BED CUTAWAY LAYERS
    // ==========================================
    // Reference elevation within reactor:
    // Bed base sits above bottom support screen at y = 2.0
    const bed_base_y = 2.0;
    const h_bot = this.solver.h_bot_inert; // 0.089 m
    const h_bed = this.solver.L_bed; // 1.156 m
    const h_top = this.solver.h_top_inert; // 0.077 m

    // Top Perforated Distributor Plate
    const distPlateGeo = new THREE.CylinderGeometry(R_inner - 0.01, R_inner - 0.01, 0.03, 32);
    const distPlate = new THREE.Mesh(distPlateGeo, new THREE.MeshStandardMaterial({ color: 0x4a5568, metalness: 0.8 }));
    distPlate.position.y = bed_base_y + h_bot + h_bed + h_top + 0.1;
    rGroup.add(distPlate);

    // Top Inert Layer: 0.077 m Denstone T-162 Alumina Support Balls
    const topInertGeo = new THREE.CylinderGeometry(R_inner - 0.01, R_inner - 0.01, h_top, 32);
    const topInertMat = new THREE.MeshStandardMaterial({ color: 0xedf2f7, roughness: 0.75 }); // White ceramic balls
    const topInertMesh = new THREE.Mesh(topInertGeo, topInertMat);
    topInertMesh.position.y = bed_base_y + h_bot + h_bed + (h_top / 2);
    rGroup.add(topInertMesh);

    // ACTIVE CATALYST BED: 1.156 m AR-401 Ni-MgO / alpha-Al2O3 Pellets
    // Multi-segment mesh with vertex colors mapping the exact thermal gradient
    const bedSegments = 32;
    const catBedGeo = new THREE.CylinderGeometry(R_inner - 0.01, R_inner - 0.01, h_bed, 32, bedSegments, false);
    
    // Thermal Heat Map Vertex Colors
    const colors = [];
    const pos = catBedGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const yNorm = (pos.getY(i) + h_bed / 2) / h_bed; // 0 at bottom (z = 1.156m), 1 at top (z = 0)
      const zSim = (1.0 - yNorm) * h_bed; // 0 at top entrance, 1.156 at exit
      
      // Color based on baseline temperature profile:
      // z = 0 -> 370°C (amber/orange)
      // z = 0.02 -> 398°C peak hotspot (crimson red)
      // z = 1.156 -> 384°C (warm golden orange)
      const c = new THREE.Color();
      if (zSim <= 0.08) {
        const tHot = (zSim / 0.08);
        c.setRGB(0.95, 0.45 - 0.25 * tHot, 0.08); // Hot crimson-orange
      } else {
        const tTail = (zSim - 0.08) / (h_bed - 0.08);
        c.setRGB(0.85 + 0.1 * (1 - tTail), 0.35 + 0.25 * tTail, 0.1);
      }
      colors.push(c.r, c.g, c.b);
    }
    catBedGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const catBedMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1
    });
    this.catalystBedMesh = new THREE.Mesh(catBedGeo, catBedMat);
    this.catalystBedMesh.position.y = bed_base_y + h_bot + (h_bed / 2);
    rGroup.add(this.catalystBedMesh);

    // Bottom Inert Layer: 0.089 m Denstone T-162 Alumina Support Balls
    const botInertGeo = new THREE.CylinderGeometry(R_inner - 0.01, R_inner - 0.01, h_bot, 32);
    const botInertMat = new THREE.MeshStandardMaterial({ color: 0xedf2f7, roughness: 0.75 });
    const botInertMesh = new THREE.Mesh(botInertGeo, botInertMat);
    botInertMesh.position.y = bed_base_y + (h_bot / 2);
    rGroup.add(botInertMesh);

    // Bottom Support Grid Mesh
    const gridMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(R_inner - 0.01, R_inner - 0.01, 0.02, 32),
      new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.9 })
    );
    gridMesh.position.y = bed_base_y - 0.01;
    rGroup.add(gridMesh);

    // Vessel Label
    this.createTagMesh("R-102 Pre-Reformer (316N ASME VIII)", rGroup, [0.0, 6.4, 0.0]);

    this.reactorBaseElevation = bed_base_y + h_bot;
    this.rGroup = rGroup;
    this.scene.add(rGroup);
  }

  buildProbeMarker() {
    // Holographic Cyan Laser Probe Ring & Scanning Disc
    const probeGroup = new THREE.Group();
    const R_inner = 0.85;

    // Glowing Ring
    const ringGeo = new THREE.TorusGeometry(R_inner - 0.02, 0.025, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ecdc4, wireframe: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    probeGroup.add(ring);

    // Semi-transparent Scanning Laser Plane
    const planeGeo = new THREE.CircleGeometry(R_inner - 0.03, 32);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x4ecdc4,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = Math.PI / 2;
    probeGroup.add(plane);

    // Laser Guideline extending to outer readout
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4ecdc4, linewidth: 2 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(R_inner + 0.6, 0, 0.4)
    ]);
    const probeLine = new THREE.Line(lineGeo, lineMat);
    probeGroup.add(probeLine);

    this.probeGroup = probeGroup;
    this.updateProbePosition(0.02);
    this.rGroup.add(probeGroup);
  }

  updateProbePosition(zMeters) {
    this.probeZ = Math.max(0.0, Math.min(this.solver.L_bed, zMeters));
    // Bed flows downwards: z = 0 is at top of bed, z = L_bed is at bottom
    const yElevation = this.reactorBaseElevation + (this.solver.L_bed - this.probeZ);
    if (this.probeGroup) {
      this.probeGroup.position.y = yElevation;
    }
  }

  buildPipingAndValves() {
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x8294a5,
      metalness: 0.85,
      roughness: 0.25
    });

    const valveBodyMat = new THREE.MeshStandardMaterial({ color: 0x1f5f5c, metalness: 0.8, roughness: 0.3 });
    const actuatorMat = new THREE.MeshStandardMaterial({ color: 0x4ecdc4, roughness: 0.4 }); // ScaleUp teal

    // 1. Pipe 1: 16" Schedule 40 from M-101 to E-102 (Length = 4.0 m, Chapter 3.3, p. 38)
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.193, 1.4, 24), pipeMat);
    p1.rotation.z = Math.PI / 2;
    p1.position.set(-2.8, 1.1, 0.0);
    this.scene.add(p1);

    // Control Valve GV-02 (Upstream E-102, Section 3.5, p. 40)
    const gv02 = this.createValveMesh("GV-02 (Preheat Throttle)", valveBodyMat, actuatorMat);
    gv02.position.set(-2.8, 1.1, 0.0);
    this.scene.add(gv02);

    // 2. Pipe 2: 20" Schedule 40 from E-102 to R-102 (Length = 12.2 m, Chapter 3.3, p. 38)
    // Runs from E-102 outlet (x = -0.3, y = 1.5) up to R-102 top nozzle (x = 2.2, y = 6.0)
    const pipePoints = [
      new THREE.Vector3(-0.3, 1.5, 0.0),
      new THREE.Vector3(0.5, 1.5, 0.0),
      new THREE.Vector3(0.5, 6.0, 0.0),
      new THREE.Vector3(2.2, 6.0, 0.0)
    ];
    const curve = new THREE.CurvePath();
    for (let i = 0; i < pipePoints.length - 1; i++) {
      curve.add(new THREE.LineCurve3(pipePoints[i], pipePoints[i + 1]));
    }
    const pipeGeo = new THREE.TubeGeometry(curve, 48, 0.24, 16, false);
    const p2 = new THREE.Mesh(pipeGeo, pipeMat);
    this.scene.add(p2);

    // Control Valve GV-03 (Reactor Feed Globe Valve, Chapter 5.1, p. 47)
    const gv03 = this.createValveMesh("GV-03 (Reactor Feed)", valveBodyMat, actuatorMat);
    gv03.position.set(1.3, 6.0, 0.0);
    this.scene.add(gv03);

    // Temperature Transmitter TT-44 on feed line (p. 48)
    const tt44 = this.createTransmitterMesh("TT-44 (478°C)", 0xe0b155);
    tt44.position.set(0.5, 3.8, 0.25);
    this.scene.add(tt44);

    // 3. Effluent Pipe from R-102 bottom to Main SMR (Stream 8)
    const effluentGeo = new THREE.TubeGeometry(
      new THREE.LineCurve3(new THREE.Vector3(2.2, 0.0, 0.0), new THREE.Vector3(4.5, 0.0, 0.0)),
      16, 0.24, 16, false
    );
    const pEffluent = new THREE.Mesh(effluentGeo, pipeMat);
    this.scene.add(pEffluent);

    // Control Valve GV-04 (Effluent Isolation, Fail Closed, Chapter 5.2, p. 49)
    const gv04 = this.createValveMesh("GV-04 (Effluent Fail-Closed)", valveBodyMat, actuatorMat);
    gv04.position.set(3.4, 0.0, 0.0);
    this.scene.add(gv04);
  }

  createValveMesh(name, bodyMat, actMat) {
    const vg = new THREE.Group();
    // Globe body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), bodyMat);
    const flange1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), bodyMat);
    flange1.rotation.z = Math.PI / 2;
    flange1.position.x = -0.22;
    const flange2 = flange1.clone();
    flange2.position.x = 0.22;

    // Pneumatic Diaphragm Actuator Dome
    const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12), bodyMat);
    bonnet.position.y = 0.3;
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 20), actMat);
    dome.position.y = 0.55;

    vg.add(body, flange1, flange2, bonnet, dome);
    return vg;
  }

  createTransmitterMesh(label, colorHex) {
    const tg = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 16), new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.8 }));
    head.rotation.x = Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x4a5568 }));
    stem.position.y = -0.12;
    tg.add(head, stem);
    return tg;
  }

  createTagMesh(text, parentGroup, offset) {
    // 3D Billboard text placeholder or node tag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 21, 0.85)';
    ctx.roundRect(0, 0, 256, 64, 10);
    ctx.fill();
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 3;
    ctx.roundRect(0, 0, 256, 64, 10);
    ctx.stroke();

    ctx.fillStyle = '#e8f0ec';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.2, 0.3, 1.0);
    sprite.position.set(offset[0], offset[1], offset[2]);
    parentGroup.add(sprite);
  }

  buildFlowParticles() {
    // Instanced animated particle flow tracing process gas path
    const particleCount = 180;
    const pGeo = new THREE.SphereGeometry(0.022, 6, 6);
    const pMat = new THREE.MeshBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.75 });
    
    this.particleInstanced = new THREE.InstancedMesh(pGeo, pMat, particleCount);
    this.particleProgress = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      this.particleProgress[i] = Math.random();
    }
    this.scene.add(this.particleInstanced);
  }

  updateFlowParticles(delta, velocityScale) {
    if (!this.particleInstanced) return;
    const dummy = new THREE.Object3D();
    const count = this.particleProgress.length;

    for (let i = 0; i < count; i++) {
      this.particleProgress[i] += delta * 0.12 * Math.max(0.5, velocityScale);
      if (this.particleProgress[i] > 1.0) this.particleProgress[i] -= 1.0;

      const p = this.particleProgress[i];
      let pos = new THREE.Vector3();

      if (p < 0.25) {
        // M-101 to E-102
        const t = p / 0.25;
        pos.set(-3.8 + t * 2.2, 1.1 + Math.sin(t * Math.PI) * 0.1, (Math.random() - 0.5) * 0.1);
      } else if (p < 0.55) {
        // E-102 through pipe to R-102
        const t = (p - 0.25) / 0.30;
        if (t < 0.3) {
          pos.set(-1.6 + (t / 0.3) * 2.1, 1.5, 0.0);
        } else if (t < 0.7) {
          const tY = (t - 0.3) / 0.4;
          pos.set(0.5, 1.5 + tY * 4.5, 0.0);
        } else {
          const tX = (t - 0.7) / 0.3;
          pos.set(0.5 + tX * 1.7, 6.0, 0.0);
        }
      } else if (p < 0.85) {
        // Percolating down through R-102 catalyst bed
        const t = (p - 0.55) / 0.30;
        const rad = Math.sqrt(Math.random()) * 0.75;
        const ang = Math.random() * Math.PI * 2;
        pos.set(2.2 + Math.cos(ang) * rad, 5.0 - t * 3.2, Math.sin(ang) * rad);
      } else {
        // Exiting R-102 through bottom outlet
        const t = (p - 0.85) / 0.15;
        pos.set(2.2 + t * 2.3, 0.0, 0.0);
      }

      dummy.position.copy(pos);
      dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, dummy.matrix);
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
  }

  updateThermalColors(profile) {
    if (!this.catalystBedMesh) return;
    const geo = this.catalystBedMesh.geometry;
    const colors = geo.attributes.color.array;
    const pos = geo.attributes.position;
    const h_bed = this.solver.L_bed;

    // Find min and peak temperature in the live simulation run
    const T_min = Math.min(...profile.map(p => p.T_C));
    const T_max = Math.max(...profile.map(p => p.T_C));

    for (let i = 0; i < pos.count; i++) {
      const yNorm = (pos.getY(i) + h_bed / 2) / h_bed; // 0 at bottom, 1 at top
      const zSim = (1.0 - yNorm) * h_bed;
      
      // Interpolate temperature at zSim from profile
      const idx = Math.min(profile.length - 1, Math.max(0, Math.round((zSim / h_bed) * (profile.length - 1))));
      const localT = profile[idx].T_C;
      const tNorm = (localT - T_min) / Math.max(1.0, (T_max - T_min));

      const c = new THREE.Color();
      // Blue/cyan (cold) -> Amber (370°C) -> Vivid Hot Crimson (peak)
      if (tNorm < 0.5) {
        c.lerpColors(new THREE.Color(0xe0b155), new THREE.Color(0xe0687a), tNorm * 2.0);
      } else {
        c.lerpColors(new THREE.Color(0xe0687a), new THREE.Color(0xff2a44), (tNorm - 0.5) * 2.0);
      }

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.attributes.color.needsUpdate = true;
  }

  setViewPreset(name) {
    if (!this.controls) return;
    switch (name) {
      case 'overview':
        this.camera.position.set(5.5, 4.2, 7.5);
        this.controls.target.set(0.5, 2.2, 0.0);
        break;
      case 'reactor':
        this.camera.position.set(3.8, 3.2, 3.8);
        this.controls.target.set(2.2, 3.0, 0.0);
        break;
      case 'exchanger':
        this.camera.position.set(-1.6, 2.5, 4.0);
        this.controls.target.set(-1.6, 1.5, 0.0);
        break;
      case 'probe':
        const probeY = this.reactorBaseElevation + (this.solver.L_bed - this.probeZ);
        this.camera.position.set(2.2 + 2.0, probeY + 0.8, 2.0);
        this.controls.target.set(2.2, probeY, 0.0);
        break;
    }
  }

  setupResizeListener() {
    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width && height && this.camera && this.renderer) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    this.updateFlowParticles(0.016, 1.0);
    this.renderer.render(this.scene, this.camera);
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.PreReformerWorkbench = PreReformerWorkbench;
}
