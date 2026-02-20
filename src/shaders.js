export const EarthVert = `
uniform sampler2D uHeightMap;
uniform float uDisplaceScale;
uniform float uDisplaceBias;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vElevation;

void main() {
    vUv = uv;

    float h = texture2D(uHeightMap, uv).r;
    vElevation = h;

    float disp = (h - uDisplaceBias) * uDisplaceScale;
    vec3 displaced = position + normal * disp;

    // perturbed normal from heightmap gradients
    float tw = 1.0 / 2048.0;
    float th = 1.0 / 1024.0;
    float hL = texture2D(uHeightMap, uv + vec2(-tw, 0.0)).r;
    float hR = texture2D(uHeightMap, uv + vec2( tw, 0.0)).r;
    float hU = texture2D(uHeightMap, uv + vec2(0.0,-th)).r;
    float hD = texture2D(uHeightMap, uv + vec2(0.0, th)).r;

    vec3 N = normalize(normal);
    vec3 t1 = cross(vec3(0.0, 1.0, 0.0), N);
    vec3 t2 = cross(vec3(1.0, 0.0, 0.0), N);
    vec3 T = normalize(length(t1) > 0.001 ? t1 : t2);
    vec3 B = normalize(cross(N, T));

    float bS = uDisplaceScale * 40.0;
    vec3 pN = normalize(N + T * (hL - hR) * bS + B * (hU - hD) * bS);

    vNormal = normalize((modelMatrix * vec4(pN, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

export const EarthFrag = `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uCloud;
uniform vec3 uSunDir;
uniform float uCloudOff;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vElevation;

void main() {
    vec3 N = normalize(vNormal);
    float NdL = dot(N, uSunDir);
    float day = smoothstep(-0.12, 0.3, NdL);

    vec3 dayCol = texture2D(uDay, vUv).rgb;
    // Photorealistic night lights (warm amber/white)
    vec3 nightCol = texture2D(uNight, vUv).rgb * vec3(1.1, 0.9, 0.7) * 3.0; 

    // terrain shadow enhancement
    float terrainShade = 0.75 + 0.25 * max(NdL, 0.0);
    dayCol *= terrainShade; 

    // snow at high elevation
    float snow = smoothstep(0.72, 0.88, vElevation);
    dayCol = mix(dayCol, vec3(0.92, 0.94, 0.96), snow * 0.5);

    // clouds — RepeatWrapping handles the UV seamlessly, no fract() needed
    vec2 cUv = vec2(vUv.x + uCloudOff, vUv.y);
    float cloud = texture2D(uCloud, cUv).r;
    
    // FIX #2: Balanced cloud layer
    // Day side: subtle cloud overlay so we can still see the beautiful earth texture
    vec3 dayFinal = mix(dayCol, vec3(1.0), cloud * 0.35);
    
    // Natural terminator sunset glow (orange/red scatter)
    float termGlow = smoothstep(-0.15, 0.08, NdL) * smoothstep(0.35, 0.0, NdL);
    vec3 cloudGlow = mix(vec3(0.01, 0.015, 0.02), vec3(0.35, 0.15, 0.05), termGlow * 1.5);
    
    // Night side: clouds lit by ambient skylight (blue-grey) + city light scatter
    // This makes clouds visible on the dark side as silvery-grey silhouettes
    vec3 nightCloudLight = vec3(0.08, 0.09, 0.12); // ambient starlight on clouds
    vec3 nightFinal = nightCol * (1.0 - cloud * 0.5) + (cloudGlow + nightCloudLight) * cloud;

    vec3 color = mix(nightFinal, dayFinal, day);

    // ocean specular (sun glint)
    float isOcean = 1.0 - smoothstep(0.28, 0.34, vElevation);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 300.0);
    spec *= isOcean * (1.0 - cloud) * day;
    color += vec3(1.0, 0.95, 0.85) * spec * 1.2; 

    // fresnel rim - beautiful atmospheric scattering (blue)
    float fresnel = pow(1.0 - max(dot(V, N), 0.0), 4.0);
    color += vec3(0.2, 0.5, 1.0) * fresnel * 0.06 * day;

    gl_FragColor = vec4(color, 1.0);
}
`;

export const AtmoVert = `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const AtmoFrag = `
uniform vec3 uSunDir;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 N = normalize(vNormal);
    float rim = 1.0 - abs(dot(V, N));
    rim = pow(rim, 3.0);

    float sunFace = max(dot(N, uSunDir), 0.0);
    
    // Photorealistic Rayleigh and Mie scattering
    vec3 rayleigh = vec3(0.15, 0.45, 1.0); 
    float mie = pow(max(dot(V, -uSunDir), 0.0), 16.0);
    vec3 mieCol = vec3(1.0, 0.85, 0.5); 
    float term = 1.0 - abs(dot(N, uSunDir));
    term = pow(term, 8.0);
    vec3 sunset = vec3(1.0, 0.3, 0.05);

    vec3 color = rayleigh * rim * (0.2 + 0.8 * sunFace)
               + mieCol * mie * rim * 0.5
               + sunset * term * rim * 0.4;
    float alpha = rim * (0.3 + 0.5 * sunFace + mie * 0.3);
    gl_FragColor = vec4(color, alpha);
}
`;

export const AuroraVert = `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
    vPos = position;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const AuroraFrag = `
uniform float uTime;
uniform vec3 uSunDir;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vWorldPos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n = i.x + i.y*157.0 + i.z*113.0;
    return mix(mix(mix(hash3(vec3(n,0,0)), hash3(vec3(n+1.0,0,0)), f.x),
                   mix(hash3(vec3(n+157.0,0,0)), hash3(vec3(n+158.0,0,0)), f.x), f.y),
               mix(mix(hash3(vec3(n+113.0,0,0)), hash3(vec3(n+114.0,0,0)), f.x),
                   mix(hash3(vec3(n+270.0,0,0)), hash3(vec3(n+271.0,0,0)), f.x), f.y), f.z);
}

float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise3(p); p *= 2.1; a *= 0.45; }
    return v;
}

void main() {
    vec3 nPos = normalize(vPos);
    float lat = asin(nPos.y);
    float lon = atan(nPos.z, nPos.x);

    // magnetic dipole tilt ~11 degrees
    float magLat = lat + 0.19 * cos(lon - 1.2);
    float poleMask = smoothstep(0.82, 1.2, abs(magLat));

    float nightFactor = 1.0 - smoothstep(-0.1, 0.15, dot(vNormal, uSunDir));

    // 3D volumetric curtain
    vec3 samplePos = vec3(lon * 4.0, magLat * 10.0, uTime * 0.15);
    float curtain = fbm3(samplePos);
    float curtain2 = fbm3(samplePos * 1.5 + vec3(0.0, uTime * 0.08, 0.0));
    curtain = pow(curtain * curtain2, 1.5) * 4.0;

    // wave propagation
    float wave = sin(lon * 8.0 + uTime * 0.5) * 0.5 + 0.5;
    curtain *= 0.6 + 0.4 * wave;

    // Beautiful natural aurora (green/purple)
    float altFactor = abs(magLat) / 1.57;
    vec3 greenLow = vec3(0.05, 1.0, 0.25);
    vec3 purpleMid = vec3(0.5, 0.08, 0.8);
    vec3 redHigh = vec3(0.8, 0.1, 0.15);
    vec3 auroraColor = mix(greenLow, mix(purpleMid, redHigh, altFactor), curtain2 * 0.6);

    float intensity = curtain * poleMask * nightFactor;

    vec3 V = normalize(cameraPosition - vWorldPos);
    float edgeFade = pow(1.0 - abs(dot(V, vNormal)), 1.8);
    intensity *= edgeFade * 1.8;

    gl_FragColor = vec4(auroraColor, clamp(intensity * 0.55, 0.0, 0.8));
}
`;
