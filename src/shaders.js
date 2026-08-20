// 苔藓 Shader v2 (GLSL ES 3.0 兼容版本)
// 致敬 Easy Moss (Unity Asset)，移植到 WebGL/Three.js
//
// 核心思路：
//   1. Triplanar Mapping (不需要UV) - 从XYZ三轴投射噪声纹理
//   2. 朝上的面优先长苔藓 (法线点积)
//   3. 缝隙/凹陷处优先长苔藓 (屏幕空间曲率检测，近似AO)  ← NEW
//   4. 噪声制造有机边界
//   5. uGrowth 0->1 控制阈值

// ==================== Vertex Shader ====================
export const mossVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewPosition;
  varying vec3 vObjectPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vObjectPosition = position;

    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    vec4 mvPosition = viewMatrix * worldPos;
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ==================== Fragment Shader ====================
// 兼容WebGL 1 和 WebGL 2
// dFdx/dFdy 在两个版本都可用，Three.js 会自动处理
export const mossFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uGrowth;          // 生长值 0~1
  uniform float uTime;            // 时间
  uniform sampler2D uNoiseTex;    // 噪声纹理
  uniform vec3 uMossColorDeep;    // 苔藓深色
  uniform vec3 uMossColorBright;  // 苔藓主色
  uniform vec3 uMossColorTip;     // 苔藓尖端亮色
  uniform vec3 uBaseColor;        // 原模型材质色
  uniform float uTextureScale;    // 纹理重复频率
  uniform float uCavityStrength;  // 缝隙效应强度 (0~1)
  uniform float uUpwardBias;      // 朝上偏好强度 (0~1)

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vViewPosition;
  varying vec3 vObjectPosition;

  // ---------- Triplanar 采样（不需要UV） ----------
  vec4 triplanarSample(sampler2D tex, vec3 pos, vec3 normal, float scale) {
    vec3 blend = abs(normal);
    blend = pow(blend, vec3(4.0));
    blend = blend / (blend.x + blend.y + blend.z);

    vec4 xProj = texture2D(tex, pos.yz * scale);
    vec4 yProj = texture2D(tex, pos.xz * scale);
    vec4 zProj = texture2D(tex, pos.xy * scale);

    return xProj * blend.x + yProj * blend.y + zProj * blend.z;
  }

  // ---------- 多倍频噪声 (FBM) ----------
  float fbmNoise(vec3 pos, vec3 normal) {
    float n1 = triplanarSample(uNoiseTex, pos, normal, uTextureScale).r;
    float n2 = triplanarSample(uNoiseTex, pos, normal, uTextureScale * 2.7).r;
    float n3 = triplanarSample(uNoiseTex, pos, normal, uTextureScale * 5.3).r;
    return n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  }

  // ---------- 屏幕空间曲率检测 (近似 AO / Cavity) ----------
  // 这是 Easy Moss "缝隙优先长"逻辑的实时近似
  // 原理：用 dFdx/dFdy 求位置和法线的变化率
  // 凹处返回较高值（让苔藓优先长），凸处返回较低值
  float screenSpaceCavity(vec3 pos, vec3 normal) {
    vec3 dPdx = dFdx(pos);
    vec3 dPdy = dFdy(pos);
    vec3 dNdx = dFdx(normal);
    vec3 dNdy = dFdy(normal);

    float normalCurvature = length(dNdx) + length(dNdy);
    float convexity = dot(dNdx, dPdx) + dot(dNdy, dPdy);

    float cavity = normalCurvature * 8.0 - convexity * 4.0;
    return clamp(cavity, 0.0, 1.0);
  }

  void main() {
    // ========== 1. 朝上程度 ==========
    float upness = dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0));
    float upFactor = smoothstep(-0.3, 1.0, upness);

    // ========== 2. 缝隙检测 (NEW) ==========
    float cavity = screenSpaceCavity(vWorldPosition, vWorldNormal);

    // ========== 3. 噪声 ==========
    float noise = fbmNoise(vWorldPosition, vWorldNormal);

    // ========== 4. 综合苔藓生长场 ==========
    // Easy Moss 核心理念：不只是"上面长"，而是"上面 + 缝里"
    float mossField =
      upFactor * uUpwardBias +
      cavity * uCavityStrength +
      noise * 0.35;

    // ========== 5. uGrowth 控制阈值 ==========
    float threshold = mix(1.2, -0.2, uGrowth);

    float mossCoverage = smoothstep(
      threshold,
      threshold + 0.08,
      mossField
    );

    // ========== 6. 苔藓颜色变化 ==========
    float colorVar = triplanarSample(
      uNoiseTex,
      vWorldPosition + vec3(13.7, 0.0, 7.1),
      vWorldNormal,
      uTextureScale * 1.5
    ).r;

    vec3 mossColor = mix(uMossColorDeep, uMossColorBright, colorVar);

    // 朝上的苔藓尖端更亮，缝隙里的苔藓更暗
    float tipLight = smoothstep(0.5, 1.0, upFactor) * (1.0 - cavity * 0.5);
    mossColor = mix(mossColor, uMossColorTip, tipLight * 0.5);

    // 缝隙里的苔藓加深
    mossColor *= mix(1.0, 0.7, cavity);

    // ========== 7. 简单光照 ==========
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(vWorldNormal, lightDir), 0.0);

    float ambient = 0.55 - cavity * 0.15;  // 缝隙自带阴影
    vec3 lighting = vec3(ambient + diffuse * 0.55);

    // ========== 8. 混合 ==========
    vec3 finalColor = mix(uBaseColor, mossColor, mossCoverage);
    finalColor *= lighting;

    float edge = mossCoverage * (1.0 - mossCoverage) * 4.0;
    finalColor -= edge * 0.08;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ==================== Shell Shader（毛茸茸效果） ====================
// 用于在模型外面叠多层"外壳"模拟苔藓绒毛的体积感
// 每层向外膨胀一点，用噪声打孔——孔的地方透明，留下的部分像苔藓尖端

export const shellVertexShader = /* glsl */ `
  uniform float uShellOffset;  // 这层外壳沿法线方向偏移多少

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPosition;

  void main() {
    // 把顶点沿法线方向"挤出"，形成外壳
    vec3 inflatedPosition = position + normal * uShellOffset;

    vec4 worldPos = modelMatrix * vec4(inflatedPosition, 1.0);
    vWorldPosition = worldPos.xyz;
    vLocalPosition = inflatedPosition;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const shellFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uGrowth;
  uniform float uTime;
  uniform sampler2D uNoiseTex;
  uniform vec3 uMossColorDeep;
  uniform vec3 uMossColorBright;
  uniform vec3 uMossColorTip;
  uniform float uTextureScale;
  uniform float uShellHeight;  // 0~1，外层=1（更"尖端"）
  uniform float uShellOffset;
  uniform float uCavityStrength;
  uniform float uUpwardBias;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPosition;

  vec4 triplanarSample(sampler2D tex, vec3 pos, vec3 normal, float scale) {
    vec3 blend = abs(normal);
    blend = pow(blend, vec3(4.0));
    blend = blend / (blend.x + blend.y + blend.z);

    vec4 xProj = texture2D(tex, pos.yz * scale);
    vec4 yProj = texture2D(tex, pos.xz * scale);
    vec4 zProj = texture2D(tex, pos.xy * scale);

    return xProj * blend.x + yProj * blend.y + zProj * blend.z;
  }

  void main() {
    // 1. 朝上偏好
    float upness = dot(normalize(vWorldNormal), vec3(0.0, 1.0, 0.0));
    float upFactor = smoothstep(-0.3, 1.0, upness);

    // 2. 高频噪声决定"绒毛"的分布
    // 每层的噪声值都一样，所以会形成"连续的针"
    float hairNoise = triplanarSample(uNoiseTex, vWorldPosition, vWorldNormal, uTextureScale).r;

    // 3. 这层在这个像素能不能"存在"
    // 苔藓覆盖区 + 噪声采样值 > 当前层高度 → 显示
    float mossPresence =
      upFactor * uUpwardBias +
      hairNoise * 0.55 + 0.3;

    // uGrowth控制阈值
    float threshold = mix(1.3, 0.3, uGrowth);
    float coverage = smoothstep(threshold - 0.05, threshold, mossPresence);

    // 每层只在 hairNoise > uShellHeight 时存在
    // 这样外层就只有最"高"的部分才有像素 → 形成尖端
    float hairThreshold = uShellHeight * 0.9;
    float hairAlpha = step(hairThreshold, hairNoise);

    float finalAlpha = coverage * hairAlpha;

    if (finalAlpha < 0.05) discard;  // 透明像素直接丢弃

    // 4. 颜色：外层更亮（模拟尖端受光），内层更暗
    vec3 mossColor = mix(uMossColorDeep, uMossColorBright, hairNoise);
    mossColor = mix(mossColor, uMossColorTip, uShellHeight * 0.6);

    // 5. 简单光照
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(vWorldNormal, lightDir), 0.0);
    float ambient = 0.5 + uShellHeight * 0.2;
    vec3 lighting = vec3(ambient + diffuse * 0.5);

    gl_FragColor = vec4(mossColor * lighting, finalAlpha);
  }
`;
