import { describe, it, expect, beforeEach } from 'vitest'
import { AnimationSearch } from './AnimationSearch'
import { ThemeManager } from '../../ThemeManager'
import { SkeletonType } from '../../enums/SkeletonType'
import { type TransformedAnimationClipPair } from './interfaces/TransformedAnimationClipPair'
import { AnimationClip } from 'three'

describe('AnimationSearch - Tabs and Management', () => {
  let themeManager: ThemeManager
  let search: AnimationSearch
  let sampleClips: TransformedAnimationClipPair[]

  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <input type="text" id="animation-filter" />
        <div id="animations-items"></div>
      </div>
    `

    themeManager = new ThemeManager()
    search = new AnimationSearch('animation-filter', 'animations-items', themeManager, SkeletonType.Human)

    sampleClips = [
      {
        original_animation_clip: new AnimationClip('Idle_Default', 1, []),
        display_animation_clip: new AnimationClip('Idle_Default', 1, []),
        metadata: { source_type: 'default-library', tags: [] }
      },
      {
        original_animation_clip: new AnimationClip('Run_Default', 1, []),
        display_animation_clip: new AnimationClip('Run_Default', 1, []),
        metadata: { source_type: 'default-library', tags: [] }
      },
      {
        original_animation_clip: new AnimationClip('Mixamo_Dance', 1, []),
        display_animation_clip: new AnimationClip('Mixamo_Dance', 1, []),
        metadata: {
          source_type: 'custom-import',
          tags: [],
          custom_storage_id: 'dance.glb',
          fileName: 'dance.glb',
          filePath: 'C:/animations/dance.glb'
        }
      }
    ]

    search.initialize_animations(sampleClips)
  })

  it('filters by view mode correctly: all, library, imported, selected', () => {
    // 1. Default mode is 'all' -> all animations shown (3 total)
    expect(search.get_view_mode()).toBe('all')
    let rendered = search.filtered_animations()
    expect(rendered.length).toBe(3)
    expect(rendered.map(c => c.name)).toEqual(['Idle_Default', 'Run_Default', 'Mixamo_Dance'])

    // 2. Switch to 'library' -> only default library animations shown (2 total)
    search.set_view_mode('library')
    expect(search.get_view_mode()).toBe('library')
    rendered = search.filtered_animations()
    expect(rendered.length).toBe(2)
    expect(rendered.map(c => c.name)).toEqual(['Idle_Default', 'Run_Default'])

    // 3. Switch to 'imported' -> only custom-import animations shown (1 total)
    search.set_view_mode('imported')
    expect(search.get_view_mode()).toBe('imported')
    rendered = search.filtered_animations()
    expect(rendered.length).toBe(1)
    expect(rendered[0].name).toBe('Mixamo_Dance')

    // 4. Switch to 'selected' -> only checked animations shown
    search.set_view_mode('selected')
    expect(search.filtered_animations().length).toBe(0)

    // Check one animation
    search.get_all_animations()[0].isChecked = true
    search.set_view_mode('selected')
    rendered = search.filtered_animations()
    expect(rendered.length).toBe(1)
    expect(rendered[0].name).toBe('Idle_Default')
  })

  it('updates animation name via update_animation_name_by_index', () => {
    search.set_view_mode('imported')
    expect(search.filtered_animations()[0].name).toBe('Mixamo_Dance')

    // Find index of Mixamo_Dance
    const danceIndex = search.get_all_animations().findIndex(c => c.name === 'Mixamo_Dance')
    expect(danceIndex).toBe(2)

    search.update_animation_name_by_index(danceIndex, 'HipHop_Groove')
    expect(search.get_all_animations()[2].name).toBe('HipHop_Groove')

    const container = document.getElementById('animations-items')
    expect(container?.innerHTML).toContain('HipHop Groove')
  })

  it('removes animation via remove_animation_by_index', () => {
    const danceIndex = search.get_all_animations().findIndex(c => c.name === 'Mixamo_Dance')
    const removed = search.remove_animation_by_index(danceIndex)

    expect(removed?.name).toBe('Mixamo_Dance')
    expect(search.get_all_animations().length).toBe(2)

    search.set_view_mode('imported')
    expect(search.filtered_animations().length).toBe(0)
  })

  it('renders custom metadata attributes in DOM tiles for context menu inspection', () => {
    search.set_view_mode('imported')
    const item = document.querySelector('.anim-custom-item') as HTMLElement | null
    expect(item).not.toBeNull()
    expect(item?.getAttribute('data-custom')).toBe('true')
    expect(item?.getAttribute('data-storage-id')).toBe('dance.glb')
    expect(item?.getAttribute('data-file-path')).toBe('C:/animations/dance.glb')
    expect(item?.getAttribute('data-file-name')).toBe('dance.glb')
    expect(item?.getAttribute('data-animation-name')).toBe('Mixamo_Dance')
  })
})
