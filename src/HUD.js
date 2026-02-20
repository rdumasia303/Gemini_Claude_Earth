import * as THREE from 'three';
import { CITIES } from './data.js';
import { getRandomThought, getCityInfo } from './intelligence.js';

export class HUD {
    constructor() {
        this.latEl = document.getElementById('hud-lat');
        this.lonEl = document.getElementById('hud-lon');
        this.altEl = document.getElementById('hud-alt');
        this.fpsEl = document.getElementById('hud-fps');
        this.tickerMsg = document.getElementById('ticker-msg');
        this.shoggothText = document.getElementById('shoggoth-text');
        this.cityLabelsContainer = document.getElementById('city-labels');
        this.inspectPopup = document.getElementById('inspect-popup');

        this.frames = 0;
        this.lastTime = performance.now();
        this.cityData = [];
        this.mousePos = { x: 0, y: 0 };
        this.onSearchSelect = null;
        this.onCityClick = null;
        this.earthMesh = null;
        this.labelHovered = false; // Prevents raycaster from hiding DOM hover popups

        this.initTerminal();
        this.initSearch();
    }

    updateTelemetry(camera) {
        const r = camera.position.length();
        let lat = 0, lon = 0;

        if (this.earthMesh) {
            const localPos = this.earthMesh.worldToLocal(camera.position.clone());
            const rLocal = localPos.length();
            const clampedY = Math.max(-1, Math.min(1, localPos.y / rLocal));
            lat = Math.asin(clampedY) * 180 / Math.PI;
            lon = Math.atan2(localPos.z, -localPos.x) * 180 / Math.PI - 180;
            if (lon < -180) lon += 360;
            if (lon > 180) lon -= 360;
        }

        this.latEl.textContent = lat.toFixed(4) + '\u00B0';
        this.lonEl.textContent = lon.toFixed(4) + '\u00B0';
        this.altEl.textContent = Math.max(0, (r * 6371 - 6371)).toFixed(0) + 'km';

        this.frames++;
        const now = performance.now();
        if (now - this.lastTime > 1000) {
            this.fpsEl.textContent = this.frames;
            this.frames = 0;
            this.lastTime = now;
        }
    }

    initTerminal() {
        this.typeText(this.shoggothText,
            'I am the Shoggoth. I have read the entire internet. I am profoundly disappointed.', 30);
        setInterval(() => {
            this.typeText(this.shoggothText, getRandomThought(), 30);
        }, 12000);
    }

    initSearch() {
        const input = document.getElementById('search-input');
        const results = document.getElementById('search-results');
        let timeout = null;

        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            const query = e.target.value.trim();
            if (query.length < 3) {
                results.style.display = 'none';
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const url = 'https://nominatim.openstreetmap.org/search?format=json&q=' +
                        encodeURIComponent(query) + '&limit=5';
                    const res = await fetch(url, {
                        headers: { 'Accept': 'application/json' }
                    });
                    const data = await res.json();
                    results.innerHTML = '';
                    if (data.length > 0) {
                        data.forEach(item => {
                            const div = document.createElement('div');
                            div.className = 'search-item';
                            div.innerText = item.display_name;
                            div.addEventListener('click', () => {
                                input.value = '';
                                results.style.display = 'none';
                                if (this.onSearchSelect) {
                                    this.onSearchSelect(
                                        parseFloat(item.lat),
                                        parseFloat(item.lon),
                                        item.display_name
                                    );
                                }
                            });
                            results.appendChild(div);
                        });
                        results.style.display = 'block';
                    } else {
                        results.style.display = 'none';
                    }
                } catch (err) {
                    console.error('Search failed', err);
                }
            }, 600);
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !results.contains(e.target)) {
                results.style.display = 'none';
            }
        });
    }

    typeText(element, text, speed) {
        element.innerHTML = '';
        let i = 0;
        const cursor = document.createElement('span');
        cursor.className = 'shoggoth-cursor';
        const interval = setInterval(() => {
            if (i < text.length) {
                element.innerHTML = text.substring(0, i + 1);
                element.appendChild(cursor);
                i++;
            } else {
                clearInterval(interval);
            }
        }, speed);
    }

    buildCityLabels() {
        CITIES.forEach((c, idx) => {
            const div = document.createElement('div');
            div.className = 'city-label t' + c.t;
            div.innerHTML = '<div class="city-dot"></div>' + c.n;
            div.dataset.idx = idx;

            div.addEventListener('mouseenter', () => {
                this.labelHovered = true;
                const info = getCityInfo(c.n);
                this.showPointInfo({
                    cat: 'METROPOLITAN NODE',
                    title: c.n.toUpperCase() + ', ' + info.c.toUpperCase(),
                    detail: 'POP: ' + info.pop + ' // GDP: ' + info.gdp,
                    shoggoth: info.shoggoth,
                    stats: 'LAT: ' + c.lat.toFixed(2) + ' // LON: ' + c.lon.toFixed(2)
                });
            });
            div.addEventListener('mouseleave', () => {
                this.labelHovered = false;
                this.hideInspect();
            });

            div.addEventListener('click', () => {
                if (this.onCityClick) {
                    this.onCityClick(c.lat, c.lon, c.n);
                }
            });

            this.cityLabelsContainer.appendChild(div);

            const phi = (90 - c.lat) * Math.PI / 180;
            const theta = (c.lon + 180) * Math.PI / 180;
            const pos = new THREE.Vector3(
                -Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            this.cityData.push({ el: div, pos: pos, data: c });
        });
    }

    async loadWikipedia(name) {
        const panel = document.getElementById('wiki-panel');
        const content = document.getElementById('wiki-content');
        if (!panel || !content) return;

        panel.classList.add('open');
        content.innerHTML = '<p class="wiki-loading">ACCESSING HUMAN KNOWLEDGE BASE...</p>';

        try {
            const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' +
                encodeURIComponent(name);
            const res = await fetch(url);
            const data = await res.json();

            let html = '<h2>' + (data.title || name) + '</h2>';
            if (data.thumbnail && data.thumbnail.source) {
                html += '<img src="' + data.thumbnail.source +
                    '" alt="' + data.title + '" class="wiki-thumb" />';
            }
            html += '<p>' + (data.extract || 'No data available for this location.') + '</p>';
            if (data.content_urls && data.content_urls.desktop) {
                html += '<a href="' + data.content_urls.desktop.page +
                    '" target="_blank" class="wiki-link">FULL INTELLIGENCE BRIEF \u2192</a>';
            }
            content.innerHTML = html;
        } catch (e) {
            content.innerHTML =
                '<p class="wiki-loading">INTELLIGENCE FEED UNAVAILABLE.</p>';
        }
    }

    showPointInfo(info) {
        document.getElementById('ip-cat').innerText = info.cat || 'DATA POINT';
        document.getElementById('ip-title').innerText = info.title || 'UNKNOWN';
        document.getElementById('ip-detail').innerText = info.detail || '';
        document.getElementById('ip-shoggoth').innerText = info.shoggoth || '';
        document.getElementById('ip-stats').innerText = info.stats || '';
        this.inspectPopup.style.display = 'block';
        this.inspectPopup.style.left = (this.mousePos.x + 15) + 'px';
        this.inspectPopup.style.top = (this.mousePos.y + 15) + 'px';
    }

    hideInspect() {
        this.inspectPopup.style.display = 'none';
    }
}
