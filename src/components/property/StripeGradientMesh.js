'use client';

import { useEffect, useRef } from 'react';

/*
  StripeGradientMesh — WebGL animated mesh gradient.

  Ported from the Claude Design handoff bundle (stripe-animation/project/
  Stripe Gradient Mesh.html). The shader/MiniGl approach is the public
  Stripe-style "whatamesh" technique (simplex-noise vertex distortion
  driving a 4-color WaveLayer fragment shader).

  Locked tweaks (from TWEAK_DEFAULTS in the design file):
    palette: #635BFF → #FF5FA2 → #FF8A3D → #F6F4FF
    amp 300, speed 0.9, freqX 14e-5, freqY 24e-5, darkenTop true, grain 0.15

  Renders an absolute-positioned canvas + grain overlay that fills the
  parent. Use inside a `position: relative; overflow: hidden` container.

  Reduce-motion: pauses the animation; the last-rendered frame stays
  visible (still readable as a static gradient).
*/

const DEFAULT_PALETTE = ['#635BFF', '#FF5FA2', '#FF8A3D', '#F6F4FF'];

// Shader sources — verbatim from the design file.
const SHADER_NOISE = `
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
}`;

const SHADER_BLEND = `
vec3 blendNormal(vec3 base, vec3 blend){return blend;}
vec3 blendNormal(vec3 base, vec3 blend, float opacity){return (blendNormal(base,blend)*opacity + base*(1.0-opacity));}`;

const SHADER_VERTEX = `
varying vec3 v_color;

void main() {
  float time = u_time * u_global.noiseSpeed;
  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;
  vec2 st = 1. - uvNorm.xy;
  float tilt = resolution.y / 2.0 * uvNorm.y;
  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;
  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);
  float noise = snoise(vec3(
    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,
    noiseCoord.y * u_vertDeform.noiseFreq.y,
    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed
  )) * u_vertDeform.noiseAmp;
  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
  noise = max(0.0, noise);
  vec3 pos = vec3(
    position.x,
    position.y + tilt + incline + noise - offset,
    position.z
  );
  if (u_active_colors[0] == 1.) {
    v_color = u_baseColor;
  }
  for (int i = 0; i < u_waveLayers_length; i++) {
    if (u_active_colors[i + 1] == 1.) {
      WaveLayers layer = u_waveLayers[i];
      float noise = smoothstep(
        layer.noiseFloor,
        layer.noiseCeil,
        snoise(vec3(
          noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,
          noiseCoord.y * layer.noiseFreq.y,
          time * layer.noiseSpeed + layer.noiseSeed
        )) / 2.0 + 0.5
      );
      v_color = blendNormal(v_color, layer.color, pow(noise, 4.));
    }
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const SHADER_FRAGMENT = `
varying vec3 v_color;
void main(){
  vec3 color = v_color;
  if (u_darken_top == 1.0){
    vec2 st = gl_FragCoord.xy/resolution.xy;
    color.g -= pow(st.y + sin(-12.0)*st.x, u_shadow_power) * 0.4;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

function normalizeColor(hexCode) {
  return [((hexCode >> 16) & 255) / 255, ((hexCode >> 8) & 255) / 255, (255 & hexCode) / 255];
}

class MiniGl {
  constructor(canvas, width, height) {
    const _miniGl = this;
    _miniGl.canvas = canvas;
    _miniGl.gl = _miniGl.canvas.getContext('webgl', { antialias: true });
    _miniGl.meshes = [];
    const context = _miniGl.gl;
    if (width && height) this.setSize(width, height);
    _miniGl.debug = () => {};

    Object.defineProperties(_miniGl, {
      Material: { enumerable: false, value: class {
        constructor(vertexShaders, fragments, uniforms = {}) {
          const material = this;
          function getShaderByType(type, source) {
            const shader = context.createShader(type);
            context.shaderSource(shader, source);
            context.compileShader(shader);
            if (!context.getShaderParameter(shader, context.COMPILE_STATUS))
              console.error(context.getShaderInfoLog(shader));
            return shader;
          }
          function getUniformVariableDeclarations(uniforms, type) {
            return Object.entries(uniforms).map(([u, v]) => v.getDeclaration(u, type)).join('\n');
          }
          material.uniforms = uniforms;
          material.uniformInstances = [];
          const prefix = '\n              precision highp float;\n            ';
          material.vertexSource = `
            ${prefix}
            attribute vec4 position;
            attribute vec2 uv;
            attribute vec2 uvNorm;
            ${getUniformVariableDeclarations(_miniGl.commonUniforms, 'vertex')}
            ${getUniformVariableDeclarations(uniforms, 'vertex')}
            ${vertexShaders}
          `;
          material.Source = `
            ${prefix}
            ${getUniformVariableDeclarations(_miniGl.commonUniforms, 'fragment')}
            ${getUniformVariableDeclarations(uniforms, 'fragment')}
            ${fragments}
          `;
          material.vertexShader = getShaderByType(context.VERTEX_SHADER, material.vertexSource);
          material.fragmentShader = getShaderByType(context.FRAGMENT_SHADER, material.Source);
          material.program = context.createProgram();
          context.attachShader(material.program, material.vertexShader);
          context.attachShader(material.program, material.fragmentShader);
          context.linkProgram(material.program);
          if (!context.getProgramParameter(material.program, context.LINK_STATUS))
            console.error(context.getProgramInfoLog(material.program));
          context.useProgram(material.program);
          material.attachUniforms(undefined, _miniGl.commonUniforms);
          material.attachUniforms(undefined, material.uniforms);
        }
        attachUniforms(name, uniforms) {
          const material = this;
          if (name === undefined) {
            Object.entries(uniforms).forEach(([n, u]) => material.attachUniforms(n, u));
          } else if (uniforms.type === 'array') {
            uniforms.value.forEach((u, i) => material.attachUniforms(`${name}[${i}]`, u));
          } else if (uniforms.type === 'struct') {
            Object.entries(uniforms.value).forEach(([n, u]) => material.attachUniforms(`${name}.${n}`, u));
          } else {
            material.uniformInstances.push({
              uniform: uniforms,
              location: context.getUniformLocation(material.program, name),
            });
          }
        }
      } },
      Uniform: { enumerable: false, value: class {
        constructor(e) {
          this.type = 'float';
          Object.assign(this, e);
          this.typeFn = ({ float: '1f', int: '1i', vec2: '2fv', vec3: '3fv', vec4: '4fv', mat4: 'Matrix4fv' })[this.type] || '1f';
          this.update();
        }
        update(value) {
          if (this.value !== undefined) {
            context[`uniform${this.typeFn}`](
              value,
              this.typeFn.indexOf('Matrix') === 0 ? this.transpose : this.value,
              this.typeFn.indexOf('Matrix') === 0 ? this.value : null
            );
          }
        }
        getDeclaration(name, type, length) {
          const u = this;
          if (u.excludeFrom !== type) {
            if (u.type === 'array') {
              return u.value[0].getDeclaration(name, type, u.value.length) +
                `\nconst int ${name}_length = ${u.value.length};`;
            }
            if (u.type === 'struct') {
              let np = name.replace('u_', '');
              np = np.charAt(0).toUpperCase() + np.slice(1);
              return `uniform struct ${np} {\n` +
                Object.entries(u.value).map(([n, u]) => u.getDeclaration(n, type).replace(/^uniform/, '')).join('') +
                `\n} ${name}${length > 0 ? `[${length}]` : ''};`;
            }
            return `uniform ${u.type} ${name}${length > 0 ? `[${length}]` : ''};`;
          }
          return '';
        }
      } },
      PlaneGeometry: { enumerable: false, value: class {
        constructor(width, height, n, i, orientation) {
          context.createBuffer();
          this.attributes = {
            position: new _miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 3 }),
            uv: new _miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 2 }),
            uvNorm: new _miniGl.Attribute({ target: context.ARRAY_BUFFER, size: 2 }),
            index: new _miniGl.Attribute({ target: context.ELEMENT_ARRAY_BUFFER, size: 3, type: context.UNSIGNED_SHORT }),
          };
          this.setTopology(n, i);
          this.setSize(width, height, orientation);
        }
        setTopology(e = 1, t = 1) {
          const n = this;
          n.xSegCount = e; n.ySegCount = t;
          n.vertexCount = (n.xSegCount + 1) * (n.ySegCount + 1);
          n.quadCount = n.xSegCount * n.ySegCount * 2;
          n.attributes.uv.values = new Float32Array(2 * n.vertexCount);
          n.attributes.uvNorm.values = new Float32Array(2 * n.vertexCount);
          n.attributes.index.values = new Uint16Array(3 * n.quadCount);
          for (let y = 0; y <= n.ySegCount; y++) {
            for (let x = 0; x <= n.xSegCount; x++) {
              const i = y * (n.xSegCount + 1) + x;
              n.attributes.uv.values[2 * i] = x / n.xSegCount;
              n.attributes.uv.values[2 * i + 1] = 1 - y / n.ySegCount;
              n.attributes.uvNorm.values[2 * i] = (x / n.xSegCount) * 2 - 1;
              n.attributes.uvNorm.values[2 * i + 1] = 1 - (y / n.ySegCount) * 2;
              if (x < n.xSegCount && y < n.ySegCount) {
                const s = y * n.xSegCount + x;
                n.attributes.index.values[6 * s] = i;
                n.attributes.index.values[6 * s + 1] = i + 1 + n.xSegCount;
                n.attributes.index.values[6 * s + 2] = i + 1;
                n.attributes.index.values[6 * s + 3] = i + 1;
                n.attributes.index.values[6 * s + 4] = i + 1 + n.xSegCount;
                n.attributes.index.values[6 * s + 5] = i + 2 + n.xSegCount;
              }
            }
          }
          n.attributes.uv.update();
          n.attributes.uvNorm.update();
          n.attributes.index.update();
        }
        setSize(width = 1, height = 1, orientation = 'xz') {
          const g = this;
          g.width = width; g.height = height; g.orientation = orientation;
          if (!g.attributes.position.values || g.attributes.position.values.length !== 3 * g.vertexCount) {
            g.attributes.position.values = new Float32Array(3 * g.vertexCount);
          }
          const o = width / -2, r = height / -2;
          const sw = width / g.xSegCount, sh = height / g.ySegCount;
          for (let y = 0; y <= g.ySegCount; y++) {
            const yp = r + y * sh;
            for (let x = 0; x <= g.xSegCount; x++) {
              const xp = o + x * sw;
              const l = y * (g.xSegCount + 1) + x;
              g.attributes.position.values[3 * l + 'xyz'.indexOf(orientation[0])] = xp;
              g.attributes.position.values[3 * l + 'xyz'.indexOf(orientation[1])] = -yp;
            }
          }
          g.attributes.position.update();
        }
      } },
      Mesh: { enumerable: false, value: class {
        constructor(geometry, material) {
          const mesh = this;
          mesh.geometry = geometry;
          mesh.material = material;
          mesh.wireframe = false;
          mesh.attributeInstances = [];
          Object.entries(mesh.geometry.attributes).forEach(([n, attribute]) => {
            mesh.attributeInstances.push({
              attribute,
              location: attribute.attach(n, mesh.material.program),
            });
          });
          _miniGl.meshes.push(mesh);
        }
        draw() {
          context.useProgram(this.material.program);
          this.material.uniformInstances.forEach(({ uniform, location }) => uniform.update(location));
          this.attributeInstances.forEach(({ attribute, location }) => attribute.use(location));
          context.drawElements(
            this.wireframe ? context.LINES : context.TRIANGLES,
            this.geometry.attributes.index.values.length,
            context.UNSIGNED_SHORT, 0
          );
        }
        remove() { _miniGl.meshes = _miniGl.meshes.filter((e) => e !== this); }
      } },
      Attribute: { enumerable: false, value: class {
        constructor(e) {
          this.type = context.FLOAT;
          this.normalized = false;
          this.buffer = context.createBuffer();
          Object.assign(this, e);
          this.update();
        }
        update() {
          if (this.values !== undefined) {
            context.bindBuffer(this.target, this.buffer);
            context.bufferData(this.target, this.values, context.STATIC_DRAW);
          }
        }
        attach(e, t) {
          const n = context.getAttribLocation(t, e);
          if (this.target === context.ARRAY_BUFFER) {
            context.enableVertexAttribArray(n);
            context.vertexAttribPointer(n, this.size, this.type, this.normalized, 0, 0);
          }
          return n;
        }
        use(e) {
          context.bindBuffer(this.target, this.buffer);
          if (this.target === context.ARRAY_BUFFER) {
            context.enableVertexAttribArray(e);
            context.vertexAttribPointer(e, this.size, this.type, this.normalized, 0, 0);
          }
        }
      } },
    });

    const a = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    _miniGl.commonUniforms = {
      projectionMatrix: new _miniGl.Uniform({ type: 'mat4', value: a }),
      modelViewMatrix: new _miniGl.Uniform({ type: 'mat4', value: a }),
      resolution: new _miniGl.Uniform({ type: 'vec2', value: [1, 1] }),
      aspectRatio: new _miniGl.Uniform({ type: 'float', value: 1 }),
    };
  }
  setSize(e = 640, t = 480) {
    this.width = e; this.height = t;
    this.canvas.width = e; this.canvas.height = t;
    this.gl.viewport(0, 0, e, t);
    this.commonUniforms.resolution.value = [e, t];
    this.commonUniforms.aspectRatio.value = e / t;
  }
  setOrthographicCamera(e = 0, t = 0, n = 0, i = -2e3, s = 2e3) {
    this.commonUniforms.projectionMatrix.value = [
      2 / this.width, 0, 0, 0,
      0, 2 / this.height, 0, 0,
      0, 0, 2 / (i - s), 0,
      e, t, n, 1,
    ];
  }
  render() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clearDepth(1);
    this.meshes.forEach((m) => m.draw());
  }
}

class Gradient {
  constructor() {
    this.el = undefined;
    this.cssVarRetries = 0;
    this.maxCssVarRetries = 200;
    this.angle = 0;
    this.shaderFiles = undefined;
    this.sectionColors = undefined;
    this.computedCanvasStyle = undefined;
    this.conf = undefined;
    this.uniforms = undefined;
    this.t = 1253106;
    this.last = 0;
    this.width = undefined;
    this.height = undefined;
    this.xSegCount = undefined;
    this.ySegCount = undefined;
    this.mesh = undefined;
    this.material = undefined;
    this.geometry = undefined;
    this.minigl = undefined;
    this.amp = 320;
    this.seed = 5;
    this.freqX = 14e-5;
    this.freqY = 29e-5;
    this.activeColors = [1, 1, 1, 1];
    this.speedMultiplier = 1;
    this.resizeObserver = null;
    this.disposed = false;

    this.resize = () => {
      if (this.disposed || !this.el) return;
      // Read the canvas's actual rendered size (CSS box) — not window size,
      // since we may be embedded inside a hero rather than full-viewport.
      const rect = this.el.getBoundingClientRect();
      this.width = Math.max(1, Math.floor(rect.width));
      this.height = Math.max(1, Math.floor(rect.height));
      this.minigl.setSize(this.width, this.height);
      this.minigl.setOrthographicCamera();
      this.xSegCount = Math.ceil(this.width * this.conf.density[0]);
      this.ySegCount = Math.ceil(this.height * this.conf.density[1]);
      this.mesh.geometry.setTopology(this.xSegCount, this.ySegCount);
      this.mesh.geometry.setSize(this.width, this.height);
      this.mesh.material.uniforms.u_shadow_power.value = this.width < 600 ? 5 : 6;
    };
    this.animate = (e) => {
      if (this.disposed) return;
      if (!this.shouldSkipFrame(e)) {
        this.t += Math.min(e - this.last, 1000 / 15) * this.speedMultiplier;
        this.last = e;
        this.mesh.material.uniforms.u_time.value = this.t;
        this.minigl.render();
      }
      if (this.conf.playing) requestAnimationFrame(this.animate);
    };
  }
  initGradient(canvas) {
    this.el = canvas;
    this.connect();
    return this;
  }
  connect() {
    this.shaderFiles = {
      vertex: SHADER_VERTEX,
      noise: SHADER_NOISE,
      blend: SHADER_BLEND,
      fragment: SHADER_FRAGMENT,
    };
    this.conf = {
      presetName: '',
      wireframe: false,
      density: [0.06, 0.16],
      zoom: 1,
      rotation: 0,
      playing: true,
    };
    this.minigl = new MiniGl(this.el, null, null, true);
    requestAnimationFrame(() => {
      if (this.disposed) return;
      if (this.el) {
        this.computedCanvasStyle = getComputedStyle(this.el);
        this.waitForCssVars();
      }
    });
  }
  initMaterial() {
    this.uniforms = {
      u_time: new this.minigl.Uniform({ value: 0 }),
      u_shadow_power: new this.minigl.Uniform({ value: 5 }),
      u_darken_top: new this.minigl.Uniform({ value: this.el.dataset.jsDarkenTop === '' ? 1 : 0 }),
      u_active_colors: new this.minigl.Uniform({ value: this.activeColors, type: 'vec4' }),
      u_global: new this.minigl.Uniform({
        value: {
          noiseFreq: new this.minigl.Uniform({ value: [this.freqX, this.freqY], type: 'vec2' }),
          noiseSpeed: new this.minigl.Uniform({ value: 5e-6 }),
        },
        type: 'struct',
      }),
      u_vertDeform: new this.minigl.Uniform({
        value: {
          incline: new this.minigl.Uniform({ value: Math.sin(this.angle) / Math.cos(this.angle) }),
          offsetTop: new this.minigl.Uniform({ value: -0.5 }),
          offsetBottom: new this.minigl.Uniform({ value: -0.5 }),
          noiseFreq: new this.minigl.Uniform({ value: [3, 4], type: 'vec2' }),
          noiseAmp: new this.minigl.Uniform({ value: this.amp }),
          noiseSpeed: new this.minigl.Uniform({ value: 10 }),
          noiseFlow: new this.minigl.Uniform({ value: 3 }),
          noiseSeed: new this.minigl.Uniform({ value: this.seed }),
        },
        type: 'struct', excludeFrom: 'fragment',
      }),
      u_baseColor: new this.minigl.Uniform({
        value: this.sectionColors[0], type: 'vec3', excludeFrom: 'fragment',
      }),
      u_waveLayers: new this.minigl.Uniform({
        value: [], excludeFrom: 'fragment', type: 'array',
      }),
    };
    for (let e = 1; e < this.sectionColors.length; e++) {
      this.uniforms.u_waveLayers.value.push(new this.minigl.Uniform({
        value: {
          color: new this.minigl.Uniform({ value: this.sectionColors[e], type: 'vec3' }),
          noiseFreq: new this.minigl.Uniform({
            value: [2 + e / this.sectionColors.length, 3 + e / this.sectionColors.length], type: 'vec2',
          }),
          noiseSpeed: new this.minigl.Uniform({ value: 11 + 0.3 * e }),
          noiseFlow: new this.minigl.Uniform({ value: 6.5 + 0.3 * e }),
          noiseSeed: new this.minigl.Uniform({ value: this.seed + 10 * e }),
          noiseFloor: new this.minigl.Uniform({ value: 0.1 }),
          noiseCeil: new this.minigl.Uniform({ value: 0.63 + 0.07 * e }),
        },
        type: 'struct',
      }));
    }
    const vert = [this.shaderFiles.noise, this.shaderFiles.blend, this.shaderFiles.vertex].join('\n\n');
    return new this.minigl.Material(vert, this.shaderFiles.fragment, this.uniforms);
  }
  initMesh() {
    this.material = this.initMaterial();
    this.geometry = new this.minigl.PlaneGeometry();
    this.mesh = new this.minigl.Mesh(this.geometry, this.material);
  }
  shouldSkipFrame(e) {
    return !!window.document.hidden || !this.conf.playing || (parseInt(e, 10) % 2 === 0);
  }
  init() {
    if (this.disposed) return;
    this.initGradientColors();
    this.initMesh();
    this.resize();
    requestAnimationFrame(this.animate);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.el);
  }
  waitForCssVars() {
    if (this.disposed) return;
    if (this.computedCanvasStyle && this.computedCanvasStyle.getPropertyValue('--gradient-color-1').indexOf('#') !== -1) {
      this.init();
    } else {
      this.cssVarRetries += 1;
      if (this.cssVarRetries > this.maxCssVarRetries) {
        this.sectionColors = [16711680, 16711680, 16711935, 65280, 255];
        this.init();
        return;
      }
      requestAnimationFrame(() => this.waitForCssVars());
    }
  }
  initGradientColors() {
    this.sectionColors = [
      '--gradient-color-1', '--gradient-color-2', '--gradient-color-3', '--gradient-color-4',
    ].map((p) => {
      let hex = this.computedCanvasStyle.getPropertyValue(p).trim();
      if (hex.length === 4) {
        const t = hex.substr(1).split('').map((c) => c + c).join('');
        hex = `#${t}`;
      }
      return hex && `0x${hex.substr(1)}`;
    }).filter(Boolean).map((n) => normalizeColor(parseInt(n)));
  }
  destroy() {
    this.disposed = true;
    if (this.conf) this.conf.playing = false;
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    // Don't call WEBGL_lose_context here — it permanently kills the canvas's
    // WebGL context, and React strict mode's mount-unmount-mount cycle would
    // then leave the second mount without a usable context. GC handles the
    // GL resources when the canvas is removed from the DOM.
    this.el = null;
    this.minigl = null;
  }
}

const GRAIN_SVG_DATA_URI =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export default function StripeGradientMesh({
  palette = DEFAULT_PALETTE,
  amp = 300,
  speed = 0.9,
  freqX = 14,
  freqY = 24,
  darkenTop = true,
  grain = 0.15,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    // Reduce-motion: skip the animation. The canvas stays empty (transparent),
    // so the parent's background-color shows through. Callers should set a
    // sensible static fallback color on the parent if this matters.
    if (typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    palette.forEach((h, i) => canvas.style.setProperty(`--gradient-color-${i + 1}`, h));
    if (darkenTop) canvas.setAttribute('data-js-darken-top', '');
    else canvas.removeAttribute('data-js-darken-top');

    const gradient = new Gradient();
    gradient.amp = amp;
    gradient.freqX = freqX * 1e-5;
    gradient.freqY = freqY * 1e-5;
    gradient.speedMultiplier = speed;
    gradient.initGradient(canvas);

    return () => gradient.destroy();
  }, [palette, amp, speed, freqX, freqY, darkenTop]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div
        className="absolute inset-0 mix-blend-multiply"
        style={{
          opacity: grain,
          backgroundImage: GRAIN_SVG_DATA_URI,
        }}
      />
    </div>
  );
}
