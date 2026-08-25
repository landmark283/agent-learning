# W1-D4~D7 · teenycode fork 补全计划

> **目标仓库**：`source/teenycode`（你的 fork，已改造支持任意 OpenAI 兼容 API：`API_KEY`/`BASE_URL`/`MODEL`）
> **背景**：toy（`try/01-agent-from-zero/agent.js`）的使命已完成（最小循环、多轮对话、工具、自愈）。
> 从"从零写"转为"读代码 + 改代码"——这是真实开发的常态，也是 W5 读 DSH 前的预演。
> **对应理论**：#16 验证回路 · #10 上下文工程 · #18 权限门控 · #11 记忆分层 · #8 RAG

---

## 第 0 步：先把它跑起来（D4 开头 30 分钟）

```powershell
cd D:\lg\else\agents大学习\agent-learning\source\teenycode
npm install            # 安装 openai、zod 等依赖

# 建 .env（参考 .env.example），内容：
#   API_KEY=sk-你的DeepSeekkey
#   BASE_URL=https://api.deepseek.com
#   MODEL=deepseek-v4-flash   （或 deepseek-chat）

node bin/teenycode.js  # 启动，输入 exit 退出
```

> 踩坑预警：这个项目用 Vite+ 把 git 钩子重定向到了 `.vite-hooks/_`，
> commit 时可能失败。遇到就加 `-c core.hooksPath=某个空目录` 或 `--no-verify`。

## 缺口清单（我读源码得出的，按实施顺序排）

| # | 缺口 | 现状（源码位置） | 补法 | 理论 |
|---|---|---|---|---|
| ① | 没有 `run_command` 工具 | `tools.ts` 只有 read_file / list_files / edit_file | 新增 Tool，内部用 `node:child_process` 的 `exec` | #16 的地基 |
| ② | 没有验证回路 | `edit_file` 改完没人验证 | 让模型用 ① 跑测试/lint/构建，报错回喂直到通过 | #16 核心 |
| ③ | 内层循环无轮数上限（缺陷） | `agent.ts` 第 69 行 `while(true)` | 加 `MAX_ROUNDS` 常量，超限报错退出 | 可靠性 |
| ④ | 无上下文压缩 | `messages` 无限增长 | 超长时截断/总结最早的消息 | #10 |
| ⑤ | `run_command` 裸跑 | 加了①后无任何检查 | 危险命令（rm/del/git push 等）先打印再等 y/n | #18 |
| ⑥ | 不读自己的 AGENTS.md | 仓库有 AGENTS.md 但从不加载 | 启动时读入并合并进 system prompt | #11 |
| ⑦ | 无检索 | 只有 list_files（会递归整棵树） | 加 `grep` 工具（按关键词搜文件内容） | #8 |

## 每日安排

- **D4**：① `run_command` + ② 验证回路
- **D5**：③ 轮数上限（顺手修缺陷）+ ④ 上下文压缩
- **D6**：⑤ 权限门控
- **D7**：⑥ 记忆文件 + ⑦ grep 检索

## 每个补全的固定流程（对应 lesson-author 规范）

1. **预测**：写下"如果我来实现这个功能，会怎么写"（两三句话）；
2. **动手**：改代码（新增/修改 Tool 或 agent.ts）；
3. **验证**：真实跑一个场景，证明它工作（比如：让它读文件→改文件→跑测试→报错→修正）；
4. **记录**：写进 `notes/teenycode-改造日志.md`——为什么改 / 怎么改 / 验证结果 / 预测和实际的差距；
5. **commit**：`git -c core.hooksPath="$env:TEMP\emptyhooks" commit`（fork 的 git 历史 = 你的改造记录）。

## 验收总则

- [ ] fork 仓库有 4 个补全 commit，每个 commit 只做一件事；
- [ ] `notes/teenycode-改造日志.md` 记满 4 次改造；
- [ ] 每个补全能说清"它解决什么问题"和"和预测差在哪"；
- [ ] 全部完成后，把 fork push 到云端（`git push -u fork main`）。

---

**下一步预告（W2）**：smolagents——看看 HuggingFace 的 CodeAgent 是怎么用"写代码代替 JSON"的，届时拿你的 fork 和它对比。
