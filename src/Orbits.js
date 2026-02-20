import * as THREE from 'three';

/**
 * Earth orbital environment: Moon, ISS, and satellite constellation.
 * All objects orbit in earth-local space (children of the scene, rotate with it).
 */

const SAT_CONFIGS = [
    { inc: 0.35, speed: 3.5, color: 0xffff00, alt: 1.03 },
    { inc: 0.80, speed: 2.8, color: 0xff8800, alt: 1.04 },
    { inc: 0.10, speed: 2.2, color: 0x00ffff, alt: 1.05 },
    { inc: 0.60, speed: 1.5, color: 0xff00ff, alt: 1.08 },
    { inc: 0.05, speed: 0.8, color: 0xffffff, alt: 1.15 },
    { inc: 0.98, speed: 3.0, color: 0x88ff88, alt: 1.03 },
    { inc: 0.45, speed: 2.5, color: 0xff4444, alt: 1.04 },
    { inc: 0.70, speed: 1.8, color: 0x4488ff, alt: 1.06 },
    { inc: 0.52, speed: 2.0, color: 0xffaa00, alt: 1.07 },
    { inc: 0.30, speed: 3.2, color: 0x00ff88, alt: 1.03 },
];

export class EarthOrbits {
    constructor(scene) {
        this.scene = scene;
        this.satellites = [];
        this.moonMesh = null;
        this.issMesh = null;
        this.issTrailPoints = [];
        this.issTrailLine = null;

        this.createMoon();
        this.createISS();
        this.createSatellites();
    }

    createMoon() {
        const texLoader = new THREE.TextureLoader();
        const moonGeo = new THREE.SphereGeometry(0.27, 64, 64);

        // Try to load moon texture, fall back to grey
        texLoader.load('/textures/moon_8k.jpg',
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                const mat = new THREE.MeshStandardMaterial({
                    map: tex,
                    roughness: 1.0,
                    metalness: 0.0
                });
                this.moonMesh = new THREE.Mesh(moonGeo, mat);
                this.scene.add(this.moonMesh);
            },
            undefined,
            () => {
                // Fallback: plain grey moon
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x999999,
                    roughness: 1.0,
                    metalness: 0.0,
                    emissive: 0x111111
                });
                this.moonMesh = new THREE.Mesh(moonGeo, mat);
                this.scene.add(this.moonMesh);
            }
        );
    }

    createISS() {
        // ISS: bright green dot, 51.6° inclination, low orbit
        const geo = new THREE.SphereGeometry(0.012, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.issMesh = new THREE.Mesh(geo, mat);
        this.scene.add(this.issMesh);

        // ISS orbit trail
        const trailGeo = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(300 * 3); // 300 points
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        const trailMat = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3
        });
        this.issTrailLine = new THREE.Line(trailGeo, trailMat);
        this.scene.add(this.issTrailLine);
    }

    createSatellites() {
        SAT_CONFIGS.forEach(cfg => {
            const geo = new THREE.SphereGeometry(0.005, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: cfg.color });
            const mesh = new THREE.Mesh(geo, mat);
            this.scene.add(mesh);

            this.satellites.push({
                mesh,
                alt: cfg.alt,
                inc: cfg.inc,
                speed: cfg.speed,
                startAngle: Math.random() * Math.PI * 2,
                raan: Math.random() * Math.PI * 2
            });
        });
    }

    update(elapsed) {
        // Moon: orbits at ~3.5 units, slow period, tidally locked
        if (this.moonMesh) {
            const moonAngle = elapsed * 0.05;
            const moonDist = 3.5;
            const moonInc = 0.09; // ~5° inclination
            this.moonMesh.position.set(
                Math.cos(moonAngle) * moonDist,
                Math.sin(moonInc) * Math.sin(moonAngle) * moonDist,
                Math.sin(moonAngle) * moonDist
            );
            this.moonMesh.rotation.y = moonAngle;
        }

        // ISS: 51.6° inclination, altitude 1.06, fast orbit
        const issAngle = elapsed * 2.0;
        const issAlt = 1.06;
        const issInc = 51.6 * Math.PI / 180;
        const x = Math.cos(issAngle) * issAlt;
        const z = Math.sin(issAngle) * issAlt;
        const issY = z * Math.sin(issInc);
        const issZ = z * Math.cos(issInc);
        this.issMesh.position.set(x, issY, issZ);

        // Update ISS trail
        if (this.issTrailLine) {
            const positions = this.issTrailLine.geometry.attributes.position.array;
            const trailLen = 300;
            for (let i = 0; i < trailLen; i++) {
                const t = elapsed - (i * 0.02);
                const a = t * 2.0;
                const tx = Math.cos(a) * issAlt;
                const tz = Math.sin(a) * issAlt;
                positions[i * 3] = tx;
                positions[i * 3 + 1] = tz * Math.sin(issInc);
                positions[i * 3 + 2] = tz * Math.cos(issInc);
            }
            this.issTrailLine.geometry.attributes.position.needsUpdate = true;
        }

        // Satellites: various orbits with proper inclination and RAAN
        this.satellites.forEach(s => {
            const angle = s.startAngle + elapsed * s.speed;
            const sx = Math.cos(angle) * s.alt;
            const sz = Math.sin(angle) * s.alt;
            const cosI = Math.cos(s.inc);
            const sinI = Math.sin(s.inc);
            const cosR = Math.cos(s.raan);
            const sinR = Math.sin(s.raan);

            s.mesh.position.set(
                sx * cosR - sz * sinR * cosI,
                sz * sinI,
                sx * sinR + sz * cosR * cosI
            );
        });
    }
}
