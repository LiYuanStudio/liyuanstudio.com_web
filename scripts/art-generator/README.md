# 车水马龙 · 模型调用工具

纯本地、参数化视觉生成器。没有网页入口、服务器或模型 API 依赖，不修改产品页。
运行环境：项目的 Node.js >=22、npm 依赖。通过 `tsx` 执行，`sharp` 导出 PNG。

## 模型调用

先运行 `npm run art:generate -- --describe` 获取机器可读参数。

```sh
# 产品卡背景，左侧留给文案
npm run art:generate -- --out artifacts/art/cobalt-001 --palette cobalt --negativeSpace left --seed 42

# 产品展示：图片保持清晰，背景承担运动感
npm run art:generate -- --out artifacts/art/product-001 --product /absolute/path/product.png --negativeSpace center --productX 50 --productScale 65

# 方形素材、暖色相似色、回旋构图
npm run art:generate -- --out artifacts/art/amber-001 --width 1600 --height 1600 --palette amber --layout eddy --negativeSpace none

# 从历史配置复现，必须使用新的输出目录
npm run art:generate -- --config artifacts/art/cobalt-001/config.json --out artifacts/art/cobalt-002

# 机器调用可以跳过 npm 的前导输出
node --import tsx scripts/art-generator/index.ts --out artifacts/art/machine-001 --seed 42

# 同一色组，12 种构图用于一组产品卡
npm run art:generate -- --out artifacts/art/cards-001 --batch 12 --palette jade --width 1200 --height 800

# 轮换 20 组相似色，同时轮换构图，生成选型总览
npm run art:generate -- --out artifacts/art/exploration-001 --batch 20 --varyPalette --negativeSpace none

# 固定构图，比较所有配色
npm run art:generate -- --out artifacts/art/palettes-001 --batch 20 --varyPalette --layout orbit

# 同色比较四种材质（蚀纹、拉丝、塑料、木理）
npm run art:generate -- --out artifacts/art/materials-001 --batch 4 --varyMaterial --palette ocean --layout sweep --negativeSpace none

# 固定木理，生成一套相似色产品卡
npm run art:generate -- --out artifacts/art/wood-001 --material wood --palette olive --batch 12
```

成功时 stdout 最后一行为 JSON，含输出绝对路径；失败时 stderr 输出 JSON，退出码为 1。
参数使用 camelCase。未知参数和越界值直接报错。
配置只接受参数对象（不是 manifest），命令行覆盖配置。配置中的产品路径相对配置文件，命令行路径相对工作目录。

## 视觉原则

v2 根据用户补充的 Kimi 卡片纹理参考重新实现：

- 相似色作为主调，以亮度、纯度、疏密形成张力；不使用互补色冲撞。
- 用覆盖全幅的细短曲线、低对比色面和宽幅压痕表现流向；去掉黑底、发光丝带。
- 不画车、道路、河流、城市、点阵或油画笔触。
- 产品信息层保持锐利；留白区降低细纹对比，方便后续加入文案。

## 材质差异与参考

v3 默认 `--colorMode material`：配色提示会映射为与材质匹配的表面色阶。
木材采用灰蜡木、浅橡木、柚木、樱桃木、胡桃木；金属采用冷银、石墨灰、香槟金、暖铜或低饱和表面着色；塑料采用本体着色。
因此 20 个色组提示不意味着每种材质有 20 种不同的自然色。实际色阶及名称记录在 manifest/index 的 `appearance` 中。
如需明确保留紫木、粉金属等艺术染色，传 `--colorMode expressive`。
v3 同时加入连续的局部走向变化、柔化压纹、不等宽断续木理及低对比色斑，减少整齐重复感。
旧参数在 v3 的输出会变化，旧文件保持不动。

`--material` 控制生成结构；`--varyMaterial` 在批量模式轮换四种材质。
差异来自笔划尺度、方向性、孔隙与反光结构，不仅是色相变化。

| material | 参考的真实结构 | 抽象化实现 |
| --- | --- | --- |
| etched | 蚀刻表面的粗细反差 | 短弯刻痕与不规则宽幅压痕，作为默认方向 |
| brushed | 单向研磨、拉丝的定向结构 | 长细划痕随流场偏转，宽反光带贯穿色面 |
| polymer | 塑料模具喷砂、压纹 | 无固定方向的细砂面，叠加浅色模压肋纹 |
| wood | 早晚材密度差、孔隙与生长纹 | 不等宽纹带、局部绕行和短导管纹，保留染色木感 |

来源（2026-09-23 查阅）：

- [worldstainless: Stainless Steel Surfaces](https://worldstainless.org/wp-content/uploads/2025/02/Module_08_Surface_Finishes_en.pdf)，第 6 页定向磨刷、第 9 页蚀刻、第 12 页喷砂。
- [Protolabs: Mold textures and finishes](https://www.protolabs.com/resources/design-tips/mold-texture-standards-and-finishes/)，轻/中喷砂与塑料表面处理。
- [The Wood Database: Hardwood anatomy](https://www.wood-database.com/wood-articles/hardwood-anatomy/)，年轮与不同孔隙分布；[木材形成](https://www.wood-database.com/wood-articles/what-is-wood/)中的早材/晚材差异。

资料提供结构依据，不把照片当作背景或宣称物理仿真。区别于参考卡片的方向是「让加工痕迹随流场发生偏转」，同时保留各材质可辨认的结构。
设计仍需看实际卡片尺寸下的输出；技术测试通过不代表审美得到用户认可。

这是程序化曲线生成，不是文生图模型，也不宣称精确复刻原对话中未取得的生成图。
20 种相似色组：`cobalt` 群青、`jade` 青绿、`amber` 琥珀、`iris` 鸢尾、
`glacier` 冰蓝、`lagoon` 泻湖、`ocean` 海蓝、`mint` 薄荷、`forest` 森林、
`moss` 苔绿、`olive` 橄榄、`citrine` 柠黄、`honey` 蜂蜜、`terracotta` 陶土、
`vermilion` 朱红、`rose` 玫瑰、`berry` 莓紫、`plum` 梅紫、`lavender` 薰衣草、`indigo` 靛青。
每组覆盖 18–34 度的邻近色相区间，使用低饱和底色和相似色细纹。
12 种 layout 在 v2 中控制全幅纹理的方向场，而不是 12 种发光轮廓。

12 种构图骨架，可搭配任意色组（240 种基础组合），随机种子进一步改变细节：

| 参数 | 构图 | 卡片用途 |
| --- | --- | --- |
| sweep | 横向掠流 | 横幅、通用背景 |
| eddy | 开放回旋 | 主视觉、产品展示 |
| cross | 交错穿插 | 强动势卡片 |
| arch | 拱形上扬 | 中央产品、发布海报 |
| cascade | 纵向垂落 | 竖卡、移动端 |
| orbit | 环绕轨迹 | 中央主体 |
| split | 两向分流 | 并列信息、功能卡 |
| diagonal | 对角斜掠 | 小卡、行动入口 |
| fold | 折返长轨 | 宽幅特写 |
| contour | 偏侧等高线 | 文案侧留白 |
| pulse | 起伏脉冲 | 动态主题、更新卡 |
| fan | 扇形展开 | 汇聚主题、封面 |

`--batch 1–48` 默认轮换骨架，每张 seed 增加 104729（按 uint32 回绕）。显式传 `--layout` 或配置含 layout 时固定构图。
批量默认保持统一色组；`--varyPalette` 从指定 palette 开始循环轮换全部色组。
每张仍只使用一组相似色。批量结果包含编号子目录、带编号/构图/配色/seed 的 `contact-sheet.png` 总览和 `index.json` 索引。
可以按索引选出素材，再读取它的 config.json 改尺寸或叠加产品。为避免内存峰值，逐张渲染。

## 参数与产物

`--help` 给出全部范围。常用画幅：1920×1080 横图、1600×1600 方图、1080×1440 竖图。
`negativeSpace` 可取 left / center / right / none。
产品缩放是相对于画幅的最大包围盒，保持比例；X/Y 是剩余可移动空间的位置，边缘值也不会裁掉产品。
不会自动抠图。透明 PNG 效果最好；JPEG/WebP 的原背景会保留。
产品文件不超过 20 MB / 2400 万像素，拒绝动画和 SVG 输入，不获取远程图片。

每次输出一个**全新目录**：

- `image.png`：按目标尺寸渲染的成品。
- `image.svg`：矢量背景，产品图以 PNG 嵌入；可独立打开。
- `config.json`：全部参数（产品路径转为绝对路径），可再次调用。
- `manifest.json`：版本、渲染依赖版本、输入与输出 SHA-256。

相同配置、产品字节和生成器/渲染版本可复现图片；manifest 时间戳不同。跨 sharp/libvips 版本的 PNG 不保证逐字节相同。
v2 重做了生成算法，v1 配置可以继续使用，但不会生成旧版光带；旧版输出不覆盖。
本地图片及其路径会出现在产物中，分享时按需选择 image.png 或 image.svg。
工具不覆盖已有目录；失败后若产生部分输出，将其保留并选择新目录重试。
`artifacts/art/` 被 git 忽略，避免将大图或本地产品素材意外提交。

验证：`npm run test:art`。该工具不参与前端构建或部署。
