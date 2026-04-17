"""Deeper analysis of Claude Code session log."""
import json
import sys
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

log_path = Path(sys.argv[1])

# Daily buckets
daily_cd = Counter()
daily_bash = Counter()
daily_edit = Counter()
daily_agent = Counter()
daily_user_msgs = Counter()

# Agent details
agent_input_output = []  # (desc, input_size, output_size)

# Bash details
bash_full_cmds = Counter()
cd_targets = Counter()

# Write details
write_targets = Counter()
write_sizes = []  # (path, size)

# Tool result sizes by tool name — need to correlate tool_use_id -> tool_name
tool_use_id_to_name = {}
tool_result_size_by_tool = defaultdict(int)
tool_result_count_by_tool = defaultdict(int)

# Errors / denials / retries
permission_denials = 0
tool_errors = 0
interrupts = 0

# Edit target files
edit_targets = Counter()

# User message analysis
user_msg_lengths = []
user_text_samples = []  # first 60 chars

# Compaction events
compaction_events = 0

# Assistant message sizes
assistant_text_bytes = 0
assistant_msg_count = 0

# Agent subagent_type summary
agent_sub_by_day = defaultdict(Counter)

with log_path.open("r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        ts = obj.get("timestamp", "")
        day = ts[:10] if ts else "?"
        t = obj.get("type", "?")

        if t == "assistant":
            msg = obj.get("message", {})
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if btype == "text":
                        assistant_text_bytes += len(block.get("text", ""))
                    elif btype == "tool_use":
                        name = block.get("name", "?")
                        tuid = block.get("id")
                        if tuid:
                            tool_use_id_to_name[tuid] = name
                        inp = block.get("input", {})

                        if name == "Bash":
                            daily_bash[day] += 1
                            cmd = inp.get("command", "")
                            head = cmd.split()[0] if cmd else ""
                            # Keep short form for grouping
                            short = " ".join(cmd.split()[:3])
                            bash_full_cmds[short[:80]] += 1
                            if head == "cd":
                                daily_cd[day] += 1
                                # capture target
                                parts = cmd.split()
                                if len(parts) > 1:
                                    cd_targets[parts[1][:60]] += 1
                        elif name == "Edit":
                            daily_edit[day] += 1
                            fp = inp.get("file_path", "")
                            edit_targets[fp.replace("\\", "/").split("/")[-1]] += 1
                        elif name == "Write":
                            fp = inp.get("file_path", "")
                            write_targets[fp.replace("\\", "/").split("/")[-1]] += 1
                            write_sizes.append((fp, len(inp.get("content", ""))))
                        elif name == "Agent":
                            daily_agent[day] += 1
                            sub = inp.get("subagent_type", "general-purpose")
                            agent_sub_by_day[day][sub] += 1
                            prompt = inp.get("prompt", "")
                            desc = inp.get("description", "")
                            agent_input_output.append({
                                "day": day,
                                "desc": desc[:40],
                                "sub": sub,
                                "prompt_size": len(prompt),
                                "result_size": 0,
                                "tuid": tuid
                            })
            assistant_msg_count += 1

        elif t == "user":
            daily_user_msgs[day] += 1
            msg = obj.get("message", {})
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if btype == "text":
                        text = block.get("text", "")
                        user_msg_lengths.append(len(text))
                        if len(text) > 5 and not text.startswith("<"):
                            user_text_samples.append(text[:80])
                    elif btype == "tool_result":
                        tuid = block.get("tool_use_id")
                        tool_name = tool_use_id_to_name.get(tuid, "?")
                        result_content = block.get("content", "")
                        size = 0
                        if isinstance(result_content, list):
                            for c in result_content:
                                if isinstance(c, dict) and c.get("type") == "text":
                                    size += len(c.get("text", ""))
                        elif isinstance(result_content, str):
                            size = len(result_content)
                        tool_result_size_by_tool[tool_name] += size
                        tool_result_count_by_tool[tool_name] += 1

                        if block.get("is_error"):
                            tool_errors += 1
                        content_text = json.dumps(result_content)[:500]
                        if "permission" in content_text.lower() and "denied" in content_text.lower():
                            permission_denials += 1
                        if "interrupted" in content_text.lower():
                            interrupts += 1

                        # Match to agent record
                        if tool_name == "Agent":
                            for rec in agent_input_output:
                                if rec["tuid"] == tuid:
                                    rec["result_size"] = size
                                    break
            elif isinstance(content, str):
                user_msg_lengths.append(len(content))

        elif t == "system":
            # compaction hints
            sub = obj.get("subtype", "") or ""
            content = json.dumps(obj)
            if "compact" in content.lower():
                compaction_events += 1

# ---------- Output ----------
print("=== Daily tool usage (last 20 days) ===")
all_days = sorted(set(list(daily_bash.keys()) + list(daily_user_msgs.keys())))[-20:]
print(f"  {'day':12s} {'user':>5s} {'bash':>5s} {'cd':>4s} {'edit':>5s} {'agent':>5s}")
for d in all_days:
    print(f"  {d:12s} {daily_user_msgs[d]:5d} {daily_bash[d]:5d} {daily_cd[d]:4d} {daily_edit[d]:5d} {daily_agent[d]:5d}")

total_cd = sum(daily_cd.values())
total_bash = sum(daily_bash.values())
print(f"\n  cd total: {total_cd} / bash total: {total_bash}  ({100*total_cd/max(total_bash,1):.1f}%)")

# Recent vs old cd ratio
days_sorted = sorted(daily_cd.keys())
if len(days_sorted) >= 6:
    old_half = days_sorted[:len(days_sorted)//2]
    new_half = days_sorted[len(days_sorted)//2:]
    old_cd = sum(daily_cd[d] for d in old_half)
    new_cd = sum(daily_cd[d] for d in new_half)
    old_bash = sum(daily_bash[d] for d in old_half) or 1
    new_bash = sum(daily_bash[d] for d in new_half) or 1
    print(f"  Old half cd rate:  {old_cd}/{old_bash} = {100*old_cd/old_bash:.1f}%")
    print(f"  New half cd rate:  {new_cd}/{new_bash} = {100*new_cd/new_bash:.1f}%")

print("\n=== Top cd targets ===")
for tgt, c in cd_targets.most_common(10):
    print(f"  {c:4d}x  {tgt}")

print("\n=== Top 20 Bash command patterns (first 3 words) ===")
for cmd, c in bash_full_cmds.most_common(20):
    print(f"  {c:4d}x  {cmd}")

print("\n=== Tool result size by tool (MB total / avg KB per call) ===")
for name in sorted(tool_result_size_by_tool.keys(), key=lambda n: -tool_result_size_by_tool[n]):
    total_b = tool_result_size_by_tool[name]
    cnt = tool_result_count_by_tool[name]
    mb = total_b / 1024 / 1024
    avg_kb = total_b / cnt / 1024 if cnt else 0
    print(f"  {name:20s} {mb:6.2f} MB total  ({cnt:5d} calls, {avg_kb:7.1f} KB avg)")

print("\n=== Agent efficiency (result_size vs prompt_size) ===")
if agent_input_output:
    total_agent_result = sum(r["result_size"] for r in agent_input_output)
    total_agent_prompt = sum(r["prompt_size"] for r in agent_input_output)
    print(f"  Total prompt sent:   {total_agent_prompt / 1024:.1f} KB")
    print(f"  Total result back:   {total_agent_result / 1024:.1f} KB")
    print(f"  Avg result per call: {total_agent_result / len(agent_input_output) / 1024:.2f} KB")
    print(f"  Largest 5 agent calls by result:")
    for rec in sorted(agent_input_output, key=lambda r: -r["result_size"])[:5]:
        print(f"    {rec['day']} {rec['sub']:20s} result={rec['result_size']/1024:.1f}KB  desc={rec['desc']}")

print("\n=== Top Edit targets ===")
for f, c in edit_targets.most_common(15):
    print(f"  {c:4d}x  {f}")

print("\n=== Top Write targets ===")
for f, c in write_targets.most_common(15):
    print(f"  {c:4d}x  {f}")

print(f"\n  Write total content bytes: {sum(s for _, s in write_sizes) / 1024 / 1024:.2f} MB")
print(f"  Largest 5 writes:")
for fp, sz in sorted(write_sizes, key=lambda x: -x[1])[:5]:
    print(f"    {sz/1024:6.1f} KB  {fp}")

print("\n=== Errors / denials / interrupts ===")
print(f"  Tool errors:        {tool_errors}")
print(f"  Permission denials: {permission_denials}")
print(f"  Interrupts:         {interrupts}")

print("\n=== User message lengths ===")
if user_msg_lengths:
    n = len(user_msg_lengths)
    avg = sum(user_msg_lengths) / n
    user_msg_lengths.sort()
    p50 = user_msg_lengths[n//2]
    p95 = user_msg_lengths[int(n*0.95)]
    p99 = user_msg_lengths[int(n*0.99)]
    print(f"  count={n} avg={avg:.0f} p50={p50} p95={p95} p99={p99}")

print("\n=== Assistant output ===")
print(f"  Total assistant text: {assistant_text_bytes / 1024 / 1024:.2f} MB")
print(f"  Messages: {assistant_msg_count}")
print(f"  Avg per msg: {assistant_text_bytes / max(assistant_msg_count,1):.0f} bytes")

print(f"\n=== Compaction indicators ===")
print(f"  {compaction_events} system events mentioning 'compact'")
