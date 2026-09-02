# agent-learning

学习"如何用 LLM Agent 做软件开发"的个人仓库。
具体实践是：怎样开发一个简单的agent。了解现在主流的使用llm的方式和技巧。

## 结构

```
agent-learning/
├── 00-入门笔记.md          # 总览：心智模型、ReAct 架构、防幻觉四防线
├── 00-参考-DSH包清单.md    # DSH 196 个包清单（自动生成，阶段 0 建地图用）
├── 01-学习路径.md          # 学习路径（实践线）：按周推进，从 200 行到 196 包（6 周）
├── 02-Agent架构理论清单.md  # 理论线：需掌握的 24 个架构/设计思路，与实践环节互相对应
├── try/                    # 动手练习：自己写简易 Agent（纳入本仓库 git 管理）
├── notes/                  # 一页纸笔记区：读每个包/项目/概念的小结
└── source/                 # 源码阅读：git clone 开源项目（被 .gitignore 忽略）
```

## 嵌套 git 的处理约定

`source/` 里的开源项目自带 `.git`，如果直接提交到本仓库会变成混乱的
"gitlink"（子仓库引用）。处理方案：

- `source/` 已在 `.gitignore` 中忽略（但保留了 `source/README.md` 这个占位文件）；
- 克隆进来的项目由它们自己的 git 管理，互不干扰；
- 好处：本仓库永远干净，只有你自己的笔记和 `try/` 里的代码。

## 常用命令

```bash
# 克隆一个项目到 source/ 里研究（示例）
git clone --depth 1 https://github.com/All-Hands-AI/OpenHands.git source/openhands
```

## 进度记录（学习日志）

| 日期 | 做了什么 | 收获 / 疑问 |
|---|---|---|
| （示例）2025-xx-xx | 搭好最小 ReAct 循环 | 理解了观察-反馈的关键性 |
