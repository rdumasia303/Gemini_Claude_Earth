import * as THREE from 'three';

/**
 * Stellarium: Bright star catalog with constellation lines and labels.
 * 100+ visible stars positioned by Right Ascension / Declination.
 * Major constellation wireframes drawn between named stars.
 */

// Convert RA (hours 0-24) and Dec (degrees -90 to +90) to 3D position
function raDecToVec3(ra, dec, radius) {
    const raRad = (ra / 24) * Math.PI * 2;
    const decRad = (dec * Math.PI) / 180;
    return new THREE.Vector3(
        -radius * Math.cos(decRad) * Math.cos(raRad),
        radius * Math.sin(decRad),
        radius * Math.cos(decRad) * Math.sin(raRad)
    );
}

// Brightest stars visible to the naked eye [name, RA(h), Dec(°), magnitude]
const STAR_CATALOG = [
    // Magnitude < 1 (brilliant)
    ['Sirius', 6.75, -16.72, -1.46], ['Canopus', 6.40, -52.70, -0.74],
    ['Arcturus', 14.26, 19.18, -0.05], ['Vega', 18.62, 38.78, 0.03],
    ['Capella', 5.28, 46.00, 0.08], ['Rigel', 5.24, -8.20, 0.13],
    ['Procyon', 7.65, 5.22, 0.34], ['Betelgeuse', 5.92, 7.41, 0.42],
    ['Achernar', 1.63, -57.24, 0.46], ['Beta Centauri', 14.06, -60.37, 0.61],
    ['Altair', 19.85, 8.87, 0.77], ['Aldebaran', 4.60, 16.51, 0.85],
    ['Antares', 16.49, -26.43, 0.96], ['Spica', 13.42, -11.16, 0.97],
    ['Pollux', 7.76, 28.03, 1.14],
    // Magnitude 1-2 (bright)
    ['Fomalhaut', 22.96, -29.62, 1.16], ['Deneb', 20.69, 45.28, 1.25],
    ['Regulus', 10.14, 11.97, 1.35], ['Castor', 7.58, 31.89, 1.58],
    ['Bellatrix', 5.42, 6.35, 1.64], ['Alnilam', 5.60, -1.20, 1.69],
    ['Polaris', 2.53, 89.26, 1.98], ['Alnitak', 5.68, -1.94, 1.77],
    ['Mintaka', 5.53, -0.30, 2.23], ['Saiph', 5.80, -9.67, 2.09],
    ['Shaula', 17.56, -37.10, 1.63], ['Dubhe', 11.06, 61.75, 1.79],
    ['Merak', 11.03, 56.38, 2.37], ['Alioth', 12.90, 55.96, 1.77],
    ['Mizar', 13.40, 54.93, 2.27], ['Alkaid', 13.79, 49.31, 1.86],
    ['Phecda', 11.90, 53.69, 2.44], ['Megrez', 12.26, 57.03, 3.31],
    // More notable stars
    ['Schedar', 0.68, 56.54, 2.23], ['Caph', 0.15, 59.15, 2.27],
    ['Gamma Cas', 0.95, 60.72, 2.47], ['Denebola', 11.82, 14.57, 2.14],
    ['Alphard', 9.46, -8.66, 1.98], ['Albireo', 19.51, 27.96, 3.08],
    ['Sadr', 20.37, 40.26, 2.23], ['Gienah', 20.77, 33.97, 2.48],
    ['Rasalhague', 17.58, 12.56, 2.08], ['Eltanin', 17.94, 51.49, 2.24],
    ['Thuban', 14.07, 64.38, 3.65], ['Kochab', 14.85, 74.16, 2.08],
    ['Hamal', 2.12, 23.46, 2.00], ['Alphecca', 15.58, 26.71, 2.23],
    ['Mirfak', 3.41, 49.86, 1.79], ['Algol', 3.14, 40.96, 2.12],
    ['Enif', 21.74, 9.88, 2.39], ['Markab', 23.08, 15.21, 2.49],
    ['Scheat', 23.06, 28.08, 2.42], ['Algenib', 0.22, 15.18, 2.83],
    ['Alpheratz', 0.14, 29.09, 2.06], ['Mirach', 1.16, 35.62, 2.05],
    ['Almach', 2.06, 42.33, 2.17], ['Diphda', 0.73, -17.99, 2.02],
    // Southern sky
    ['Acrux', 12.44, -63.10, 0.77], ['Mimosa', 12.80, -59.69, 1.25],
    ['Gacrux', 12.52, -57.11, 1.63], ['Peacock', 20.43, -56.74, 1.94],
    ['Atria', 16.81, -69.03, 1.92], ['Avior', 8.38, -59.51, 1.86],
    ['Miaplacidus', 9.22, -69.72, 1.68], ['Alnair', 22.14, -46.96, 1.74],
    ['Sargas', 17.62, -42.99, 1.87], ['Kaus Australis', 18.40, -34.38, 1.85],
    ['Nunki', 18.92, -26.30, 2.05], ['Naos', 8.06, -40.00, 2.25],
    // Extras for density
    ['Wezen', 7.14, -26.39, 1.84], ['Adhara', 6.98, -28.97, 1.50],
    ['Mirzam', 6.38, -17.96, 1.98], ['Alhena', 6.63, 16.40, 1.93],
    ['Elnath', 5.44, 28.61, 1.65], ['Menkalinan', 6.00, 44.95, 1.90],
    ['Dschubba', 16.01, -22.62, 2.32], ['Graffias', 16.09, -19.81, 2.62],
    ['Wei', 16.84, -34.29, 2.29],
    // Dim fill stars for visual density (~200 random positions)
];

// Constellation line connections [star1_name, star2_name]
const CONSTELLATIONS = {
    'Orion': [
        ['Betelgeuse', 'Bellatrix'], ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'],
        ['Alnilam', 'Alnitak'], ['Alnitak', 'Saiph'], ['Saiph', 'Rigel'],
        ['Rigel', 'Mintaka'], ['Betelgeuse', 'Alnitak']
    ],
    'Ursa Major': [
        ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'],
        ['Megrez', 'Alioth'], ['Alioth', 'Mizar'], ['Mizar', 'Alkaid'],
        ['Megrez', 'Dubhe']
    ],
    'Cassiopeia': [
        ['Schedar', 'Caph'], ['Schedar', 'Gamma Cas'],
        ['Gamma Cas', 'Schedar'] // W shape needs intermediate stars
    ],
    'Scorpius': [
        ['Antares', 'Dschubba'], ['Dschubba', 'Graffias'],
        ['Antares', 'Shaula'], ['Antares', 'Wei'], ['Wei', 'Sargas'],
        ['Sargas', 'Shaula']
    ],
    'Leo': [
        ['Regulus', 'Denebola'], ['Regulus', 'Alphard']
    ],
    'Summer Triangle': [
        ['Vega', 'Deneb'], ['Deneb', 'Altair'], ['Altair', 'Vega']
    ],
    'Southern Cross': [
        ['Acrux', 'Gacrux'], ['Mimosa', 'Gacrux']
    ],
    'Pegasus': [
        ['Markab', 'Scheat'], ['Scheat', 'Alpheratz'],
        ['Alpheratz', 'Algenib'], ['Algenib', 'Markab'], ['Scheat', 'Enif']
    ],
    'Andromeda': [
        ['Alpheratz', 'Mirach'], ['Mirach', 'Almach']
    ],
    'Perseus': [
        ['Mirfak', 'Algol']
    ],
    'Cygnus': [
        ['Deneb', 'Sadr'], ['Sadr', 'Albireo'], ['Sadr', 'Gienah']
    ]
};

export class Stellarium {
    constructor(scene) {
        this.scene = scene;
        this.radius = 70; // inside the milky way skybox (80)
        this.starMap = {};

        this.createStars();
        this.createRandomField();
        this.createConstellationLines();
        this.createStarLabels();
    }

    createStars() {
        const positions = [];
        const sizes = [];
        const colors = [];

        STAR_CATALOG.forEach(([name, ra, dec, mag]) => {
            const pos = raDecToVec3(ra, dec, this.radius);
            this.starMap[name] = pos.clone();
            positions.push(pos.x, pos.y, pos.z);

            // Brighter stars = larger points + warmer color
            const brightness = Math.max(0.3, 1.0 - mag * 0.25);
            sizes.push(brightness * 3.0);

            // Stars have subtle color variation
            if (mag < 0) {
                colors.push(0.9, 0.95, 1.0); // Blue-white (brightest)
            } else if (mag < 1.0) {
                colors.push(1.0, 0.98, 0.9); // Warm white
            } else {
                colors.push(0.95, 0.9, 0.85); // Slightly amber
            }
        });

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.5,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });

        this.scene.add(new THREE.Points(geo, mat));
    }

    createRandomField() {
        // ~2000 dim random stars for visual density
        const positions = [];
        const sizes = [];
        const colors = [];

        for (let i = 0; i < 2000; i++) {
            // Uniform distribution on sphere
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const r = this.radius + (Math.random() - 0.5) * 5;

            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta)
            );

            const mag = 2.5 + Math.random() * 3; // dim stars
            const brightness = Math.max(0.1, 1.0 - mag * 0.2);
            sizes.push(brightness * 1.5);
            colors.push(0.9, 0.9, 0.95);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.15,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });

        this.scene.add(new THREE.Points(geo, mat));
    }

    createConstellationLines() {
        Object.entries(CONSTELLATIONS).forEach(([name, lines]) => {
            const points = [];

            lines.forEach(([from, to]) => {
                const fromPos = this.starMap[from];
                const toPos = this.starMap[to];
                if (fromPos && toPos) {
                    points.push(fromPos.clone(), toPos.clone());
                }
            });

            if (points.length > 0) {
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                const mat = new THREE.LineBasicMaterial({
                    color: 0x334466,
                    transparent: true,
                    opacity: 0.25
                });
                this.scene.add(new THREE.LineSegments(geo, mat));
            }
        });
    }

    createStarLabels() {
        // Only label the brightest 20 stars
        const container = document.getElementById('star-labels');
        if (!container) return;

        this.starLabels = [];
        const labelStars = STAR_CATALOG.filter(s => s[3] < 1.0);

        labelStars.forEach(([name, ra, dec]) => {
            const div = document.createElement('div');
            div.className = 'star-label';
            div.textContent = name;
            container.appendChild(div);

            const pos = raDecToVec3(ra, dec, this.radius);
            this.starLabels.push({ el: div, pos: pos });
        });
    }

    updateLabels(camera) {
        if (!this.starLabels) return;

        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;
        const dist = camera.position.length();
        const tempVec = new THREE.Vector3();

        // Only show star labels when zoomed out enough
        const showStars = dist > 4;

        this.starLabels.forEach(s => {
            if (!showStars) {
                s.el.style.display = 'none';
                return;
            }

            tempVec.copy(s.pos);
            tempVec.project(camera);

            if (tempVec.z > 1) {
                s.el.style.display = 'none';
                return;
            }

            s.el.style.display = 'block';
            const sx = (tempVec.x * widthHalf) + widthHalf;
            const sy = -(tempVec.y * heightHalf) + heightHalf;
            s.el.style.left = sx + 'px';
            s.el.style.top = sy + 'px';
        });
    }
}
