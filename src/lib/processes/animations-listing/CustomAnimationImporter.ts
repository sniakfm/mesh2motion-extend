import { UI } from '../../UI.ts'
import { ModalDialog } from '../../ModalDialog.ts'
import { CustomAnimationStorage } from './CustomAnimationStorage.ts'
import { type AnimationClip, type SkinnedMesh } from 'three'
import { type AnimationLoader } from './AnimationLoader.ts'
import CustomAnimationValidation from './CustomAnimationValidation.ts'
import { type AnimationClipMetadata, type TransformedAnimationClipPair } from './interfaces/TransformedAnimationClipPair.ts'

/**
 * Handles the importing of custom animations from GLB files.
 * This class encapsulates the UI and logic for the import process.
 */
export class CustomAnimationImporter extends EventTarget {
  private readonly ui: UI
  private readonly animation_loader: AnimationLoader
  private skinned_meshes_to_animate: SkinnedMesh[] = []
  private skeleton_scale: number = 1.0
  private import_context_provider: (() => { skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number }) | null = null
  private enabled: boolean = true
  private has_added_event_listeners: boolean = false

  constructor (animation_loader: AnimationLoader) {
    super()
    this.ui = UI.getInstance()
    this.animation_loader = animation_loader
    this.add_event_listeners()
  }

  public set_import_context (skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number): void {
    this.skinned_meshes_to_animate = skinned_meshes_to_animate
    this.skeleton_scale = skeleton_scale
  }

  public set_import_context_provider (provider: () => { skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number }): void {
    this.import_context_provider = provider
  }

  public set_enabled (enabled: boolean): void {
    this.enabled = enabled
    if (this.ui.dom_import_animations_button != null) {
      this.ui.dom_import_animations_button.disabled = !enabled
    }
  }

  public is_enabled (): boolean {
    return this.enabled
  }

  private add_event_listeners (): void {
    if (this.has_added_event_listeners) {
      return
    }

    this.ui.dom_import_animations_button?.addEventListener('click', () => {
      if (!this.is_enabled()) {
        return
      }
      this.sync_import_context_from_provider()
      this.ui.dom_import_animations_input?.click()
    })

    this.ui.dom_import_animations_input?.addEventListener('change', (event) => {
      void this.handle_import_animations_input_change(event)
    })

    this.has_added_event_listeners = true
  }

  private async handle_import_animations_input_change (event: Event): Promise<void> {
    if (!this.is_enabled()) {
      return
    }

    this.sync_import_context_from_provider()

    // potentially allow multiple files
    const input = event.target as HTMLInputElement
    const files = input.files
    if (files === null || files.length === 0) {
      return
    }

    this.set_enabled(false) // disable to prevent double-clicks during processing

    try {
      for (const file of Array.from(files)) {
        const file_name = file.name.toLowerCase()
        if (!file_name.endsWith('.glb')) {
          new ModalDialog('Unsupported file type. Please select a GLB file.', 'Error').show()
          continue
        }
        await this.import_animation_glb(file)
      }
    } finally {
      input.value = ''
      this.set_enabled(true)
    }
  }

  private sync_import_context_from_provider (): void {
    if (this.import_context_provider === null) {
      return
    }

    const { skinned_meshes_to_animate, skeleton_scale } = this.import_context_provider()
    this.set_import_context(skinned_meshes_to_animate, skeleton_scale)
  }

  private async import_animation_glb (file: File): Promise<{ success: boolean, clipCount: number }> {
    // tell the animation data these are custom animations to help differentiate for custom video previews
    // tags are unused right now, but I want to eventually use them to help filtering
    const metadata_override: Partial<AnimationClipMetadata> = {
      source_type: 'custom-import',
      tags: []
    }

    try {
      const new_animation_clips = await this.animation_loader.load_animations_from_file(
        file,
        this.skeleton_scale,
        metadata_override
      )

      // Replace default/generic mixamo clip names with cleaner base file name
      const base_file_name = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
      const file_path = (file as any).path || (file as any).webkitRelativePath || file.name

      new_animation_clips.forEach((clip_pair, index) => {
        const raw_name = clip_pair.display_animation_clip.name.trim().toLowerCase()
        if (raw_name === 'mixamo.com' || raw_name.includes('mixamo') || raw_name === '') {
          const clean_name = new_animation_clips.length > 1
            ? `${base_file_name} ${index + 1}`
            : base_file_name
          clip_pair.display_animation_clip.name = clean_name
          clip_pair.original_animation_clip.name = clean_name
        }
        clip_pair.metadata.custom_storage_id = file.name
        clip_pair.metadata.fileName = file.name
        clip_pair.metadata.filePath = file_path
      })

      // Validate custom animations against our target skeleton
      const animation_clip_names_imported = new_animation_clips.map(clip_pair => clip_pair.display_animation_clip.name).join(', ')
      const clips_to_validate: AnimationClip[] = new_animation_clips.map((clip_pair) => clip_pair.display_animation_clip)
      CustomAnimationValidation.validate_animation_bones_match(clips_to_validate, this.skinned_meshes_to_animate)

      // Persist the imported animation GLB to IndexedDB storage
      try {
        const array_buffer = await file.arrayBuffer()
        await CustomAnimationStorage.save_animation(
          file.name,
          animation_clip_names_imported,
          file.name,
          array_buffer,
          undefined,
          file_path
        )
      } catch (storage_err) {
        console.warn('Failed to save animation to persistent storage:', storage_err)
      }

      this.dispatchEvent(new CustomEvent<TransformedAnimationClipPair[]>('import-success', {
        detail: new_animation_clips
      }))

      const animation_count = new_animation_clips.length
      const animation_word = animation_count === 1 ? 'animation' : 'animations'
      new ModalDialog(
        'Import Success',
        `${animation_count} ${animation_word} Imported successfully: ${animation_clip_names_imported}`
      ).show()

      return { success: true, clipCount: new_animation_clips.length }
    } catch (error) {
      return CustomAnimationValidation.handle_import_error(error)
    }
  }
}
