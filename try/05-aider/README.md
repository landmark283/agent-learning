# W3 · T5a 压缩版 Aider：编辑协议 + Repo Map

> 对应理论：**#9 ACI（工具/接口设计）**、**#16 差分编辑与验证回路**
> 前置：W1 的 fork（`edit_file` 只支持"唯一精确匹配"，失败只抛一句错；检索只有 `grep`）
> 产出：`notes/aider.md` 一页纸 + fork 升级方案

## 0. 为什么只读这两块（决策记录）

原计划 W3-D1~4 读 Aider 全貌，现压缩为 **1~2 天**，只取两个能直接搬回 fork 的机制：

1. **SEARCH/REPLACE 编辑协议**（含失配回喂）—— 解决"模型怎么安全地改文件"；
2. **Repo Map**（按相关性选符号）—— 解决"大仓库把什么放进上下文"。

其余部分（命令系统、多种 edit format、git 自动提交、watch 模式、voice/web）属于广度，本轮跳过；
OpenHands 那 3 天顺延（见 `01-学习路径.md` 的决策注记）。
理由：终点是写 DSH 插件，**Cordis 是硬前置**；而这两块正好是 fork 现在最缺的能力。

## 1. 源码与阅读纪律

- 源码：`source/aider`（经本地代理抓取，685 个文件）。**注意仓库内没有 `docs/`**——官方文档在 aider.chat（见参考）。
- 纪律（**预测-对照法**）：开读前先在 `notes/aider.md` 写下三条预测，读后只记差距：
  1. 为什么不让模型直接重写整个文件？
  2. 搜索块匹配不上时，应该"猜一个最像的位置"还是"报错"？
  3. 上万文件的仓库，靠什么决定哪些符号进上下文？

---

## Day 1 · SEARCH/REPLACE 编辑协议

### 为什么需要"编辑协议"

模型只能产出文本，不能直接改文件。三条路：

| 做法 | 代价 | 风险 |
|---|---|---|
| whole：重发整个文件 | 贵、慢 | 模型偷懒省略（写 `# ... 其余不变 ...`）→ 代码被删掉 |
| diff：只发差异（SEARCH/REPLACE） | 便宜 | 搜索块必须逐字符匹配，容易失配 |
| 工具调用：JSON 参数（**你 fork 现在的方式**） | 中 | 大段代码塞进 JSON 参数，转义/换行易错；失配时无补救线索 |

Aider 的核心设计选择：**失配时绝不猜位置，而是报错 + 告诉模型"你是不是想匹配这些行"**，
把纠错交还给模型（最多重试 3 次）。这就是 #16"差分编辑验证回路"的完整形态。

### 是什么：格式与规则

```
mathweb/flask/app.py          ← 路径单独一行（相对路径，原样）
```python                     ← 打开 fence + 语言
<<<<<<< SEARCH                ← 搜索块开始
from flask import Flask
=======                       ← 分隔线
import math
from flask import Flask
>>>>>>> REPLACE               ← 替换块结束
```                           ← 闭合 fence
```

规则（摘自 `coders/editblock_prompts.py:120-159` 的 `system_reminder`）：

- SEARCH 必须**逐字符**匹配现有内容（含缩进、注释、docstring）；
- 只替换**第一次**出现，所以要"多行 + 唯一"；鼓励拆成多个小块，别把大段没改的代码也放进来；
- 空 SEARCH + 新路径 = 新建文件；空 SEARCH + 已存在文件 = 追加；
- 括在 json/xml/quotes 容器里的内容，要按**字面**改（连容器标记一起）；
- 最后一句话是 `ONLY EVER RETURN CODE IN A *SEARCH/REPLACE BLOCK*!`——协议优先于自然语言。

### 怎么实现的（行号精读指引）

| 机制 | 位置 | 要点 |
|---|---|---|
| 发给模型的规则与示例 | `coders/editblock_prompts.py:31-118`（示例）、`:120-159`（规则） | 用 few-shot 把格式钉死 |
| **宽容定界符**解析 | `coders/editblock_coder.py:386-396` | 正则允许 **5~9** 个 `<`/`>`（模型常写多或写少） |
| 扫描响应、抽出块 | `:439-535` | 行扫描状态机；顺带抽出 ` ```bash ` 等 shell 块（`:475-485`）单独执行 |
| 认文件名 | `:538-599` | 回看 3 行；容忍"文件名被 fence 包住"（DeepSeek Coder v2 的老毛病）；精确 → basename → difflib 模糊（0.8） |
| **匹配梯子** | `:157-187` + `:243-293` | ①完美匹配 ②忽略前导空白差异（模型缩进写错）③丢掉多余的首个空行 ④`...` 省略块（`:190-240`） |
| **模糊匹配被关掉** | `:183` 的裸 `return` | `replace_closest_edit_distance`（`:296-329`）写了但**没接进主路径**——宁可报错也不猜位置 |
| 失败回喂文本 | `:84-124` | `SearchReplaceNoExactMatch` + did-you-mean（`:602-628`，相似度阈值 **0.6**）+ "REPLACE 内容已在文件里？" + 已成功的块"不要重发" |
| 反射重试 | `coders/base_coder.py:100-102`、`:932-944`、`:2296-2336` | 错误文本存进 `reflected_message`，作为**下一轮 user 消息**再发；`max_reflections = 3`，超了就停 |
| 部分成功是常态 | `editblock_coder.py:69-74`、`:117-123` | 一个响应里 N 个块：成功的已落盘，只要求重发失败的 |

### 动手（约 45 分钟）

1. **跑现成脚本**（本目录）——它在无依赖环境下 `exec` Aider 的纯函数（因为 `editblock_coder.py` 顶部
   import 了牵出 litellm 的 `base_coder`，直接 import 装不上；但协议逻辑全是纯函数）：

   ```bash
   cd try/05-aider
   python verify_editblock.py      # 7/7 断言通过
   ```

   它逐条演示：宽容定界符解析 / 精确匹配 / 缩进宽容 / 失配返回 None / did-you-mean / `...` 省略 / 空 SEARCH 建文件 / 模糊匹配被关掉。

2. **读脚本第 4b 的注释**（一个真实细节）：`find_similar_lines` 用 `SequenceMatcher` 比的是**行列表**，
   单行 search 块只有"相等/不等"两种结果（比值非 0 即 1）→ **did-you-mean 实际只对多行块生效**。

3. **换成真实代码**：把脚本里的 `ORIGINAL` 替换成你仓库里的一段真实代码（比如 `agent.ts` 里 runTask 的一段），
   重复第 4 步，看 did-you-mean 给你的建议合不合理。

### 验收

- [ ] 能不查文档默写一个合法 SEARCH/REPLACE 块（路径行 + fence + 三个定界符）
- [ ] 能解释"为什么失配时报错优于猜测"，以及报错信息里**必须**给模型哪三样东西
- [ ] 能列出 Aider 的匹配宽容有哪几级、每一级是为了对付模型的什么毛病

---

## Day 2 · Repo Map（仓库地图）

### 为什么

大仓库塞不进上下文：全量代码不可能；只列文件名没有结构信息；纯 `grep` 只有关键词、没有相关性排序
（你 fork 现在就是这样）。需要的是「**按相关性挑选符号，并在 token 预算内渲染**」。

### 是什么：三个步骤

1. **抽符号**：tree-sitter 解析每个文件，用语言查询（`aider/queries/tree-sitter-languages/typescript-tags.scm` 等）
   抽出 def/ref 标签，带 mtime + SQLite 缓存 → `repomap.py:233-363`（`get_tags`）
2. **建图 + 排序**：文件为节点的图、标识符引用为**带权边**，跑 **PageRank**；
   personalization 让"已在 chat 里的文件"权重更高 → `:365-534`
3. **按预算渲染**：挑 top 标签，渲染成符号树（每个函数只留定义行），逐步逼近 `--map-tokens`
   （默认 **1024**，`:49`）→ `:576-786`（`to_tree` / `render_tree`）

### 权重启发式（最值得抄的部分，`:487-514`）

| 规则 | 乘数 | 直觉 |
|---|---|---|
| 用户消息里提到的标识符 | ×10 | 被点名 = 强相关 |
| 长且有风格的命名（snake/kebab/camel 且 ≥8 字符） | ×10 | 真实 API 名比 `i`、`x` 重要 |
| `_` 开头的私有名 | ×0.1 | 私有，别占预算 |
| 一个标识符有 >5 个定义者 | ×0.1 | 歧义大（如 `get`）→ 降权 |
| 引用它的文件在 chat 里 | ×50 | 你正在改的文件用到的符号优先 |
| 引用次数 | √n | 抑制高频词的支配效应 |

> 对照思考（留给 W5）：DSH 里"该把什么放进上下文"的答案是 `dsh-fs-observation-policy`
> 这套**观察策略**，而不是仓库地图。读 `dsh-tools` 时留意两种思路的差别。

### 动手（60~90 分钟，直接长在 fork 上）

**写一个迷你 Repo Map（TS，放进 fork 的练习分支）**——不依赖 tree-sitter，用正则近似：

1. 扫 `src/**/*.ts`，用正则抽 `export function/const/class` 定义，并记录每个文件里出现的标识符（refs）；
2. 建双向索引 `Map<ident, Set<file>>` → 生成图（边权：chat 文件 ×50、被点名标识符 ×10、√n）；
3. 自己写 20 行**幂迭代 PageRank**（不引依赖），输出"按分数排序的 `文件: 符号` 清单"；
4. 加 token 预算：按约 4 字符/token 估算，超出就截断（对照 Aider 的 `max_map_tokens`）。

**加分**：把它做成 `repo_map` 工具接进 `runTask`，然后问模型一个跨文件问题，
对比"只有 grep"与"repo_map + grep"的回答质量——这是最直观的 ACI 实验。

### 验收

- [ ] 在你的 fork 仓库上跑出排序后的符号清单，且**改动某个文件后排序会变**（personalization 生效）
- [ ] 能说出 PageRank 在这里扮演什么角色、为什么不用简单的引用计数排序
- [ ] 写进 `notes/aider.md`：repo map 与 grep 的三点差异（结构 vs 关键词 / 全局排序 vs 局部匹配 / 预算控制 vs 无上限）

---

## 收官产出

1. `notes/aider.md`：一页纸（解决什么问题 / 核心机制 / 验证点在哪 / 差距点）；
2. **fork 升级方案**（写进 `notes/teenycode-改造日志.md` 的"可改进"）：
   - `edit_file` 升级为 SEARCH/REPLACE 协议：失配时回喂"没匹配到 + 最相似的真实片段 + 是否已应用"，而不是干巴巴抛错（复刻 #16）；
   - 要不要加 `repo_map` 工具（迷你版）；
3. `git commit`（学习轨迹完整）。

## 参考

- Aider 官方文档 · Edit formats：<https://aider.chat/docs/more/edit-formats.html>（whole / diff / diff-fenced / udiff / editor-diff 的取舍）
- Aider 官方文档 · Repository map：<https://aider.chat/docs/repomap.html>
- Aider 仓库：<https://github.com/Aider-AI/aider>（本地副本 `source/aider`）
- 为什么 udiff 被简化改写：<https://aider.chat/2023/12/21/unified-diffs.html>
- 本目录脚本：`verify_editblock.py`（无依赖运行 Aider 纯函数，7/7 通过）
