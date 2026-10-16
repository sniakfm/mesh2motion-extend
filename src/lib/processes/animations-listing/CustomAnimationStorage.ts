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

    return await new Promise<StoredAnimationRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const get_req = store.getAll()

      get_req.onsuccess = () => {
        const records: StoredAnimationRecord[] = get_req.result ?? []
        if (skeletonType !== undefined) {
          resolve(records.filter(r => r.skeletonType === skeletonType))
        } else {
          resolve(records)
        }
      }
      get_req.onerror = () => { reject(get_req.error) }
    })
  }

  public static async delete_animation (id: string): Promise<void> {
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
