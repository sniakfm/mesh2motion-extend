"""
Mixamo to Mesh2Motion GLB Converter
Maps Mixamo rig bones to standard Mesh2Motion Human rig bones and injects
the missing root bone & animation tracks.
"""

import sys
import os
import re
import glob
import struct
import json
import shutil

# Canonical mapping from normalized Mixamo bone names to Mesh2Motion bone names
NORMALIZED_MAP = {
    # Pelvis & Spine
    "hips": "pelvis",
    "pelvis": "pelvis",
    "spine": "spine_01",
    "spine1": "spine_02",
    "spine2": "spine_03",
    "neck": "neck_01",
    "neck1": "neck_01",
    "head": "head",
    "headtopend": "head_leaf",
    "headend": "head_leaf",
    
    # Left Arm
    "leftshoulder": "clavicle_l",
    "leftarm": "upperarm_l",
    "leftforearm": "lowerarm_l",
    "lefthand": "hand_l",
    
    # Left Fingers
    "lefthandthumb1": "thumb_01_l",
    "lefthandthumb2": "thumb_02_l",
    "lefthandthumb3": "thumb_03_l",
    "lefthandthumb4": "thumb_04_leaf_l",
    "lefthandindex1": "index_01_l",
    "lefthandindex2": "index_02_l",
    "lefthandindex3": "index_03_l",
    "lefthandindex4": "index_04_leaf_l",
    "lefthandmiddle1": "middle_01_l",
    "lefthandmiddle2": "middle_02_l",
    "lefthandmiddle3": "middle_03_l",
    "lefthandmiddle4": "middle_04_leaf_l",
    "lefthandring1": "ring_01_l",
    "lefthandring2": "ring_02_l",
    "lefthandring3": "ring_03_l",
    "lefthandring4": "ring_04_leaf_l",
    "lefthandpinky1": "pinky_01_l",
    "lefthandpinky2": "pinky_02_l",
    "lefthandpinky3": "pinky_03_l",
    "lefthandpinky4": "pinky_04_leaf_l",
    
    # Right Arm
    "rightshoulder": "clavicle_r",
    "rightarm": "upperarm_r",
    "rightforearm": "lowerarm_r",
    "righthand": "hand_r",
    
    # Right Fingers
    "righthandthumb1": "thumb_01_r",
    "righthandthumb2": "thumb_02_r",
    "righthandthumb3": "thumb_03_r",
    "righthandthumb4": "thumb_04_leaf_r",
    "righthandindex1": "index_01_r",
    "righthandindex2": "index_02_r",
    "righthandindex3": "index_03_r",
    "righthandindex4": "index_04_leaf_r",
    "righthandmiddle1": "middle_01_r",
    "righthandmiddle2": "middle_02_r",
    "righthandmiddle3": "middle_03_r",
    "righthandmiddle4": "middle_04_leaf_r",
    "righthandring1": "ring_01_r",
    "righthandring2": "ring_02_r",
    "righthandring3": "ring_03_r",
    "righthandring4": "ring_04_leaf_r",
    "righthandpinky1": "pinky_01_r",
    "righthandpinky2": "pinky_02_r",
    "righthandpinky3": "pinky_03_r",
    "righthandpinky4": "pinky_04_leaf_r",
    
    # Left Leg
    "leftupleg": "thigh_l",
    "leftleg": "calf_l",
    "leftfoot": "foot_l",
    "lefttoebase": "ball_l",
    "lefttoeend": "ball_leaf_l",
    
    # Right Leg
    "rightupleg": "thigh_r",
    "rightleg": "calf_r",
    "rightfoot": "foot_r",
    "righttoebase": "ball_r",
    "righttoeend": "ball_leaf_r",
}

def normalize_bone_name(raw_name: str) -> str:
    s = raw_name.strip()
    for prefix in ["mixamorig:", "mixamorig_", "mixamorig"]:
        if s.lower().startswith(prefix):
            s = s[len(prefix):]
            break
    key = re.sub(r'[^a-zA-Z0-9]', '', s).lower()
    return NORMALIZED_MAP.get(key, raw_name)

def convert_mixamo_glb(input_path: str, output_path: str) -> bool:
    print(f"\n[Processing] {os.path.basename(input_path)} -> {os.path.basename(output_path)}")
    
    if not os.path.exists(input_path):
        print(f"  [ERROR] File not found: {input_path}")
        return False

    with open(input_path, "rb") as f:
        data = f.read()

    if len(data) < 12:
        print("  [ERROR] File too small to be a valid GLB.")
        return False

    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        print(f"  [ERROR] Not a GLB file (Magic: {magic})")
        return False

    offset = 12
    chunk0_len, chunk0_type = struct.unpack_from("<I4s", data, offset)
    offset += 8
    if chunk0_type != b"JSON":
        print("  [ERROR] Chunk 0 is not JSON.")
        return False

    json_str = data[offset:offset+chunk0_len].decode("utf-8")
    offset += chunk0_len
    gltf = json.loads(json_str)

    bin_data = bytearray()
    if offset < total_length:
        chunk1_len, chunk1_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        if chunk1_type == b"BIN\x00":
            bin_data = bytearray(data[offset:offset+chunk1_len])

    nodes = gltf.get("nodes", [])
    pelvis_idx = None
    renamed_count = 0

    # Step 1: Rename nodes
    for idx, node in enumerate(nodes):
        old_name = node.get("name", "")
        new_name = normalize_bone_name(old_name)
        if new_name != old_name:
            node["name"] = new_name
            renamed_count += 1
        if new_name.lower() == "pelvis":
            pelvis_idx = idx

    print(f"  - Renamed {renamed_count} bone node(s) to Mesh2Motion naming convention.")

    if pelvis_idx is None:
        print("  [WARNING] 'pelvis' (mixamorig:Hips) bone not found. Rig may not be a standard Mixamo skeleton.")
    
    # Step 2: Ensure 'root' bone exists
    root_idx = None
    for idx, node in enumerate(nodes):
        if node.get("name", "").lower() == "root":
            root_idx = idx
            break

    # Determine animation duration from existing clips
    anim_duration = 1.0
    if "animations" in gltf and len(gltf["animations"]) > 0:
        for anim in gltf["animations"]:
            for sampler in anim.get("samplers", []):
                input_acc_idx = sampler.get("input")
                if input_acc_idx is not None and input_acc_idx < len(gltf.get("accessors", [])):
                    acc = gltf["accessors"][input_acc_idx]
                    if "max" in acc and len(acc["max"]) > 0:
                        anim_duration = max(anim_duration, float(acc["max"][0]))

    if root_idx is None and pelvis_idx is not None:
        root_node = {
            "name": "root",
            "translation": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0, 1.0],
            "scale": [1.0, 1.0, 1.0],
            "children": [pelvis_idx]
        }
        nodes.append(root_node)
        root_idx = len(nodes) - 1
        print(f"  - Injected 'root' bone at node index {root_idx} (parenting 'pelvis').")

        # Reparent in scenes
        if "scenes" in gltf:
            for sc in gltf["scenes"]:
                scene_nodes = sc.get("nodes", [])
                if pelvis_idx in scene_nodes:
                    scene_nodes.remove(pelvis_idx)
                    if root_idx not in scene_nodes:
                        scene_nodes.append(root_idx)

        # Reparent in skins
        if "skins" in gltf:
            for sk in gltf["skins"]:
                if sk.get("skeleton") == pelvis_idx:
                    sk["skeleton"] = root_idx

    # Step 3: Inject root rotation animation track
    if root_idx is not None and "animations" in gltf and len(gltf["animations"]) > 0:
        # Align bin_data to 4-byte boundary
        pad = (4 - (len(bin_data) % 4)) % 4
        bin_data.extend(b"\x00" * pad)

        # Time accessor data (2 keyframes: 0.0s and anim_duration)
        time_offset = len(bin_data)
        time_bytes = struct.pack("<ff", 0.0, anim_duration)
        bin_data.extend(time_bytes)

        # Align to 4-byte boundary
        pad = (4 - (len(bin_data) % 4)) % 4
        bin_data.extend(b"\x00" * pad)

        # Rotation accessor data (identity quaternion [0, 0, 0, 1] for each keyframe)
        rot_offset = len(bin_data)
        rot_bytes = struct.pack("<ffffffff", 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)
        bin_data.extend(rot_bytes)

        # Add bufferViews
        time_bv_idx = len(gltf.get("bufferViews", []))
        gltf.setdefault("bufferViews", []).append({
            "buffer": 0,
            "byteOffset": time_offset,
            "byteLength": len(time_bytes)
        })

        rot_bv_idx = len(gltf.get("bufferViews", []))
        gltf.setdefault("bufferViews", []).append({
            "buffer": 0,
            "byteOffset": rot_offset,
            "byteLength": len(rot_bytes)
        })

        # Add accessors
        time_acc_idx = len(gltf.get("accessors", []))
        gltf.setdefault("accessors", []).append({
            "bufferView": time_bv_idx,
            "byteOffset": 0,
            "componentType": 5126, # FLOAT
            "count": 2,
            "type": "SCALAR",
            "min": [0.0],
            "max": [anim_duration]
        })

        rot_acc_idx = len(gltf.get("accessors", []))
        gltf.setdefault("accessors", []).append({
            "bufferView": rot_bv_idx,
            "byteOffset": 0,
            "componentType": 5126, # FLOAT
            "count": 2,
            "type": "VEC4"
        })

        # Update buffer size
        if "buffers" in gltf and len(gltf["buffers"]) > 0:
            gltf["buffers"][0]["byteLength"] = len(bin_data)

        # Append channel to each animation
        for anim in gltf["animations"]:
            has_root = False
            for ch in anim.get("channels", []):
                if ch["target"].get("node") == root_idx and ch["target"].get("path") in ("rotation", "quaternion"):
                    has_root = True
                    break
            if not has_root:
                new_sampler_idx = len(anim.get("samplers", []))
                anim.setdefault("samplers", []).append({
                    "input": time_acc_idx,
                    "output": rot_acc_idx,
                    "interpolation": "LINEAR"
                })
                anim.setdefault("channels", []).append({
                    "sampler": new_sampler_idx,
                    "target": {
                        "node": root_idx,
                        "path": "rotation"
                    }
                })
                print(f"  - Injected 'root' rotation track into clip '{anim.get('name', 'unnamed')}'.")

    # Final Step: Serialize GLB
    pad = (4 - (len(bin_data) % 4)) % 4
    bin_data.extend(b"\x00" * pad)

    json_bytes = json.dumps(gltf, separators=(',', ':')).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b" " * json_pad

    total_len = 12 + (8 + len(json_bytes)) + (8 + len(bin_data))

    with open(output_path, "wb") as f:
        # GLB Header
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        # JSON Chunk
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        # BIN Chunk
        f.write(struct.pack("<I4s", len(bin_data), b"BIN\x00"))
        f.write(bin_data)

    print(f"  [SUCCESS] Converted file created: {output_path}")

    # Copy to library directories if available
    script_dir = os.path.dirname(os.path.abspath(__file__))
    lib_targets = [
        os.path.join(script_dir, "Source", "mesh2motion-app-main", "static", "animations"),
        os.path.join(script_dir, "Source", "mesh2motion-app-main", "dist", "animations")
    ]
    for lib_dir in lib_targets:
        if os.path.exists(os.path.dirname(lib_dir)):
            os.makedirs(lib_dir, exist_ok=True)
            target_file = os.path.join(lib_dir, os.path.basename(output_path))
            shutil.copy2(output_path, target_file)
            print(f"  [COPIED] Copied to animation library: {target_file}")

    return True

def main():
    print("=" * 60)
    print("  Mixamo -> Mesh2Motion Rig & Animation Converter")
    print("=" * 60)

    files_to_process = []

    if len(sys.argv) > 1:
        # Files provided via command line / drag & drop
        for arg in sys.argv[1:]:
            for matched in glob.glob(arg):
                if matched.lower().endswith(".glb"):
                    files_to_process.append(matched)
    else:
        # Look for GLB files in current working directory
        current_dir = os.getcwd()
        for f in os.listdir(current_dir):
            if f.lower().endswith(".glb") and not f.lower().endswith("_m2m_animation.glb") and not f.lower().endswith("_converted_test.glb"):
                files_to_process.append(os.path.join(current_dir, f))

    if not files_to_process:
        print("\nNo .glb files found to convert.")
        print("Usage:")
        print("  1. Drag and drop any .glb file onto convert_mixamo_to_mesh2motion.bat")
        print("  2. Or run: convert_mixamo_to_mesh2motion.bat <model.glb>")
        print("  3. Or place .glb files in this folder and run the bat file.")
        return

    success_count = 0
    for input_file in files_to_process:
        base, ext = os.path.splitext(input_file)
        output_file = f"{base}_m2m_animation{ext}"
        if convert_mixamo_glb(input_file, output_file):
            success_count += 1

    print("\n" + "=" * 60)
    print(f"Conversion finished: {success_count}/{len(files_to_process)} file(s) converted successfully.")
    print("=" * 60)

if __name__ == "__main__":
    main()
