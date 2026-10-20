import fs from 'fs';
import path from 'path';
import { AppStore } from './store';
import { DataSyncManager } from './dataSync';
import { diagnosticsService } from './diagnosticsService';
import { DataSource, FileSource, LauncherItem, StaticSource } from '../src/types';

export class SourceManagerService {
  private store: AppStore;
  private syncManager: DataSyncManager;
  private onDataChanged?: () => void;

  constructor(store: AppStore, syncManager: DataSyncManager, onDataChanged?: () => void) {
    this.store = store;
    this.syncManager = syncManager;
    this.onDataChanged = onDataChanged;
  }

  private async triggerSyncAndNotify(): Promise<void> {
    await this.syncManager.syncAll();
    this.onDataChanged?.();
  }

  /**
   * Reads a JSON file and determines if it is a bare array or wrapped inside an object
   */
  private async readJsonFileWithMetadata(filePath: string): Promise<{
    items: any[];
    wrapperType: 'array' | 'object';
    wrapperKey?: string;
    originalObj?: Record<string, any>;
  }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Soubor nebyl nalezen na cestě: ${filePath}`);
    }

    const buf = await fs.promises.readFile(filePath);
    let raw = buf.toString('utf-8').replace(/^\uFEFF/, '').trim();

    if (raw.includes('\uFFFD')) {
      try {
        const win1250 = new TextDecoder('windows-1250').decode(buf).replace(/^\uFEFF/, '').trim();
        if (!win1250.includes('\uFFFD')) {
          raw = win1250;
        }
      } catch {}
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try removing trailing commas
      try {
        const stripped = raw.replace(/,\s*([}\]])/g, '$1');
        parsed = JSON.parse(stripped);
      } catch (err: any) {
        throw new Error(`Neplatný formát JSON souboru: ${err?.message || err}`);
      }
    }

    if (Array.isArray(parsed)) {
      return { items: parsed, wrapperType: 'array' };
    }

    if (parsed && typeof parsed === 'object') {
      const candidates = ['data', 'items', 'results', 'records', 'values'];
      for (const key of candidates) {
        if (Array.isArray(parsed[key])) {
          return { items: parsed[key], wrapperType: 'object', wrapperKey: key, originalObj: parsed };
        }
      }
      for (const [key, val] of Object.entries(parsed)) {
        if (Array.isArray(val)) {
          return { items: val, wrapperType: 'object', wrapperKey: key, originalObj: parsed };
        }
      }
    }

    throw new Error('Soubor neobsahuje pole JSON objektů [{ ... }]');
  }

  /**
   * Writes items back to a JSON file safely with backup and atomic rename
   */
  private async writeJsonFileSafely(
    filePath: string,
    items: any[],
    meta: { wrapperType: 'array' | 'object'; wrapperKey?: string; originalObj?: Record<string, any> }
  ): Promise<void> {
    if (fs.existsSync(filePath)) {
      try {
        await fs.promises.copyFile(filePath, `${filePath}.bak`);
      } catch (e) {
        console.warn(`[SourceManager] Failed to create backup for ${filePath}:`, e);
      }
    }

    let payload: any;
    if (meta.wrapperType === 'object' && meta.wrapperKey && meta.originalObj) {
      payload = {
        ...meta.originalObj,
        [meta.wrapperKey]: items,
      };
    } else {
      payload = items;
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const tmpPath = `${filePath}.tmp-${Date.now()}`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
  }

  /**
   * Adds or updates an item in a static or file source
   */
  public async saveSourceItem(params: {
    sourceId: string;
    item: LauncherItem;
    originalIndex?: number;
  }): Promise<{ ok: boolean; error?: string }> {
    const config = this.store.getConfig();
    const source = config.sources?.find((s: DataSource) => s.id === params.sourceId);
    if (!source) {
      return { ok: false, error: `Zdroj s ID "${params.sourceId}" nebyl nalezen.` };
    }

    if (source.type === 'api') {
      return { ok: false, error: 'API zdroje jsou pouze pro čtení. Položky nelze přidávat ani upravovat.' };
    }

    if (source.type === 'static') {
      const staticSrc = source as StaticSource;
      const items = Array.isArray(staticSrc.items) ? [...staticSrc.items] : [];
      if (typeof params.originalIndex === 'number' && params.originalIndex >= 0 && params.originalIndex < items.length) {
        items[params.originalIndex] = { ...items[params.originalIndex], ...params.item };
      } else {
        items.push(params.item);
      }
      staticSrc.items = items;
      this.store.saveConfig(config);
      await this.triggerSyncAndNotify();
      diagnosticsService.logAction({
        type: 'action',
        title: typeof params.originalIndex === 'number' ? `Upraven záznam ve zdroji: ${source.name}` : `Přidán záznam do zdroje: ${source.name}`,
        details: params.item.name,
        status: 'success',
      });
      return { ok: true };
    }

    if (source.type === 'file') {
      const fileSrc = source as FileSource;
      let meta: { wrapperType: 'array' | 'object'; wrapperKey?: string; originalObj?: Record<string, any> } = { wrapperType: 'array' };
      let items: any[] = [];
      if (fs.existsSync(fileSrc.path)) {
        const res = await this.readJsonFileWithMetadata(fileSrc.path);
        meta = res;
        items = res.items;
      }
      if (typeof params.originalIndex === 'number' && params.originalIndex >= 0 && params.originalIndex < items.length) {
        items[params.originalIndex] = { ...items[params.originalIndex], ...params.item };
      } else {
        items.push(params.item);
      }
      await this.writeJsonFileSafely(fileSrc.path, items, meta);
      await this.triggerSyncAndNotify();
      diagnosticsService.logAction({
        type: 'action',
        title: typeof params.originalIndex === 'number' ? `Upraven záznam v souboru: ${source.name}` : `Přidán záznam do souboru: ${source.name}`,
        details: params.item.name,
        status: 'success',
      });
      return { ok: true };
    }

    return { ok: false, error: `Neznámý typ zdroje: ${(source as any).type}` };
  }

  /**
   * Deletes an item from a static or file source
   */
  public async deleteSourceItem(params: {
    sourceId: string;
    itemIndex?: number;
    itemName?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const config = this.store.getConfig();
    const source = config.sources?.find((s: DataSource) => s.id === params.sourceId);
    if (!source) {
      return { ok: false, error: `Zdroj s ID "${params.sourceId}" nebyl nalezen.` };
    }

    if (source.type === 'api') {
      return { ok: false, error: 'API zdroje jsou pouze pro čtení. Položky nelze mazat.' };
    }

    if (source.type === 'static') {
      const staticSrc = source as StaticSource;
      const items = Array.isArray(staticSrc.items) ? [...staticSrc.items] : [];
      let idx = params.itemIndex;
      if (idx === undefined || idx < 0 || idx >= items.length) {
        if (params.itemName) {
          idx = items.findIndex((it) => it.name === params.itemName);
        }
      }
      if (idx === undefined || idx < 0 || idx >= items.length) {
        return { ok: false, error: 'Záznam k odstranění nebyl nalezen.' };
      }
      const removed = items.splice(idx, 1)[0];
      staticSrc.items = items;
      this.store.saveConfig(config);
      await this.triggerSyncAndNotify();
      diagnosticsService.logAction({
        type: 'action',
        title: `Odstraněn záznam ze zdroje: ${source.name}`,
        details: removed?.name || params.itemName || `Index ${idx}`,
        status: 'success',
      });
      return { ok: true };
    }

    if (source.type === 'file') {
      const fileSrc = source as FileSource;
      const meta = await this.readJsonFileWithMetadata(fileSrc.path);
      const items = [...meta.items];
      let idx = params.itemIndex;
      if (idx === undefined || idx < 0 || idx >= items.length) {
        if (params.itemName) {
          idx = items.findIndex((it: any) => it.name === params.itemName || it.title === params.itemName);
        }
      }
      if (idx === undefined || idx < 0 || idx >= items.length) {
        return { ok: false, error: 'Záznam k odstranění nebyl nalezen.' };
      }
      const removed = items.splice(idx, 1)[0];
      await this.writeJsonFileSafely(fileSrc.path, items, meta);
      await this.triggerSyncAndNotify();
      diagnosticsService.logAction({
        type: 'action',
        title: `Odstraněn záznam ze souboru: ${source.name}`,
        details: removed?.name || removed?.title || params.itemName || `Index ${idx}`,
        status: 'success',
      });
      return { ok: true };
    }

    return { ok: false, error: `Neznámý typ zdroje: ${(source as any).type}` };
  }

  /**
   * Deletes an entire source from configuration
   */
  public async deleteSource(sourceId: string): Promise<{ ok: boolean; error?: string }> {
    const config = this.store.getConfig();
    const sourceIndex = config.sources?.findIndex((s: DataSource) => s.id === sourceId);
    if (sourceIndex === undefined || sourceIndex === -1) {
      return { ok: false, error: `Zdroj s ID "${sourceId}" nebyl nalezen.` };
    }
    const sourceName = config.sources[sourceIndex].name;
    config.sources.splice(sourceIndex, 1);
    this.store.saveConfig(config);
    await this.triggerSyncAndNotify();
    diagnosticsService.logAction({
      type: 'action',
      title: `Odstraněn zdroj dat: ${sourceName}`,
      details: `ID: ${sourceId}`,
      status: 'success',
    });
    return { ok: true };
  }

  /**
   * Creates a new source
   */
  public async createSource(source: DataSource): Promise<{ ok: boolean; source?: DataSource; error?: string }> {
    const config = this.store.getConfig();
    if (!config.sources) config.sources = [];

    const newSource: DataSource = {
      ...source,
      id: source.id || `source-${Date.now()}`,
      enabled: source.enabled !== false,
    };

    if (newSource.type === 'file') {
      const fileSrc = newSource as FileSource;
      if (fileSrc.path && !fs.existsSync(fileSrc.path)) {
        const dir = path.dirname(fileSrc.path);
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true });
        }
        await fs.promises.writeFile(fileSrc.path, '[]', 'utf-8');
      }
    } else if (newSource.type === 'static') {
      const staticSrc = newSource as StaticSource;
      if (!Array.isArray(staticSrc.items)) {
        staticSrc.items = [];
      }
    }

    config.sources.push(newSource);
    this.store.saveConfig(config);
    await this.triggerSyncAndNotify();
    diagnosticsService.logAction({
      type: 'action',
      title: `Vytvořen nový zdroj dat: ${newSource.name}`,
      details: `Typ: ${newSource.type}`,
      status: 'success',
    });
    return { ok: true, source: newSource };
  }
}
