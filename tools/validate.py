#!/usr/bin/env python3
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.normpath(os.path.join(ROOT, ".."))

def validate_js_brackets(path):
  issues = []
  for root, _, files in os.walk(path):
    for f in files:
      if f.endswith(".js"):
        fp = os.path.join(root, f)
        with open(fp, "r", encoding="utf-8", errors="ignore") as fh:
          src = fh.read()
        stack = []
        pairs = {')':'(',']':'[','}':'{'}
        openers = set(['(','[','{'])
        closers = set(pairs.keys())
        line=1; col=0
        for ch in src:
          if ch == '\n':
            line += 1; col=0; continue
          col += 1
          if ch in openers:
            stack.append((ch,line,col))
          elif ch in closers:
            if not stack or stack[-1][0] != pairs[ch]:
              issues.append((fp, "unmatched closer", ch, line, col))
            else:
              stack.pop()
        for ch,line,col in [(s[0],s[1],s[2]) for s in stack]:
          issues.append((fp, "unclosed opener", ch, line, col))
        trimmed = src.strip()
        if trimmed and not trimmed.endswith(("}", ");", "]", ";")):
          issues.append((fp, "eof heuristic", "", None, None))
  return issues

def find_script_asset_refs(script_root):
  asset_pat = re.compile(r'(?P<q>["\'])(assets/[^"\']+)\1')
  missing = []
  for root, _, files in os.walk(script_root):
    for f in files:
      if f.endswith(".js"):
        fp = os.path.join(root,f)
        with open(fp,"r",encoding="utf-8",errors="ignore") as fh:
          src = fh.read()
        for m in asset_pat.finditer(src):
          rel = m.group(2)
          full = os.path.join(PROJ, rel)
          if not os.path.exists(full):
            missing.append((fp, rel))
  return missing

def main():
  scripts = os.path.join(PROJ,"scripts")
  js_issues = validate_js_brackets(scripts) if os.path.exists(scripts) else []
  miss_assets = find_script_asset_refs(scripts) if os.path.exists(scripts) else []
  ok = True
  if js_issues:
    ok = False
    print("JS issues:")
    for item in js_issues:
      print("  ", item)
  else:
    print("JS structure: OK")
  if miss_assets:
    ok = False
    print("Missing asset paths:")
    for fp, rel in miss_assets:
      print(f"  {fp} -> {rel}")
  else:
    print("Asset paths referenced in JS: OK")
  print("Done.")
  sys.exit(0 if ok else 2)

if __name__ == "__main__":
  main()
