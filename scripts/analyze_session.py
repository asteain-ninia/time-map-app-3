"""Analyze Claude Code session JSONL log for usage patterns."""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

log_path = Path(sys.argv[1])

type_counter = Counter()
tool_counter = Counter()
tool_input_bytes = defaultdict(int)
tool_result_bytes = defaultdict(int)
skill_invocations = Counter()
subagent_invocations = Counter()
file_reads = Counter()
bash_commands = Counter()
grep_patterns = Counter()
user_messages = 0
assistant_messages = 0
total_bytes_by_type = defaultdict(int)

with log_path.open("r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        t = obj.get("type", "?")
        type_counter[t] += 1
        total_bytes_by_type[t] += len(line)

        if t == "user":
            user_messages += 1
        elif t == "assistant":
            assistant_messages += 1
            msg = obj.get("message", {})
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        name = block.get("name", "?")
                        tool_counter[name] += 1
                        inp = block.get("input", {})
                        inp_str = json.dumps(inp, ensure_ascii=False)
                        tool_input_bytes[name] += len(inp_str)

                        if name == "Skill":
                            skill_invocations[inp.get("skill", "?")] += 1
                        elif name == "Agent":
                            subagent_invocations[inp.get("subagent_type", "general-purpose")] += 1
                        elif name == "Read":
                            file_reads[inp.get("file_path", "?")] += 1
                        elif name == "Bash":
                            cmd = inp.get("command", "")
                            head = cmd.split()[0] if cmd else "?"
                            bash_commands[head] += 1
                        elif name == "Grep":
                            grep_patterns[inp.get("pattern", "?")[:60]] += 1

        # Tool result bytes
        if t == "user":
            msg = obj.get("message", {})
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        result_content = block.get("content", "")
                        if isinstance(result_content, list):
                            for c in result_content:
                                if isinstance(c, dict) and c.get("type") == "text":
                                    tool_result_bytes["_total"] += len(c.get("text", ""))
                        elif isinstance(result_content, str):
                            tool_result_bytes["_total"] += len(result_content)

print("=== Entry types ===")
for t, c in type_counter.most_common():
    mb = total_bytes_by_type[t] / 1024 / 1024
    print(f"  {t:30s} {c:6d}  ({mb:.2f} MB)")

print(f"\n=== Messages ===")
print(f"  user:      {user_messages}")
print(f"  assistant: {assistant_messages}")

print(f"\n=== Tool usage (count / input kb) ===")
for name, c in tool_counter.most_common(30):
    inb = tool_input_bytes[name] / 1024
    print(f"  {name:25s} {c:6d}   {inb:8.1f} KB input")

print(f"\n=== Total tool_result bytes ===")
print(f"  {tool_result_bytes['_total'] / 1024 / 1024:.2f} MB")

print(f"\n=== Skill invocations ===")
for s, c in skill_invocations.most_common():
    print(f"  {s:25s} {c}")

print(f"\n=== Sub-agent invocations ===")
for s, c in subagent_invocations.most_common():
    print(f"  {s:25s} {c}")

print(f"\n=== Top 20 Bash command heads ===")
for cmd, c in bash_commands.most_common(20):
    print(f"  {cmd:25s} {c}")

print(f"\n=== Top 20 most-read files ===")
for f, c in file_reads.most_common(20):
    short = f.replace("\\", "/").split("/")[-1] if "/" in f or "\\" in f else f
    print(f"  {c:4d}x  {short}")

print(f"\n=== Files read 3+ times (re-read indicator) ===")
repeats = [(f, c) for f, c in file_reads.items() if c >= 3]
print(f"  {len(repeats)} unique files re-read 3+ times")
total_rereads = sum(c - 1 for _, c in repeats)
print(f"  {total_rereads} wasted re-reads (reads beyond the first)")
