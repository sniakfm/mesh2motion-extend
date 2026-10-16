import { SkeletonType } from '../../enums/SkeletonType'

export interface StoredAnimationRecord {
  id: string
  name: string
  fileName: string
  filePath?: string
  data: ArrayBuffer
  skeletonType: SkeletonType
  timestamp: number
}

export type StorageManifest = Record<string, {
  id: string
  name: string
  fileName: string
  filePath?: string
  skeletonType: SkeletonType
  timestamp: number
}>

const DB_NAME = 'Mesh2Motion_Storage'
const DB_VERSION = 1
const STORE_NAME = 'custom_animations'

export class CustomAnimationStorage {
  private static db_instance: IDBDatabase | null = null

  public static is_tauri (): boolean {
    if (typeof window === 'undefined') return false
    return (
      (window as any).__TAURI_INTERNALS__ != null ||
      (window as any).__TAURI__?.core != null
    )
  }

  public static async tauri_invoke<T> (cmd: string, args?: Record<string, unknown>): Promise<T | null> {
    if (typeof window === 'undefined') return null
    try {
      const internals = (window as any).__TAURI_INTERNALS__
      if (internals != null && typeof internals.invoke === 'function') {
        return await internals.invoke(cmd, args)
      }
      const tauriGlobal = (window as any).__TAURI__
      if (tauriGlobal?.core != null && typeof tauriGlobal.core.invoke === 'function') {
        return await tauriGlobal.core.invoke(cmd, args)
      }
    } catch (err) {
      console.warn(`[CustomAnimationStorage] Tauri invoke failed for ${cmd}:`, err)
    }
    return null
  }

  // --- Tauri Manifest (storage/manifest.json) Helpers ---

  private static async load_manifest (): Promise<StorageManifest> {
    try {
      const jsonStr = await CustomAnimationStorage.tauri_invoke<string>('read_storage_manifest')
      if (jsonStr != null && jsonStr.trim() !== '') {
        return JSON.parse(jsonStr) as StorageManifest
      }
    } catch (err) {
      console.warn('[CustomAnimationStorage] Failed to read storage/manifest.json:', err)
    }
    return {}
  }

  private static async save_manifest (manifest: StorageManifest): Promise<void> {
    try {
      const jsonStr = JSON.stringify(manifest, null, 2)
      await CustomAnimationStorage.tauri_invoke('save_storage_manifest', {
        manifestJson: jsonStr
      })
    } catch (err) {
      console.warn('[CustomAnimationStorage] Failed to save storage/manifest.json:', err)
    }
  }

  // --- Web / Test Fallback: IndexedDB ---

  private static async get_db (): Promise<IDBDatabase> {
    if (CustomAnimationStorage.db_instance !== null) {
      return CustomAnimationStorage.db_instance
    }

    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('skeletonType', 'skeletonType', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }

      request.onsuccess = () => {
        CustomAnimationStorage.db_instance = request.result
        resolve(request.result)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  // --- Public API ---

  public static async save_animation (
    id: string,
    name: string,
    fileName: string,
    data: ArrayBuffer,
    skeletonType: SkeletonType = SkeletonType.Human,
    filePath?: string
  ): Promise<void> {
    // [Tauri Desktop] Completely isolated to storage/ folder and storage/manifest.json!
    if (CustomAnimationStorage.is_tauri()) {
      try {
        const byteArr = Array.from(new Uint8Array(data))
        const resPath = await CustomAnimationStorage.tauri_invoke<string>('save_to_storage', {
          fileName,
          data: byteArr
        })

        const manifest = await CustomAnimationStorage.load_manifest()
        manifest[fileName] = {
          id: fileName,
          name,
          fileName,
          filePath: resPath ?? filePath,
          skeletonType,
          timestamp: Date.now()
        }
        await CustomAnimationStorage.save_manifest(manifest)
        return
      } catch (err) {
        console.warn('[CustomAnimationStorage] Failed to save to storage folder:', err)
      }
    }

    // [Browser / Vitest Fallback]
    const db = await CustomAnimationStorage.get_db()
    const record: StoredAnimationRecord = {
      id,
      name,
      fileName,
      filePath,
      data,
      skeletonType,
      timestamp: Date.now()
    }

    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const put_req = store.put(record)

      put_req.onsuccess = () => { resolve() }
      put_req.onerror = () => { reject(put_req.error) }
    })
  }

  public static async update_animation_name (
    id: string,
    newName: string
  ): Promise<void> {
    // [Tauri Desktop] Directly update storage/manifest.json
    if (CustomAnimationStorage.is_tauri()) {
      try {
        const manifest = await CustomAnimationStorage.load_manifest()
        // id can be fileName or id
        let matchedKey: string | null = null
        for (const [key, item] of Object.entries(manifest)) {
          if (key === id || item.id === id || item.fileName === id || item.name === id) {
            matchedKey = key
            break
          }
        }

        if (matchedKey != null) {
          manifest[matchedKey].name = newName
          await CustomAnimationStorage.save_manifest(manifest)
          return
        }
      } catch (err) {
        console.warn('[CustomAnimationStorage] Failed to update name in storage/manifest.json:', err)
      }
    }

    // [Browser / Vitest Fallback]
    const db = await CustomAnimationStorage.get_db()
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const get_req = store.get(id)

      get_req.onsuccess = () => {
        const record = get_req.result as StoredAnimationRecord | undefined
        if (record != null) {
          record.name = newName
          const put_req = store.put(record)
          put_req.onsuccess = () => { resolve() }
          put_req.onerror = () => { reject(put_req.error) }
        } else {
          resolve()
        }
      }
      get_req.onerror = () => { reject(get_req.error) }
    })
  }

  public static async get_all_animations (
    skeletonType?: SkeletonType
  ): Promise<StoredAnimationRecord[]> {
    // [Tauri Desktop] Read entirely from storage/ folder and storage/manifest.json
    if (CustomAnimationStorage.is_tauri()) {
      try {
        const storageFiles = await CustomAnimationStorage.tauri_invoke<string[]>('list_storage_files') ?? []
        const storageFileSet = new Set(storageFiles)
        const manifest = await CustomAnimationStorage.load_manifest()
        let manifestDirty = false

        const results: StoredAnimationRecord[] = []

        // 1. Process files registered in manifest
        for (const [key, item] of Object.entries(manifest)) {
          if (storageFileSet.has(item.fileName)) {
            try {
              const fileBytes = await CustomAnimationStorage.tauri_invoke<number[]>('read_from_storage', {
                fileNameOrPath: item.fileName
              })
              if (fileBytes != null && fileBytes.length > 0) {
                results.push({
                  id: item.id || item.fileName,
                  name: item.name,
                  fileName: item.fileName,
                  filePath: item.filePath,
                  data: new Uint8Array(fileBytes).buffer,
                  skeletonType: item.skeletonType ?? SkeletonType.Human,
                  timestamp: item.timestamp ?? Date.now()
                })
                storageFileSet.delete(item.fileName)
                continue
              }
            } catch (readErr) {
              console.warn('[CustomAnimationStorage] Could not read file from storage:', item.fileName, readErr)
            }
          } else {
            // File was removed from storage folder -> clean from manifest
            delete manifest[key]
            manifestDirty = true
          }
        }

        // 2. Discover untracked files placed directly into storage/
        for (const newFile of storageFileSet) {
          try {
            const fileBytes = await CustomAnimationStorage.tauri_invoke<number[]>('read_from_storage', {
              fileNameOrPath: newFile
            })
            if (fileBytes != null && fileBytes.length > 0) {
              const cleanName = newFile.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
              const recordItem = {
                id: newFile,
                name: cleanName,
                fileName: newFile,
                filePath: newFile,
                skeletonType: SkeletonType.Human,
                timestamp: Date.now()
              }
              manifest[newFile] = recordItem
              manifestDirty = true

              results.push({
                ...recordItem,
                data: new Uint8Array(fileBytes).buffer
              })
            }
          } catch (newFileErr) {
            console.warn('[CustomAnimationStorage] Failed to read untracked storage file:', newFile, newFileErr)
          }
        }

        if (manifestDirty) {
          void CustomAnimationStorage.save_manifest(manifest)
        }

        if (skeletonType !== undefined) {
          return results.filter(r => r.skeletonType === skeletonType)
        }
        return results
      } catch (tauriErr) {
        console.warn('[CustomAnimationStorage] Error loading from storage/ folder:', tauriErr)
      }
    }

    // [Browser / Vitest Fallback]
    const db = await CustomAnimationStorage.get_db()
    const records = await new Promise<StoredAnimationRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const get_req = store.getAll()

      get_req.onsuccess = () => {
        resolve(get_req.result ?? [])
      }
      get_req.onerror = () => { reject(get_req.error) }
    })

    if (skeletonType !== undefined) {
      return records.filter(r => r.skeletonType === skeletonType)
    }
    return records
  }

  public static async delete_animation (id: string): Promise<void> {
    // [Tauri Desktop] Delete file from storage/ and remove entry from storage/manifest.json
    if (CustomAnimationStorage.is_tauri()) {
      try {
        const manifest = await CustomAnimationStorage.load_manifest()
        let fileToDelete = id

        for (const [key, item] of Object.entries(manifest)) {
          if (key === id || item.id === id || item.fileName === id || item.name === id) {
            fileToDelete = item.fileName
            delete manifest[key]
            break
          }
        }

        await Promise.all([
          CustomAnimationStorage.tauri_invoke('delete_from_storage', {
            fileNameOrPath: fileToDelete
          }),
          CustomAnimationStorage.save_manifest(manifest)
        ])
        return
      } catch (err) {
        console.warn('[CustomAnimationStorage] Failed to delete from storage folder:', err)
      }
    }

    // [Browser / Vitest Fallback]
    const db = await CustomAnimationStorage.get_db()
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const del_req = store.delete(id)
      del_req.onsuccess = () => { resolve() }
      del_req.onerror = () => { reject(del_req.error) }
    })
  }
}
