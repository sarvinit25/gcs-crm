import { useEffect, useRef, useState } from "react";

/**
 * How Gia looks right now. The glowing ring around the "AI" changes with what the chat is doing:
 *  idle      a calm, slow swirl
 *  thinking  a quick, bright swirl while it works out an answer
 *  speaking  a steady, breathing pulse while it writes the reply
 *  joy       a short bright flare when a reply is done or the visitor says thanks
 *  concerned a low, dim ember when something went wrong
 */
export type GiaMood = "idle" | "thinking" | "speaking" | "joy" | "concerned";

type Look = { speed: number; wisp: number; heat: number; pulse: number; size: number; bright: number };

const LOOKS: Record<GiaMood, Look> = {
  idle: { speed: 0.45, wisp: 1, heat: 0.45, pulse: 0, size: 1, bright: 0.95 },
  thinking: { speed: 1.7, wisp: 1.25, heat: 0.62, pulse: 0, size: 1, bright: 1.1 },
  speaking: { speed: 0.9, wisp: 1.1, heat: 0.75, pulse: 0.04, size: 1.01, bright: 1.15 },
  joy: { speed: 1.2, wisp: 1.5, heat: 1, pulse: 0.02, size: 1.05, bright: 1.45 },
  concerned: { speed: 0.2, wisp: 0.6, heat: 0.1, pulse: 0, size: 0.92, bright: 0.55 },
};

// Compact 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// A ring of blue wisps with a little gold that swirl and morph around the centre. The noise is sampled on
// a circle (cos / sin of the angle), so the ring closes up smoothly with no seam.
const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uWisp;
uniform float uHeat;
uniform float uSize;
uniform float uBright;
uniform float uLight;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime * uSpeed;

  // noise layers turning in opposite directions give the ring its flowing, uneven look
  float n1 = snoise(vec3(cos(a + t * 0.9) * 1.4, sin(a + t * 0.9) * 1.4, t * 0.55));
  float n2 = snoise(vec3(cos(a - t * 0.7) * 2.8, sin(a - t * 0.7) * 2.8, t * 1.0 + 7.0));
  float n3 = snoise(vec3(cos(a + t * 1.6) * 5.0, sin(a + t * 1.6) * 5.0, t * 1.5 + 3.0));

  float radius = (0.70 + n1 * 0.06 * uWisp + 0.02 * sin(t * 2.6 + a * 3.0)) * uSize;
  float d = abs(r - radius);
  // the ring is thick in some places and thin or broken in others
  float thick = 0.05 + 0.07 * (0.5 + 0.5 * n2) * uWisp;
  float body = smoothstep(thick, 0.0, d);
  float gaps = smoothstep(-0.95, 0.25, n2 * 0.8 + n1 * 0.4);
  float specks = smoothstep(0.6, 0.95, n3) * smoothstep(0.12, 0.0, abs(r - radius - n2 * 0.05));
  float glow = exp(-d * 7.0) * 0.24 * (1.0 - 0.6 * uLight) * (0.45 + 0.55 * gaps);
  float v = clamp(body * (0.35 + 0.65 * gaps) + specks * 0.5 + glow, 0.0, 1.4);

  // colour: mostly blue (deep blue at the thin edges, bright blue in the middle, pale where it is
  // strongest), with a little gold glinting in the sparks and the brightest wisps
  float heat = clamp(0.30 + v * 0.55 + n1 * 0.18 + (uHeat - 0.45) * 0.6, 0.0, 1.0);
  vec3 deep  = vec3(0.04, 0.12, 0.50);
  vec3 blue  = vec3(0.12, 0.46, 1.00);
  vec3 pale  = mix(vec3(0.72, 0.88, 1.00), vec3(0.22, 0.52, 1.00), uLight);   // stays visible on white
  vec3 gold  = vec3(1.00, 0.78, 0.26);
  vec3 col = mix(deep, blue, smoothstep(0.0, 0.5, heat));
  col = mix(col, pale, smoothstep(0.7, 1.0, heat) * body);
  float goldAmount = specks * 0.95 + smoothstep(0.55, 0.95, n2) * body * 0.5;
  col = mix(col, gold, clamp(goldAmount * (0.6 + uHeat * 0.7), 0.0, 1.0));

  float alpha = clamp(v * uBright, 0.0, 1.0);
  gl_FragColor = vec4(col * uBright, alpha);
}
`;

/**
 * Gia's 3D symbol, the same as on the website: the GCS logo on a small white disc, with a ring of blue and gold light swirling
 * around it, drawn with three.js straight onto the dark button it sits on. Until the 3D code has loaded
 * (it waits for the page to settle), and for visitors who prefer reduced motion or whose browser
 * cannot do WebGL, just the logo shows.
 */
export function GiaOrb({
  mood = "idle",
  className = "h-16 w-16",
  tone = "dark",
}: {
  mood?: GiaMood;
  className?: string;
  /** "dark" (the default) for the navy button and header; "light" tunes the ring for a white background. */
  tone?: "light" | "dark";
}) {
  const host = useRef<HTMLSpanElement>(null);
  const moodRef = useRef<GiaMood>(mood);
  const toneRef = useRef(tone);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = () => {};
    let cancelled = false;

    // The 3D code is a sizeable download, so it waits until the page has settled, and is skipped
    // on data-saver connections.
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const settle = () =>
      new Promise<void>((resolve) => {
        const go = () => window.setTimeout(resolve, 800);
        // wait for a quiet moment, but never longer than a few seconds on a busy page
        if ("requestIdleCallback" in window) {
          (window as Window & { requestIdleCallback: (cb: () => void, o: { timeout: number }) => void }).requestIdleCallback(go, { timeout: 3000 });
        } else go();
      });

    (async () => {
      try {
        await settle();
        if (cancelled) return;
        const THREE = await import("three");
        if (cancelled) return;

        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        const canvas = renderer.domElement;
        canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
        el.insertBefore(canvas, el.firstChild);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const uniforms = {
          uTime: { value: 0 },
          uSpeed: { value: LOOKS.idle.speed },
          uWisp: { value: LOOKS.idle.wisp },
          uHeat: { value: LOOKS.idle.heat },
          uSize: { value: 1 },
          uBright: { value: LOOKS.idle.bright },
          uLight: { value: toneRef.current === "light" ? 1 : 0 },
        };
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms,
          transparent: true,
          depthTest: false,
        });
        scene.add(new THREE.Mesh(geometry, material));

        const cur: Look = { ...LOOKS.idle };
        let last = performance.now();
        let time = 12; // start part-way in, so the first frame already looks lively
        let raf = 0;
        let visible = true;

        const resize = () => {
          renderer.setSize(el.clientWidth || 44, el.clientHeight || 44, false);
        };
        resize();
        const ro = new ResizeObserver(() => {
          resize();
          if (!raf) renderer.render(scene, camera);
        });
        ro.observe(el);

        const frame = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const target = LOOKS[moodRef.current];
          const k = 1 - Math.exp(-dt * 4);
          (Object.keys(cur) as (keyof Look)[]).forEach((key) => {
            cur[key] += (target[key] - cur[key]) * k;
          });
          time += dt;
          uniforms.uTime.value = time;
          uniforms.uSpeed.value = cur.speed;
          uniforms.uWisp.value = cur.wisp;
          uniforms.uHeat.value = cur.heat;
          uniforms.uSize.value = cur.size * (1 + cur.pulse * Math.sin(time * 6.5));
          uniforms.uBright.value = cur.bright;
          renderer.render(scene, camera);
          setDrawn(true);
          if (!reduced && visible && !document.hidden) raf = requestAnimationFrame(frame);
          else raf = 0;
        };

        const kick = () => {
          if (!raf) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
          }
        };
        const io = new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? true;
          if (visible) kick();
        });
        io.observe(el);
        const onVis = () => {
          if (!document.hidden) kick();
        };
        document.addEventListener("visibilitychange", onVis);
        // with reduced motion there is no loop: draw once, and again whenever the mood changes
        let moodWas = moodRef.current;
        const poll = reduced
          ? window.setInterval(() => {
              if (moodRef.current !== moodWas) {
                moodWas = moodRef.current;
                Object.assign(cur, LOOKS[moodWas]);
                frame(performance.now());
              }
            }, 300)
          : 0;
        raf = requestAnimationFrame(frame);

        stop = () => {
          cancelAnimationFrame(raf);
          raf = 0;
          visible = false;
          if (poll) window.clearInterval(poll);
          io.disconnect();
          ro.disconnect();
          document.removeEventListener("visibilitychange", onVis);
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          canvas.remove();
        };
      } catch {
        // no WebGL: the logo simply stays as it is
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <span
      ref={host}
      aria-hidden="true"
      data-drawn={drawn}
      className={`relative grid shrink-0 place-items-center rounded-full ${className}`}
    >
      {/* a white disc behind the G, so the logo shows on the dark button */}
      <span className="relative grid h-[52%] w-[52%] place-items-center rounded-full bg-white shadow-[0_0_10px_rgba(90,150,255,0.45)]">
        <img src={`${import.meta.env.BASE_URL}brand/gcs-mark.png`} alt="" className="h-auto w-[74%]" />
      </span>
    </span>
  );
}
