import { type AnimationClip, type SkinnedMesh } from 'three'
import { IncompatibleSkeletonError, LoadError, NoAnimationsError } from './AnimationImportErrors.ts'
import { ModalDialog } from '../../ModalDialog.ts'

export default class CustomAnimationValidation {
  static readonly STANDARD_HUMAN_BONES = [
    'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'head_leaf',
    'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
    'thumb_01_l', 'thumb_02_l', 'thumb_03_l', 'thumb_04_leaf_l',
    'index_01_l', 'index_02_l', 'index_03_l', 'index_04_leaf_l',
    'middle_01_l', 'middle_02_l', 'middle_03_l', 'middle_04_leaf_l',
    'ring_01_l', 'ring_02_l', 'ring_03_l', 'ring_04_leaf_l',
    'pinky_01_l', 'pinky_02_l', 'pinky_03_l', 'pinky_04_leaf_l',
    'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
    'thumb_01_r', 'thumb_02_r', 'thumb_03_r', 'thumb_04_leaf_r',
    'index_01_r', 'index_02_r', 'index_03_r', 'index_04_leaf_r',
    'middle_01_r', 'middle_02_r', 'middle_03_r', 'middle_04_leaf_r',
    'ring_01_r', 'ring_02_r', 'ring_03_r', 'ring_04_leaf_r',
    'pinky_01_r', 'pinky_02_r', 'pinky_03_r', 'pinky_04_leaf_r',
    'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'ball_leaf_l',
    'thigh_r', 'calf_r', 'foot_r', 'ball_r', 'ball_leaf_r'
  ]

  /**
   * Validates that animation bones are compatible with target skeleton
   * @throws {IncompatibleSkeletonError} If bones don't match
   * @throws {NoAnimationsError} If no recognizable bone tracks found
   */
  static validate_animation_bones_match (
    animation_clips: AnimationClip[],
    skinned_meshes: SkinnedMesh[] = []
  ): void {
    // Get target bone names from skeleton or standard fallback
    const target_bone_names = new Set<string>()
    if (skinned_meshes.length > 0) {
      skinned_meshes.forEach((skinned_mesh) => {
        skinned_mesh.skeleton.bones.forEach((bone) => {
          target_bone_names.add(bone.name.toLowerCase())
        })
      })
    } else {
      CustomAnimationValidation.STANDARD_HUMAN_BONES.forEach(b => target_bone_names.add(b.toLowerCase()))
    }

    const animation_bone_map = CustomAnimationValidation.get_animation_bones_by_clip(animation_clips)
    const animation_bone_names = new Set(animation_bone_map.keys())

    if (animation_bone_names.size === 0) {
      throw new NoAnimationsError('We couldn\'t find any animation tracks in this file.')
    }

    // Check bone name mismatch
    const missing_from_animation = Array.from(target_bone_names).filter(bone => !animation_bone_names.has(bone)).sort()
    const extra_in_animation = Array.from(animation_bone_names).filter(bone => !target_bone_names.has(bone)).sort()

    if (missing_from_animation.length > 0 || extra_in_animation.length > 0) {
      const details = CustomAnimationValidation.format_bone_mismatch_details(
        missing_from_animation,
        extra_in_animation,
        animation_bone_map
      )
      throw new IncompatibleSkeletonError('Bone names don\'t match the Mesh2Motion rig:\n' + details)
    }
  }

  /**
   * Gets all bone names referenced in animation clips
   */
  static get_animation_bone_names (animation_clips: AnimationClip[]): Set<string> {
    const bone_names = new Set<string>()
    animation_clips.forEach((clip) => {
      clip.tracks.forEach((track) => {
        const bone_name = CustomAnimationValidation.extract_bone_name_from_track(track.name)
        if (bone_name !== null) {
          bone_names.add(bone_name)
        }
      })
    })
    return bone_names
  }

  /**
   * Gets bone names mapped to the animation clips they appear in
   */
  static get_animation_bones_by_clip (animation_clips: AnimationClip[]): Map<string, Set<string>> {
    const bone_to_clips = new Map<string, Set<string>>()
    animation_clips.forEach((clip) => {
      clip.tracks.forEach((track) => {
        const bone_name = CustomAnimationValidation.extract_bone_name_from_track(track.name)
        if (bone_name !== null) {
          if (!bone_to_clips.has(bone_name)) {
            bone_to_clips.set(bone_name, new Set())
          }
          bone_to_clips.get(bone_name)!.add(clip.name)
        }
      })
    })
    return bone_to_clips
  }

  /**
   * Extracts bone name from animation track name
   */
  static extract_bone_name_from_track (track_name: string): string | null {
    const bones_match = track_name.match(/\.bones\[([^\]]+)\]\.(?:quaternion|position|scale)$/)
    if (bones_match !== null) {
      return bones_match[1].toLowerCase()
    }

    const simple_match = track_name.match(/^([^.]+)\.(?:quaternion|position|scale)$/)
    if (simple_match !== null) {
      return simple_match[1].toLowerCase()
    }

    return null
  }

  /**
   * Formats bone mismatch details in a side-by-side comparison
   */
  static format_bone_mismatch_details (
    missing_from_animation: string[],
    extra_in_animation: string[],
    animation_bone_map: Map<string, Set<string>>
  ): string {
    let details = ''

    if (missing_from_animation.length > 0) {
      details += 'Missing from animation (in Mesh2Motion but not animation):\n'
      details += missing_from_animation.join(', ')
    }

    if (extra_in_animation.length > 0) {
      if (details.length > 0) details += '\n\n'
      details += 'Extra in animation (in animation but not in Mesh2Motion):\n'
      extra_in_animation.forEach((bone) => {
        const clips = animation_bone_map.get(bone)
        const clip_names = clips ? Array.from(clips).join(', ') : 'unknown'
        details += '\n  • ' + bone + ' (in: ' + clip_names + ')'
      })
    }

    return details
  }

  /***
   * Shows different error messages when importing custom animations based on the type of error encountered
   */
  static handle_import_error (error: unknown): { success: boolean, clipCount: number } {
    const error_title = 'Error Importing Animation(s)'
    if (error instanceof NoAnimationsError) {
      new ModalDialog(error_title, 'No animations found in that glb file').show()
      return { success: false, clipCount: 0 }
    }

    // skeleton validation errors
    if (error instanceof IncompatibleSkeletonError) {
      new ModalDialog(error_title, error.message).show()
      return { success: false, clipCount: 0 }
    }

    if (error instanceof LoadError) {
      new ModalDialog(error_title, 'failed to load the animation file').show()
      return { success: false, clipCount: 0 }
    }

    // Unknown error
    new ModalDialog(error_title, 'failed to import animations from the glb file for an unknown reason').show()
    return { success: false, clipCount: 0 }
  }
}
