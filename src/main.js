// 苔藓生长 AR · 主程序
// 使用 MindAR (Image Tracking) + Three.js + 自定义苔藓 Shader

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import { mossVertexShader, mossFragmentShader, shellVertexShader, shellFragmentShader } from './shaders.js';

// Vite 中静态资源路径：public/ 下的文件在运行时位于根路径 /
const MIND_FILE = '/target.mind';
const MODEL_FILE = '/prototype.glb';

// ========== 屏幕日志（手机调试用） ==========
// ========== 屏幕日志（手机调试用） ==========
// 只在 ?debug=1 时显示，普通用户看不到
function screenLog(msg, isError = false) {
  // 也在Console打印（不管debug模式都打印）
  console.log(msg);

  // 检查是否启用了debug模式
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
  if (!debugEnabled) return;

  let panel = document.getElementById('screen-log');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'screen-log';
    panel.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;max-height:30vh;overflow-y:auto;background:rgba(0,0,0,0.85);color:#a8c478;padding:8px 30px 8px 8px;font-family:monospace;font-size:11px;z-index:9999;border-radius:4px;white-space:pre-wrap;word-break:break-all;';
    document.body.appendChild(panel);
    // 关闭按钮
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:4px;right:8px;cursor:pointer;color:#ff8888;font-weight:bold;font-size:14px;';
    closeBtn.onclick = () => panel.style.display = 'none';
    panel.appendChild(closeBtn);
  }
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.style.cssText = isError ? 'color:#ff8888;margin-bottom:4px;' : 'margin-bottom:4px;';
  line.textContent = `[${time}] ${msg}`;
  panel.appendChild(line);
  // 自动滚动到底部
  panel.scrollTop = panel.scrollHeight;
}
// 暴露到全局方便调试
window.screenLog = screenLog;

// 全局状态
const state = {
  growth: 0.0,        // 苔藓生长值 0~1，由滑动条控制
  isReady: false,
  mossMaterial: null, // Shader材质引用，后面更新uniform用
  model: null,        // 3D模型引用，调试时可访问
  debugMode: false,   // 调试模式开关
  floatEnabled: false, // 悬浮动画，默认关闭便于调试（确认模型显示后再开）
  floatBaseZ: 0,      // 悬浮的基准距离
};

// 检查URL参数
const urlParams = new URLSearchParams(window.location.search);
state.debugMode = urlParams.get('debug') === '1';
state.noMossMode = urlParams.get('nomoss') === '1';  // 跳过苔藓Shader，用纯色材质

// ========== 初始化 MindAR ==========
async function initAR() {
  const arContainer = document.getElementById('ar-container');

  const mindarThree = new MindARThree({
    container: arContainer,
    imageTargetSrc: MIND_FILE,
    // 追踪优化参数
    maxTrack: 1,
    filterMinCF: 0.001,     // 降低敏感度，减少抖动（原0.0001）
    filterBeta: 0.001,      // 大幅降低beta（原50），让追踪更平滑
    warmupTolerance: 5,
    missTolerance: 5,
  });

  const { renderer, scene, camera } = mindarThree;

  // 环境光照——苔藓需要柔和的光，不能太亮
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 5, 3);
  scene.add(dirLight);

  // 一个稍微偏冷的填充光，模拟天空反射
  const fillLight = new THREE.DirectionalLight(0xc4d4e8, 0.3);
  fillLight.position.set(-3, 2, -2);
  scene.add(fillLight);

  // 锚点：识别到图后，3D内容会附着在这里
  const anchor = mindarThree.addAnchor(0);

  // 锚点可见性切换
  anchor.onTargetFound = () => {
    console.log('Target found');
    document.getElementById('hint').classList.add('hidden');
    document.getElementById('ui').classList.remove('hidden');
  };

  anchor.onTargetLost = () => {
    console.log('Target lost');
    document.getElementById('hint').classList.remove('hidden');
    document.getElementById('ui').classList.add('hidden');
  };

  // ========== 加载3D模型 ==========
  await loadModel(anchor);

  // ========== 启动 AR ==========
  await mindarThree.start();
  document.getElementById('loading').classList.add('hidden');
  state.isReady = true;

  // 渲染循环
  renderer.setAnimationLoop(() => {
    const t = performance.now() * 0.001;

    // 把当前growth传给主Shader
    if (state.mossMaterial) {
      state.mossMaterial.uniforms.uGrowth.value = state.growth;
      state.mossMaterial.uniforms.uTime.value = t;
    }

    // 更新Shell层的uniform
    if (state.shellMaterials) {
      for (const mat of state.shellMaterials) {
        mat.uniforms.uGrowth.value = state.growth;
        mat.uniforms.uTime.value = t;
      }
    }

    // 悬浮动画（默认关闭）
    if (state.model && state.floatEnabled) {
      const baseZ = state.floatBaseZ;
      state.model.position.z = baseZ + Math.sin(t * 0.5) * 0.05;
      state.model.rotation.y += 0.002;
    }

    renderer.render(scene, camera);
  });
}

// ========== 加载GLB模型并应用苔藓Shader ==========
async function loadModel(anchor) {
  const loader = new GLTFLoader();
  screenLog('Loading model: ' + MODEL_FILE);

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_FILE,
      (gltf) => {
        const model = gltf.scene;
        screenLog('Model loaded successfully, inspecting...');

        // 统计mesh数量
        let meshCount = 0;
        let totalVertices = 0;
        model.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            if (child.geometry && child.geometry.attributes.position) {
              totalVertices += child.geometry.attributes.position.count;
            }
          }
        });
        screenLog(`Mesh count: ${meshCount}, vertices: ${totalVertices}`);

        if (meshCount === 0) {
          screenLog('Warning: model has no Mesh (Rhino export issue?)', true);
        }

        // 计算模型包围盒，了解实际大小
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        screenLog(`Original size: X=${size.x.toFixed(2)} Y=${size.y.toFixed(2)} Z=${size.z.toFixed(2)}`);
        screenLog(`Center: X=${center.x.toFixed(2)} Y=${center.y.toFixed(2)} Z=${center.z.toFixed(2)}`);

        // ========== 自动归一化模型 ==========
        // targetSize = 模型最长边相对于AR坐标系的大小
        // AR坐标系：1 单位 = 识别图的短边
        // - 2.0 = 模型最长边 = 海报短边的2倍（太大，部分超出画面）
        // - 1.0 = 模型最长边 = 海报短边（刚好覆盖海报，推荐）
        // - 0.7 = 模型最长边 = 海报短边的70%（适中，悬浮在海报上方）
        //
        // 可通过URL参数 ?size=0.8 临时覆盖（无需改代码）
        const sizeOverride = parseFloat(new URLSearchParams(window.location.search).get('size'));
        const TARGET_SIZE = !isNaN(sizeOverride) ? sizeOverride : 0.8;  // 默认0.8 = 海报短边80%

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const normalizedScale = TARGET_SIZE / maxDim;
          model.scale.set(normalizedScale, normalizedScale, normalizedScale);
          model.position.set(
            -center.x * normalizedScale,
            -center.y * normalizedScale,
            -center.z * normalizedScale
          );
          screenLog(`Auto-scale: ${normalizedScale.toFixed(3)}x → target ${TARGET_SIZE} units`);
          screenLog(`Final position: X=${model.position.x.toFixed(2)} Y=${model.position.y.toFixed(2)} Z=${model.position.z.toFixed(2)}`);
        }

        // ========== 模型旋转配置 ==========
        screenLog('Model original orientation preserved');

        // 创建噪声纹理
        const noiseTexture = createNoiseTexture(256);

        // 创建苔藓Shader材质
        state.mossMaterial = new THREE.ShaderMaterial({
          uniforms: {
            uGrowth: { value: 0.0 },
            uTime: { value: 0.0 },
            uNoiseTex: { value: noiseTexture },
            uMossColorDeep: { value: new THREE.Color(0x2d3a2a) },
            uMossColorBright: { value: new THREE.Color(0x6b8e4e) },
            uMossColorTip: { value: new THREE.Color(0xa8c478) },
            uBaseColor: { value: new THREE.Color(0xb8b0a0) },
            uTextureScale: { value: 8.0 },
            uCavityStrength: { value: 0.6 },
            uUpwardBias: { value: 0.55 },
          },
          vertexShader: mossVertexShader,
          fragmentShader: mossFragmentShader,
          extensions: {
            derivatives: true,
          },
        });

        // 给模型所有Mesh应用材质
        let materialToApply;
        if (state.noMossMode) {
          // ?nomoss=1 时使用鲜红色基础材质，用于诊断模型可见性
          materialToApply = new THREE.MeshNormalMaterial();  // 按法线着色，让模型每个面颜色不同
          screenLog('NoMoss mode: using normal material instead of moss shader');
        } else {
          materialToApply = state.mossMaterial;
        }

        model.traverse((child) => {
          if (child.isMesh) {
            if (!child.geometry.attributes.normal) {
              child.geometry.computeVertexNormals();
            }
            child.material = materialToApply;
          }
        });

        anchor.group.add(model);
        state.model = model;

        // ========== Shell Texturing（毛茸茸效果） ==========
        // 在主模型外面再加几层"外壳"，每层沿法线方向外扩一点
        // 模拟苔藓的体积感——像毛皮、绒毛、苔藓那种"植绒"效果
        if (!state.noMossMode) {
          const SHELL_COUNT = 6;  // 外壳层数，越多越蓬松但越耗性能
          const SHELL_DISTANCE = 0.008;  // 每层之间的距离（AR单位，约0.12cm）
          state.shellMaterials = [];

          for (let i = 1; i <= SHELL_COUNT; i++) {
            const shellOffset = i * SHELL_DISTANCE;
            const shellHeight = i / SHELL_COUNT;  // 0~1，外层=1

            // 每层一个独立Shader材质，参数稍有不同
            const shellMaterial = new THREE.ShaderMaterial({
              uniforms: {
                uGrowth: { value: 0.0 },
                uTime: { value: 0.0 },
                uNoiseTex: { value: state.mossMaterial.uniforms.uNoiseTex.value },
                uMossColorDeep: { value: new THREE.Color(0x2d3a2a) },
                uMossColorBright: { value: new THREE.Color(0x6b8e4e) },
                uMossColorTip: { value: new THREE.Color(0xb8d488) },
                uTextureScale: { value: 12.0 },
                uShellHeight: { value: shellHeight },  // 这层在哪个高度
                uShellOffset: { value: shellOffset },  // 沿法线偏移多少
                uCavityStrength: { value: 0.6 },
                uUpwardBias: { value: 0.55 },
              },
              vertexShader: shellVertexShader,
              fragmentShader: shellFragmentShader,
              transparent: true,
              side: THREE.DoubleSide,  // 双面渲染，避免某些角度看不到
              depthWrite: false,  // 不写深度，避免外壳遮挡问题
            });
            state.shellMaterials.push(shellMaterial);

            // 克隆模型用作外壳
            const shell = model.clone();
            shell.traverse((child) => {
              if (child.isMesh) {
                child.material = shellMaterial;
              }
            });
            anchor.group.add(shell);
          }
          screenLog(`Generated ${SHELL_COUNT} moss shell layers (fuzzy effect)`);
        }

        screenLog('Model added to scene, waiting for target...');

        // 如果开启调试模式，创建调试面板
        if (state.debugMode) {
          createDebugPanel();
        }

        resolve(model);
      },
      (progress) => {
        if (progress.total > 0) {
          const percent = (progress.loaded / progress.total) * 100;
          screenLog(`Loading: ${percent.toFixed(0)}%`);
        }
      },
      (error) => {
        screenLog('Model load failed: ' + error.message, true);
        console.error('Model load error:', error);
        reject(error);
      }
    );
  });
}

// ========== 程序生成噪声纹理 ==========
// 不依赖外部图片，直接在JS里生成一张噪声纹理给Shader用
function createNoiseTexture(size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(Math.random() * 256);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(
    data, size, size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ========== UI 交互 ==========
function initUI() {
  const slider = document.getElementById('growth-slider');
  const valueDisplay = document.getElementById('growth-value');

  slider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    state.growth = value / 100;
    valueDisplay.textContent = `${Math.round(value)}%`;
  });
}

// ========== 调试面板（仅 ?debug=1 时显示） ==========
// 现场对齐用：实时调整模型的scale和position，不用改代码重启
function createDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `
    <div class="dbg-title">DEBUG · Model Alignment</div>
    <div class="dbg-row">
      <label>Scale</label>
      <input type="range" id="dbg-scale" min="0.1" max="5" step="0.05" value="1.0">
      <span id="dbg-scale-val">1.00</span>
    </div>
    <div class="dbg-row">
      <label>X offset</label>
      <input type="range" id="dbg-x" min="-3" max="3" step="0.05" value="0">
      <span id="dbg-x-val">0.00</span>
    </div>
    <div class="dbg-row">
      <label>Y offset</label>
      <input type="range" id="dbg-y" min="-3" max="3" step="0.05" value="0">
      <span id="dbg-y-val">0.00</span>
    </div>
    <div class="dbg-row">
      <label>Z offset</label>
      <input type="range" id="dbg-z" min="-3" max="3" step="0.05" value="0.34">
      <span id="dbg-z-val">0.34</span>
    </div>
    <div class="dbg-row">
      <label>Rotate Y</label>
      <input type="range" id="dbg-roty" min="-180" max="180" step="1" value="0">
      <span id="dbg-roty-val">0°</span>
    </div>
    <button id="dbg-copy">Copy values</button>
    <button id="dbg-close">Close</button>
  `;
  document.body.appendChild(panel);

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    const val = document.getElementById(id + '-val');
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      val.textContent = id === 'dbg-roty' ? `${v}°` : v.toFixed(2);
      fn(v);
    });
  };

  bind('dbg-scale', (v) => state.model.scale.set(v, v, v));
  bind('dbg-x', (v) => state.model.position.x = v);
  bind('dbg-y', (v) => state.model.position.y = v);
  bind('dbg-z', (v) => {
    state.floatBaseZ = v;  // 同步基准距离
    state.model.position.z = v;
  });
  bind('dbg-roty', (v) => state.model.rotation.y = v * Math.PI / 180);

  document.getElementById('dbg-copy').addEventListener('click', () => {
    const s = state.model.scale.x.toFixed(2);
    const x = state.model.position.x.toFixed(2);
    const y = state.model.position.y.toFixed(2);
    const z = state.model.position.z.toFixed(2);
    const ry = (state.model.rotation.y * 180 / Math.PI).toFixed(0);
    const text = `// Alignment values from debug:
const SCALE_FACTOR = ${s};
model.scale.set(SCALE_FACTOR, SCALE_FACTOR, SCALE_FACTOR);
model.position.set(${x}, ${y}, ${z});
model.rotation.y = ${ry} * Math.PI / 180;`;
    navigator.clipboard.writeText(text).then(() => {
      alert('Values copied to clipboard. Paste into main.js to apply.');
    });
  });

  document.getElementById('dbg-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });
}

// ========== 错误处理 ==========
window.addEventListener('error', (e) => {
  console.error('Global error:', e);
});

// ========== Start ==========
async function start() {
  screenLog('Starting...');
  try {
    initUI();
    screenLog('UI initialized');
    await initAR();
    screenLog('AR system ready!');
  } catch (err) {
    screenLog('Failed to start: ' + err.message, true);
    console.error('Failed to start AR:', err);
    document.getElementById('loading').innerHTML =
      '<div class="loader-text">Unable to start<br>Please allow camera access and refresh</div>';
  }
}

start();
