/**
 * ARTEMIS PRISM v2.1 — High-Fidelity 3D Lunar Digital Twin Engine
 * WebGL terrain reconstruction calibrated to NASA LRO LOLA DEM altimetry,
 * multi-tier realistic solar & earthshine lighting, camera presets,
 * hypsometric elevation palette, slope hazard mapping, and raycast inspection.
 */

import { LUNAR_LANDING_SITES } from '../data/lunarSites.js';
import { soundManager } from './audio.js';

export class View3D {
  constructor(containerElement, terrainModel, appState, ephemerisEngine, onInspectCallback) {
    this.container = containerElement;
    this.terrain = terrainModel;
    this.state = appState;
    this.ephemeris = ephemerisEngine;
    this.onInspect = onInspectCallback;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.terrainMesh = null;
    this.sunLight = null;
    this.sunLightTarget = null;
    this.hemiLight = null;
    this.ambientLight = null;
    this.earthMarker = null;
    this.earthRay = null;
    this.landerMesh = null;
    this.footprintCircle = null;
    this.roverPathLine = null;
    this.raycaster = null;
    this.mouse = null;

    this.shadingMode = "hypsometric";
    this.isThreeAvailable = false;
    this.animationFrameId = null;

    this._init();
  }

  _init() {
    if (typeof window.THREE !== 'undefined') {
      this._initThreeScene();
    } else {
      const checkInterval = setInterval(() => {
        if (typeof window.THREE !== 'undefined') {
          clearInterval(checkInterval);
          this._initThreeScene();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (!this.isThreeAvailable) {
          this._initFallbackRenderer();
        }
      }, 2500);
    }
  }

  _initThreeScene() {
    this.isThreeAvailable = true;
    const THREE = window.THREE;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Scene without fog (Moon has vacuum, no atmospheric haze)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a12);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 50, 350000);
    this.camera.position.set(0, 16000, 24000);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.container.innerHTML = "";
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
      this.controls.minDistance = 200;
      this.controls.maxDistance = 160000;
      this.controls.target.set(0, 500, 0);
    }

    // MULTI-TIER LUNAR LIGHTING
    // 1. Hemisphere Light: Bright Earthshine & cosmic starlight from above, regolith bounce from below
    this.hemiLight = new THREE.HemisphereLight(0xe0e7ff, 0x1e293b, 1.8);
    this.scene.add(this.hemiLight);

    // 2. Base Ambient Light: Guarantees every crater wall and surface feature is visibly illuminated
    this.ambientLight = new THREE.AmbientLight(0x64748b, 0.9);
    this.scene.add(this.ambientLight);

    // 3. Directional Sunlight: Topocentric Sun vector with soft shadows
    this.sunLight = new THREE.DirectionalLight(0xfffaed, 2.8);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 500;
    this.sunLight.shadow.camera.far = 100000;
    const d = 24000;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;

    this.sunLightTarget = new THREE.Object3D();
    this.sunLightTarget.position.set(0, 500, 0);
    this.scene.add(this.sunLightTarget);
    this.sunLight.target = this.sunLightTarget;
    this.scene.add(this.sunLight);

    // Starfield in background
    this._addStarfield();

    // LOLA 3D Terrain Mesh
    this._buildTerrainMesh();

    // Earth Sphere & Line-of-sight Ray
    this._buildEarthIndicator();

    // Mission Assets
    this._buildMissionAssets();

    // Geodetic Reference Circle
    this._buildGeodeticGrid();

    // Update Sun/Earth lighting
    this.updateEphemerisLighting();

    // Canvas click interactions
    this._setupCanvasInteractions();

    // Resize observer
    if (window.ResizeObserver) {
      new ResizeObserver(() => this.resize()).observe(this.container);
    }
    window.addEventListener('resize', () => this.resize());

    // Staggered resize calls
    setTimeout(() => this.resize(), 50);
    setTimeout(() => this.resize(), 200);
    setTimeout(() => this.resize(), 500);

    // Render loop
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  _buildTerrainMesh() {
    const THREE = window.THREE;
    const N = this.terrain.gridSize; // 128
    const extent = this.terrain.domainExtentM; // 32,000m

    const geometry = new THREE.PlaneGeometry(extent, extent, N - 1, N - 1);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    this.vertexColorsHypso = [];
    this.vertexColorsHillshade = [];
    this.vertexColorsSlope = [];

    const colHypso = new THREE.Color();
    const colHill = new THREE.Color();
    const colSlope = new THREE.Color();

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const vIdx = j * N + i;
        const zM = this.terrain.elevationGrid[vIdx];
        const slope = this.terrain.slopeGrid[vIdx];
        const isPsr = this.terrain.psrGrid[vIdx] === 1;

        pos.setY(vIdx, zM);

        // High-contrast Hypsometric Tinting (LOLA Calibrated: -3400m to +1450m)
        const normZ = Math.max(0, Math.min(1, (zM + 3400) / 4850));

        if (isPsr) {
          // Vivid royal blue in cold trap
          colHypso.setRGB(0.12 + normZ * 0.15, 0.28 + normZ * 0.3, 0.75 + normZ * 0.25);
        } else if (normZ < 0.45) {
          // Mid slopes: Cyan / Steel
          colHypso.setRGB(0.15 + normZ * 0.4, 0.5 + normZ * 0.3, 0.65 + normZ * 0.2);
        } else if (normZ < 0.75) {
          // Lunar plains: Silvery grey
          const g = 0.62 + (normZ - 0.45) * 0.65;
          colHypso.setRGB(g * 0.95, g * 0.96, g * 1.0);
        } else {
          // Elevated Rim Peaks: Sunlit golden amber to summit crest white
          const t = (normZ - 0.75) / 0.25;
          colHypso.setRGB(0.94 + t * 0.06, 0.78 + t * 0.2, 0.38 + t * 0.55);
        }
        this.vertexColorsHypso.push(colHypso.r, colHypso.g, colHypso.b);

        // Hillshade: Realistic silvery-grey lunar regolith
        const hillBrightness = 0.52 + normZ * 0.45;
        colHill.setRGB(hillBrightness * 0.96, hillBrightness * 0.97, hillBrightness * 1.0);
        this.vertexColorsHillshade.push(colHill.r, colHill.g, colHill.b);

        // Slope Hazard Map
        if (slope < 7.0) {
          colSlope.setRGB(0.1, 0.8, 0.45); // Safe Green
        } else if (slope <= 15.0) {
          colSlope.setRGB(0.96, 0.68, 0.12); // Caution Amber
        } else {
          colSlope.setRGB(0.94, 0.25, 0.25); // Hazard Red
        }
        this.vertexColorsSlope.push(colSlope.r, colSlope.g, colSlope.b);
      }
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.vertexColorsHypso, 3));
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.1,
      flatShading: false,
      side: THREE.DoubleSide
    });

    this.terrainMesh = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.terrainMesh.frustumCulled = false; // Prevent culling
    this.scene.add(this.terrainMesh);
  }

  _addStarfield() {
    const THREE = window.THREE;
    const starCount = 2500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < starCount; i++) {
      const x = (Math.random() - 0.5) * 220000;
      const y = Math.random() * 100000 + 3000;
      const z = (Math.random() - 0.5) * 220000;
      starPos.push(x, y, z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xf1f5f9, size: 45, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    const stars = new THREE.Points(starGeo, starMat);
    this.scene.add(stars);
  }

  _buildEarthIndicator() {
    const THREE = window.THREE;
    const earthGeo = new THREE.SphereGeometry(600, 32, 32);
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });
    this.earthMarker = new THREE.Mesh(earthGeo, earthMat);
    this.scene.add(this.earthMarker);

    const haloGeo = new THREE.RingGeometry(630, 780, 32);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xa5b4fc, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2;
    this.earthMarker.add(halo);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1000, 0)]);
    const lineMat = new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 300, gapSize: 150, linewidth: 2 });
    this.earthRay = new THREE.Line(lineGeo, lineMat);
    this.earthRay.computeLineDistances();
    this.scene.add(this.earthRay);
  }

  _buildMissionAssets() {
    const THREE = window.THREE;

    this.landerMesh = new THREE.Group();

    const bodyGeo = new THREE.CylinderGeometry(90, 130, 120, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 60;
    body.castShadow = true;
    this.landerMesh.add(body);

    const mastGeo = new THREE.CylinderGeometry(6, 6, 210, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x818cf8, metalness: 0.9, roughness: 0.1 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = 165;
    this.landerMesh.add(mast);

    const dishGeo = new THREE.SphereGeometry(35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(0, 270, 0);
    dish.rotation.x = -Math.PI / 3;
    this.landerMesh.add(dish);

    const footGeo = new THREE.RingGeometry(380, 440, 48);
    const footMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    this.footprintCircle = new THREE.Mesh(footGeo, footMat);
    this.footprintCircle.rotation.x = Math.PI / 2;
    this.footprintCircle.position.y = 2.0;
    this.landerMesh.add(this.footprintCircle);

    this.scene.add(this.landerMesh);

    const roverLineGeo = new THREE.BufferGeometry();
    const roverLineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 3 });
    this.roverPathLine = new THREE.Line(roverLineGeo, roverLineMat);
    this.scene.add(this.roverPathLine);

    this.updateSelectedSite();
  }

  _buildGeodeticGrid() {
    const THREE = window.THREE;
    const rimGeo = new THREE.BufferGeometry();
    const points = [];
    const rRim = 10500.0;
    for (let a = 0; a <= Math.PI * 2; a += Math.PI / 64) {
      points.push(new THREE.Vector3(rRim * Math.sin(a), 0, -rRim * Math.cos(a)));
    }
    rimGeo.setFromPoints(points);
    const rimMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.45 });
    const rimCircle = new THREE.Line(rimGeo, rimMat);
    this.scene.add(rimCircle);
  }

  _setupCanvasInteractions() {
    this.renderer.domElement.addEventListener('click', (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.terrainMesh);

      if (intersects.length > 0) {
        const pt = intersects[0].point;
        const xM = pt.x;
        const yM = -pt.z;
        const elevM = pt.y;
        const slopeInfo = this.terrain.getSlopeMultiBaseline(xM, yM);

        if (this.onInspect) {
          this.onInspect({
            xM: Math.round(xM),
            yM: Math.round(yM),
            elevationM: Math.round(elevM),
            slopeDeg: slopeInfo.slopeFootprint95thDeg,
            passes15Deg: slopeInfo.passes15DegVeto
          });
        }
        soundManager.playClick(1000, 0.02);
      }
    });
  }

  setShadingMode(mode) {
    if (!this.terrainMesh) return;
    this.shadingMode = mode;
    const THREE = window.THREE;

    if (mode === 'hypsometric') {
      this.terrainMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.vertexColorsHypso, 3));
      this.terrainMaterial.wireframe = false;
    } else if (mode === 'hillshade') {
      this.terrainMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.vertexColorsHillshade, 3));
      this.terrainMaterial.wireframe = false;
    } else if (mode === 'slope') {
      this.terrainMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.vertexColorsSlope, 3));
      this.terrainMaterial.wireframe = false;
    } else if (mode === 'wireframe') {
      this.terrainMesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.vertexColorsHypso, 3));
      this.terrainMaterial.wireframe = true;
    }
    this.terrainMesh.geometry.attributes.color.needsUpdate = true;
  }

  setCameraPreset(preset) {
    if (!this.camera || !this.controls) return;
    soundManager.playClick(1100, 0.03);

    const targetPos = this.landerMesh ? this.landerMesh.position : new THREE.Vector3(0, 500, 0);

    if (preset === 'overview') {
      this.camera.position.set(0, 16000, 24000);
      this.controls.target.set(0, 500, 0);
    } else if (preset === 'nadir') {
      this.camera.position.set(0, 32000, 0.1);
      this.controls.target.set(0, 0, 0);
    } else if (preset === 'site') {
      this.camera.position.set(targetPos.x + 2200, targetPos.y + 1400, targetPos.z + 2800);
      this.controls.target.copy(targetPos);
    } else if (preset === 'horizon') {
      this.camera.position.set(targetPos.x - 3200, targetPos.y + 450, targetPos.z + 2200);
      this.controls.target.set(targetPos.x, targetPos.y + 150, targetPos.z);
    }
    this.controls.update();
  }

  updateSelectedSite() {
    if (!this.landerMesh) return;
    const site = this.state.activeSite;
    const toRad = Math.PI / 180.0;
    const colatRad = (90.0 + site.lat) * toRad;
    const lonRad = site.lon * toRad;
    const rM = 2.0 * 1737400.0 * Math.tan(colatRad / 2.0);
    const xM = rM * Math.sin(lonRad);
    const yM = rM * Math.cos(lonRad);

    const elev = this.terrain.getElevation(xM, yM);
    this.landerMesh.position.set(xM, elev, -yM);

    if (this.footprintCircle) {
      const isVetoed = site.metrics.slopeFootprint95thDeg > 15.0;
      this.footprintCircle.material.color.setHex(isVetoed ? 0xef4444 : 0x10b981);
    }

    if (this.controls && this.shadingMode === 'site') {
      this.controls.target.set(xM, elev, -yM);
    }
  }

  updateEphemerisLighting() {
    if (!this.isThreeAvailable || !this.sunLight) return;
    const site = this.state.activeSite;
    const date = this.state.currentDate;

    const sunGeom = this.ephemeris.getSunPosition(site.lat, site.lon, date);
    const sunAzRad = (sunGeom.azimuthDeg * Math.PI) / 180.0;
    const sunElevRad = (sunGeom.elevationDeg * Math.PI) / 180.0;

    const sunDist = 45000.0;
    const sx = sunDist * Math.cos(sunElevRad) * Math.sin(sunAzRad);
    const sy = Math.max(600.0, sunDist * Math.sin(sunElevRad) + 1800.0);
    const sz = -sunDist * Math.cos(sunElevRad) * Math.cos(sunAzRad);

    this.sunLight.position.set(sx, sy, sz);

    if (this.earthMarker && this.earthRay) {
      const earthGeom = this.ephemeris.getEarthPosition(site.lat, site.lon, date);
      const earthAzRad = (earthGeom.azimuthDeg * Math.PI) / 180.0;
      const earthElevRad = (earthGeom.elevationDeg * Math.PI) / 180.0;
      const earthDist = 55000.0;

      const ex = earthDist * Math.cos(earthElevRad) * Math.sin(earthAzRad);
      const ey = earthDist * Math.sin(earthElevRad);
      const ez = -earthDist * Math.cos(earthElevRad) * Math.cos(earthAzRad);

      this.earthMarker.position.set(ex, ey, ez);

      const landerPos = this.landerMesh.position;
      const positions = new Float32Array([
        landerPos.x, landerPos.y + 120, landerPos.z,
        ex, ey, ez
      ]);
      this.earthRay.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.earthRay.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateRoverTrajectory(waypoints) {
    if (!this.roverPathLine || !waypoints || waypoints.length === 0) return;
    const THREE = window.THREE;
    const points = waypoints.map(w => new THREE.Vector3(w.xM, w.elevationM + 15.0, -w.yM));
    this.roverPathLine.geometry.setFromPoints(points);
    this.roverPathLine.geometry.needsUpdate = true;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _initFallbackRenderer() {
    const canvas = document.createElement('canvas');
    canvas.width = this.container.clientWidth || 800;
    canvas.height = this.container.clientHeight || 600;
    this.container.innerHTML = "";
    this.container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const renderIso = () => {
      ctx.fillStyle = "#070a12";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
      ctx.lineWidth = 1;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 100;
      const step = 8;
      const N = this.terrain.gridSize;

      for (let j = 0; j < N; j += step) {
        ctx.beginPath();
        for (let i = 0; i < N; i += step) {
          const idx = j * N + i;
          const z = this.terrain.elevationGrid[idx] * 0.04;
          const px = cx + (i - j) * 4.5;
          const py = cy + (i + j) * 2.2 - z;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.fillStyle = "#f8fafc";
      ctx.font = "13px Plus Jakarta Sans, sans-serif";
      ctx.fillText("LOLA DEM 3D Terrain Mesh (Canvas Backup)", 24, 32);
    };

    renderIso();
  }
}
