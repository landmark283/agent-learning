# 从零读懂 pnpm workspace 与 tsconfig：以 DSH 仓库为标本
> dsh作为生产级项目，引用了大量的包，学习dsh，了解怎样处理多包仓库是一个前置条件。

这篇笔记写给"会写 TypeScript、但没处理过多包仓库"的人。目标是把两件一直混在一起的事拆开：**pnpm 怎么把仓库连起来**，和 **TypeScript 怎么把代码连起来**。

标本是 `agent-learning/source/deepseek-harness/deepseek-harness`（下称 DSH）。文中所有结论都在这个仓库上实测过，实测命令汇总在文末附录。文中引用的相对路径，除特别说明外都相对 DSH 仓库根。

阅读顺序建议：第 0、1、2、3 节建立认知，第 4、5 节读 DSH 的真实配置，第 6、7 节补两个关键机制，第 8、9 节是动手清单和排查手册。

---

## 0. 先分清三个平面

这是全文最重要的一张表。多包仓库的所有困惑，几乎都来自把这三层当成了一层。

| 平面 | 谁在管 | 它眼里的"连接" |
|---|---|---|
| 磁盘平面 | 文件系统 | 一个个 `.ts` 文件放在哪 |
| 链接平面 | pnpm | `node_modules` 里的符号链接 / 目录联接 |
| 编译平面 | tsc、tsx、vitest、Node | 一条 `import` 语句解析到哪个文件 |

核心结论：**pnpm 只负责链接平面，它从不参与编译平面。** 一个 `import` 能不能被 tsc 解析、解析到源码还是声明文件，跟 pnpm 是否链接成功没有必然关系 —— tsc 有自己独立的解析器。这就是为什么 DSH 里同一个 `import`，在 tsc 眼里是 `.d.ts`，在 tsx 眼里是 `.ts`。

两个平面的交会点是 `package.json` 的 `exports` 字段。

---

## 1. pnpm 到底"连接"了什么

### 1.1 第一步：声明哪些目录算"包"

`pnpm-workspace.yaml` 的 `packages` 是 glob 列表，决定哪些目录是工作区包。DSH 的：

```yaml
packages:
  - vendor/*
  - packages/*/*
  - native/system
  - native/system/packages/*
  - apps/*
  - benchmarks
  - website
  - python/sdk-runtime
```

`packages/*/*` 表示 `packages/<组>/<包>` —— 正好两级。这就解释了 DSH 的包路径形状：`packages/core/agent`、`packages/shell/tool-pwsh`。组名（core、shell、fs、llm）只是目录分类，**不是嵌套包**，只有叶子目录里才有 `package.json`。

验证一下到底识别出多少个包：

```powershell
# 在 DSH 仓库根执行
$r = (Get-Location).Path
$pkgs = Get-ChildItem "$r\packages" -Directory | ForEach-Object { Get-ChildItem $_.FullName -Directory } | Where-Object { Test-Path (Join-Path $_.FullName 'package.json') }
$pkgs.Count
```

实测结果：268。

### 1.2 `workspace:` 协议

包之间互相依赖时，DSH 一律写：

```json
"@deepseek-ai/dsh-llm": "workspace:^"
```

它的含义是：安装时不要从 npm registry 下载，把我链接到工作区里那个叫这个名字的包。`^` 表示发布到 npm 时会被替换成实际版本号（例如 `^0.1.5-rc.2`）。

### 1.3 链接的实物长什么样

实测 DSH 里某个包的 `node_modules`：

```powershell
Get-ChildItem "$r\packages\shell\tool-pwsh\node_modules\@deepseek-ai" |
  Select-Object Name, LinkType, @{n='Target';e={$_.Target -join ''}}
```

```
Name           LinkType     Target
----           --------     ------
cordis         SymbolicLink ..\..\..\..\..\vendor\cordis
dsh-agent      SymbolicLink ..\..\..\..\core\agent
dsh-agent-loop SymbolicLink ..\..\..\..\core\agent-loop
dsh-app-boot   SymbolicLink ..\..\..\..\boot\app-boot
dsh-jobs       SymbolicLink ..\..\..\..\jobs\jobs
```

这就是 pnpm 的"连接"：`node_modules` 里放的不是拷贝，而是指向 `packages/core/agent` 这类目录的链接。你改 `packages/core/agent/src` 里的代码，立刻对 `tool-pwsh` 生效，不需要重新安装。

**关键推论：pnpm 的链接让"改一处、全仓库生效"成为可能，但它不保证类型正确，也不做任何编译。**

### 1.4 每个包有自己的 `node_modules`

这是 pnpm 与 npm/yarn 最大的结构差异。npm 会把依赖尽量摊平到根 `node_modules`；pnpm 只在每个包的 `node_modules` 里放**它自己声明过的**依赖。

实测对比 DSH：

- 仓库根 `node_modules/@deepseek-ai/` 只有 3 项 —— 因为只有根 `package.json` 里声明了这 3 个。
- `packages/shell/tool-pwsh/node_modules/@deepseek-ai/` 有十几项 —— 该包自己声明的。

这带来的好事叫 **phantom dependency 防护**：你在 `tool-pwsh` 里 `import` 一个它没声明的包，会直接报 `Cannot find module`，而不是"碰巧在根目录找到了、本地能跑、CI 上炸"。

学习时遇到这个报错，第一反应应该是"我漏写了 dependency"，而不是"pnpm 坏了"。

### 1.5 `linkWorkspacePackages` 和 `overrides`：强制指向本地源码

DSH 的 `pnpm-workspace.yaml` 里有两段值得单独讲：

```yaml
linkWorkspacePackages: true

overrides:
  '@deepseek-ai/cosmokit': 'link:vendor/cosmokit'
  '@deepseek-ai/schemastery': 'link:vendor/schemastery'
```

- `linkWorkspacePackages: true`：只要版本范围匹配，本地工作区的包优先于 registry。这一行在这里是把行为显式钉死，避免默认值变化。
- `overrides` + `link:`：**无条件覆盖**。`vendor/` 下的包是从上游 fork 的源码副本，它们保留了上游的版本号；如果只按版本范围匹配，某些依赖者可能从 npm 下载官方版，而不是用本地 fork。`link:` 强制所有声明者都连到本地目录。

证据就在上面 1.3 的第一行：`@deepseek-ai/cordis` 链接的目标是 `vendor\cordis` —— 包名叫 `cordis`，目录叫 `vendor/cordis`，名字和目录不一致，正是 override 在起作用。

### 1.6 `peerDependencies` 为什么和 `devDependencies` 写两遍

以 `@deepseek-ai/cordis` 为例，DSH 的每个包都同时写在两处：

```json
"peerDependencies": { "@deepseek-ai/cordis": "workspace:^" },
"devDependencies":    { "@deepseek-ai/cordis": "workspace:^" }
```

- `peerDependencies`：声明"我运行时需要一个 cordis 实例，但我不负责提供它"。这样整个应用里只有一份 cordis 单例，插件才挂得上同一个 Context。
- `devDependencies`：让这个包单独也能编译、能跑自己的测试，不必依赖上层的完整装配。

**写成 `dependencies` 的后果**：pnpm 会给每个包各装一份 cordis，运行时出现多个 Context 实例，插件的 `ctx` 之间互不可见。这是插件框架里最经典的坑，你学 cordis 时一定会碰上。

### 1.7 全局 store 与 `.pnpm` 虚拟目录

pnpm 的磁盘结构是三层：

1. 全局 store（如 `~/.pnpm-store`）：所有下载内容的唯一副本。
2. `node_modules/.pnpm/<名字>@<版本>/node_modules/<名字>`：真实解包位置。
3. `node_modules/<名字>`：指向第 2 层的符号链接。

所以几百个包也不会撑爆磁盘。对学习的影响是：**你在 `node_modules` 里看到的每个包都是链接，直接改它会污染全局 store。** 要修改依赖行为应该用 `patches/` —— DSH 正是这么做的，见 `pnpm-workspace.yaml` 的 `patchedDependencies` 段落。

### 1.8 本节结论

pnpm 解决的是"文件在哪里、谁能看见谁"，交付物是 `node_modules` 里的一堆链接。它**不解决**"tsc 按什么顺序编译、一个 `import` 解析成 `.ts` 还是 `.d.ts`、类型从哪来"。那是下一节。

---

## 2. TypeScript 如何把代码文本连起来

### 2.1 `import` 的两种形态

```ts
import { a } from './helper.ts'            // 相对路径：以当前文件为起点
import { b } from '@deepseek-ai/dsh-llm'   // 裸标识符：交给解析器查
```

相对路径没什么好讲的（但注意 `.ts` 后缀，第 6 节专门说）。**多包仓库的全部复杂度都在裸标识符上。**

### 2.2 tsc 解析裸标识符的顺序

当 tsc 看到 `import ... from '@deepseek-ai/dsh-llm/types'`，它按顺序做：

1. **查 `compilerOptions.paths`**。DSH 的 `tsconfig.base.json` 里有：
   ```json
   "@deepseek-ai/dsh-llm/types": ["./packages/llm/llm/src/types.ts"]
   ```
   命中就直接得到文件路径，**不再看 `node_modules`**。
2. 没命中 → 从当前文件目录向上逐级找 `node_modules`，找到 `node_modules/@deepseek-ai/dsh-llm`，读它的 `package.json`。
3. 读 `package.json` 的 `exports`（`moduleResolution` 为 `bundler`/`node16`/`nodenext` 时），或旧式的 `types`/`main` 字段。
4. 都找不到 → `TS2307: Cannot find module`。

第 3 步在 DSH 里长这样（`packages/core/agent/package.json`）：

```json
"exports": {
  ".":        { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
  "./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
  "./types":  { "types": "./lib/types/types.d.ts",  "default": "./lib/types/types.js" },
  "./src/*":  "./src/*",
  "./package.json": "./package.json"
}
```

注意 `./src/*` 这一条 —— 它是"源码平面"的逃生舱，让消费者可以直接 `import '@deepseek-ai/dsh-agent/src/foo.ts'`。

**`paths` 优先于 `node_modules`，这一条最重要。** DSH 用 `paths` 把所有包指向 `src`，所以编辑器、tsx、vitest 看到的都是源码；而 `node_modules` 的 `exports` 指向 `lib/` 的构建产物，那是给发布后的消费者和生产运行用的。同一个 `import`，两条路 —— 这就是"源码平面 vs 产物平面"。

### 2.3 `moduleResolution` 的档位

| 值 | 什么时候用 | 特征 |
|---|---|---|
| `node10`（旧名 `node`） | 老项目 | 只认 `main`/`types`，不认 `exports` |
| `node16` / `nodenext` | 写 Node 库 | 强制 `exports`、强制 `.js` 后缀，最严格 |
| `bundler` | 现代应用 / 打包器 | 认 `exports`，允许省略后缀 |

DSH 选 `bundler`（`tsconfig.base.json` 里的 `"moduleResolution": "bundler"`，配合 `"module": "esnext"`）。原因：源码要用 tsx / vitest / esbuild 跑，这些都是 bundler 语义；同时仓库用 `paths` 指到 `src`，而 `node16` 会要求写 `.js` 后缀、与实际 `.ts` 文件对不上。

### 2.4 一个模块被解析后只有三种结局

- **作为源码进 program**：tsc 会类型检查它的实现，报它的错。
- **作为声明进 program**：只读 `.d.ts`，不检查实现。
- **完全进不来**：`TS2307`。

第 5 节会用一个实验证明：**是哪一种，取决于 `references`，而不取决于 `paths`。**

---

## 3. tsconfig.json 其实在回答四个互不相干的问题

把字段分成四组，你就不会再混：

| # | 问题 | 字段 | 配错时的症状 |
|---|---|---|---|
| 1 | 哪些文件进这次编译？ | `files` / `include` / `exclude` | 文件不报错但根本没被检查；`TS6059` / `TS6307` |
| 2 | 编出来的东西长什么样？ | `compilerOptions`（`target`/`module`/`strict`/`declaration`/`jsx`/`lib`…） | 各种类型报错、产物不对 |
| 3 | `import` 的名字怎么变成路径？ | `paths` / `moduleResolution` / `baseUrl` | `TS2307 Cannot find module` |
| 4 | 我和别的 tsconfig 什么关系？ | `references` / `composite` / `rootDir` / `outDir` / `tsBuildInfoFile` | 源码被重复编译、`tsc -b` 顺序乱、增量失效 |

一个 tsconfig 里同时出现这四组是正常的。**出问题时，先定位是哪一组**，能省掉大半的瞎猜。

---

## 4. 逐层读 DSH 的 tsconfig 家族

### 4.1 全景图

```
tsconfig.json                    ← solution：只 extends + files: [] + references 两个聚合（不构成 program）
├── tsconfig.host.json           ← Host 聚合 program（extends base；226 个 references）
└── tsconfig.client.json         ← Client 聚合 program（extends base.client；69 个 references）

tsconfig.base.json               ← 只放 compilerOptions + paths（facade，永不含 include/files）
└── tsconfig.base.client.json    ← extends base，追加 jsx / lib / typeRoots / types

packages/<组>/<包>/tsconfig.json  ← 268 个包各自的编译单元
```

实测数字：`tsconfig.host.json` 有 226 条 `"path"`，`tsconfig.client.json` 有 69 条；`packages/` 下有 268 个包目录。

### 4.2 `tsconfig.base.json`：一个"只有解析规则、没有文件"的配置

这是全文最反直觉、也最值得学的一个设计。它只有 `compilerOptions`（含 `paths`），**没有 `include`，没有 `files`**。原因就写在文件注释里：

> Doubles as the resolution facade for vite-tsconfig-paths (vitest configs point here). NEVER add include/files to this file: it would leak into every extending package project and narrow the facade's match-all scope.

两个后果：

1. 所有 `extends` 它的包都继承 `paths` —— "哪个包能被谁 import"有了一份全局定义，不用每个包各写一遍。
2. 因为它自己没有文件列表，它可以安全地作为"纯解析规则"被任意工具读取（vite-tsconfig-paths、tsx）。**一旦加上 `include: ["src"]`，268 个继承它的包就会各自把 `src` 当成自己的文件列表**，全乱。

记住这条规则：**base 配置只放"人人相同"的东西，绝不放"谁编哪些文件"。**

### 4.3 为什么要两个聚合，而不是一个

`tsconfig.host.json` 和 `tsconfig.client.json` 各是一个独立的 program。`docs/development.md` 给的理由：

> both sides declaration-merge the cordis `Context` interface under the same keys with different services; one program seeing both merges reports a collision. The collision exists only inside a `ts.Program` — module resolution never triggers it.

翻译成学习要点：

- cordis 的类型扩展靠**接口声明合并**（declaration merging）。Host 端写 `interface Context { agents: ... }`，Client 端写 `interface Context { sessions: ... }`。
- 两个扩展同时出现在**一个** program 里，同名字段类型不同 → 冲突报错。
- 这个冲突只在 tsc 把两边源码收进同一个 program 时才出现；**单纯做模块解析不会触发** —— 所以 `paths` 可以横跨两边。

对你的实际意义：**你在 DSH 里看到的 Host/Client 拆分不是"目录分类"，而是类型系统层面的隔离。** 将来你给 cordis 写插件，如果遇到 `Subsequent property declarations must have the same type` 这类报错，大概率就是这个原因。

文件注释还写了一条禁令：

> NEVER add include/files entries [to the root solution], and NEVER flatten this solution into a single ts.Program (scripts seed tsconfig.host.json or tsconfig.client.json).

### 4.4 `tsconfig.json`（根）：solution file

```json
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": [
    { "path": "./tsconfig.host.json" },
    { "path": "./tsconfig.client.json" }
  ]
}
```

- `files: []` → 这个配置本身不产生 program，它只是一张"图"。
- `extends` 仍然有用：继承来的 `paths` 让 tsx 运行 `scripts/` 时（那里没有更近的 tsconfig）能找到工作区包。
- 它是 tsserver（编辑器）的发现入口，也是显式跑完整引用图的入口。

### 4.5 包级 `tsconfig.json`：最小模板

`packages/shell/tool-pwsh/tsconfig.json` 是最标准的形态，可以直接背下来：

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/types"
  },
  "include": ["src"],
  "references": [
    { "path": "../../../vendor/cordis" },
    { "path": "../../llm/llm" },
    { "path": "../../core/tools" },
    { "path": "../../shell/shell" }
  ]
}
```

逐字段：

- `extends`：继承 `strict`、`target`、`moduleResolution`、`declaration`、`paths` 等。路径按**本文件所在目录**计算，所以在 `packages/shell/tool-pwsh` 下要退三级。
- `rootDir: "src"`：限定源码根。任何被解析进这个 program 却位于 `src` 之外的文件都会报 `TS6059` —— 这个报错是第 5 节的主角。
- `outDir: "lib/types"`：产物目录。注意 DSH 把 `.js` 和 `.d.ts` 都放这里（实测 `packages/core/agent/lib/types/` 下同时有 `dispatch.js`、`dispatch.d.ts`、`.map`），然后 tsdown 再从这里打包出 `lib/index.js`。
- `include: ["src"]`：这个包编哪些文件。**对比 `base` —— base 故意没有这一项。**
- `references`：这个包用到的其他工作区包。**它不是 `import` 的替代品**：你仍然要写 `import ... from '@deepseek-ai/dsh-jobs'`；`references` 只是告诉 tsc"那个文件由另一个项目负责"。

### 4.6 拆分包的三文件形态

六个包同时有 Host 和 Client 两个面：`api/remotes`、`api/gateway`、`api/session-controller`、`api/workspace-controller`、`client/connection`、`session-query/session-log-export`。它们的包根 `tsconfig.json` 退化成 solution：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.host.json" },
    { "path": "./tsconfig.client.json" }
  ]
}
```

两个叶子各自 `extends` 对应的 base、各自用 `files` 列出属于自己那面的入口、各自用 `tsBuildInfoFile` 分开增量缓存。以 `packages/api/gateway` 为例：host 叶子列 `src/index.ts`、`src/types.ts` 等，client 叶子列 `src/client/index.ts` 等。

**什么时候才该拆**：只有当这个包真的需要两个编译器面（不同的 `lib`/`jsx`/Context 合并）时。写 `packages/AGENTS.md` 的原话 —— "一个 Node 入口 + 一个浏览器入口"**不是**拆分的理由，普通 Client 插件在 Client 构建阶段会同时产出两种运行时产物。

### 4.7 `paths` 是生成的，不是手写的

`tsconfig.base.json` 里有一大段（约 200 条）`@deepseek-ai/dsh-*` 别名，被两行注释框住：

```json
// BEGIN generated package aliases — pnpm run gen-tsconfig-paths
...
// END generated package aliases
```

生成脚本 `scripts/gen-tsconfig-paths.ts` 的模块注释解释了动机：早期用通配符 `@deepseek-ai/dsh-*` 一个键对应 49 个候选 glob，tsx 的 ESM 钩子每次未命中都要走一遍 CommonJS 解析兜底，拖慢了源码启动。现在展开成一条包一条别名，未命中即失败。

学习要点：**`paths` 的通配符不是免费的**，仓库一大就变成解析性能瓶颈。顺带，`pnpm run gen-tsconfig-paths` 支持 `--check`，能在 CI 里拦住"新加了包但忘了加别名"。

---

## 5. 实验：`references` 和 `paths` 到底是什么关系

这是我最建议你亲手跑一遍的部分。下面四个实验都在本机用 DSH 自带的 TypeScript 6.0.3 实测过。

### 实验装置

两个最小包：

- `pkg-a`：`src/index.ts` 导出 `export const A_VERSION = 'a-1.0.0'`
- `pkg-b`：`src/index.ts` 里 `import { A_VERSION } from '@lab/pkg-a'`

`pkg-b` 的 tsconfig 关键部分：

```json
{
  "compilerOptions": {
    "composite": true, "declaration": true,
    "rootDir": "src", "outDir": "lib/types",
    "paths": { "@lab/pkg-a": ["../pkg-a/src"] }
  },
  "include": ["src"],
  "references": [{ "path": "../pkg-a" }]
}
```

### 实验 A：`paths` 指向 src + 有 `references` → 成功

```
> tsc -b pkg-b/tsconfig.json
exit=0
```

产物：`pkg-a/lib/types/{index.d.ts,index.js}` 和 `pkg-b/lib/types/{index.d.ts,index.js}`。注意 `pkg-b` 的产物里**没有** `pkg-a` 的源码副本，而且 `pkg-b` 的声明是：

```ts
export declare const B_LABEL = "b-uses-a-1.0.0";
```

字面量被内联了，说明它确实读到了 `pkg-a` 的声明而非源码。

### 实验 B：`paths` 指向 src，去掉 `references` → 失败

```
> tsc -b pkg-b/tsconfig.json
exit=1
pkg-b/src/index.ts(1,27): error TS6059: File '.../pkg-a/src/index.ts' is not under 'rootDir' '.../pkg-b/src'.
                              'rootDir' is expected to contain all source files.
pkg-b/src/index.ts(1,27): error TS6307: File '.../pkg-a/src/index.ts' is not listed within the file list of project
                              '.../pkg-b/tsconfig.json'. Projects must list all files or use an 'include' pattern.
```

**这两行报错就是全文的答案。** 没有 `references` 时，`paths` 把 `pkg-a` 的**源文件**直接拖进了 `pkg-b` 的 program，而 `pkg-b` 的 `rootDir` 是 `src`，不允许包含外面的文件。

### 实验 C：不写 `paths`，只靠 `node_modules` 链接 → 成功

把 `pkg-a` 做成一个正常包（`package.json` 的 `exports.types` 指向 `lib/types/index.d.ts`），然后在 `pkg-c/node_modules/@lab/pkg-a` 放一个指向 `pkg-a` 的目录链接（也就是 pnpm 做的事），`pkg-c` 的 tsconfig 里**不写 `paths`**、保留 `references`：

```
> tsc -b pkg-c/tsconfig.json
exit=0
```

解析路径变成：裸标识符 → `node_modules` 链接 → `package.json` 的 `exports.types` → 声明文件。

### 实验 D：源码写 `.ts` 后缀，产物里变成 `.js`

```
源码  : import { HELPER } from './helper.ts'
产物  : import { HELPER } from "./helper.js";
```

细节见第 6 节。

### 结论表

| `paths` | `references` | 结果 |
|---|---|---|
| 指向 `src` | 有 | **成功**。TS 把被引用项目重定向到它的声明输出，源码不进当前 program |
| 指向 `src` | 无 | `TS6059` / `TS6307`。源码被拖进来，撞上 `rootDir` 和文件列表 |
| 无（走 `node_modules`） | 有 | 成功。读到 `lib/types` 里的 `.d.ts` |
| 无 | 无 | 能成功，但必须手工保证编译顺序，且丢失 `tsc -b` 的增量与拓扑排序 |

所以：

> **`paths` 决定"找到哪个文件"，`references` 决定"这个文件以源码还是以声明进入 program"。**
> DSH 里 `paths → src` 之所以安全，正是因为每个包都老老实实列了 `references`。

这也解释了 `AGENTS.md` 里的那句话：*"Project references, not declaration path aliases, keep each package/vendor source compiled under its own tsconfig boundary."*

### 顺带解释 `tsc -b`

`tsc -b`（build 模式）做的事：

1. 从入口 tsconfig 出发，按 `references` 递归收集所有项目。
2. 拓扑排序，先编没有依赖的（实验 A 里 `pkg-a` 先被编出来）。
3. 用每个项目的 `.tsbuildinfo` 判断是否最新，跳过没变的。
4. 所以 `tsc -b tsconfig.host.json` 一行就能编完整个 Host 面，226 条引用不用手写顺序。

这也解释了引用路径的两种写法：普通包写**目录**（TS 自动找该目录下的 `tsconfig.json`），拆分包必须写**全文件名**（如 `../../client/connection/tsconfig.host.json`）—— 目录形态会解析到 solution root，那是个空 program。

---

## 6. 为什么源码里写 `.ts` 后缀

DSH 的约定：跨包用包名（`@deepseek-ai/dsh-llm`），**包内相对导入必须写 `.ts`**：

```ts
import { HELPER } from './helper.ts'
```

普通 Node/TS 项目写 `./helper` 或 `./helper.js`，这里为什么写 `.ts`？靠两个开关配合（都在 `tsconfig.base.json`）：

```json
"allowImportingTsExtensions": true,
"rewriteRelativeImportExtensions": true
```

- `allowImportingTsExtensions`：允许 `.ts` 出现在 `import` 里，否则报 `TS5097`。
- `rewriteRelativeImportExtensions`（TS 5.7+）：输出时把 `./helper.ts` 改写成 `./helper.js`。

好处有三条：

1. 源码里点 `import` 能精确跳转到源文件，不依赖"省略后缀再猜"。在 ESM 世界里，让 `.js` 后缀指向一个 `.ts` 源文件本来就很别扭。
2. tsx / vitest 直接跑源码，Node 的 ESM 解析器需要看到确切文件名。
3. 生产走 `lib/` 时自动变回 `.js`，Node 能直接跑。

实战经验：`allowImportingTsExtensions` 单独用会要求 `noEmit` 或 `emitDeclarationOnly`，是 `rewriteRelativeImportExtensions` 解除了这个限制 —— 这就是为什么 DSH 必须两个一起开。

---

## 7. 同一个 import，四种消费者看到的四种东西

以 `import { x } from '@deepseek-ai/dsh-jobs'` 为例：

| 消费者 | 走哪条路 | 解析到 |
|---|---|---|
| tsx（源码启动 `dsh`） | `tsconfig.base.json` 的 `paths` | `packages/jobs/jobs/src/index.ts`（源码） |
| vitest（单元测试） | `vite-tsconfig-paths` 指向 base 的 `paths` | 同上，源码 |
| `tsc -b`（typecheck / build） | `paths` 命中 `src`，再被 `references` 重定向 | `packages/jobs/jobs/lib/types/index.d.ts`（声明） |
| Node（跑构建后的 `lib/`） | `node_modules` 链接 + `package.json` 的 `exports` | `lib/index.js` |

这张表是整篇笔记的收束：**"连接"不是一件事，而是四套规则各自算出来的结果。** 以后 debug 遇到的类型错乱、模块找不到、单例不唯一，基本都能挂到这张表的某一行上。

---

## 8. 动手清单：给 DSH 加一个新包要碰什么

按顺序做，每步都给出验证方式（依据 `packages/AGENTS.md` 的命名规则）。

1. **建目录** `packages/<组>/<包名>/`，写 `package.json`：
   - `name: "@deepseek-ai/dsh-<包名>"`、`type: "module"`、`main: "lib/index.js"`、`types: "lib/types/index.d.ts"`
   - `exports` 至少要有 `"."` 和 `"./package.json"`；需要深路径就加 `"./src/*": "./src/*"`
   - `peerDependencies` 里写 `@deepseek-ai/cordis: workspace:^`，`devDependencies` 再写一遍
   - 依赖其他工作区包一律 `workspace:^`
   - 验证：`pnpm install` 后，`node_modules` 里出现指向你的目录的链接。
2. **写 `tsconfig.json`**：`extends` 到 base（Client 面用 `tsconfig.base.client.json`）、`rootDir: "src"`、`outDir: "lib/types"`、`include: ["src"]`、`references` 列出所有直接 `import` 的工作区包。
   - 验证：`tsc -b packages/<组>/<包>` 通过。
3. **补 `paths` 别名**：跑 `pnpm run gen-tsconfig-paths`（或手写进生成区以外的位置）。
   - 验证：其它包 `import` 你的包时编辑器不报 `TS2307`；`pnpm run gen-tsconfig-paths --check` 无 diff。
4. **注册进一个聚合**：Host 包加进 `tsconfig.host.json` 的 `references`，Client 包加进 `tsconfig.client.json` 的 `references`。**新包只能进一个聚合**（共享叶子除外）。
   - 验证：`pnpm run typecheck` 通过。
5. **判断要不要拆两面**：只有真正需要两个编译器面时才拆成 `tsconfig.host.json` + `tsconfig.client.json` + solution 根。否则不要拆。
6. **跑门禁**：`pnpm run lint`、`pnpm run hygiene`。

---

## 9. 排查手册

| 症状 | 最可能的原因 | 动作 |
|---|---|---|
| `TS2307 Cannot find module '@deepseek-ai/dsh-x'` | `paths` 里没这个别名，或包名写错 | `pnpm run gen-tsconfig-paths --check`；核对 `package.json` 的 `name` |
| `TS6059` / `TS6307` | `references` 漏了某个包，源码被拖进当前 program | 补 `references`（第 5 节实验 B） |
| 某个包里 `Cannot find module`，但根目录跑得通 | pnpm 没给它链接：你漏写 `dependency` | 补进 `package.json` 再 `pnpm install`（phantom dependency 防护） |
| 多个 cordis 实例 / `ctx.xxx` 是 `undefined` | 把 cordis 写进了 `dependencies` | 改成 `peerDependencies` + `devDependencies` |
| `Subsequent property declarations must have the same type` | 一个 program 同时看到 Host 和 Client 的 `Context` 合并 | 检查是否把两边文件收进了同一个 tsconfig（第 4.3 节） |
| 改了 `packages/` 里的代码不生效 | 消费方读的是 `lib/` 产物而不是源码 | 对照第 7 节的表，确认走的是哪一行 |
| 编辑器正常、`tsc -b` 报错（或反之） | 编辑器用 `paths`，`tsc -b` 用 `references`，两套规则 | 对照第 5 节结论表 |
| 新建的包在 `tsc -b` 里不被编译 | 忘了注册进聚合的 `references` | 加进 `tsconfig.host.json` 或 `tsconfig.client.json` |

---

## 10. 下一步：这和 cordis 的关系

到这里你应该能看到一条线索了。cordis 的插件能用 `ctx.agents`、`ctx.sessions` 这类属性，靠的是**接口声明合并** —— 某个包在 `declare module '@deepseek-ai/cordis'` 里往 `Context` 上加字段。而这些声明能不能被你的插件看到，取决于两件你已经学过的事：

1. `paths` 能不能把那个包解析进你的 program（第 2.2 节）；
2. 它带来的 `Context` 合并会不会和另一面冲突（第 4.3 节，这就是 Host/Client 必须分家的原因）。

换句话说：**你现在学的 tsconfig，就是 cordis 类型系统能工作的地基。**

下一步建议：

- 读 `docs/cordis-primer.md` 和 `docs/architecture.md`（后者是改 `packages/` 之前的必读）。
- 打开 `packages/extensions/cordis-host-runner`，把它和 `packages/shell/tool-pwsh` 的 `tsconfig.json` + `package.json` 并排看，对照本文第 4.5 节。
- 亲手跑一次 `pnpm run typecheck`，然后去 `packages/core/agent/lib/types/` 里看 tsc 到底产出了什么。

---

## 附录：本文结论的实测命令

实验用 DSH 自带的 TypeScript：

```
agent-learning/source/deepseek-harness/deepseek-harness/node_modules/.bin/tsc   # 6.0.3
```

对照实验的目录结构（实验结束后已删除）：

```
.tmp-ts-lab/
  with-refs/pkg-a/{tsconfig.json,src/index.ts}
  with-refs/pkg-b/{tsconfig.json,src/index.ts}   # paths -> ../pkg-a/src，带 references
  no-refs/...                                    # 同上，去掉 references → TS6059/TS6307
  nm/pkg-a/{package.json,tsconfig.json,src/index.ts}
  nm/pkg-c/{tsconfig.json,src/index.ts,node_modules/@lab/pkg-a -> ../../pkg-a}
  ext/{tsconfig.json,src/index.ts,src/helper.ts}  # 验证 .ts → .js 重写
```

复现要点：

- Windows 上创建符号链接需要管理员权限或开发者模式；用 `New-Item -ItemType Junction`（目录联接）可以免权限复现 pnpm 的链接效果，tsc 不区分这两者。
- 实验 C 中 `pkg-c` 的 `node_modules/@lab/pkg-a` 必须先指向一个**已构建出 `lib/types`** 的 `pkg-a`，否则 `exports.types` 指向的文件不存在，解析会失败。
- 注意 DSH 的 `paths` 值写作 `"./packages/..."`（相对仓库根，因为定义在 `tsconfig.base.json` 里）；而在包级 tsconfig 里定义 `paths` 时，值是相对**该 tsconfig 文件所在目录**的。这是最容易写错的一处。

DSH 侧的相关命令：

```sh
pnpm install                                    # 建立全部链接
pnpm run gen-tsconfig-paths --check             # 检查 paths 是否与包清单同步
pnpm run typecheck                              # = tsc -b tsconfig.host.json && tsdown host && tsc -b tsconfig.client.json
pnpm run build                                  # tsx scripts/build.ts
```
