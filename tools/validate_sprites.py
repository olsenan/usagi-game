#!/usr/bin/env python3
import os, sys, json
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.normpath(os.path.join(ROOT, ".."))
MANIFEST = os.path.join(PROJ, "manifest", "sprite_manifest.json")
FRAME_W = 96
FRAME_H = 96

def check_sprite(path, expected_frames):
  issues = []
  if not os.path.exists(path):
    return [f"Missing file: {path}"]
  try:
    img = Image.open(path)
  except Exception as e:
    return [f"Cannot open {path}: {e}"]
  w, h = img.size
  if h != FRAME_H:
    issues.append(f"{path}: wrong height {h} (expected {FRAME_H})")
  if w % FRAME_W != 0:
    issues.append(f"{path}: width {w} not divisible by {FRAME_W}")
  frames = w // FRAME_W
  if frames != expected_frames:
    issues.append(f"{path}: frame count {frames} != expected {expected_frames}")
  if img.mode not in ("RGBA","LA"):
    issues.append(f"{path}: no alpha channel (mode {img.mode})")
  return issues

def main():
  if not os.path.exists(MANIFEST):
    print("Missing manifest/sprite_manifest.json")
    sys.exit(2)
  with open(MANIFEST,"r",encoding="utf-8") as f:
    man = json.load(f)
  errors = []
  for who in ("usagi","ninja"):
    if who not in man:
      print(f"Warning: '{who}' not present in manifest.")
      continue
    for action, meta in man[who].items():
      rel = meta.get("path")
      expected = int(meta.get("frames", 1))
      if not rel:
        errors.append(f"{who}.{action}: missing 'path'")
        continue
      full = os.path.join(PROJ, rel)
      errs = check_sprite(full, expected)
      for e in errs:
        errors.append(f"{who}.{action}: {e}")
  if errors:
    print("Sprite validation FAILED:")
    for e in errors:
      print("  -", e)
    sys.exit(2)
  else:
    print("Sprite validation OK.")
    sys.exit(0)

if __name__ == "__main__":
  main()
