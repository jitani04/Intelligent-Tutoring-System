import { useEffect, useRef } from "react";

const MAX_RIPPLES = 8;

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_mouseTarget;
uniform float u_time;
uniform float u_pressure;
uniform vec3 u_ripples[${MAX_RIPPLES}];

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.05;
    a *= 0.52;
  }
  return v;
}

vec3 palette(float t) {
  // app theme: deep navy -> midnight slate -> slate blue (#5f7f9f) -> soft periwinkle (#9eb7cf)
  vec3 c1 = vec3(0.020, 0.035, 0.075);
  vec3 c2 = vec3(0.080, 0.130, 0.220);
  vec3 c3 = vec3(0.370, 0.500, 0.620);
  vec3 c4 = vec3(0.620, 0.720, 0.810);
  vec3 col = mix(c1, c2, smoothstep(0.00, 0.40, t));
  col = mix(col, c3, smoothstep(0.35, 0.78, t));
  col = mix(col, c4, smoothstep(0.78, 1.10, t));
  return col;
}

void main() {
  vec2 res = u_resolution;
  vec2 uv = gl_FragCoord.xy / res;
  float asp = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  vec2 m = (u_mouse - 0.5) * vec2(asp, 1.0);
  vec2 mt = (u_mouseTarget - 0.5) * vec2(asp, 1.0);

  // smooth mouse warp: pull field gently toward the cursor
  vec2 toM = mt - p;
  float dM = length(toM);
  float warp = exp(-dM * 2.4) * (0.18 + u_pressure * 0.25);
  p += normalize(toM + 1e-5) * warp;

  float t = u_time * 0.07;

  // flowing field via domain-warped fbm
  vec2 q = vec2(fbm(p * 1.4 + vec2(t, -t * 0.6)),
                fbm(p * 1.4 + vec2(-t * 0.8, t * 1.1) + 5.2));
  vec2 r = vec2(fbm(p * 2.2 + q * 1.8 + vec2(t * 1.3, 0.0)),
                fbm(p * 2.2 + q * 1.8 + vec2(0.0, -t * 0.9) + 1.7));
  float field = fbm(p * 2.6 + r * 2.4 - t * 0.5);

  // ripples from clicks
  float ripple = 0.0;
  float rGlow = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 ri = u_ripples[i];
    if (ri.z < 0.0) continue;
    float age = u_time - ri.z;
    if (age < 0.0 || age > 3.5) continue;
    vec2 rp = (ri.xy - 0.5) * vec2(asp, 1.0);
    float rd = length(p - rp);
    float front = age * 0.55;
    float band = exp(-pow((rd - front) * 9.0, 2.0));
    float decay = exp(-age * 1.05);
    ripple += sin(rd * 36.0 - age * 9.0) * band * decay * 0.9;
    rGlow += band * decay * 1.4;
  }

  float shade = field + ripple * 0.5;
  float hue = shade * 0.9 + 0.15 + 0.08 * sin(u_time * 0.25 + p.x * 1.2);

  vec3 col = palette(hue);

  // soft inner glow following the cursor (slate-blue accent)
  float halo = exp(-dM * 3.2);
  col += halo * vec3(0.45, 0.58, 0.70) * (0.35 + u_pressure * 0.55);

  // additive ripple glow (periwinkle highlight)
  col += rGlow * vec3(0.62, 0.72, 0.81);

  // subtle holographic grid (OS feel)
  vec2 grid = uv * vec2(72.0, 42.0);
  vec2 gf = abs(fract(grid) - 0.5);
  float gridLine = smoothstep(0.49, 0.50, max(gf.x, gf.y));
  col += (1.0 - gridLine) * 0.025;

  // scan line shimmer
  float scan = 0.5 + 0.5 * sin(uv.y * res.y * 1.6 + u_time * 1.5);
  col += scan * 0.012;

  // film grain
  float grain = hash21(uv * res + u_time) - 0.5;
  col += grain * 0.018;

  // vignette
  float vd = length((uv - 0.5) * vec2(asp, 1.0));
  float vig = smoothstep(1.05, 0.25, vd);
  col *= mix(0.45, 1.0, vig);

  // subtle cool edge tint (stays in slate family)
  col.b += smoothstep(0.5, 1.0, vd) * 0.025;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("shader compile failed:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function ShaderWallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("program link failed:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uMouseTarget = gl.getUniformLocation(prog, "u_mouseTarget");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uPressure = gl.getUniformLocation(prog, "u_pressure");
    const uRipples = gl.getUniformLocation(prog, "u_ripples");

    const mouse = { x: 0.5, y: 0.5 };
    const mouseTarget = { x: 0.5, y: 0.5 };
    let pressure = 0;

    // ripples: each is [x, y, startTime]; z < 0 means slot is empty
    const ripples = new Float32Array(MAX_RIPPLES * 3);
    for (let i = 0; i < MAX_RIPPLES; i++) ripples[i * 3 + 2] = -1;
    let nextRipple = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      const pw = Math.max(1, Math.floor(w * dpr));
      const ph = Math.max(1, Math.floor(h * dpr));
      if (canvas!.width !== pw || canvas!.height !== ph) {
        canvas!.width = pw;
        canvas!.height = ph;
      }
      gl!.viewport(0, 0, pw, ph);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function ndc(e: { clientX: number; clientY: number }) {
      const rect = canvas!.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      };
    }

    function onMove(e: MouseEvent) {
      const p = ndc(e);
      mouseTarget.x = p.x;
      mouseTarget.y = p.y;
    }
    function onTouchMove(e: TouchEvent) {
      if (!e.touches[0]) return;
      const p = ndc(e.touches[0]);
      mouseTarget.x = p.x;
      mouseTarget.y = p.y;
    }
    function spawnRipple(x: number, y: number) {
      const idx = nextRipple % MAX_RIPPLES;
      ripples[idx * 3 + 0] = x;
      ripples[idx * 3 + 1] = y;
      ripples[idx * 3 + 2] = (performance.now() - start) / 1000;
      nextRipple++;
    }
    function onPointerDown(e: PointerEvent) {
      const p = ndc(e);
      spawnRipple(p.x, p.y);
      pressure = 1;
    }
    function onPointerUp() {
      pressure = 0;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const start = performance.now();
    let raf = 0;

    function frame() {
      const now = (performance.now() - start) / 1000;
      // ease mouse toward target
      mouse.x += (mouseTarget.x - mouse.x) * 0.08;
      mouse.y += (mouseTarget.y - mouse.y) * 0.08;
      pressure *= 0.92;

      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform2f(uMouse, mouse.x, mouse.y);
      gl!.uniform2f(uMouseTarget, mouseTarget.x, mouseTarget.y);
      gl!.uniform1f(uTime, now);
      gl!.uniform1f(uPressure, pressure);
      gl!.uniform3fv(uRipples, ripples);

      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas className="shader-wallpaper-canvas" ref={canvasRef} aria-hidden="true" />;
}
