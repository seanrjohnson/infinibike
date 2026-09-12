---
name: blender
description: Use for Blender scene inspection, modeling, modification, rendering, and asset export through the official Blender Lab MCP.
---

# Blender workflow

Use the official Blender Lab MCP tools.

## General workflow

1. Inspect before modifying.
   - Use `get_objects_summary` to understand the scene.
   - Use `get_object_detail_summary` when working on an existing object.

2. Prefer `execute_blender_code` for non-trivial Blender operations.
   - Use `bpy` directly.
   - Make focused, understandable changes.
   - Avoid rebuilding unrelated parts of the scene.

3. Verify after changes.
   - Check object properties numerically where possible.
   - Use screenshots or viewport renders to visually verify geometry, materials, and placement.
   - Do not assume code execution means the result is visually correct.

4. Iterate when necessary.
   - inspect → modify → verify → correct

## Geometry

When creating objects:
- Use sensible real-world dimensions.
- Apply transforms when appropriate.
- Check scale, rotation, origin, and bounding dimensions.
- Avoid unnecessary geometry and modifiers.

## Game assets

For assets intended for games:
- Keep topology reasonably efficient.
- Use named objects and materials.
- Prefer portable materials.
- Keep transforms and origins suitable for export.
- Verify exported GLB/glTF when export is part of the task.

## Safety

Before destructive changes:
- Inspect the existing scene.
- Preserve unrelated objects.
- Do not overwrite source files unless explicitly requested.

## Visual verification

Use screenshots/renders after significant visual changes.

Do not judge dimensions or alignment from screenshots alone when Blender data can provide exact values.