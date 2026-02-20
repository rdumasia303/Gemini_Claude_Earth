import * as THREE from 'three';
import { NUCLEAR_SITES, CONFLICT_ZONES, CABLES, FLIGHT_ROUTES, SEISMIC_ZONES, POP_CENTERS } from './data.js';

const R = 1.0;

function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

function getArcPoints(lat1, lon1, lat2, lon2, segments = 32) {
    const v1 = latLonToVec3(lat1, lon1, 1).normalize();
    const v2 = latLonToVec3(lat2, lon2, 1).normalize();
    const angle = Math.acos(Math.min(1, Math.max(-1, v1.dot(v2))));
    const pts = [];
    if (angle < 0.001) return [v1.clone().multiplyScalar(R * 1.003)];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const sinA = Math.sin(angle);
        const w1 = Math.sin((1 - t) * angle) / sinA;
        const w2 = Math.sin(t * angle) / sinA;
        const p = v1.clone().multiplyScalar(w1).add(v2.clone().multiplyScalar(w2));
        const arcH = Math.sin(t * Math.PI) * 0.05 * angle;
        pts.push(p.multiplyScalar(R * 1.002 + arcH));
    }
    return pts;
}

export class LayerManager {
    constructor(scene) {
        this.scene = scene;
        this.layers = {};
        this.active = {};
        this.createLayers();
    }

    createPointLayer(dataArr, color, size, opacity, isInteractable) {
        const geo = new THREE.BufferGeometry();
        const pos = [];
        const dataRefs = [];

        dataArr.forEach(s => {
            const v = latLonToVec3(s.lat, s.lon, R * 1.008);
            pos.push(v.x, v.y, v.z);
            dataRefs.push({
                cat: s.cat || 'DATA POINT',
                title: s.n || s.title || 'Unknown',
                detail: s.note || s.detail || '',
                stats: `LAT ${s.lat.toFixed(2)} // LON ${s.lon.toFixed(2)}`,
                shoggoth: s.shoggoth || 'More activity on the crust.'
            });
        });

        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({
            color, size, transparent: true, opacity,
            sizeAttenuation: true,
            depthTest: true,
            depthWrite: false
        });
        const points = new THREE.Points(geo, mat);
        if (isInteractable) {
            points.userData = { isInteractable: true, dataArray: dataRefs };
        }
        return points;
    }

    createLayers() {
        this.layers['nuclear'] = this.createPointLayer(NUCLEAR_SITES.map(s => ({
            ...s, cat: 'NUCLEAR SITE', detail: `Detonated: ${s.yr} | Tests: ${s.tests}`, shoggoth: s.note
        })), 0xff003c, 0.015, 0.9, true);

        this.layers['conflicts'] = this.createPointLayer(CONFLICT_ZONES.map(s => ({
            ...s, cat: 'CONFLICT ZONE', detail: `Severity: ${s.sev}`, shoggoth: s.note
        })), 0xff3c00, 0.02, 0.8, true);

        const cableGroup = new THREE.Group();
        const cableMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
        CABLES.forEach(c => {
            const pts = getArcPoints(c.from[0], c.from[1], c.to[0], c.to[1]);
            cableGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
        });
        this.layers['cables'] = cableGroup;

        const flightGroup = new THREE.Group();
        const flightMat = new THREE.LineBasicMaterial({ color: 0x00ff80, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
        FLIGHT_ROUTES.forEach(f => {
            const pts = getArcPoints(f.from[0], f.from[1], f.to[0], f.to[1]);
            flightGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), flightMat));
        });
        this.layers['flights'] = flightGroup;

        this.layers['seismic'] = this.createPointLayer(SEISMIC_ZONES.map(s => ({
            ...s, n: 'FAULT LINE', cat: 'SEISMIC RISK', detail: `Magnitude Potential: ${s.mag}`,
            shoggoth: 'The earth waiting to shrug off the parasites.'
        })), 0xffa500, 0.03, 0.9, true);

        // Key matches data-layer="population" in HTML
        this.layers['population'] = this.createPointLayer(POP_CENTERS.map(s => ({
            ...s, cat: 'POPULATION HUB',
            detail: `Density Factor: ${s.d}`,
            shoggoth: 'Swarming biological vectors converting carbon into anxiety and waste heat.'
        })), 0xff00ff, 0.008, 0.5, true);
    }

    async loadUSGSQuakes() {
        if (this.layers['livequakes']) return;
        try {
            document.getElementById('ticker-msg').innerText = 'FETCHING LIVE USGS SEISMIC FEED...';
            const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
            const data = await res.json();
            const quakes = data.features.map(f => {
                const coords = f.geometry.coordinates;
                return {
                    lon: coords[0], lat: coords[1],
                    n: f.properties.place, cat: 'LIVE QUAKE',
                    detail: `Magnitude: ${f.properties.mag} | Depth: ${coords[2]}km`,
                    shoggoth: 'Tectonic plates shifting. Everything you build will eventually fall down.'
                };
            });
            this.layers['livequakes'] = this.createPointLayer(quakes, 0xffeb3b, 0.02, 1.0, true);
            if (this.active['livequakes']) this.scene.add(this.layers['livequakes']);
            document.getElementById('ticker-msg').innerText = `LOADED ${quakes.length} LIVE SEISMIC EVENTS.`;
        } catch (e) {
            console.error(e);
            document.getElementById('ticker-msg').innerText = 'FAILED TO FETCH SEISMIC FEED.';
        }
    }

    async loadEONETEvents() {
        if (this.layers['liveevents']) return;
        try {
            document.getElementById('ticker-msg').innerText = 'FETCHING NASA EONET EVENTS...';
            const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=10');
            const data = await res.json();
            const events = [];
            data.events.forEach(e => {
                if (e.geometry && e.geometry.length > 0) {
                    const coords = e.geometry[0].coordinates;
                    if (Array.isArray(coords) && coords.length === 2 && !Array.isArray(coords[0])) {
                        events.push({
                            lon: coords[0], lat: coords[1],
                            n: e.title, cat: 'LIVE DISASTER',
                            detail: e.categories.map(c => c.title).join(', '),
                            shoggoth: 'Nature aggressively rejecting human habitation. Beautiful.'
                        });
                    }
                }
            });
            this.layers['liveevents'] = this.createPointLayer(events, 0xff00ff, 0.025, 0.9, true);
            if (this.active['liveevents']) this.scene.add(this.layers['liveevents']);
            document.getElementById('ticker-msg').innerText = `LOADED ${events.length} ACTIVE CLIMATE EVENTS.`;
        } catch (e) {
            console.error(e);
            document.getElementById('ticker-msg').innerText = 'FAILED TO FETCH EONET FEED.';
        }
    }

    toggleLayer(name, buttonElement) {
        this.active[name] = !this.active[name];
        if (this.active[name]) {
            if (this.layers[name]) this.scene.add(this.layers[name]);
            if (buttonElement) buttonElement.classList.add('on');
        } else {
            if (this.layers[name]) this.scene.remove(this.layers[name]);
            if (buttonElement) buttonElement.classList.remove('on');
        }
    }
}
