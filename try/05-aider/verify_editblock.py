"""在无依赖环境下直接运行 Aider 的 SEARCH/REPLACE 纯函数（教学用）。

为什么这样做：`editblock_coder.py` 顶部 import 了 `base_coder`（牵出 litellm 等重依赖），
但真正决定"编辑协议"行为的全是**纯函数**（解析块、匹配、替换）。
本脚本把源码里 `def prep(...)` 之后的部分抽出来，在只注入 re/difflib/math/Path
的命名空间里 exec —— 于是不必 pip install aider 也能亲手验证协议行为。

用法: python verify_editblock.py
"""
import difflib
import math
import re
from difflib import SequenceMatcher
from pathlib import Path

SRC = (
    Path(__file__).resolve().parents[2]
    / "source"
    / "aider"
    / "aider"
    / "coders"
    / "editblock_coder.py"
)

text = SRC.read_text(encoding="utf-8")
body = text[text.index("def prep(content):") :]
ns = {"re": re, "difflib": difflib, "math": math, "Path": Path, "SequenceMatcher": SequenceMatcher}
exec(compile(body, str(SRC), "exec"), ns)  # noqa: S102 - 教学脚本，故意 exec 本地源码

do_replace = ns["do_replace"]
find_original_update_blocks = ns["find_original_update_blocks"]
find_similar_lines = ns["find_similar_lines"]
replace_most_similar_chunk = ns["replace_most_similar_chunk"]
replace_closest_edit_distance = ns["replace_closest_edit_distance"]

ORIGINAL = """def greet(name):
    print("hello", name)


def main():
    greet("world")
"""

FENCE = ("```", "```")
ok = 0
checks = 0


def check(title, got, want):
    global ok, checks
    checks += 1
    good = got == want
    ok += 1 if good else 0
    print(f"[{'PASS' if good else 'FAIL'}] {title}")
    if not good:
        print("   got :", repr(got))
        print("   want:", repr(want))


print("=== 1. 解析 SEARCH/REPLACE 块（宽容标记：允许 5~9 个 < >） ===")
response = """这里是说明文字。

demo.py
```python
<<<<<<<<< SEARCH
def greet(name):
=======
def greet(name: str) -> None:
>>>>>>>>> REPLACE
```
"""
blocks = list(find_original_update_blocks(response, FENCE, ["demo.py"]))
print("解析出块数:", len(blocks), "| 文件名:", blocks[0][0])
print("SEARCH 部分:", repr(blocks[0][1]))

print("\n=== 2. 完美匹配 ===")
edited = do_replace("demo.py", ORIGINAL, '    print("hello", name)\n',
                    '    print("hi", name)\n', FENCE)
check("精确匹配替换成功", edited, ORIGINAL.replace('"hello"', '"hi"'))

print("\n=== 3. 模型缩进写错（Search 块整体少缩进）→ 宽容匹配救回来 ===")
bad_indent_search = 'print("hello", name)\n'  # 少了 4 空格
edited = do_replace("demo.py", ORIGINAL, bad_indent_search,
                    'print("hi", name)\n', FENCE)
check("前导空白宽容匹配成功", edited, ORIGINAL.replace('"hello"', '"hi"'))

print("\n=== 4. 内容真的不对 → 返回 None（Aider 此时会报错回喂，而不是猜） ===")
wrong_search = '    print("totally different", name)\n'
edited = do_replace("demo.py", ORIGINAL, wrong_search,
                    '    print("hi", name)\n', FENCE)
check("失配返回 None", edited, None)
print("差异过大时 find_similar_lines 返回空（相似度阈值 0.6 没到）:",
      repr(find_similar_lines(wrong_search, ORIGINAL)))

print("\n--- 4b. 笔误的多行块 → 有 'Did you mean' 提示（单行块拿不到建议，见注释） ---")
# 注意：find_similar_lines 用 SequenceMatcher 比的是**行列表**，
# 单行 search 块只有"相等/不等"两种结果（比值不是 0 就是 1），
# 所以 did-you-mean 实际只对多行块生效——这本身就是个值得记的细节。
typo_search = 'def greet(name):\n    print("helo", name)\n\n\ndef main():\n'
edited = do_replace("demo.py", ORIGINAL, typo_search, '    print("hi", name)\n', FENCE)
check("笔误也失配（精确匹配是硬要求）", edited, None)
did_you_mean = find_similar_lines(typo_search, ORIGINAL)
check("多行块给出了 did-you-mean 建议", did_you_mean,
      'def greet(name):\n    print("hello", name)\n\n\ndef main():')
print("--- 失败回喂里给模型看的片段 ---")
print(did_you_mean)

print("\n=== 5. `...` 省略块（模型偷懒省略中间代码） ===")
dots_search = 'def greet(name):\n    print("hello", name)\n...\n    greet("world")\n'
dots_replace = 'def greet(name):\n    print("hi", name)\n...\n    greet("world")\n'
edited = do_replace("demo.py", ORIGINAL, dots_search, dots_replace, FENCE)
check("... 省略块成功", edited, ORIGINAL.replace('"hello"', '"hi"'))

print("\n=== 6. 空 SEARCH + 不存在的文件 = 新建文件 ===")
newpath = Path(__file__).parent / "_tmp_new_file.py"
if newpath.exists():
    newpath.unlink()
edited = do_replace(str(newpath), "", "", "print('created')\n", FENCE)
check("空 SEARCH 建新文件", edited, "print('created')\n")
if newpath.exists():
    newpath.unlink()

print("\n=== 7. 模糊匹配（编辑距离）被显式关掉了 —— 源码 :183 的裸 return ===")
almost = '    print("hellp", name)\n'  # 只差一个字符
res_chunk = replace_most_similar_chunk(ORIGINAL, almost, '    print("hi", name)\n')
print("replace_most_similar_chunk 结果:", res_chunk, "(None = 走了报错回喂这条路)")
lines_whole = ORIGINAL.splitlines(keepends=True)
fuzzy = replace_closest_edit_distance(lines_whole, almost, almost.splitlines(keepends=True),
                                      '    print("hi", name)\n'.splitlines(keepends=True))
print("但 replace_closest_edit_distance 单独调用是能匹配的:", fuzzy is not None)
print("→ 结论：Aider 写了模糊匹配但没接进主路径（宁可报错让模型修正，也不猜位置）")

print(f"\n=== 合计 {ok}/{checks} 项断言通过 ===")
