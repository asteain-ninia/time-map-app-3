"""Extract tool error patterns."""
import json, sys, re
from collections import Counter
from pathlib import Path

log_path = Path(sys.argv[1])
tool_use_id_to_name = {}
tool_use_id_to_input = {}
errors = []

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
        if t == "assistant":
            content = obj.get("message", {}).get("content", [])
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        tuid = b.get("id")
                        if tuid:
                            tool_use_id_to_name[tuid] = b.get("name")
                            tool_use_id_to_input[tuid] = b.get("input", {})
        elif t == "user":
            content = obj.get("message", {}).get("content", [])
            if isinstance(content, list):
                for b in content:
                    if not isinstance(b, dict) or b.get("type") != "tool_result":
                        continue
                    if not b.get("is_error"):
                        continue
                    tuid = b.get("tool_use_id")
                    name = tool_use_id_to_name.get(tuid, "?")
                    inp = tool_use_id_to_input.get(tuid, {})
                    rc = b.get("content", "")
                    text = ""
                    if isinstance(rc, list):
                        for c in rc:
                            if isinstance(c, dict) and c.get("type") == "text":
                                text += c.get("text", "")
                    elif isinstance(rc, str):
                        text = rc
                    errors.append({"tool": name, "input": inp, "text": text[:300]})

print(f"Total errors: {len(errors)}\n")
by_tool = Counter(e["tool"] for e in errors)
print("By tool:")
for t, c in by_tool.most_common():
    print(f"  {t:20s} {c}")

print("\nError pattern categorization (first 60 chars of message):")
pattern_counter = Counter()
for e in errors:
    first = e["text"].replace("\n", " ")[:100]
    first = re.sub(r'\d+', 'N', first)  # normalize numbers
    first = re.sub(r'[a-f0-9]{8,}', 'HASH', first)
    pattern_counter[first[:80]] += 1
for pat, c in pattern_counter.most_common(15):
    print(f"  {c:3d}x  {pat}")

print("\nSample 5 errors with context:")
for e in errors[:5]:
    inp_summary = ""
    if e["tool"] == "Bash":
        inp_summary = e["input"].get("command", "")[:80]
    elif e["tool"] in ("Read", "Edit", "Write"):
        inp_summary = e["input"].get("file_path", "")[-60:]
    elif e["tool"] == "Grep":
        inp_summary = e["input"].get("pattern", "")[:60]
    print(f"\n  [{e['tool']}] {inp_summary}")
    print(f"  -> {e['text'][:200]}")
