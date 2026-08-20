# 苔藓 AR 项目 · 操作手册

## 你拿到了什么

一个完整的 MindAR + Three.js 项目骨架，包含：

- `index.html` — 网页入口
- `styles.css` — UI 样式（青苔绿主题）
- `src/main.js` — AR 核心逻辑（加载模型、管理状态、UI 交互）
- `src/shaders.js` — 苔藓 Shader（Triplanar Mapping，不需要 UV）
- `public/` — 放你的模型文件和图像识别目标的地方

---

## 三天行动计划

### Day 1（今天）：跑通骨架，确认链路

**目标：** 手机扫码 → 打开网页 → 识别图片 → 看到一个变色的方块（或你的模型，未必好看）

1. 装 Node.js（如果没有）
2. 准备图像识别目标（一张你打算贴在展品旁边的图）
3. 用 MindAR 工具把这张图转成 `.mind` 文件
4. 从 Blender 导出 prototype 为 `.glb` 文件
5. 本地跑起来测试
6. 部署到 Vercel/Netlify
7. 手机扫二维码，验证整个链路

### Day 2：调 Shader 效果

**目标：** 苔藓看起来像苔藓，滑动条能催生

1. 现场拍摄真实苔藓的照片做色彩参考
2. 调整 `main.js` 里的颜色参数（`uMossColorDeep`、`uMossColorBright`、`uMossColorTip`）
3. 调整 `shaders.js` 里的阈值、噪声频率、边界硬度
4. 测试滑动条范围，看看 0% 到 100% 的过渡是否合理

### Day 3：现场对齐 + 容错 + 备用

**目标：** 在真实展览现场可靠工作

1. 把标识图实际打印出来，贴到展品旁
2. 用手机在不同距离、角度、光线下测试
3. 调整模型的 `scale` 和 `position`（在 `main.js` 的 `loadModel` 函数里）
4. 录一段演示视频作为备用方案（万一现场网络出问题）

---

## 第一步：装 Node.js

如果你电脑上没有 Node.js：

- Mac：访问 https://nodejs.org/，下载 LTS 版本
- Windows：同上

装完后，打开终端（Mac 是 Terminal，Windows 是 PowerShell），输入：

```bash
node --version
```

看到一个版本号（比如 v20.x.x）就成功了。

---

## 第二步：准备图像识别目标

### 选什么图作为标识？

MindAR 的 Image Tracking 对图片有要求。**好的标识图：**

- 高对比度（黑白图、深色背景+浅色图案）
- 有大量不规则细节（文字、纹理、复杂图案）
- 不对称（防止180度识别错误）
- 不要太大或太小（10cm × 10cm 到 20cm × 20cm 是好尺寸）

**不好的标识图：**

- 纯色块、简单几何图形
- 重复对称图案（如格子布）
- 反光材质（如金属、玻璃下的图）
- 渐变为主、缺少边缘

### 为展览设计的标识图建议

既然这是建筑展，你可以把标识图设计成像展品标签：

- 一张 A5 大小的卡片（21cm × 14.8cm）
- 上半部分：作品名、作者、年份（用一种带衬线字体，有大量细节供识别）
- 下半部分：一段建筑学描述文字（密集排版的文字本身就是好的识别图）
- 整体黑白印刷，对比度高
- 卡片右下角小字提示"用手机扫上方二维码体验 AR"

用 Adobe Illustrator 或 InDesign 设计，导出 PNG 或 JPG（推荐尺寸 1024 × 1024 像素以上）。

### 生成 .mind 文件

1. 访问 MindAR 的图像编译工具：
   https://hiukim.github.io/mind-ar-js-doc/tools/compile

2. 上传你的标识图（PNG/JPG）

3. 点击 "Start"，等待编译（几秒钟）

4. 下载生成的 `targets.mind` 文件

5. 把这个文件重命名为 `target.mind`，放到项目的 `public/` 文件夹里

---

## 第三步：从 Blender 导出 GLB 模型

1. 在 Blender 里打开你的模型
2. 选中模型（可能有多个对象，全选）
3. 检查一下模型的尺寸——MindAR 的世界坐标里，识别图大约对应 1 个单位（视图片宽度而定），所以模型应该控制在几个单位以内
4. 菜单：**File → Export → glTF 2.0 (.glb/.gltf)**
5. 导出设置（重要）：
   - **Format**: glTF Binary (.glb)
   - **Include**: 勾选 "Selected Objects"（如果你只想导出选中的部分）
   - **Transform**: 不勾选 "+Y Up"（保持默认）
   - **Geometry**:
     - 勾选 "Apply Modifiers"（应用所有修改器）
     - 勾选 "UVs"（即使没有手动展开，也勾上）
     - 勾选 "Normals"
   - **Animation**: 全部不勾（你不需要动画）
6. 命名为 `prototype.glb`，放到项目的 `public/` 文件夹里

### 模型方向问题

如果导入网页后模型躺倒或者颠倒，在 `src/main.js` 找到这段：

```js
model.scale.set(0.5, 0.5, 0.5);
model.position.set(0, 0, 0);
// model.rotation.set(-Math.PI / 2, 0, 0);
```

取消最后一行的注释（删除 `//`），调整三个数字。每个数字是旋转弧度（Math.PI 约等于 3.14，对应 180 度）。常见情况：

- Blender Z-up 模型在 Three.js 里需要 X 轴转 -90 度：`rotation.set(-Math.PI / 2, 0, 0)`
- 如果模型背朝镜头：`rotation.set(0, Math.PI, 0)`

---

## 第四步：本地跑起来

1. 打开终端，进入项目文件夹：

```bash
cd path/to/moss-ar
```

2. 启动一个本地 HTTPS 服务器（**必须是 HTTPS，否则相机权限拿不到**）。最简单的方法是用 `vite`：

```bash
npm install -g vite
vite --host
```

3. Vite 启动后会显示两个网址，类似：
   - `Local: https://localhost:5173/`
   - `Network: https://192.168.x.x:5173/`

4. 用电脑浏览器打开 Local 地址，看看页面是否加载。**第一次会有一个"证书不安全"的警告，点"高级 → 继续访问"**

5. 用手机访问 Network 地址（确保手机和电脑在同一 WiFi 下）。同样跳过证书警告。

6. 允许相机权限。把镜头对准你的标识图（可以直接对屏幕显示的图）。

7. 应该能看到模型出现在图上。**第一次模型颜色可能不对，没关系，先确认它出现了。**

---

## 第五步：部署到 Vercel（生成展览用的二维码）

本地测试通过后，要部署到公网，观众才能扫码访问。

### 推荐方式：Vercel（免费、最快）

1. 注册 https://vercel.com/（用 GitHub 账号最方便）

2. 装 Vercel CLI：

```bash
npm install -g vercel
```

3. 在项目目录下：

```bash
vercel
```

4. 按提示登录、选择项目名称、确认设置。Vercel 会自动部署。

5. 部署完成后会给你一个网址，类似：
   `https://moss-ar-xxx.vercel.app`

6. 用手机访问这个网址，再测一次完整流程。

### 生成二维码

1. 用任何二维码生成器（如 https://www.qr-code-generator.com/）
2. 输入你的 Vercel 网址
3. 下载高分辨率二维码 PNG
4. 加到你的展品标识卡设计上
5. 现场打印 → 贴到展品旁

---

## 第六步：调 Shader 让苔藓好看

这个 Shader 是 Unity Asset Store 上 **Easy Moss**（你购买的那个）的 WebGL 移植版本，核心逻辑一致：

| Easy Moss (Unity) | 本项目 (WebGL) |
|---|---|
| Shader Graph | GLSL 代码 (shaders.js) |
| 朝上面长苔藓 | `uUpwardBias` 控制 |
| 缝隙处长苔藓 | `uCavityStrength` 控制 (屏幕空间曲率检测) |
| 噪声纹理 | 程序生成的噪声 + Triplanar 采样 |
| 苔藓厚度参数 | `uGrowth` 控制 (0~1 滑动条) |
| 苔藓颜色 | uMossColorDeep / Bright / Tip 三层 |

打开 `src/main.js` 找到 `state.mossMaterial`，下面是常调参数：

### 颜色（在 main.js 里改）

```js
uMossColorDeep: { value: new THREE.Color(0x2d3a2a) },    // 深处的暗绿
uMossColorBright: { value: new THREE.Color(0x6b8e4e) },  // 主体的中绿
uMossColorTip: { value: new THREE.Color(0xa8c478) },     // 受光处的浅绿
uBaseColor: { value: new THREE.Color(0xb8b0a0) },        // 模型原始的灰白
```

颜色用十六进制，可以在 https://htmlcolorcodes.com/color-picker/ 调色后复制。

**建筑学小tip：** 真实苔藓不是单一绿色，有偏黄、偏蓝、偏黑的层次。用三层颜色而不是一层，立刻有真实感。

### 生长偏好（在 main.js 里改）

```js
uCavityStrength: { value: 0.6 },  // 缝隙优先 (0~1)
uUpwardBias: { value: 0.55 },     // 朝上优先 (0~1)
```

**这是 Easy Moss 的核心特色！** 两个参数控制苔藓的生长偏好：

- **uCavityStrength = 0** → 苔藓不在缝隙里聚集（只看朝向）
- **uCavityStrength = 1** → 苔藓主要长在缝里、角落、凹陷处
- **uUpwardBias = 0** → 苔藓不区分朝向，到处长
- **uUpwardBias = 1** → 苔藓只在朝上的面上长

**建筑展览的推荐值：**
- 古老建筑/有岁月感的：缝隙 0.8，朝上 0.4（突出岁月在缝里的痕迹）
- 现代建筑/有机生长感：缝隙 0.5，朝上 0.7（强调"从顶部蔓延"的逻辑）
- 平均自然感：缝隙 0.6，朝上 0.55（默认值）

### 噪声密度（在 main.js 里改）

```js
uTextureScale: { value: 8.0 },  // 数字越大，斑块越小越密；越小越大越稀疏
```

试试 4.0、8.0、16.0，看哪个最像苔藓。

### 阈值范围（在 shaders.js 里改）

找到这行：
```glsl
float threshold = mix(1.2, -0.2, uGrowth);
```

`1.2` 是 growth=0 时的阈值（数字越大越没苔藓），`-0.2` 是 growth=1 时的阈值（数字越小苔藓越多）。

如果觉得"0%时还能看到苔藓"，把 1.2 改大到 1.4。
如果觉得"100%时还有空隙没覆盖"，把 -0.2 改小到 -0.4。

### 边缘锐度（在 shaders.js 里改）

找到：
```glsl
float mossCoverage = smoothstep(
  threshold,
  threshold + 0.08,
  mossField
);
```

`0.08` 是过渡宽度。改大（如 0.2）→ 边缘柔和。改小（如 0.02）→ 边缘锐利。**苔藓推荐 0.05~0.1。**

---

## 常见问题

### 模型出现但太大/太小

调 `main.js` 里的 `model.scale.set(0.5, 0.5, 0.5)`。三个数是 XYZ 缩放，通常一起改。

### 模型位置偏离标识图

调 `main.js` 里的 `model.position.set(0, 0, 0)`。
- X 正方向：右
- Y 正方向：上
- Z 正方向：朝向你（出屏幕）

如果你的展品摆在标识图**旁边**而不是图上，你需要把模型在 X 或 Z 方向移开。比如：
```js
model.position.set(0.5, 0, 0); // 向右移半个单位
```

### 苔藓看起来是平的，没有立体感

这个 Shader 是"贴在表面"的简化版。要做到毛茸茸的体积感需要 Shell Texturing（壳层渲染），那会让性能下降很多。如果一定要尝试，告诉我，但**不建议三天内尝试**。

替代方案：在 Shader 里加 normal perturbation（法线扰动），让苔藓表面有凹凸感的光照变化。这是 Day 3 可以尝试的优化。

### 手机扫码后白屏 / 黑屏

99% 是没有给相机权限。点击地址栏左边的小锁图标，手动允许相机。

### 跨设备颜色不一致

iOS Safari 和 Android Chrome 对 WebGL 颜色处理略有差异。在 Day 3 拿一台 iPhone 和一台 Android 各测一次，分别调参数（虽然麻烦，但展览级别要做）。

---

## 备用容错方案

万一现场出问题（网络、相机、识别失败），你需要一个备用方案：

1. **录视频**：在自己手机上跑一遍完整流程，录屏。在标识卡上加一行小字：
   "如 AR 无法加载，请扫此码观看演示视频"，附第二个二维码指向 YouTube/Vimeo 链接。

2. **离线 PDF 说明**：把整个项目的概念图、Shader 逻辑、生长阶段截图做成一份 PDF，放在云盘，对应另一个二维码。这样即使技术失败，作品的思想还能传达。

建筑学博士的展览，**作品的思想最重要**，技术只是载体。

---

## 联系我继续

如果在任何步骤卡住了，回来告诉我：
1. 你卡在第几步
2. 出现了什么错误信息（截图或文字）
3. 你做到了什么程度

我可以根据具体问题给精确解决方案。

祝展览成功。
