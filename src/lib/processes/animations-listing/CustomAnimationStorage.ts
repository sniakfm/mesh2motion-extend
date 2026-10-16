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

  public static async save_animation (
    id: string,
    name: string,
    fileName: string,
    data: ArrayBuffer,
    skeletonType: SkeletonType = SkeletonType.Human,
    filePath?: string
  ): Promise<void> {
    let savedStoragePath = filePath
    let dataToStore = data

    // If running in Tauri desktop, save file to binary's ./storage folder and keep IndexedDB lightweight!
    if (CustomAnimationStorage.is_tauri()) {
      try {
        const byteArr = Array.from(new Uint8Array(data))
        const resPath = await CustomAnimationStorage.tauri_invoke<string>('save_to_storage', {
          fileName,
          data: byteArr
        })
        if (resPath != null && resPath !== '') {
          savedStoragePath = resPath
          // Keep IndexedDB empty of huge ArrayBuffers
          dataToStore = new ArrayBuffer(0)
        }
      } catch (err) {
        console.warn('[CustomAnimationStorage] Failed to save to local storage dir, falling back to IndexedDB:', err)
      }
    }

    const db = await CustomAnimationStorage.get_db()
    const record: StoredAnimationRecord = {
      id,
      name,
      fileName,
      filePath: savedStoragePath,
      data: dataToStore,
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
    const db = await CustomAnimationStorage.get_db()

    const rawRecords = await new Promise<StoredAnimationRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const get_req = store.getAll()

      get_req.onsuccess = () => {
        const records: StoredAnimationRecord[] = get_req.result ?? []
        resolve(records)
      }
      get_req.onerror = () => { reject(get_req.error) }
    })

    // If Tauri is active, populate ArrayBuffer from storage folder and discover untracked files
    if (CustomAnimationStorage.is_tauri()) {
      try {
        const storageFiles = await CustomAnimationStorage.tauri_invoke<string[]>('list_storage_files') ?? []
        const storageFileSet = new Set(storageFiles)

        const validRecords: StoredAnimationRecord[] = []

        for (const rec of rawRecords) {
          const fileName = rec.fileName || rec.id
          if (storageFileSet.has(fileName)) {
            try {
              const fileBytes = await CustomAnimationStorage.tauri_invoke<number[]>('read_from_storage', {
                fileNameOrPath: fileName
              })
              if (fileBytes != null && fileBytes.length > 0) {
                rec.data = new Uint8Array(fileBytes).buffer
                validRecords.push(rec)
                storageFileSet.delete(fileName) // Mark as handled
                continue
              }
            } catch (readErr) {
              console.warn('[CustomAnimationStorage] Could not read storage file:', fileName, readErr)
            }
          }

          // If record already has non-empty buffer (e.g. stored in IndexedDB before)
          if (rec.data != null && rec.data.byteLength > 0) {
            validRecords.push(rec)
          }
        }

        // Also register any new files found directly in storage/ folder
        for (const extraFile of storageFileSet) {
          try {
            const fileBytes = await CustomAnimationStorage.tauri_invoke<number[]>('read_from_storage', {
              fileNameOrPath: extraFile
            })
            if (fileBytes != null && fileBytes.length > 0) {
              const cleanName = extraFile.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
              const newRecord: StoredAnimationRecord = {
                id: extraFile,
                name: cleanName,
                fileName: extraFile,
                filePath: extraFile,
                data: new Uint8Array(fileBytes).buffer,
                skeletonType: SkeletonType.Human,
                timestamp: Date.now()
              }
              // Save metadata to IndexedDB
              void CustomAnimationStorage.save_animation(
                newRecord.id,
                newRecord.name,
                newRecord.fileName,
                newRecord.data,
                newRecord.skeletonType,
                newRecord.filePath
              )
              validRecords.push(newRecord)
            }
          } catch (extraErr) {
            console.warn('[CustomAnimationStorage] Failed to read extra storage file:', extraFile, extraErr)
          }
        }

        if (skeletonType !== undefined) {
          return validRecords.filter(r => r.skeletonType === skeletonType)
        }
        return validRecords
      } catch (tauriErr) {
        console.warn('[CustomAnimationStorage] Error syncing storage files:', tauriErr)
      }
    }

    if (skeletonType !== undefined) {
      return rawRecords.filter(r => r.skeletonType === skeletonType)
    }
    return rawRecords
  }

  public static async delete_animation (id: string): Promise<void> {
    const db = await CustomAnimationStorage.get_db()

    // 1. If Tauri, delete file from binary storage dir
    if (CustomAnimationStorage.is_tauri()) {
      try {
        await CustomAnimationStorage.tauri_invoke('delete_from_storage', {
          fileNameOrPath: id
        })
      } catch (err) {
        console.warn('[CustomAnimationStorage] Failed to delete from storage dir:', err)
      }
    }

    // 2. Delete metadata from IndexedDB
    return await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const del_req = store.delete(id)
      del_req.onsuccess = () => { resolve() }
      del_req.onerror = () => { reject(del_req.error) }
    })
  }
}
