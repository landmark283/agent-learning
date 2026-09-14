# W5·D1 装配层：155 个插件是怎么拼出来的

> **对应理论**：#21 插件化框架（Cordis 式）；顺带 #17 沙箱（`!!js` 与补丁的信任面）
> **前置**：W4 全部 + 官方 Cordis 教程第 6 章（组合与 HMR）+ `try/07-cordis-hotmount` 第 5.1 节
> **材料**：本目录 3 份**实测** dump（`dump-web.txt`、`dump-web-default.txt`、`dump-web-cordis-overlay.txt`）+ `layer-summary.ps1`

---

## 0 一句话

DSH 没有「主程序」。一次 `dsh web` 启动，本质是把**若干个补丁列表按顺序叠在一张空表上**，叠出 155 行插件。

---

## 1 先惊一下：profile 的根文件是空的

打开你自己的 profile：

```powershell
Get-Content "$env:DSH_HOME\profiles\web\cordis.yml"
```

内容是**四行，正文是 `[]`**：

```yaml
# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
```

**根是空的，155 行插件全部来自补丁层。** 这是 W4 那句「装配关系在配置里，不在代码里」的极端形态——连配置本身都只是补丁。

顺带记住：这个文件**每次启动都被重写**（`apps/cli/src/profile-boot.ts:190`）。**永远改 `cordis.patch.yml`，不要改它。**

---

## 2 补丁层的顺序（源码依据）

`apps/cli/src/profile-boot.ts` 头部注释与 `loadProfile` 明确：

1. **bundle 层**——按 profile `package.json` 里 `dsh.profile.bundles` 的顺序，**每层一个补丁列表**
2. profile 自己的 `cordis.patch.yml`
3. **home 层** `$DSH_HOME/cordis.patch.yml`（机器本地偏好，跨 profile）
4. 每个 `--patch` overlay，按 argv 顺序
5. 遥测开关

**顺序就是优先级**：后面的层可以改前面层插入的行。这一点是刻意的——`vendor/include/src/index.ts:96-101` 专门在每次 `insert` 后重建索引，注释写着：如果没有这一步，「插入的行会静默地无法被补丁」。

---

## 3 你机器上的真实分层（实测，155 行）

| 层（dump 里的 `# ==` 注释头） | 插件行数 | 来源 |
|---|---|---|
| `@deepseek-ai/dsh-base` | 59 | bundle 1 |
| `@deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app` | 25 | base 里被 web-app 改过的行 |
| `@deepseek-ai/dsh-web-app` | 68 | bundle 2 |
| `@dsh-external/dsh-mobile-nav` | 1 | **你装的**（`github:mexiaosqwq/dsh-web-mobile`） |
| `dshmarket` | 1 | **你装的** |
| `dsh-pet, patched by ...\profiles\web\cordis.patch.yml` | 1 | **你的补丁层**把它禁用了 |
| **合计** | **155** | |

来源：`$DSH_HOME/profiles/web/package.json` 的 `dsh.profile.bundles`。

---

## 4 动手步骤

### 4.1 预测，然后对答案（本节的核心练习）

**先别看 dump 文件。** 看着 `package.json` 里那 5 个 bundle，回答：

1. `dsh-base` 和 `dsh-web-app` 各贡献约多少行？谁大？
2. 为什么有一层叫「`dsh-base`, patched by `dsh-web-app`」？它和单独的 `dsh-base` 什么关系？
3. 你自己装的三个包里，为什么有两个是裸的、一个带「patched by」？

把答案写下来，然后跑：

```powershell
cd agent-learning\try\08-dsh-assembly
powershell -ExecutionPolicy Bypass -File .\layer-summary.ps1
```

对答案。**只记差距**——这正是 W5 计划里「先预测，读后只记差距」的具体做法。

### 4.2 比较两个 dump

```powershell
# 只有 2 行差异：你的补丁层把 dsh-pet 禁用了
Compare-Object (Get-Content .\dump-web-default.txt) (Get-Content .\dump-web.txt)
```

`--dump-default-config` 打印的是**只有 bundle 层**的组合；`--dump-config` 加上 profile 层、home 层和 `--patch`。两者**互斥**，一起用会报错。

### 4.3 patch 的语法词汇表

全部语义在 `vendor/include/src/index.ts:44-134`。**两种形态**：

**A. 定向改一行**（`id` 必填）

```yaml
- id: webserver
  config: { host: 127.0.0.1, port: 3081 }
- id: pet
  disabled: true
```

- `id` 找不到 → **warn 并跳过**，不报错（见第 5 节，这是真坑）
- 给了 `name` 则做校验，不匹配也 warn 跳过
- `disabled` 支持 `!!js`

**B. 插入新行**

```yaml
- insert:
    - id: cordis-host-runner
      name: '@deepseek-ai/dsh-cordis-host-runner'
```

- **不带 `id`** → 插到根列表（官方 cordis overlay 就是这么干的）
- **带 `id`** → 插到那个 **group** 行的 `config` 数组里；目标不是 group 会 warn

### 4.4 亲手改一次，并用 dump 验证

编辑 `$DSH_HOME\profiles\web\cordis.patch.yml`（当前是 `- id: pet` + `disabled: true`），加一行你自己的覆盖，然后：

```powershell
cd agent-learning\source\deepseek-harness\deepseek-harness
pnpm dsh web --dump-config | Select-String 'pet' -Context 0,2
```

观察你的层出现在哪里、改到了哪一行。**不要启动**——dump 就是为了不启动也能验证。

---

## 5 实测出来的真坑：patch 是**替换**，不是合并

这是我跑出来的一手证据。用官方示例 overlay 去打 `webserver` 的端口。

**打之前**（`dump-web.txt`）：

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject:
    - webStartup
  config:
    host: !!js ctx.webStartup.host ?? '127.0.0.1'
    port: !!js ctx.webStartup.port ?? 3080
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
```

**打之后**（`dump-web-cordis-overlay.txt`）：

```yaml
- id: webserver
  ...
  config:
    host: 127.0.0.1
    port: 3081
```

**`compression: gzip` 那三行被静默丢掉了。** overlay 只写了 `host` 和 `port`，结果整个 `config` 被替换。官方示例文件里那句注释——「A patch replaces the targeted row's whole `config`」——就是这个意思。

> **教训：覆盖前，先把原始 `config` 从 dump 里抄全。**

顺带，这次 overlay 还新增了一整层（2 行）：

```
# == D:\...\apps\cli\config\examples\cordis\cordis.yml
- id: cordis-host-runner
  name: '@deepseek-ai/dsh-cordis-host-runner'
- id: tool-cordis
  name: '@deepseek-ai/dsh-tool-cordis'
```

174 → 177 行左右的差别，就是 `try/07` 那个实验的入口。

---

## 6 验收标准

- [ ] 能画出补丁层的顺序，并说出「后面的层为什么能改前面层插入的行」
- [ ] 能说出 profile 根 `cordis.yml` 为什么是空的、为什么不该编辑它
- [ ] 4.1 的预测与实测对上（或能解释差距）
- [ ] 能默写 patch 的两种形态，并说出 `id` 缺失时各自的行为
- [ ] 能说出「patch 是替换不是合并」并举出 `webserver` 那个例子
- [ ] 亲手改过 `cordis.patch.yml` 并用 `--dump-config` 验证
- [ ] 能说出 `--dump-config` 与 `--dump-default-config` 的区别

---

## 7 踩坑表

| 现象 | 原因 | 处理 |
|---|---|---|
| **patch 写了没生效，也没报错** | `id` 对不上 → **warn + 跳过**（fail-soft，`include/src/index.ts:112`） | 从 `--dump-config` 里抄准确的 `id` |
| **改一个字段后别的字段没了** | patch **整体替换**该行的 `config`，不是深合并 | 覆盖前抄全原始 `config` |
| 编辑了 profile 根 `cordis.yml` | 它每次启动都被重写 | 永远改 `cordis.patch.yml` |
| `!!js` 报错 | 只在 plugin `config` 和 entry `disabled` 下允许，且必须 `!!js` 不是 `!js` | — |
| dump 里 `!!js ...` 没被求值 | `--dump-config` **故意不求值**（见 `apps/cli/src/dump-config.ts` 头注释） | 想看真值就启动 |
| `--dump-config` 和 `--dump-default-config` 一起用 | 互斥，直接报错 | 选一个 |
| `2>$null` 拦不住 pnpm 的 stderr | PS 5.1 下原生命令写 stderr + `ErrorActionPreference='Stop'` = 终止错误 | 脚本里改成 `'Continue'` |

---

## 8 与 W4 的接口

| W4 学的 | 在这里 |
|---|---|
| `cordis/bin.js` 读 `./cordis.yml` | DSH 读 profile 根 `cordis.yml`（空的）+ 一串补丁列表 |
| `EntryOptions`（`id`/`name`/`config`/`group`/`disabled`/`inject`） | patch 改的就是这些字段 |
| include 插件的 `path` 配置 | 每个 bundle 就是一个 include + 它的补丁列表 |
| `internal/update` waterfall | HMR 与 live recomposition 的落点（`profile-boot.ts:363-379` 在监听补丁文件） |
| 配置 schema 校验失败 → 明确报错 | patch 的 `id` 不匹配 → **只 warn**（两者宽容度不同，注意） |

---

## 9 参考链接

- [`apps/cli/src/args.ts`](../../source/deepseek-harness/deepseek-harness/apps/cli/src/args.ts)——`--dump-config` 契约与示例
- [`apps/cli/src/dump-config.ts`](../../source/deepseek-harness/deepseek-harness/apps/cli/src/dump-config.ts)——分层与 `!!js` 不求值
- [`apps/cli/src/profile-boot.ts`](../../source/deepseek-harness/deepseek-harness/apps/cli/src/profile-boot.ts)——层顺序、home 层、根文件名
- [`vendor/include/src/index.ts`](../../source/deepseek-harness/deepseek-harness/vendor/include/src/index.ts) 第 44~134 行——补丁语义原文
- [`packages/bundle/base/cordis.patch.yml`](../../source/deepseek-harness/deepseek-harness/packages/bundle/base/cordis.patch.yml)——DSH base profile 全文（19.5 KB）
- [`packages/boot/app-boot/README.zh.md`](../../source/deepseek-harness/deepseek-harness/packages/boot/app-boot/README.zh.md)
- [官方：第一个 Harness 插件](../../source/deepseek-harness/deepseek-harness/docs/user/develop/basic/index.zh.md)

---

## 10 下一步

W5-D2：`dsh-agent-loop`——核心 ReAct 循环（思考 → 工具 → 观察 → 再思考）。

**收尾：`git commit`**——把 dump、脚本、笔记一起提交。
