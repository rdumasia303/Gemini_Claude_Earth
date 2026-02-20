import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { createGlobe } from './Globe.js';
import { LayerManager } from './Layers.js';
import { HUD } from './HUD.js';
import { SolarSystem } from './SolarSystem.js';
import { EarthOrbits } from './Orbits.js';
import { Stellarium } from './Stars.js';

const clock = new THREE.Timer();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObject = null;

function latLonToVec3(lat, lon, r) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

async function init() {
  const loader = document.getElementById('loader');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.rotation.y = -Math.PI / 2;

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 0, 3.5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.getElementById('app').appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x222233, 0.3));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1.15; // Clear terrain displacement + atmosphere
  controls.maxDistance = 80;

  // Precision for hover detection on overlay points
  raycaster.params.Points.threshold = 0.03;

  // Bloom — uses half-resolution render targets to prevent GPU memory pressure
  // which was causing black-frame flicker on full-res targets
  const halfW = Math.floor(window.innerWidth / 2);
  const halfH = Math.floor(window.innerHeight / 2);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(halfW, halfH), 0.25, 0.3, 0.95
  );
  bloomPass.enabled = false; // Default OFF — press B to enable
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const hud = new HUD();
  const layerManager = new LayerManager(scene);
  const globe = await createGlobe(scene);
  const solarSystem = new SolarSystem(scene, globe.sunDir.clone().multiplyScalar(20));
  const earthOrbits = new EarthOrbits(scene);
  const stars = new Stellarium(scene);

  hud.earthMesh = globe.earth;
  hud.buildCityLabels();

  let targetCamPos = null;
  let flyProgress = 0;
  let startCamPos = new THREE.Vector3();

  function flyToLatLon(lat, lon, name) {
    document.getElementById('ticker-msg').innerText =
      'ACQUIRING TARGET: ' + name.toUpperCase();

    const localTarget = latLonToVec3(lat, lon, 1.5);
    targetCamPos = localTarget.applyMatrix4(globe.earth.matrixWorld);
    startCamPos.copy(camera.position);
    flyProgress = 0;
    controls.enabled = false;

    const pingGeo = new THREE.SphereGeometry(0.012, 16, 16);
    const pingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const ping = new THREE.Mesh(pingGeo, pingMat);
    ping.position.copy(latLonToVec3(lat, lon, 1.002));
    globe.earth.add(ping);
    setTimeout(() => {
      globe.earth.remove(ping);
      pingGeo.dispose();
      pingMat.dispose();
    }, 5000);
  }

  hud.onSearchSelect = (lat, lon, name) => {
    flyToLatLon(lat, lon, name);
    // Extract the city/place name (first part before comma)
    const shortName = name.split(',')[0].trim();
    hud.loadWikipedia(shortName);
  };
  hud.onCityClick = (lat, lon, name) => {
    flyToLatLon(lat, lon, name);
    hud.loadWikipedia(name);
  };

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const layer = e.target.dataset.layer;
      layerManager.toggleLayer(layer, e.target);
      if (layer === 'livequakes') layerManager.loadUSGSQuakes();
      if (layer === 'liveevents') layerManager.loadEONETEvents();
    });
  });

  const wikiClose = document.getElementById('wiki-close');
  if (wikiClose) {
    wikiClose.addEventListener('click', () => {
      document.getElementById('wiki-panel').classList.remove('open');
    });
  }

  // ISS telemetry (position data for the HUD)
  async function updateISS() {
    try {
      // wheretheiss.at is HTTPS + CORS-friendly (open-notify is HTTP-only, blocked by browsers on HTTPS)
      const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
      const data = await res.json();
      if (data.latitude !== undefined) {
        const lat = parseFloat(data.latitude);
        const lon = parseFloat(data.longitude);
        const issLatEl = document.getElementById('iss-lat');
        const issLonEl = document.getElementById('iss-lon');
        if (issLatEl) issLatEl.textContent = lat.toFixed(2) + '\u00B0';
        if (issLonEl) issLonEl.textContent = lon.toFixed(2) + '\u00B0';
      }
    } catch (e) { /* ISS API may be unavailable */ }
  }
  updateISS();
  setInterval(updateISS, 10000);

  // ISS crew count (single call, delayed to avoid 429 rate limit)
  setTimeout(async () => {
    try {
      const res = await fetch('https://api.open-notify.org/astros.json');
      const data = await res.json();
      const crewEl = document.getElementById('iss-crew');
      if (crewEl && data.number) {
        crewEl.textContent = data.number + ' aboard';
      }
    } catch (e) { }
  }, 5000);

  // World Pulse: live-ish population counter (4.4 net births/sec globally)
  let worldPop = 8189700000;
  const popEl = document.getElementById('wp-pop');
  setInterval(() => {
    worldPop += Math.round(4.4 + Math.random() * 0.6);
    if (popEl) popEl.textContent = worldPop.toLocaleString();
  }, 1000);

  loader.classList.add('hidden');
  document.getElementById('hud').classList.add('visible');

  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    hud.mousePos = { x: e.clientX, y: e.clientY };
  });

  const _camDir = new THREE.Vector3();
  const _tempVec = new THREE.Vector3();

  // ═══ DIAGNOSTIC TOGGLES — press keys to toggle scene components ═══
  const diag = {
    bloom: false,      // B — toggle bloom (default OFF to avoid flicker)
    aurora: true,      // A — toggle aurora
    atmosphere: true,  // T — toggle atmosphere
    orbits: true,      // O — toggle moon/ISS/satellites
    solar: true,       // S — toggle solar system (planets/rings)
    labels: true,      // L — toggle city labels
    stars: true,       // R — toggle star labels
    raycaster: true,   // X — toggle raycaster (hover detection)
  };

  // Overlay showing toggle states
  const diagOverlay = document.createElement('div');
  diagOverlay.id = 'diag-overlay';
  diagOverlay.style.cssText = `
    position:fixed; top:50%; left:20px; transform:translateY(-50%); z-index:9999;
    background:rgba(0,0,0,0.85); color:#40c0ff; font:10px/1.6 'JetBrains Mono',monospace;
    padding:8px 12px; border:1px solid rgba(64,192,255,0.3); border-radius:4px;
    pointer-events:none;
  `;
  document.body.appendChild(diagOverlay);
  updateDiagOverlay(); // Show on load

  function updateDiagOverlay() {
    const labels = { bloom: 'B', aurora: 'A', atmosphere: 'T', orbits: 'O', solar: 'S', labels: 'L', stars: 'R', raycaster: 'X' };
    diagOverlay.innerHTML = Object.entries(diag)
      .map(([k, v]) => `<span style="color:${v ? '#30ffb0' : '#ff4040'}">[${labels[k]}] ${k}: ${v ? 'ON' : 'OFF'}</span>`)
      .join('<br>');
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    let changed = false;

    if (key === 'b') { diag.bloom = !diag.bloom; bloomPass.enabled = diag.bloom; changed = true; }
    if (key === 'a') { diag.aurora = !diag.aurora; globe.aurora.visible = diag.aurora; changed = true; }
    if (key === 't') { diag.atmosphere = !diag.atmosphere; globe.atmosphere.visible = diag.atmosphere; changed = true; }
    if (key === 'o') { diag.orbits = !diag.orbits; changed = true; }
    if (key === 's') { diag.solar = !diag.solar; changed = true; }
    if (key === 'l') { diag.labels = !diag.labels; changed = true; }
    if (key === 'r') { diag.stars = !diag.stars; changed = true; }
    if (key === 'x') { diag.raycaster = !diag.raycaster; changed = true; }

    // Toggle solar system visibility
    if (key === 's') {
      solarSystem.planets.forEach(p => p.mesh.visible = diag.solar);
    }
    // Toggle orbit objects visibility
    if (key === 'o') {
      if (earthOrbits.moonMesh) earthOrbits.moonMesh.visible = diag.orbits;
      if (earthOrbits.issMesh) earthOrbits.issMesh.visible = diag.orbits;
      if (earthOrbits.issTrailLine) earthOrbits.issTrailLine.visible = diag.orbits;
      earthOrbits.satellites.forEach(s => s.mesh.visible = diag.orbits);
    }

    if (changed) {
      updateDiagOverlay();
      console.log('[DIAG]', JSON.stringify(diag));
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    clock.update();
    const delta = clock.getDelta();
    const elapsed = clock.getElapsed();
    const dist = camera.position.length();

    if (globe.uniforms) globe.uniforms.uCloudOff.value -= delta * 0.002;
    if (globe.aurora && diag.aurora) globe.aurora.material.uniforms.uTime.value = elapsed;
    if (diag.solar) solarSystem.update(elapsed);
    if (diag.orbits) earthOrbits.update(elapsed);

    // Dynamic bloom: gentle when enabled
    if (diag.bloom) {
      const bloomStrength = THREE.MathUtils.lerp(0.06, 0.25, THREE.MathUtils.smoothstep(dist, 1.5, 4.0));
      bloomPass.strength = bloomStrength;
    }

    if (!targetCamPos) {
      controls.enabled = true;
      controls.update();
      scene.rotation.y += delta * 0.02;
    } else {
      flyProgress += delta * 1.2;
      if (flyProgress >= 1.0) {
        targetCamPos = null;
        controls.enabled = true;
        controls.update();
      } else {
        const ease = 1 - Math.pow(1 - flyProgress, 3);
        camera.position.lerpVectors(startCamPos, targetCamPos, ease);
        camera.lookAt(0, 0, 0);
      }
    }

    // --- CRITICAL: freshen ALL matrices before projection/raycasting ---
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // Sync Earth's custom shader lighting direction with the rotatin Sun's world position
    if (globe.sunMesh && globe.uniforms.uSunDir) {
      globe.sunMesh.getWorldPosition(_tempVec).normalize();
      globe.uniforms.uSunDir.value.copy(_tempVec);
    }

    hud.updateTelemetry(camera);
    if (diag.stars) stars.updateLabels(camera);

    // Raycaster — skip if disabled for performance testing
    if (diag.raycaster) {
      raycaster.setFromCamera(mouse, camera);
      const targets = [globe.earth];
      scene.children.forEach(obj => {
        if (obj.isPoints) targets.push(obj);
      });
      const intersects = raycaster.intersectObjects(targets, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object !== globe.earth &&
          hit.object !== globe.atmosphere &&
          hit.object !== globe.aurora) {
          document.body.style.cursor = 'crosshair';
          if (hit.index !== undefined &&
            hit.object.userData &&
            hit.object.userData.dataArray) {
            const dataItem = hit.object.userData.dataArray[hit.index];
            if (hoveredObject !== dataItem) {
              hud.showPointInfo(dataItem);
              hoveredObject = dataItem;
            }
          }
        } else if (!hud.labelHovered) {
          document.body.style.cursor = 'default';
          hud.hideInspect();
          hoveredObject = null;
        }
      } else if (!hud.labelHovered) {
        document.body.style.cursor = 'default';
        hud.hideInspect();
        hoveredObject = null;
      }
    }

    // City Labels — dynamic tier visibility based on zoom
    if (diag.labels) {
      const widthHalf = window.innerWidth / 2;
      const heightHalf = window.innerHeight / 2;
      _camDir.copy(camera.position).normalize();

      let limit = 4;
      if (dist > 10) limit = 0;
      else if (dist > 3.0) limit = 1;
      else if (dist > 2.0) limit = 2;
      else if (dist > 1.5) limit = 3;

      hud.cityData.forEach(c => {
        if (c.data.t > limit) {
          c.el.style.display = 'none';
          return;
        }

        _tempVec.copy(c.pos);
        _tempVec.applyMatrix4(globe.earth.matrixWorld);

        const dot = _tempVec.normalize().dot(_camDir);
        if (dot < 0.15) {
          c.el.style.display = 'none';
          return;
        }

        c.el.style.display = 'flex';
        _tempVec.project(camera);

        const sx = (_tempVec.x * widthHalf) + widthHalf;
        const sy = -(_tempVec.y * heightHalf) + heightHalf;
        c.el.style.left = sx + 'px';
        c.el.style.top = sy + 'px';
      });
    } else {
      // Hide all labels when diagnostics disabled
      hud.cityData.forEach(c => c.el.style.display = 'none');
    }

    // When bloom is OFF, bypass EffectComposer entirely for richer, darker render
    if (diag.bloom) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

init().catch(err => {
  console.error(err);
  document.getElementById('load-status').innerText =
    'FATAL SYSTEM ERROR: ' + err.message;
});
