import math
import os

import bpy
from mathutils import Vector


PROJECT_ROOT = r"C:\projects\infinibike"
GLB_PATH = os.path.join(
    PROJECT_ROOT, "public", "assets", "models", "infinibike-assets.glb"
)
BLEND_PATH = os.path.join(
    PROJECT_ROOT, "assets", "blender", "infinibike-assets.blend"
)
COLLECTION_NAME = "InfinibikeAssets"
BEVEL_SEGMENTS = 5


def rgba(hex_color):
    return (
        ((hex_color >> 16) & 255) / 255,
        ((hex_color >> 8) & 255) / 255,
        (hex_color & 255) / 255,
        1,
    )


def material(name, color, roughness=0.82, metallic=0.0, atlas=False):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    # Keep the library texture-free. The art direction gets its variation from
    # modeled silhouettes, bevel highlights, and a small set of matte colors.
    return mat


MAT = {
    "bark": material("CartoonBark", 0x70452E),
    "leaf": material("LeafSage", 0x5D8A4E),
    "leaf_light": material("LeafSunlit", 0x86A852),
    "leaf_autumn": material("LeafAutumn", 0xD87B35),
    "leaf_pink": material("FloweringPink", 0xE89AAA),
    "bark_light": material("BirchCream", 0xD8CEB7),
    "pine": material("PineDeep", 0x315B48),
    "wood": material("WarmWood", 0x9A673E),
    "red_brick": material("Terracotta", 0xB85F47),
    "tan_brick": material("MustardStucco", 0xD6A451),
    "siding": material("CreamSiding", 0xE7D9BA),
    "roof": material("CharcoalRoof", 0x394451, roughness=0.92),
    "concrete": material("WarmStone", 0xB8B09F),
    "glass": material("CartoonGlass", 0x75A9B4, roughness=0.3, metallic=0.08),
    "metal": material("GraphiteMetal", 0x4D5A5B, roughness=0.56, metallic=0.3),
    "white": material("WarmWhite", 0xF2E9D7),
    "black": material("TireRubber", 0x202627, roughness=0.94),
    "red": material("BrickRed", 0xA9473D),
    "green": material("AwningTeal", 0x3D786F),
    "blue": material("PaintTeal", 0x3F8090, roughness=0.68),
    "mustard": material("PaintMustard", 0xD7A63E),
    "navy": material("PaintNavy", 0x344C66),
    "gold": material("WarmLight", 0xF2C66D, roughness=0.35),
    "skin_a": material("SkinA", 0x9B6649),
    "skin_b": material("SkinB", 0xC58D69),
    "denim": material("Denim", 0x354C63),
    "cloth_green": material("ClothGreen", 0x4D6754),
    "cloth_rust": material("ClothRust", 0x985747),
    "cow_white": material("CowWhite", 0xD8D5C8),
    "cow_dark": material("CowDark", 0x30302D),
    "sheep": material("SheepWool", 0xD7D1BF, roughness=1.0),
    "raccoon": material("RaccoonFur", 0x626865, roughness=1.0),
    "dinosaur": material("DinosaurGreen", 0x587247, roughness=0.9),
    "animal_tan": material("AnimalTan", 0xB97A45),
    "animal_fox": material("AnimalFox", 0xD56A35),
    "animal_brown": material("AnimalBrown", 0x76503A),
}


ATLAS_TILES = {
    "red_brick": (0, 0),
    "tan_brick": (1, 0),
    "siding": (2, 0),
    "roof": (3, 0),
    "wood": (0, 1),
    "fence": (1, 1),
    "bark": (2, 1),
    "leaf": (3, 1),
    "pine": (0, 2),
    "concrete": (1, 2),
    "glass": (2, 2),
    "metal": (3, 2),
}


def atlas_uv(obj, tile):
    if not obj.data or not hasattr(obj.data, "uv_layers"):
        return
    uv_layer = obj.data.uv_layers.active
    if uv_layer is None:
        return
    col, row = ATLAS_TILES[tile]
    for loop in uv_layer.data:
        loop.uv.x = (loop.uv.x + col) / 4
        loop.uv.y = (loop.uv.y + (2 - row)) / 3


def move_to_collection(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def root(collection, key):
    obj = bpy.data.objects.new(f"asset__{key}", None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    # Modeling helpers use Three.js-style Y-up coordinates. Rotate that local
    # space into Blender's Z-up world; glTF export converts it back to Y-up.
    obj.rotation_euler.x = math.pi / 2
    obj["asset_key"] = key
    return obj


def finish(obj, parent, mat, tile=None, bevel=0.04):
    obj.parent = parent
    move_to_collection(obj, parent.users_collection[0])
    if mat:
        obj.data.materials.append(mat)
    if tile:
        atlas_uv(obj, tile)
    if bevel > 0:
        modifier = obj.modifiers.new("Edge softness", "BEVEL")
        modifier.width = bevel
        modifier.segments = BEVEL_SEGMENTS
    return obj


def box(parent, name, location, scale, mat, tile=None, bevel=0.05, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, parent, mat, tile, bevel)


def cylinder(parent, name, location, radius, depth, mat, tile=None, vertices=28, rotation=(-math.pi / 2, 0, 0), bevel=0.03):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, parent, mat, tile, bevel)


def beam(parent, name, start, end, radius, mat, vertices=20, bevel=0.025):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    obj = cylinder(
        parent,
        name,
        (start_vector + end_vector) / 2,
        radius,
        direction.length,
        mat,
        vertices=vertices,
        bevel=bevel,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(direction.normalized())
    return obj


def torus(parent, name, location, major_radius, minor_radius, mat, major_segments=36, minor_segments=10, rotation=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, parent, mat, bevel=0.015)


def sphere(parent, name, location, scale, mat, tile=None, subdivisions=4):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return finish(obj, parent, mat, tile, 0.04)


def cone(parent, name, location, radius1, radius2, depth, mat, tile=None, vertices=28, rotation=(-math.pi / 2, 0, 0), smooth_sides=False):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    if smooth_sides:
        for polygon in obj.data.polygons:
            polygon.use_smooth = len(polygon.vertices) <= 4
    return finish(obj, parent, mat, tile, 0.03)


def window(parent, x, y, z, width=1.2, height=1.5, front=True):
    scale = (width, height, 0.12) if front else (0.12, height, width)
    pane = box(parent, "window", (x, y, z), scale, MAT["glass"], bevel=0.04)
    if front and width <= 2.5:
        trim_z = z - 0.08
        for trim_x in (-width / 2 - 0.07, width / 2 + 0.07):
            box(parent, "window-frame", (x + trim_x, y, trim_z), (0.11, height + 0.22, 0.12), MAT["white"], bevel=0.025)
        for trim_y in (-height / 2 - 0.07, height / 2 + 0.07):
            box(parent, "window-frame", (x, y + trim_y, trim_z), (width + 0.22, 0.11, 0.12), MAT["white"], bevel=0.025)
        box(parent, "window-mullion", (x, y, trim_z - 0.02), (0.07, height, 0.1), MAT["white"], bevel=0.018)
    return pane


def door(parent, x, y, z, width=1.2, height=2.2, mat=None):
    panel = box(parent, "door", (x, y, z), (width, height, 0.16), mat or MAT["wood"], bevel=0.055)
    box(parent, "door-header", (x, y + height / 2 + 0.09, z - 0.08), (width + 0.28, 0.16, 0.14), MAT["white"], bevel=0.025)
    for side in (-1, 1):
        box(parent, "door-frame", (x + side * (width / 2 + 0.07), y, z - 0.08), (0.14, height + 0.2, 0.14), MAT["white"], bevel=0.025)
    sphere(parent, "door-knob", (x + width * 0.32, y, z - 0.13), (0.055, 0.055, 0.04), MAT["gold"], subdivisions=2)
    return panel


def gable_roof(parent, width, depth, base_y, mat=None):
    roof_mat = mat or MAT["roof"]
    angle = math.radians(28)
    panel_width = width / 2 + 0.55
    for side in (-1, 1):
        box(
            parent,
            "pitched-roof",
            (side * width * 0.23, base_y + 0.72, 0),
            (panel_width, 0.22, depth + 0.7),
            roof_mat,
            "roof",
            0.035,
            rotation=(0, side * angle, 0),
        )


def make_tree(collection, key, pine=False, broad=False):
    asset = root(collection, key)
    trunk_mat = MAT["bark_light"] if key == "tree_birch" else MAT["bark"]
    if pine:
        cylinder(asset, "trunk", (0, 2.0, 0), 0.3, 4.0, MAT["bark"], vertices=24)
        for index, (y, radius) in enumerate(((2.7, 2.45), (3.8, 2.15), (4.9, 1.78), (5.9, 1.35), (6.75, 0.85))):
            cone(asset, f"pine-crown-{index}", (0, y, 0), radius, 0.08, 2.45, MAT["pine"], vertices=32, smooth_sides=True)
    else:
        cylinder(asset, "trunk", (0, 2.0, 0), 0.42 if broad else 0.34, 4.0, trunk_mat, vertices=28)
        for angle in range(0, 360, 72):
            radians = math.radians(angle)
            root_x = math.cos(radians) * 0.48
            root_z = math.sin(radians) * 0.48
            box(asset, "root-flare", (root_x, 0.18, root_z), (0.32, 0.32, 1.15), trunk_mat, bevel=0.12, rotation=(0, -radians, 0))
        branches = [(-0.8, 3.2, 0.1), (0.75, 3.5, 0.2), (0.1, 4.1, 0.65)]
        for index, (x, y, z) in enumerate(branches):
            branch = cylinder(asset, f"branch-{index}", (x * 0.5, y, z * 0.5), 0.15, 2.3, trunk_mat, vertices=18)
            branch.rotation_euler = (-math.pi / 2 + z * 0.35, 0, -x * 0.65)
        leaf_mat = MAT["leaf_autumn"] if key == "tree_maple" else MAT["leaf_pink"] if key == "tree_flowering" else MAT["leaf"]
        clusters = [(-1.45, 4.55, 0.1, 1.45), (1.35, 4.7, 0.25, 1.4), (0, 5.45, -0.9, 1.55), (0.35, 5.25, 1.2, 1.3), (-0.45, 6.15, 0.2, 1.2), (-0.45, 4.7, 0.65, 1.25), (0.65, 5.7, 0.45, 1.15)]
        for index, (x, y, z, size) in enumerate(clusters):
            sphere(asset, f"leaf-cluster-{index}", (x, y, z), (size * (1.1 if broad else 0.9), size, size), leaf_mat, subdivisions=3)
        for x, y, z in ((-1.0, 5.3, -0.9), (0.9, 5.1, 0.9), (0.15, 6.25, -0.2)):
            sphere(asset, "sunlit-leaf-cluster", (x, y, z), (0.65, 0.55, 0.65), MAT["leaf_light"] if key == "tree_oak" else leaf_mat, subdivisions=3)


def make_fence(collection):
    asset = root(collection, "fence_split_rail")
    for x in (-2.5, 0, 2.5):
        cylinder(asset, "fence-post", (x, 0.75, 0), 0.13, 1.5, MAT["wood"], "fence", 8)
    for start in (-1.25, 1.25):
        for y, z in ((0.55, -0.02), (1.05, 0.04)):
            rail = cylinder(asset, "fence-rail", (start, y, z), 0.09, 2.75, MAT["wood"], "fence", 8, rotation=(0, math.pi / 2, 0))
            rail.rotation_euler.z = math.radians(3 if y < 0.8 else -2)

    picket = root(collection, "fence_picket")
    for x in (-2.5, 2.5):
        box(picket, "picket-post", (x, 0.82, 0), (0.2, 1.64, 0.2), MAT["white"], bevel=0.05)
        sphere(picket, "post-cap", (x, 1.72, 0), (0.16, 0.16, 0.16), MAT["white"], subdivisions=2)
    for x in [value * 0.42 for value in range(-5, 6)]:
        box(picket, "picket", (x, 0.72, 0), (0.13, 1.35, 0.12), MAT["white"], bevel=0.035)
        cone(picket, "picket-point", (x, 1.48, 0), 0.11, 0.01, 0.25, MAT["white"], vertices=12)
    for y in (0.48, 1.02):
        box(picket, "picket-rail", (0, y, 0.08), (5.0, 0.11, 0.11), MAT["white"], bevel=0.03)

    stone = root(collection, "fence_stone")
    for row in range(3):
        for index in range(7):
            x = -2.55 + index * 0.85 + (0.4 if row % 2 else 0)
            if x > 2.65:
                continue
            box(stone, "wall-stone", (x, 0.28 + row * 0.48, 0), (0.78, 0.42, 0.48), MAT["concrete"], bevel=0.12)
    for x in (-2.85, 2.85):
        box(stone, "wall-pier", (x, 0.78, 0), (0.62, 1.56, 0.68), MAT["concrete"], bevel=0.1)


def make_quadruped(collection, key, body_mat, size, head_scale, ears=True):
    asset = root(collection, key)
    sphere(asset, "body", (0, size * 0.95, 0.15), (size * 0.62, size * 0.55, size), body_mat, subdivisions=3)
    sphere(asset, "head", (0, size * 1.12, -size * 0.92), head_scale, body_mat, subdivisions=3)
    for index, (x, z) in enumerate(((-0.34, -0.45), (0.34, -0.45), (-0.34, 0.62), (0.34, 0.62))):
        cylinder(asset, f"{key}-left-leg" if x < 0 else f"{key}-right-leg", (x * size, size * 0.39, z * size), size * 0.09, size * 0.76, body_mat, vertices=14)
    if ears:
        for side in (-1, 1):
            cone(asset, "ear", (side * head_scale[0] * 0.78, size * 1.35, -size * 1.0), size * 0.14, 0.02, size * 0.42, body_mat, vertices=12)
    for side in (-1, 1):
        sphere(asset, "eye", (side * head_scale[0] * 0.42, size * 1.2, -size * 1.34), (size * 0.045, size * 0.055, size * 0.035), MAT["black"], subdivisions=2)
    sphere(asset, "muzzle", (0, size * 1.02, -size * 1.34), (head_scale[0] * 0.58, head_scale[1] * 0.48, head_scale[2] * 0.35), MAT["white"], subdivisions=3)
    for x, z in ((-0.34, -0.45), (0.34, -0.45), (-0.34, 0.62), (0.34, 0.62)):
        box(asset, "hoof", (x * size, size * 0.08, z * size - size * 0.06), (size * 0.22, size * 0.16, size * 0.28), MAT["black"], bevel=size * 0.05)
    return asset


def make_animals(collection):
    cow = make_quadruped(collection, "cow", MAT["cow_white"], 1.25, (0.42, 0.38, 0.5))
    for x, z, scale in ((-0.35, -0.2, 0.32), (0.25, 0.18, 0.28), (0.05, 0.65, 0.22)):
        sphere(cow, "cow-spot", (x, 1.25, z), (scale, scale * 0.55, scale * 1.2), MAT["cow_dark"], subdivisions=2)
    for side in (-1, 1):
        cone(cow, "horn", (side * 0.32, 1.7, -1.12), 0.1, 0.01, 0.4, MAT["white"], vertices=8)

    sheep = make_quadruped(collection, "sheep", MAT["sheep"], 0.9, (0.29, 0.3, 0.36))
    sphere(sheep, "dark-face", (0, 1.02, -0.86), (0.25, 0.25, 0.3), MAT["black"], subdivisions=3)

    raccoon = make_quadruped(collection, "raccoon", MAT["raccoon"], 0.48, (0.2, 0.2, 0.24))
    box(raccoon, "face-mask", (0, 0.57, -0.48), (0.34, 0.13, 0.08), MAT["black"], bevel=0.04)
    tail = cylinder(raccoon, "tail", (0, 0.55, 0.62), 0.13, 0.85, MAT["raccoon"], vertices=10, rotation=(math.radians(65), 0, 0))
    for z in (0.38, 0.58, 0.78):
        cylinder(raccoon, "tail-band", (0, 0.55, z), 0.14, 0.1, MAT["black"], vertices=10, rotation=(math.radians(65), 0, 0))

    dino = root(collection, "dinosaur")
    sphere(dino, "trex-body", (0, 3.7, 0.35), (1.45, 1.65, 2.85), MAT["dinosaur"], subdivisions=4)
    sphere(dino, "trex-chest", (0, 4.25, -1.35), (1.2, 1.3, 1.5), MAT["dinosaur"], subdivisions=3)
    sphere(dino, "trex-head", (0, 5.55, -3.05), (1.28, 1.02, 1.58), MAT["dinosaur"], subdivisions=4)
    sphere(dino, "trex-muzzle", (0, 5.25, -4.1), (1.18, 0.55, 0.92), MAT["dinosaur"], subdivisions=3)
    box(dino, "trex-mouth", (0, 5.08, -4.58), (1.72, 0.18, 0.52), MAT["cloth_rust"], bevel=0.09)
    for side in (-1, 1):
        sphere(dino, "trex-eye-white", (side * 0.7, 5.88, -4.02), (0.21, 0.25, 0.16), MAT["white"], subdivisions=3)
        sphere(dino, "trex-eye", (side * 0.76, 5.9, -4.15), (0.08, 0.1, 0.055), MAT["black"], subdivisions=2)
        thigh_name = "left-leg" if side < 0 else "right-leg"
        sphere(dino, f"trex-{'left' if side < 0 else 'right'}-thigh", (side * 0.82, 2.35, 0.45), (0.68, 1.3, 0.82), MAT["dinosaur"], subdivisions=3)
        leg = cylinder(dino, f"dinosaur-{thigh_name}", (side * 0.82, 1.05, -0.05), 0.38, 1.9, MAT["dinosaur"], vertices=28, bevel=0.1)
        leg.rotation_euler = (-math.pi / 2, 0, side * math.radians(3))
        box(dino, "trex-foot", (side * 0.82, 0.2, -0.62), (0.78, 0.34, 1.55), MAT["dinosaur"], bevel=0.16)
        for toe in (-0.22, 0, 0.22):
            cone(dino, "trex-toe", (side * 0.82 + toe, 0.16, -1.42), 0.1, 0.015, 0.4, MAT["black"], vertices=12, rotation=(0, 0, 0))
        beam(dino, "trex-arm", (side * 0.78, 4.55, -2.0), (side * 1.0, 3.92, -2.7), 0.14, MAT["dinosaur"], vertices=18)
    cone(dino, "trex-tail", (0, 3.7, 4.15), 1.12, 0.05, 6.8, MAT["dinosaur"], vertices=32, rotation=(0, 0, 0))
    sphere(dino, "trex-belly", (0, 3.7, -1.2), (0.92, 1.15, 1.5), MAT["mustard"], subdivisions=3)

    dog = make_quadruped(collection, "dog", MAT["animal_tan"], 0.55, (0.24, 0.24, 0.28))
    cone(dog, "tail", (0, 0.76, 0.78), 0.11, 0.035, 0.8, MAT["animal_tan"], vertices=18, rotation=(math.radians(-35), 0, 0))
    deer = make_quadruped(collection, "deer", MAT["animal_tan"], 0.95, (0.3, 0.34, 0.4))
    for side in (-1, 1):
        antler = cylinder(deer, "antler", (side * 0.18, 1.75, -1.0), 0.035, 0.72, MAT["animal_brown"], vertices=14)
        antler.rotation_euler = (-math.pi / 2, 0, side * math.radians(14))
    horse = make_quadruped(collection, "horse", MAT["animal_brown"], 1.18, (0.36, 0.42, 0.5))
    box(horse, "mane", (0, 1.62, -0.72), (0.12, 0.85, 0.75), MAT["black"], bevel=0.1)
    fox = make_quadruped(collection, "fox", MAT["animal_fox"], 0.5, (0.23, 0.23, 0.3))
    cone(fox, "tail", (0, 0.6, 0.78), 0.24, 0.06, 1.25, MAT["animal_fox"], vertices=24, rotation=(math.radians(-35), 0, 0))


def make_car(collection, key, style="sedan", paint_key=None):
    asset = root(collection, key)
    van = style == "van"
    body_depth = {"hatchback": 3.65, "wagon": 4.55, "pickup": 4.8, "van": 4.6}.get(style, 4.1)
    paint = MAT[paint_key or ("mustard" if van else "blue")]
    box(asset, "vehicle-body", (0, 0.66, 0), (1.9, 0.82, body_depth), paint, bevel=0.2)
    if style == "pickup":
        box(asset, "vehicle-cabin", (0, 1.3, -0.95), (1.72, 1.12, 1.85), paint, bevel=0.2)
        window(asset, 0, 1.43, -1.92, 1.38, 0.56)
        for side in (-1, 1):
            box(asset, "pickup-bed-side", (side * 0.82, 1.02, 1.25), (0.18, 0.72, 2.05), paint, bevel=0.1)
        box(asset, "pickup-tailgate", (0, 1.02, 2.32), (1.72, 0.72, 0.18), paint, bevel=0.1)
    elif van:
        box(asset, "vehicle-cabin", (0, 1.45, 0.25), (1.76, 1.4, 3.55), paint, bevel=0.2)
        window(asset, 0, 1.52, -1.58, 1.45, 0.75)
    else:
        cabin_depth = 1.95 if style == "hatchback" else 2.75 if style == "wagon" else 2.15
        box(asset, "vehicle-cabin", (0, 1.27, -0.05), (1.58, 0.9, cabin_depth), paint, bevel=0.2)
        window(asset, 0, 1.38, -cabin_depth / 2 - 0.08, 1.34, 0.52)
        box(asset, "rear-window", (0, 1.38, cabin_depth / 2 + 0.03), (1.34, 0.52, 0.08), MAT["glass"], bevel=0.04)
        box(asset, "hood", (0, 0.99, -1.5), (1.74, 0.3, 1.22), paint, bevel=0.14)
    for axle in (-1.38, 1.38):
        for side in (-1, 1):
            cylinder(asset, "wheel", (side * 0.98, 0.42, axle), 0.4, 0.24, MAT["black"], vertices=36, rotation=(0, math.pi / 2, 0))
            cylinder(asset, "wheel-rim", (side * 1.11, 0.42, axle), 0.22, 0.03, MAT["white"], vertices=36, rotation=(0, math.pi / 2, 0), bevel=0.015)
    for side in (-1, 1):
        side_window_depth = 2.6 if van else 0.9 if style == "pickup" else 1.25 if style == "hatchback" else 2.05 if style == "wagon" else 1.45
        box(asset, "side-window", (side * 0.79, 1.25, -0.15), (0.06, 0.54, side_window_depth), MAT["glass"], bevel=0.035)
        cylinder(asset, "side-mirror", (side * 1.02, 1.2, -1.05), 0.12, 0.12, MAT["navy"], vertices=24, rotation=(0, math.pi / 2, 0))
    box(asset, "front-bumper", (0, 0.46, -body_depth / 2 - 0.08), (1.62, 0.18, 0.16), MAT["metal"], "metal", 0.035)
    box(asset, "rear-bumper", (0, 0.46, body_depth / 2 + 0.08), (1.62, 0.18, 0.16), MAT["metal"], "metal", 0.035)
    for side in (-0.55, 0.55):
        box(asset, "headlight", (side, 0.7, -body_depth / 2 - 0.03), (0.34, 0.2, 0.08), MAT["gold"], bevel=0.03)
        box(asset, "taillight", (side, 0.7, body_depth / 2 + 0.03), (0.34, 0.2, 0.08), MAT["red"], bevel=0.03)
    if style == "taxi":
        box(asset, "taxi-roof-light", (0, 1.84, 0), (0.55, 0.2, 0.28), MAT["white"], bevel=0.08)


def make_person(collection, key, skin, coat, pose=0.0, accessory=None, height=1.0):
    asset = root(collection, key)
    sphere(asset, "torso", (0, 1.25 * height, 0), (0.32, 0.52 * height, 0.25), coat, subdivisions=3)
    sphere(asset, "head", (0, 1.95 * height, 0), (0.22, 0.25, 0.22), skin, subdivisions=3)
    sphere(asset, "hair", (0, 2.12 * height, 0.025), (0.235, 0.12, 0.225), MAT["navy"], subdivisions=3)
    for side in (-1, 1):
        sphere(asset, "eye", (side * 0.082, 1.99 * height, -0.205), (0.026, 0.032, 0.018), MAT["black"], subdivisions=2)
    for side in (-1, 1):
        leg = cylinder(asset, f"{key}-left-leg" if side < 0 else f"{key}-right-leg", (side * 0.14, 0.5 * height, side * pose), 0.09, 0.95 * height, MAT["denim"], vertices=20)
        arm = cylinder(asset, f"{key}-left-arm" if side < 0 else f"{key}-right-arm", (side * 0.38, 1.28 * height, -side * pose), 0.075, 0.85 * height, skin, vertices=20)
        arm.rotation_euler = (-math.pi / 2, 0, side * math.radians(10))
        box(asset, "shoe", (side * 0.14, 0.08, -0.09 + side * pose), (0.2, 0.14, 0.36), MAT["white"], bevel=0.07)
    box(asset, "jacket", (0, 1.35 * height, -0.03), (0.65, 0.78 * height, 0.46), coat, bevel=0.12)
    box(asset, "collar", (0, 1.63 * height, -0.27), (0.26, 0.18, 0.06), MAT["white"], bevel=0.04)
    if accessory == "hat":
        cylinder(asset, "hat-brim", (0, 2.16 * height, 0), 0.3, 0.06, coat, vertices=28)
        sphere(asset, "hat-crown", (0, 2.25 * height, 0.02), (0.22, 0.16, 0.21), coat, subdivisions=3)
    elif accessory == "backpack":
        box(asset, "backpack", (0, 1.38 * height, 0.3), (0.5, 0.68, 0.22), MAT["mustard"], bevel=0.12)
    elif accessory == "bag":
        sphere(asset, "shoulder-bag", (0.42, 0.95 * height, 0.08), (0.24, 0.3, 0.12), MAT["mustard"], subdivisions=3)


def facade_grid(parent, width, height, depth, floors, columns, y0=1.7):
    floor_step = (height - 1.2) / max(1, floors)
    col_step = width / max(1, columns)
    for floor in range(floors):
        for col in range(columns):
            x = (col - (columns - 1) / 2) * col_step
            y = y0 + floor * floor_step
            window(parent, x, y, -depth / 2 - 0.08, min(1.25, col_step * 0.52), min(1.55, floor_step * 0.58))


def make_house(collection, key="house", body_mat=None):
    asset = root(collection, key)
    box(asset, "house-body", (0, 2.6, 0), (8.2, 5.2, 7.0), body_mat or MAT["siding"], bevel=0.08)
    gable_roof(asset, 8.8, 7.6, 5.15)
    door(asset, 0, 1.15, -3.58)
    for x in (-2.4, 2.4):
        for y in (1.7, 3.8):
            window(asset, x, y, -3.57, 1.35, 1.45)
    box(asset, "porch-roof", (0, 2.65, -4.35), (6.2, 0.22, 1.9), MAT["roof"], "roof")
    for x in (-2.7, 2.7):
        cylinder(asset, "porch-post", (x, 1.25, -4.45), 0.09, 2.5, MAT["wood"], "wood", 8)
    for step, (y, z, width) in enumerate(((0.16, -4.35, 3.0), (0.34, -4.05, 2.5), (0.52, -3.78, 2.0))):
        box(asset, f"porch-step-{step}", (0, y, z), (width, 0.28, 0.65), MAT["concrete"], bevel=0.06)
    box(asset, "chimney", (2.55, 5.65, 1.8), (0.75, 2.0, 0.75), MAT["red_brick"], bevel=0.08)


def make_apartment(collection):
    asset = root(collection, "apartment")
    box(asset, "apartment-body", (0, 6.0, 0), (11.0, 12.0, 8.0), MAT["red_brick"], "red_brick", 0.09)
    facade_grid(asset, 11, 12, 8, 4, 4)
    door(asset, 0, 1.25, -4.1, 1.5, 2.4, MAT["glass"])
    box(asset, "cornice", (0, 11.65, -0.02), (11.45, 0.42, 8.45), MAT["concrete"], "concrete")
    for floor in (3.0, 5.8, 8.6):
        for side in (-1, 1):
            box(asset, "balcony", (side * 3.35, floor, -4.55), (2.5, 0.18, 1.0), MAT["metal"], "metal")
            for rail_x in (-0.95, -0.48, 0, 0.48, 0.95):
                box(asset, "balcony-rail", (side * 3.35 + rail_x, floor + 0.48, -4.98), (0.07, 0.9, 0.07), MAT["metal"], bevel=0.025)
            box(asset, "balcony-top-rail", (side * 3.35, floor + 0.92, -4.98), (2.35, 0.08, 0.09), MAT["metal"], bevel=0.025)


def make_townhouses(collection):
    asset = root(collection, "townhouses")
    mats = (MAT["red_brick"], MAT["tan_brick"], MAT["siding"])
    tiles = ("red_brick", "tan_brick", "siding")
    for index in range(3):
        x = (index - 1) * 4.3
        box(asset, "townhouse-body", (x, 4.3, 0), (4.3, 8.6, 7.0), mats[index], tiles[index], 0.06)
        door(asset, x, 1.2, -3.58, 1.0, 2.2)
        for y in (3.2, 5.8):
            window(asset, x, y, -3.57, 1.25, 1.5)
        box(asset, "stoop", (x, 0.35, -4.05), (2.0, 0.7, 1.0), MAT["concrete"], "concrete")
        box(asset, "stoop-step", (x, 0.16, -4.65), (1.55, 0.3, 0.65), MAT["concrete"], bevel=0.05)
        box(asset, "roof-accent", (x, 8.65, -3.15), (3.7, 0.45, 0.35), MAT["white"], bevel=0.06)
    box(asset, "townhouse-roof", (0, 8.72, 0), (13.2, 0.32, 7.3), MAT["roof"], "roof")


def make_store(collection, key, cafe=False):
    asset = root(collection, key)
    box(asset, "store-body", (0, 3.8, 0), (9.4, 7.6, 7.0), MAT["tan_brick" if cafe else "red_brick"], "tan_brick" if cafe else "red_brick", 0.08)
    facade_grid(asset, 9.4, 7.6, 7.0, 2, 3, 4.35)
    box(asset, "storefront-glass", (0, 1.45, -3.58), (6.8, 2.55, 0.12), MAT["glass"], "glass", 0.025)
    door(asset, 3.7, 1.25, -3.59, 1.1, 2.4, MAT["glass"])
    box(asset, "awning", (0, 2.95, -4.05), (7.6, 0.22, 1.25), MAT["green" if not cafe else "cloth_rust"], bevel=0.05, rotation=(math.radians(8), 0, 0))
    for x in (-3.4, -1.7, 0, 1.7, 3.4):
        box(asset, "awning-stripe", (x, 2.94, -4.13), (0.72, 0.06, 1.15), MAT["white"], bevel=0.02, rotation=(math.radians(8), 0, 0))
    box(asset, "parapet", (0, 7.38, 0), (9.7, 0.45, 7.3), MAT["concrete"], "concrete")
    box(asset, "store-sign", (0, 3.65, -3.68), (5.4, 0.58, 0.16), MAT["mustard" if not cafe else "red"], bevel=0.1)
    if cafe:
        for x in (-2.2, 0, 2.2):
            cylinder(asset, "cafe-table", (x, 0.72, -4.8), 0.55, 0.08, MAT["wood"], "wood", 14)
            cylinder(asset, "table-leg", (x, 0.36, -4.8), 0.06, 0.7, MAT["metal"], "metal", 8)
    else:
        for x in (-2.5, -0.8, 0.9, 2.6):
            box(asset, "produce-crate", (x, 0.45, -4.05), (1.1, 0.8, 0.8), MAT["wood"], "wood")


def make_warehouse(collection):
    asset = root(collection, "warehouse")
    box(asset, "warehouse-body", (0, 4.0, 0), (14.0, 8.0, 12.0), MAT["red_brick"], "red_brick", 0.08)
    gable_roof(asset, 14.8, 12.8, 7.9)
    box(asset, "loading-door", (0, 2.2, -6.08), (5.0, 4.4, 0.16), MAT["metal"], "metal", 0.04)
    for x in (-4.8, 4.8):
        window(asset, x, 5.8, -6.08, 1.8, 1.5)


def make_office(collection):
    asset = root(collection, "office")
    box(asset, "office-core", (0, 7.0, 0), (11.5, 14.0, 9.0), MAT["concrete"], "concrete", 0.06)
    for floor in range(5):
        y = 1.5 + floor * 2.55
        box(asset, "glass-band", (0, y, -4.58), (10.2, 1.55, 0.12), MAT["glass"], "glass", 0.02)
        for side in (-1, 1):
            box(asset, "side-glass", (side * 5.83, y, 0), (0.12, 1.55, 7.8), MAT["glass"], "glass", 0.02)
    box(asset, "office-roof", (0, 14.15, 0), (12.0, 0.35, 9.5), MAT["metal"], "metal")


def make_duplex(collection):
    asset = root(collection, "duplex")
    for side, mat in ((-1, MAT["mustard"]), (1, MAT["siding"])):
        box(asset, "duplex-half", (side * 2.25, 3.1, 0), (4.5, 6.2, 7.2), mat, bevel=0.1)
        door(asset, side * 2.25, 1.2, -3.68, 1.05, 2.2)
        for x in (side * 3.25, side * 1.25):
            for y in (3.1, 5.0):
                window(asset, x, y, -3.67, 0.9, 1.15)
    gable_roof(asset, 9.6, 7.8, 6.1)
    box(asset, "shared-porch", (0, 0.48, -4.05), (6.4, 0.34, 1.2), MAT["concrete"], bevel=0.07)


def make_civic_building(collection, key, kind):
    asset = root(collection, key)
    if kind == "church":
        box(asset, "church-nave", (0, 3.8, 0.7), (8.0, 7.6, 12.0), MAT["siding"], bevel=0.1)
        gable_roof(asset, 8.8, 12.8, 7.45)
        box(asset, "church-tower", (0, 6.1, -4.3), (4.2, 12.2, 4.2), MAT["concrete"], bevel=0.1)
        cone(asset, "church-spire", (0, 13.8, -4.3), 2.55, 0.12, 4.0, MAT["roof"], vertices=32)
        door(asset, 0, 1.4, -6.48, 1.6, 2.8)
        for x in (-2.4, 2.4):
            window(asset, x, 4.2, -5.38, 1.15, 2.0)
        return
    width = 16.0 if kind == "school" else 13.5
    depth = 10.0
    height = 7.8 if kind == "school" else 7.0
    body_mat = MAT["tan_brick"] if kind == "school" else MAT["red_brick"]
    box(asset, f"{kind}-body", (0, height / 2, 0), (width, height, depth), body_mat, bevel=0.1)
    box(asset, "civic-cornice", (0, height - 0.25, 0), (width + 0.45, 0.5, depth + 0.45), MAT["white"], bevel=0.06)
    if kind == "fire_station":
        for x in (-3.8, 0, 3.8):
            box(asset, "garage-door", (x, 2.0, -5.08), (3.1, 3.75, 0.16), MAT["red"], bevel=0.08)
            for y in (0.8, 1.65, 2.5, 3.35):
                box(asset, "garage-panel", (x, y, -5.18), (2.72, 0.08, 0.08), MAT["white"], bevel=0.02)
        box(asset, "station-bell-tower", (0, 8.8, 1.8), (3.0, 3.2, 3.0), MAT["red_brick"], bevel=0.08)
        gable_roof(asset, 3.6, 3.6, 10.25)
    else:
        door(asset, 0, 1.35, -5.08, 1.6, 2.6)
        for x in (-6.0, -3.0, 3.0, 6.0):
            for y in (2.0, 5.0):
                window(asset, x, y, -5.08, 1.25, 1.55)
        box(asset, "school-clock", (0, 6.4, -5.2), (1.2, 1.2, 0.14), MAT["white"], bevel=0.5)


def make_barn(collection):
    asset = root(collection, "barn")
    box(asset, "barn-body", (0, 3.8, 0), (11.0, 7.6, 14.0), MAT["red"], bevel=0.08)
    gable_roof(asset, 11.8, 14.8, 7.5)
    box(asset, "barn-door", (0, 2.5, -7.08), (4.6, 5.0, 0.18), MAT["wood"], "wood")
    for side in (-1, 1):
        box(asset, "door-brace", (0, 2.5, -7.2), (0.18, 5.5, 0.18), MAT["white"], bevel=0.02, rotation=(0, 0, side * math.radians(40)))
    window(asset, 0, 6.4, -7.09, 1.5, 1.2)


def make_rural_buildings(collection):
    farmhouse = root(collection, "farmhouse")
    box(farmhouse, "farmhouse-body", (0, 2.8, 0), (9.2, 5.6, 7.4), MAT["mustard"], bevel=0.11)
    gable_roof(farmhouse, 9.9, 8.1, 5.48, MAT["blue"])
    box(farmhouse, "farmhouse-porch", (0, 0.38, -4.45), (8.2, 0.4, 2.1), MAT["wood"], bevel=0.08)
    box(farmhouse, "farmhouse-porch-roof", (0, 3.05, -4.5), (8.5, 0.3, 2.3), MAT["blue"], bevel=0.06)
    for x in (-3.65, 3.65):
        cylinder(farmhouse, "porch-post", (x, 1.62, -4.55), 0.11, 2.55, MAT["white"], vertices=16)
    door(farmhouse, 0, 1.35, -3.78, 1.25, 2.45, MAT["red"])
    for x in (-2.8, 2.8):
        window(farmhouse, x, 2.35, -3.78, 1.3, 1.55)
    box(farmhouse, "chimney", (3.1, 6.65, 1.1), (0.9, 3.0, 0.9), MAT["red_brick"], bevel=0.06)

    stand = root(collection, "produce_stand")
    box(stand, "stand-counter", (0, 0.72, 0), (5.3, 1.25, 2.5), MAT["wood"], bevel=0.1)
    for x in (-2.3, 2.3):
        cylinder(stand, "stand-post", (x, 2.0, 0.55), 0.1, 3.3, MAT["wood"], vertices=16)
    box(stand, "stand-roof", (0, 3.55, 0.2), (5.9, 0.3, 3.3), MAT["red"], bevel=0.12)
    for index, mat in enumerate((MAT["red"], MAT["white"], MAT["red"], MAT["white"], MAT["red"])):
        box(stand, "awning-stripe", ((index - 2) * 1.05, 3.38, -1.48), (1.0, 0.16, 0.32), mat, bevel=0.04)
    for x, mat in ((-1.65, MAT["leaf"]), (-0.55, MAT["red"]), (0.55, MAT["gold"]), (1.65, MAT["leaf_light"])):
        box(stand, "produce-crate", (x, 1.28, -1.0), (0.92, 0.65, 0.75), MAT["wood"], bevel=0.07)
        for offset in (-0.22, 0, 0.22):
            sphere(stand, "produce", (x + offset, 1.65, -1.28), (0.12, 0.12, 0.12), mat, subdivisions=2)

    bridge = root(collection, "covered_bridge")
    box(bridge, "bridge-deck", (0, 0.35, 0), (7.5, 0.55, 12.0), MAT["wood"], bevel=0.09)
    for x in (-3.35, 3.35):
        box(bridge, "bridge-wall", (x, 2.75, 0), (0.45, 5.0, 12.0), MAT["red"], bevel=0.07)
        for z in (-4.3, -1.45, 1.45, 4.3):
            beam(bridge, "bridge-brace", (x, 0.7, z - 1.1), (x, 4.65, z + 1.1), 0.12, MAT["wood"], vertices=16)
    gable_roof(bridge, 8.3, 12.8, 5.15, MAT["blue"])

    windmill = root(collection, "windmill")
    for side in (-1, 1):
        beam(windmill, "windmill-leg", (side * 1.4, 0.1, 0), (side * 0.38, 6.8, 0), 0.16, MAT["wood"], vertices=18)
    for y in (1.8, 3.7, 5.5):
        box(windmill, "windmill-crossbar", (0, y, 0), (2.5 - y * 0.18, 0.18, 0.18), MAT["wood"], bevel=0.04)
    cylinder(windmill, "windmill-hub", (0, 7.05, -0.2), 0.36, 0.42, MAT["metal"], vertices=28, rotation=(0, 0, 0))
    for angle in range(0, 360, 45):
        radians = math.radians(angle)
        beam(windmill, "windmill-blade", (math.cos(radians) * 0.35, 7.05 + math.sin(radians) * 0.35, -0.42), (math.cos(radians) * 2.25, 7.05 + math.sin(radians) * 2.25, -0.42), 0.11, MAT["metal"], vertices=14)
    box(windmill, "windmill-tail", (2.1, 7.05, 0.35), (2.8, 1.2, 0.15), MAT["red"], bevel=0.08)

    tower = root(collection, "water_tower")
    for x in (-1.55, 1.55):
        for z in (-1.55, 1.55):
            beam(tower, "tower-leg", (x, 0.1, z), (x * 0.72, 5.0, z * 0.72), 0.15, MAT["wood"], vertices=16)
    cylinder(tower, "water-tank", (0, 6.75, 0), 2.25, 3.2, MAT["mustard"], vertices=32, bevel=0.1)
    cone(tower, "water-tower-roof", (0, 8.72, 0), 2.45, 0.15, 1.15, MAT["blue"], vertices=32)
    box(tower, "tower-platform", (0, 5.18, 0), (5.1, 0.25, 5.1), MAT["wood"], bevel=0.06)


def make_silo(collection):
    asset = root(collection, "silo")
    cylinder(asset, "silo-body", (0, 5.0, 0), 2.5, 10.0, MAT["concrete"], "concrete", 20)
    cone(asset, "silo-roof", (0, 10.9, 0), 2.65, 0.2, 2.2, MAT["metal"], "metal", 20)
    cylinder(asset, "silo-cap", (0, 12.05, 0), 0.18, 0.45, MAT["metal"], "metal", 10)


def make_street_assets(collection):
    bench = root(collection, "bench")
    box(bench, "seat", (0, 0.65, 0), (2.0, 0.16, 0.55), MAT["wood"], "wood")
    box(bench, "back", (0, 1.1, 0.25), (2.0, 0.72, 0.13), MAT["wood"], "wood")
    for x in (-0.75, 0.75):
        box(bench, "bench-leg", (x, 0.32, 0), (0.1, 0.64, 0.45), MAT["metal"], "metal")
    lamp = root(collection, "streetlamp")
    cylinder(lamp, "lamp-pole", (0, 2.2, 0), 0.08, 4.4, MAT["metal"], "metal", 10)
    box(lamp, "lamp-head", (0, 4.45, -0.22), (0.6, 0.22, 0.75), MAT["metal"], "metal")
    box(lamp, "lamp-glow", (0, 4.34, -0.25), (0.45, 0.05, 0.55), MAT["gold"], bevel=0.02)

    hydrant = root(collection, "fire_hydrant")
    cylinder(hydrant, "hydrant-body", (0, 0.58, 0), 0.24, 0.82, MAT["red"], vertices=32)
    cylinder(hydrant, "hydrant-cap", (0, 1.08, 0), 0.32, 0.16, MAT["red"], vertices=32)
    sphere(hydrant, "hydrant-dome", (0, 1.2, 0), (0.25, 0.2, 0.25), MAT["red"], subdivisions=3)
    for side in (-1, 1):
        cylinder(hydrant, "hydrant-nozzle", (side * 0.34, 0.7, 0), 0.13, 0.28, MAT["gold"], vertices=24, rotation=(0, math.pi / 2, 0))

    mailbox = root(collection, "mailbox")
    cylinder(mailbox, "mailbox-post", (0, 0.75, 0.15), 0.08, 1.5, MAT["wood"], vertices=20)
    box(mailbox, "mailbox-box", (0, 1.48, -0.15), (0.72, 0.6, 1.0), MAT["blue"], bevel=0.18)
    box(mailbox, "mailbox-door", (0, 1.46, -0.67), (0.62, 0.48, 0.08), MAT["navy"], bevel=0.08)

    trash = root(collection, "trash_bin")
    cylinder(trash, "trash-can", (0, 0.62, 0), 0.42, 1.12, MAT["green"], vertices=32)
    cylinder(trash, "trash-rim", (0, 1.2, 0), 0.47, 0.12, MAT["metal"], vertices=32)
    sphere(trash, "trash-lid", (0, 1.34, 0), (0.43, 0.15, 0.43), MAT["green"], subdivisions=3)

    rack = root(collection, "bike_rack")
    for index in range(4):
        x = (index - 1.5) * 0.62
        cylinder(rack, "rack-loop", (x, 0.62, 0), 0.07, 1.25, MAT["metal"], vertices=20)
        sphere(rack, "rack-top", (x, 1.24, 0), (0.2, 0.2, 0.2), MAT["metal"], subdivisions=2)
    box(rack, "rack-base", (0, 0.08, 0), (2.5, 0.16, 0.55), MAT["concrete"], bevel=0.06)

    shelter = root(collection, "bus_shelter")
    box(shelter, "shelter-roof", (0, 2.65, 0), (3.8, 0.24, 1.7), MAT["green"], bevel=0.12)
    box(shelter, "shelter-back", (0, 1.35, 0.72), (3.5, 2.45, 0.1), MAT["glass"], bevel=0.05)
    for x in (-1.72, 1.72):
        cylinder(shelter, "shelter-post", (x, 1.32, 0), 0.07, 2.64, MAT["metal"], vertices=20)
    box(shelter, "shelter-bench", (0, 0.62, 0.35), (2.6, 0.18, 0.5), MAT["wood"], bevel=0.08)

    signal = root(collection, "traffic_light")
    cylinder(signal, "signal-pole", (0, 2.1, 0), 0.1, 4.2, MAT["metal"], vertices=24)
    box(signal, "signal-head", (0, 4.25, 0), (0.58, 1.45, 0.52), MAT["black"], bevel=0.14)
    for y, mat in ((4.68, MAT["red"]), (4.25, MAT["gold"]), (3.82, MAT["leaf"])):
        sphere(signal, "signal-lamp", (0, y, -0.28), (0.17, 0.17, 0.09), mat, subdivisions=3)


def make_rural_assets(collection):
    rocks = root(collection, "rock_cluster")
    for index, (x, y, z, scale) in enumerate(
        ((-0.75, 0.48, 0.1, 0.75), (0, 0.7, 0, 1.0), (0.78, 0.38, 0.18, 0.58), (0.3, 0.3, -0.65, 0.46))
    ):
        sphere(rocks, f"rounded-rock-{index}", (x, y, z), (scale, scale * 0.78, scale * 0.9), MAT["metal"], subdivisions=3)

    hay = root(collection, "hay_bales")
    for index, (x, y, z, radius) in enumerate(((-0.72, 0.58, 0, 0.58), (0.72, 0.58, 0, 0.58), (0, 1.55, 0, 0.58))):
        cylinder(hay, f"hay-bale-{index}", (x, y, z), radius, 1.18, MAT["gold"], vertices=36, rotation=(0, math.pi / 2, 0), bevel=0.08)
        for band_x in (-0.36, 0.36):
            cylinder(hay, "hay-band", (x + band_x, y, z), radius + 0.025, 0.055, MAT["animal_brown"], vertices=36, rotation=(0, math.pi / 2, 0), bevel=0.01)

    flowers = root(collection, "flower_patch")
    flower_colors = (MAT["red"], MAT["gold"], MAT["leaf_pink"], MAT["white"])
    for index in range(12):
        angle = index * 2.399
        radius = 0.18 + (index % 4) * 0.17
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        height = 0.42 + (index % 3) * 0.09
        cylinder(flowers, "flower-stem", (x, height / 2, z), 0.025, height, MAT["leaf"], vertices=12, bevel=0.01)
        sphere(flowers, "flower-head", (x, height + 0.04, z), (0.12, 0.09, 0.12), flower_colors[index % len(flower_colors)], subdivisions=2)

    reeds = root(collection, "reed_clump")
    for index in range(11):
        angle = index * 2.17
        radius = 0.12 + (index % 4) * 0.09
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        height = 0.7 + (index % 5) * 0.12
        cylinder(reeds, "reed-stem", (x, height / 2, z), 0.025, height, MAT["leaf"], vertices=12, bevel=0.01)
        if index % 2 == 0:
            cylinder(reeds, "cattail", (x, height + 0.08, z), 0.065, 0.24, MAT["animal_brown"], vertices=18, bevel=0.03)

    bush = root(collection, "berry_bush")
    for index, (x, y, z, size) in enumerate(((-0.45, 0.48, 0, 0.55), (0.42, 0.52, 0.12, 0.6), (0, 0.72, -0.16, 0.68))):
        sphere(bush, f"bush-crown-{index}", (x, y, z), (size, size * 0.9, size), MAT["leaf"], subdivisions=3)
    for index in range(14):
        angle = index * 2.05
        sphere(bush, "berry", (math.cos(angle) * 0.72, 0.55 + (index % 3) * 0.18, math.sin(angle) * 0.38 - 0.4), (0.065, 0.065, 0.065), MAT["red"], subdivisions=2)

    log = root(collection, "fallen_log")
    cylinder(log, "fallen-trunk", (0, 0.42, 0), 0.38, 2.8, MAT["bark"], vertices=32, rotation=(0, math.pi / 2, 0), bevel=0.08)
    for side in (-1, 1):
        cylinder(log, "cut-end", (side * 1.42, 0.42, 0), 0.31, 0.04, MAT["wood"], vertices=32, rotation=(0, math.pi / 2, 0), bevel=0.01)
    box(log, "log-branch", (0.55, 0.72, 0.25), (0.18, 0.95, 0.18), MAT["bark"], bevel=0.07, rotation=(0, 0, math.radians(-38)))

    stump = root(collection, "tree_stump")
    cylinder(stump, "stump-body", (0, 0.48, 0), 0.48, 0.96, MAT["bark"], vertices=32, bevel=0.08)
    cylinder(stump, "stump-cut", (0, 0.98, 0), 0.42, 0.05, MAT["wood"], vertices=32, bevel=0.015)
    for angle in range(0, 360, 72):
        radians = math.radians(angle)
        box(stump, "stump-root", (math.cos(radians) * 0.5, 0.14, math.sin(radians) * 0.5), (0.25, 0.25, 0.9), MAT["bark"], bevel=0.09, rotation=(0, -radians, 0))

    gate = root(collection, "farm_gate")
    for x in (-2.55, 2.55):
        box(gate, "gate-post", (x, 1.2, 0), (0.42, 2.4, 0.42), MAT["wood"], bevel=0.1)
        cone(gate, "gate-post-cap", (x, 2.55, 0), 0.3, 0.06, 0.42, MAT["wood"], vertices=12)
    for y in (0.42, 0.78, 1.14, 1.5, 1.86):
        box(gate, "gate-rail", (-0.12, y, -0.02), (4.55, 0.18, 0.2), MAT["wood"], bevel=0.055)
    box(gate, "gate-brace", (-0.12, 1.14, -0.14), (0.2, 4.85, 0.2), MAT["wood"], bevel=0.05, rotation=(0, 0, math.radians(-65)))
    for y in (0.58, 1.65):
        box(gate, "gate-hinge", (-2.31, y, -0.2), (0.42, 0.18, 0.16), MAT["black"], bevel=0.04)
    box(gate, "gate-latch", (2.18, 1.18, -0.2), (0.55, 0.14, 0.14), MAT["black"], bevel=0.035)

    picnic = root(collection, "picnic_table")
    box(picnic, "table-top", (0, 1.05, 0), (2.8, 0.18, 1.05), MAT["wood"], bevel=0.08)
    for side in (-1, 1):
        box(picnic, "bench-seat", (0, 0.62, side * 0.92), (2.8, 0.16, 0.4), MAT["wood"], bevel=0.07)
        for x in (-0.9, 0.9):
            box(picnic, "table-leg", (x, 0.52, side * 0.35), (0.18, 1.05, 0.18), MAT["wood"], bevel=0.05, rotation=(0, 0, side * math.radians(18)))

    sign = root(collection, "trail_sign")
    cylinder(sign, "sign-post", (0, 1.2, 0), 0.11, 2.4, MAT["wood"], vertices=20)
    box(sign, "sign-arrow-a", (0.4, 1.9, 0), (1.25, 0.38, 0.16), MAT["mustard"], bevel=0.08)
    box(sign, "sign-arrow-b", (-0.35, 1.42, 0), (1.15, 0.34, 0.16), MAT["green"], bevel=0.08)

    corn = root(collection, "crop_corn")
    for index in range(10):
        x = (index % 5 - 2) * 0.48
        z = (index // 5 - 0.5) * 0.62
        height = 1.25 + (index % 3) * 0.12
        cylinder(corn, "corn-stalk", (x, height / 2, z), 0.035, height, MAT["leaf"], vertices=12, bevel=0.012)
        box(corn, "corn-leaf", (x + 0.1, height * 0.56, z), (0.38, 0.06, 0.13), MAT["leaf_light"], bevel=0.025, rotation=(0, 0, math.radians(28)))
        sphere(corn, "corn-cob", (x - 0.08, height * 0.68, z - 0.05), (0.08, 0.23, 0.08), MAT["gold"], subdivisions=2)

    wheat = root(collection, "crop_wheat")
    for index in range(18):
        angle = index * 2.18
        radius = 0.15 + (index % 6) * 0.13
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius * 0.6
        height = 0.85 + (index % 4) * 0.08
        cylinder(wheat, "wheat-stem", (x, height / 2, z), 0.018, height, MAT["gold"], vertices=10, bevel=0.008)
        cone(wheat, "wheat-head", (x, height + 0.12, z), 0.07, 0.025, 0.28, MAT["gold"], vertices=14)

    utility = root(collection, "utility_pole")
    cylinder(utility, "utility-post", (0, 3.5, 0), 0.14, 7.0, MAT["bark"], vertices=24)
    box(utility, "crossbar", (0, 6.45, 0), (3.0, 0.18, 0.2), MAT["wood"], bevel=0.05)
    for x in (-1.25, 0, 1.25):
        cylinder(utility, "insulator", (x, 6.72, 0), 0.08, 0.35, MAT["white"], vertices=18)
    for side in (-1, 1):
        cylinder(utility, "transformer", (side * 0.42, 5.1, 0), 0.24, 0.72, MAT["metal"], vertices=28)


def make_aircraft(collection):
    plane = root(collection, "plane")
    sphere(plane, "fuselage", (0, 0, 0), (0.62, 0.62, 3.1), MAT["white"], subdivisions=3)
    box(plane, "wings", (0, 0, -0.2), (10.0, 0.16, 1.4), MAT["metal"], "metal")
    box(plane, "tail", (0, 0.3, 2.55), (3.8, 0.14, 0.8), MAT["metal"], "metal")
    box(plane, "fin", (0, 0.7, 2.7), (0.15, 1.4, 1.1), MAT["blue"], bevel=0.04)
    heli = root(collection, "helicopter")
    sphere(heli, "cabin", (0, 0.2, -0.9), (1.2, 0.9, 1.45), MAT["blue"], subdivisions=3)
    box(heli, "tail-boom", (0, 0.25, 2.1), (0.34, 0.34, 5.0), MAT["metal"], "metal")
    box(heli, "rotor", (0, 1.35, -0.55), (8.5, 0.08, 0.18), MAT["black"], bevel=0.02)
    box(heli, "tail-rotor", (0.05, 0.35, 4.55), (0.12, 2.0, 0.12), MAT["black"], bevel=0.02)


def consolidate_asset(asset):
    animated_names = ("left-leg", "right-leg", "left-arm", "right-arm", "rotor", "tail-rotor")
    meshes = [child for child in asset.children_recursive if child.type == "MESH"]
    static_meshes = [mesh for mesh in meshes if not any(name in mesh.name for name in animated_names)]
    material_groups = {}
    for mesh in static_meshes:
        material_name = mesh.data.materials[0].name if mesh.data.materials else "unmaterialed"
        material_groups.setdefault(material_name, []).append(mesh)
    for material_name, group in material_groups.items():
        if len(group) < 2:
            group[0].name = f"{asset['asset_key']}-{material_name}"
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for mesh in group:
            mesh.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"{asset['asset_key']}-{material_name}"
        joined.parent = asset


def build_library():
    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION_NAME)
        bpy.context.scene.collection.children.link(collection)
    else:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)

    make_tree(collection, "tree_oak", broad=True)
    make_tree(collection, "tree_maple")
    make_tree(collection, "tree_pine", pine=True)
    make_tree(collection, "tree_birch")
    make_tree(collection, "tree_flowering", broad=True)
    make_fence(collection)
    make_animals(collection)
    make_car(collection, "car_sedan")
    make_car(collection, "car_van", style="van", paint_key="white")
    make_car(collection, "car_hatchback", style="hatchback", paint_key="green")
    make_car(collection, "car_wagon", style="wagon", paint_key="red")
    make_car(collection, "car_pickup", style="pickup", paint_key="navy")
    make_car(collection, "car_taxi", style="taxi", paint_key="mustard")
    make_person(collection, "person_a", MAT["skin_a"], MAT["cloth_green"], 0.04)
    make_person(collection, "person_b", MAT["skin_b"], MAT["cloth_rust"], -0.03)
    make_person(collection, "person_c", MAT["skin_b"], MAT["denim"], 0.02)
    make_person(collection, "person_d", MAT["skin_a"], MAT["mustard"], -0.02, "hat", 0.94)
    make_person(collection, "person_e", MAT["skin_b"], MAT["navy"], 0.05, "backpack", 1.05)
    make_person(collection, "person_f", MAT["skin_a"], MAT["green"], 0.01, "bag", 0.9)
    make_house(collection)
    make_house(collection, "cottage", MAT["mustard"])
    make_duplex(collection)
    make_apartment(collection)
    make_townhouses(collection)
    make_store(collection, "bodega")
    make_store(collection, "cafe", cafe=True)
    make_store(collection, "bakery", cafe=True)
    make_store(collection, "bookstore")
    make_warehouse(collection)
    make_office(collection)
    make_civic_building(collection, "school", "school")
    make_civic_building(collection, "fire_station", "fire_station")
    make_civic_building(collection, "church", "church")
    make_barn(collection)
    make_silo(collection)
    make_rural_buildings(collection)
    make_street_assets(collection)
    make_rural_assets(collection)
    make_aircraft(collection)

    roots = [obj for obj in collection.objects if obj.parent is None]
    for asset in roots:
        consolidate_asset(asset)

    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    os.makedirs(os.path.dirname(BLEND_PATH), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.select_set(True)
    roots = [obj for obj in collection.objects if obj.parent is None]
    if roots:
        bpy.context.view_layer.objects.active = roots[0]
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_extras=True,
        export_yup=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    return {
        "collection": COLLECTION_NAME,
        "assets": [obj["asset_key"] for obj in roots],
        "glb_path": GLB_PATH,
        "blend_path": BLEND_PATH,
        "object_count": len(collection.all_objects),
    }


result = build_library()
