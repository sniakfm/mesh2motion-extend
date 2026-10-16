import { CustomAnimationStorage } from './CustomAnimationStorage.ts'
import { type AnimationSearch } from './AnimationSearch.ts'
import { type TransformedAnimationClipPair } from './interfaces/TransformedAnimationClipPair.ts'

interface ContextMenuTarget {
  index: number
  name: string
  isCustom: boolean
  storageId: string
  filePath: string
  fileName: string
  element: HTMLElement
}

/**
 * Handles right-click context menu actions on animations in the library:
 * - Change Name
 * - Delete (with optional disk file removal)
 */
export class AnimationContextMenu {
  private readonly animation_search: AnimationSearch
  private get_animation_clips: () => TransformedAnimationClipPair[]
  private on_animation_deleted?: (index: number, storageId: string) => void

  private menu_element: HTMLDivElement | null = null
  private current_target: ContextMenuTarget | null = null
  private active_dialog_element: HTMLElement | null = null

  constructor (
    animation_search: AnimationSearch,
    get_animation_clips: () => TransformedAnimationClipPair[],
    on_animation_deleted?: (index: number, storageId: string) => void
  ) {
    this.animation_search = animation_search
    this.get_animation_clips = get_animation_clips
    this.on_animation_deleted = on_animation_deleted

    this.create_menu_element()
    this.attach_event_listeners()
  }

  private create_menu_element (): void {
    const existing = document.getElementById('animation-context-menu')
    if (existing != null) {
      existing.remove()
    }

    const menu = document.createElement('div')
    menu.id = 'animation-context-menu'
    menu.className = 'anim-context-menu'
    menu.style.display = 'none'
    menu.innerHTML = `
      <div class="anim-context-menu-header" id="anim-context-menu-title">Animation</div>
      <button type="button" class="anim-context-menu-item" data-action="rename">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
        Change Name
      </button>
      <button type="button" class="anim-context-menu-item danger" data-action="delete">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Delete
      </button>
    `
    document.body.appendChild(menu)
    this.menu_element = menu

    menu.querySelector('button[data-action="rename"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.hide_menu()
      if (this.current_target != null) {
        this.open_rename_dialog(this.current_target)
      }
    })

    menu.querySelector('button[data-action="delete"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.hide_menu()
      if (this.current_target != null) {
        this.open_delete_dialog(this.current_target)
      }
    })
  }

  private attach_event_listeners (): void {
    const container = document.getElementById('animations-items')
    if (container == null) {
      return
    }

    container.addEventListener('contextmenu', (event: MouseEvent) => {
      const targetElement = event.target as HTMLElement
      const row = targetElement.closest('.anim-item, .anim-custom-item') as HTMLElement | null
      if (row == null) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const indexStr = row.getAttribute('data-animation-index')
      const index = indexStr != null ? parseInt(indexStr, 10) : -1
      const isCustom = row.getAttribute('data-custom') === 'true' || row.classList.contains('anim-custom-item')
      const storageId = row.getAttribute('data-storage-id') ?? ''
      const filePath = row.getAttribute('data-file-path') ?? ''
      const fileName = row.getAttribute('data-file-name') ?? ''
      const name = row.getAttribute('data-animation-name') ?? (this.animation_search.get_animation_by_index(index)?.name ?? 'Animation')

      this.current_target = {
        index,
        name,
        isCustom,
        storageId,
        filePath,
        fileName,
        element: row
      }

      this.show_menu(event.clientX, event.clientY, this.current_target)
    })

    document.addEventListener('click', (event) => {
      if (this.menu_element != null && !this.menu_element.contains(event.target as Node)) {
        this.hide_menu()
      }
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hide_menu()
        this.close_active_dialog()
      }
    })
  }

  private show_menu (x: number, y: number, target: ContextMenuTarget): void {
    if (this.menu_element == null) {
      return
    }

    const titleEl = this.menu_element.querySelector('#anim-context-menu-title')
    if (titleEl != null) {
      titleEl.textContent = target.name
    }

    const renameBtn = this.menu_element.querySelector('button[data-action="rename"]') as HTMLButtonElement | null
    const deleteBtn = this.menu_element.querySelector('button[data-action="delete"]') as HTMLButtonElement | null

    if (!target.isCustom) {
      if (renameBtn != null) {
        renameBtn.disabled = true
        renameBtn.title = 'Built-in library animations cannot be renamed'
      }
      if (deleteBtn != null) {
        deleteBtn.disabled = true
        deleteBtn.title = 'Built-in library animations cannot be deleted'
      }
    } else {
      if (renameBtn != null) {
        renameBtn.disabled = false
        renameBtn.title = 'Change animation name'
      }
      if (deleteBtn != null) {
        deleteBtn.disabled = false
        deleteBtn.title = 'Delete animation'
      }
    }

    this.menu_element.style.display = 'block'

    const menuWidth = this.menu_element.offsetWidth
    const menuHeight = this.menu_element.offsetHeight
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    let posX = x
    let posY = y

    if (posX + menuWidth > windowWidth - 10) {
      posX = windowWidth - menuWidth - 10
    }
    if (posY + menuHeight > windowHeight - 10) {
      posY = windowHeight - menuHeight - 10
    }

    this.menu_element.style.left = `${posX}px`
    this.menu_element.style.top = `${posY}px`
  }

  public hide_menu (): void {
    if (this.menu_element != null) {
      this.menu_element.style.display = 'none'
    }
  }

  private open_rename_dialog (target: ContextMenuTarget): void {
    this.close_active_dialog()

    const overlay = document.createElement('div')
    overlay.className = 'modal-dialog-overlay'

    overlay.innerHTML = `
      <div class="modal-dialog-content anim-action-modal">
        <h2>Change Animation Name</h2>
        <div class="modal-dialog-body">
          <p style="margin-bottom: 0.8rem; color: var(--text-alternate); font-size: 0.9rem;">
            Enter a new name for the imported animation:
          </p>
          <input type="text" id="rename-animation-input" class="text-input" value="${target.name.replace(/"/g, '&quot;')}" style="width: 100%; box-sizing: border-box; padding: 0.6rem 0.8rem; font-size: 1rem; border-radius: 6px; border: 1px solid var(--bg-tertiary); background: var(--bg-primary); color: var(--text-primary);" />
        </div>
        <div class="modal-dialog-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.2rem;">
          <button type="button" class="secondary-button" id="cancel-rename-button">Cancel</button>
          <button type="button" class="primary-button" id="confirm-rename-button">Rename</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)
    this.active_dialog_element = overlay

    const input = overlay.querySelector('#rename-animation-input') as HTMLInputElement | null
    const cancelBtn = overlay.querySelector('#cancel-rename-button')
    const confirmBtn = overlay.querySelector('#confirm-rename-button')

    input?.focus()
    input?.select()

    cancelBtn?.addEventListener('click', () => {
      this.close_active_dialog()
    })

    const doRename = async (): Promise<void> => {
      const newName = input?.value.trim() ?? ''
      if (newName === '' || newName === target.name) {
        this.close_active_dialog()
        return
      }

      await this.apply_rename(target, newName)
      this.close_active_dialog()
    }

    confirmBtn?.addEventListener('click', () => {
      void doRename()
    })

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void doRename()
      } else if (e.key === 'Escape') {
        this.close_active_dialog()
      }
    })

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close_active_dialog()
      }
    })
  }

  private async apply_rename (target: ContextMenuTarget, newName: string): Promise<void> {
    // 1. Update Three.js clip pairs in memory
    const loadedClips = this.get_animation_clips()
    if (target.index >= 0 && target.index < loadedClips.length) {
      const clipPair = loadedClips[target.index]
      clipPair.display_animation_clip.name = newName
      clipPair.original_animation_clip.name = newName
    }

    // 2. Update UI & AnimationSearch state
    this.animation_search.update_animation_name_by_index(target.index, newName)

    // 3. Persist to IndexedDB
    const storageId = target.storageId || target.fileName || target.name
    if (storageId !== '') {
      try {
        await CustomAnimationStorage.update_animation_name(storageId, newName)
      } catch (err) {
        console.warn('Failed to update animation name in storage:', err)
      }
    }
  }

  private open_delete_dialog (target: ContextMenuTarget): void {
    this.close_active_dialog()

    const overlay = document.createElement('div')
    overlay.className = 'modal-dialog-overlay'

    const hasFilePath = target.filePath !== '' && target.filePath !== target.fileName
    const fileHint = hasFilePath ? target.filePath : (target.fileName !== '' ? target.fileName : target.storageId)

    overlay.innerHTML = `
      <div class="modal-dialog-content anim-action-modal">
        <h2>Delete Animation</h2>
        <div class="modal-dialog-body">
          <p style="margin-bottom: 0.8rem; font-size: 1rem;">
            Are you sure you want to delete <strong>${target.name}</strong> from the library?
          </p>

          <label class="styled-checkbox" style="display: flex; align-items: flex-start; gap: 0.5rem; margin-top: 1rem; cursor: pointer; user-select: none;">
            <input type="checkbox" id="delete-disk-file-checkbox" style="margin-top: 3px;" />
            <div>
              <span style="font-weight: 500;">폴더 파일(원본 파일)도 함께 삭제</span>
              <span style="display: block; font-size: 0.85rem; color: var(--text-alternate);">
                Also delete file from disk folder
              </span>
              ${fileHint ? `<div style="font-size: 0.8rem; color: var(--text-alternate); margin-top: 0.2rem; word-break: break-all; opacity: 0.85;">Target: ${fileHint}</div>` : ''}
            </div>
          </label>
        </div>
        <div class="modal-dialog-actions" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.2rem;">
          <button type="button" class="secondary-button" id="cancel-delete-button">Cancel</button>
          <button type="button" class="primary-button" id="confirm-delete-button" style="background: #e74c3c;">Delete</button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)
    this.active_dialog_element = overlay

    const deleteCheckbox = overlay.querySelector('#delete-disk-file-checkbox') as HTMLInputElement | null
    const cancelBtn = overlay.querySelector('#cancel-delete-button')
    const confirmBtn = overlay.querySelector('#confirm-delete-button')

    cancelBtn?.addEventListener('click', () => {
      this.close_active_dialog()
    })

    confirmBtn?.addEventListener('click', () => {
      const deleteDiskFile = deleteCheckbox?.checked ?? false
      void this.apply_delete(target, deleteDiskFile)
      this.close_active_dialog()
    })

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close_active_dialog()
      }
    })
  }

  private async apply_delete (target: ContextMenuTarget, deleteDiskFile: boolean): Promise<void> {
    const storageId = target.storageId || target.fileName || target.name

    // 1. Delete from IndexedDB
    if (storageId !== '') {
      try {
        await CustomAnimationStorage.delete_animation(storageId)
      } catch (err) {
        console.warn('Failed to delete animation from persistent storage:', err)
      }
    }

    // 2. Remove from AnimationSearch list & re-render UI
    this.animation_search.remove_animation_by_index(target.index, storageId)

    // 3. Notify parent listener (StepAnimationsListing / RetargetAnimationListing)
    if (this.on_animation_deleted != null) {
      this.on_animation_deleted(target.index, storageId)
    }

    // 4. If requested, delete from disk via Tauri invoke
    if (deleteDiskFile) {
      const targetFilePath = target.filePath || target.fileName || storageId
      const deleteResult = await this.delete_file_from_disk(targetFilePath)

      if (deleteResult.success) {
        this.show_feedback_dialog('File Deleted', `Animation and file were successfully deleted from disk:<br><code>${targetFilePath}</code>`)
      } else {
        const errorMsg = deleteResult.message ?? 'Unknown reason'
        this.show_feedback_dialog(
          'Library Item Removed',
          `Animation was removed from the library.<br><br>
           <span style="color: #e67e22;">Disk file could not be deleted automatically:</span><br>
           <code>${targetFilePath}</code><br>
           <small style="color: var(--text-alternate);">${errorMsg}</small><br><br>
           Please delete the file from your folder manually if needed.`
        )
      }
    }
  }

  private async delete_file_from_disk (filePath: string): Promise<{ success: boolean, message?: string }> {
    if (!filePath || filePath.trim() === '') {
      return { success: false, message: 'No file path available' }
    }

    try {
      // 1. Check window.__TAURI_INTERNALS__ (Tauri v2 invoke)
      const tauriInternals = (window as any).__TAURI_INTERNALS__
      if (tauriInternals != null && typeof tauriInternals.invoke === 'function') {
        await tauriInternals.invoke('delete_local_file', { filePath })
        return { success: true }
      }

      // 2. Check window.__TAURI__.core.invoke
      const tauriGlobal = (window as any).__TAURI__
      if (tauriGlobal?.core != null && typeof tauriGlobal.core.invoke === 'function') {
        await tauriGlobal.core.invoke('delete_local_file', { filePath })
        return { success: true }
      }

      return {
        success: false,
        message: 'Web browser environment (Direct file system access is restricted by browser security policies)'
      }
    } catch (err: any) {
      console.warn('delete_file_from_disk error:', err)
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private show_feedback_dialog (title: string, messageHtml: string): void {
    this.close_active_dialog()

    const overlay = document.createElement('div')
    overlay.className = 'modal-dialog-overlay'
    overlay.innerHTML = `
      <div class="modal-dialog-content anim-action-modal">
        <h2>${title}</h2>
        <div class="modal-dialog-body">
          <p style="font-size: 0.95rem; line-height: 1.5;">${messageHtml}</p>
        </div>
        <div class="modal-dialog-actions" style="display: flex; justify-content: flex-end; margin-top: 1.2rem;">
          <button type="button" class="primary-button" id="close-feedback-dialog">OK</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    this.active_dialog_element = overlay

    overlay.querySelector('#close-feedback-dialog')?.addEventListener('click', () => {
      this.close_active_dialog()
    })
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close_active_dialog()
      }
    })
  }

  private close_active_dialog (): void {
    if (this.active_dialog_element != null && this.active_dialog_element.parentNode != null) {
      this.active_dialog_element.parentNode.removeChild(this.active_dialog_element)
      this.active_dialog_element = null
    }
  }
}
