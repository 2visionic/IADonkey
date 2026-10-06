import { app, clipboard as electronClipboard, nativeImage, ClipboardItem } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { EasyClipItem, AppConfig } from '../src/types';
import { diagnosticsService } from './diagnosticsService';
import { NotificationService } from './notificationService';

const clipboard = electronClipboard as any;

export class EasyClipService {
  private items: EasyClipItem[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private lastText: string = '';
  private lastImageHash: string = '';
  private isWritingToClipboard = false;
  private storageDir: string;
  private storageFile: string;
  private imagesDir: string;
  private maxItems = 50;
  private isEnabled = false;
  private onItemsUpdatedCallback?: (items: EasyClipItem[]) => void;
  private notificationService?: NotificationService;

  constructor() {
    this.storageDir = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.user_data');
    this.storageFile = path.join(this.storageDir, 'easyclip.json');
    this.imagesDir = path.join(this.storageDir, 'easyclip_images');

    if (!fs.existsSync(this.imagesDir)) {
      try {
        fs.mkdirSync(this.imagesDir, { recursive: true });
      } catch (err) {
        console.error('[EasyClip] Failed to create images directory:', err);
      }
    }

    this.loadFromDisk();
  }

  public init(config: AppConfig, notificationService?: NotificationService): void {
    this.notificationService = notificationService;
    this.storageDir = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.user_data');
    this.storageFile = path.join(this.storageDir, 'easyclip.json');
    this.imagesDir = path.join(this.storageDir, 'easyclip_images');

    if (!fs.existsSync(this.imagesDir)) {
      try {
        fs.mkdirSync(this.imagesDir, { recursive: true });
      } catch (err) {
        console.error('[EasyClip] Failed to create images directory:', err);
      }
    }

    this.loadFromDisk();
    this.updateConfig(config);
  }

  public updateConfig(config: AppConfig): void {
    const isDonkeyTools = Boolean(config?.extensions?.donkeyTools);
    const easyClipCfg = config?.donkeyTools?.easyClip;
    const shouldBeEnabled = Boolean(isDonkeyTools && (easyClipCfg?.enabled === true));
    this.maxItems = easyClipCfg?.maxItems && easyClipCfg.maxItems > 0 ? easyClipCfg.maxItems : 50;

    console.log(`[EasyClip] updateConfig: isDonkeyTools=${isDonkeyTools}, enabled=${easyClipCfg?.enabled}, shouldBeEnabled=${shouldBeEnabled}, maxItems=${this.maxItems}`);

    if (shouldBeEnabled && !this.isEnabled) {
      this.isEnabled = true;
      this.startMonitoring();
    } else if (!shouldBeEnabled && this.isEnabled) {
      this.isEnabled = false;
      this.stopMonitoring();
    }
  }

  public setOnItemsUpdated(callback: (items: EasyClipItem[]) => void): void {
    this.onItemsUpdatedCallback = callback;
  }

  private startMonitoring(): void {
    if (this.pollTimer) return;

    // Reset so that any new copy (even if matching initial clipboard) is detected if not in history
    this.lastText = '';
    this.lastImageHash = '';

    this.pollTimer = setInterval(() => {
      this.checkClipboard().catch((err) => {
        console.warn('[EasyClip] Polling error in checkClipboard:', err);
      });
    }, 1200);
  }

  private stopMonitoring(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private registerCapturedImage(img: Electron.NativeImage, existingBuf?: Buffer): boolean {
    if (!img || img.isEmpty()) return false;
    const size = img.getSize();
    if (!size || size.width <= 0 || size.height <= 0) return false;

    const buf = existingBuf || img.toPNG();
    if (!buf || buf.length === 0) return false;

    const hash = `${size.width}x${size.height}_${buf.length}_${buf.subarray(0, 32).toString('hex')}`;

    const topItem = this.items[0];
    const isSameAsTopImage =
      topItem &&
      topItem.type === 'image' &&
      topItem.width === size.width &&
      topItem.height === size.height &&
      topItem.sizeBytes === buf.length;

    if (!isSameAsTopImage && hash !== this.lastImageHash) {
      this.lastImageHash = hash;
      this.lastText = ''; // New image supersedes prior text

      // Check if identical image already in history (by dimensions + size)
      const existingIdx = this.items.findIndex(
        (it) => it.type === 'image' && it.width === size.width && it.height === size.height && it.sizeBytes === buf.length
      );

      if (existingIdx >= 0) {
        const [existing] = this.items.splice(existingIdx, 1);
        existing.timestamp = Date.now();
        this.items.unshift(existing);
        this.saveToDisk();
        this.notifyRenderer();
        return true;
      }

      const id = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const filePath = path.join(this.imagesDir, `${id}.png`);
      try {
        fs.writeFileSync(filePath, buf);
      } catch (err) {
        console.error('[EasyClip] Failed to write image to disk:', err);
      }

      // Create compact thumbnail for fast UI rendering
      let thumbImg = img;
      if (size.width > 240 || size.height > 240) {
        const maxDim = 240;
        const ratio = Math.min(maxDim / size.width, maxDim / size.height);
        thumbImg = img.resize({
          width: Math.max(1, Math.round(size.width * ratio)),
          height: Math.max(1, Math.round(size.height * ratio)),
        });
      }
      const dataUrl = thumbImg.toDataURL();

      const newItem: EasyClipItem = {
        id,
        type: 'image',
        filePath,
        dataUrl,
        width: size.width,
        height: size.height,
        sizeBytes: buf.length,
        timestamp: Date.now(),
      };

      this.items.unshift(newItem);
      this.pruneItems();
      this.saveToDisk();
      this.notifyRenderer();

      console.log(`[EasyClip] Captured image (${newItem.width}x${newItem.height}, ${newItem.sizeBytes} B)`);
      diagnosticsService.logAction({
        type: 'action',
        title: 'EasyClip: Zachycen nový obrázek ze schránky',
        details: `Rozměry: ${newItem.width} × ${newItem.height} px (${Math.round((newItem.sizeBytes || 0) / 1024)} KB)`,
        status: 'info',
      });
      return true;
    } else if (isSameAsTopImage || hash === this.lastImageHash) {
      // Clipboard still holds the current top image; don't fall through to check text
      return true;
    }
    return false;
  }

  private async checkClipboard(): Promise<void> {
    if (!this.isEnabled || this.isWritingToClipboard) return;

    try {
      // 1. Try reading image via modern Electron 44+ Async Clipboard API (ClipboardItem / Blob)
      let foundImage = false;
      try {
        if (typeof clipboard.read === 'function') {
          const rawItems = clipboard.read();
          const clipItems = rawItems instanceof Promise ? await rawItems : rawItems;
          if (Array.isArray(clipItems)) {
            for (const cItem of clipItems) {
              const types: string[] = cItem?.types || [];
              const imgType = types.find((t: string) => t.startsWith('image/'));
              if (imgType && typeof cItem.getType === 'function') {
                const blob = await cItem.getType(imgType);
                if (blob && blob.size > 0) {
                  const arrBuf = await blob.arrayBuffer();
                  const buf = Buffer.from(arrBuf);
                  const img = nativeImage.createFromBuffer(buf);
                  if (img && !img.isEmpty()) {
                    if (this.registerCapturedImage(img, buf)) {
                      return;
                    }
                    foundImage = true;
                  }
                }
              }
            }
          }
        }
      } catch (readErr) {
        console.warn('[EasyClip] Error reading clipboard items:', readErr);
      }

      // 1b. Fallback for Electron < 44 where clipboard.readImage existed
      if (!foundImage && typeof (clipboard as any).readImage === 'function') {
        try {
          const rawImg = (clipboard as any).readImage();
          const img = rawImg instanceof Promise ? await rawImg : rawImg;
          if (img && typeof img.isEmpty === 'function' && !img.isEmpty()) {
            if (this.registerCapturedImage(img)) {
              return;
            }
            foundImage = true;
          }
        } catch (imgErr) {
          console.warn('[EasyClip] Error reading legacy image:', imgErr);
        }
      }

      // 2. Try reading image file path if copied from Windows Explorer
      try {
        let filePathFromClip = '';
        if (typeof (clipboard as any).read === 'function') {
          try {
            const rawPath = (clipboard as any).read('FileNameW');
            if (typeof rawPath === 'string' && rawPath.trim()) {
              filePathFromClip = rawPath.replace(/\0+$/, '').trim();
            }
          } catch {}
        }
        if (filePathFromClip && fs.existsSync(filePathFromClip)) {
          const ext = path.extname(filePathFromClip).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'].includes(ext)) {
            const fileImg = nativeImage.createFromPath(filePathFromClip);
            if (fileImg && !fileImg.isEmpty()) {
              if (this.registerCapturedImage(fileImg)) {
                return;
              }
            }
          }
        }
      } catch (fileErr) {
        console.warn('[EasyClip] Error reading image file from clipboard:', fileErr);
      }

      // 3. Try reading text from clipboard
      let text = '';
      try {
        const raw = clipboard.readText();
        const resolved = raw instanceof Promise ? await raw : raw;
        if (typeof resolved === 'string') {
          text = resolved;
        } else if (resolved && typeof (resolved as any).toString === 'function') {
          text = (resolved as any).toString();
        }
      } catch (textErr) {
        console.warn('[EasyClip] Error reading text:', textErr);
      }

      if (typeof text === 'string' && text.trim().length > 0) {
        const topItem = this.items[0];
        const isSameAsTopText = topItem && topItem.type === 'text' && topItem.text === text;

        if (!isSameAsTopText && text !== this.lastText) {
          this.lastText = text;
          this.lastImageHash = ''; // New text resets image hash

          const existingIdx = this.items.findIndex((it) => it.type === 'text' && it.text === text);
          if (existingIdx >= 0) {
            const [existing] = this.items.splice(existingIdx, 1);
            existing.timestamp = Date.now();
            this.items.unshift(existing);
            this.saveToDisk();
            this.notifyRenderer();
            return;
          }

          const lines = text.split(/\r\n|\r|\n/);
          const preview = lines.slice(0, 3).join(' ').trim();
          const id = `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          const newItem: EasyClipItem = {
            id,
            type: 'text',
            text,
            previewText: preview.length > 240 ? preview.substring(0, 240) + '...' : preview,
            lineCount: lines.length,
            charCount: text.length,
            timestamp: Date.now(),
          };

          this.items.unshift(newItem);
          this.pruneItems();
          this.saveToDisk();
          this.notifyRenderer();

          console.log(`[EasyClip] Captured text (${newItem.charCount} chars): ${newItem.previewText}`);
          diagnosticsService.logAction({
            type: 'action',
            title: 'EasyClip: Zachycen nový text ze schránky',
            details: `${newItem.charCount} znaků: ${newItem.previewText}`,
            status: 'info',
          });
        }
      }
    } catch (err) {
      console.warn('[EasyClip] Polling error:', err);
    }
  }

  private pruneItems(): void {
    if (this.items.length > this.maxItems) {
      const removed = this.items.splice(this.maxItems);
      for (const item of removed) {
        if (item.type === 'image' && item.filePath && fs.existsSync(item.filePath)) {
          try {
            fs.unlinkSync(item.filePath);
          } catch {}
        }
      }
    }
  }

  private notifyRenderer(): void {
    if (this.onItemsUpdatedCallback) {
      try {
        this.onItemsUpdatedCallback([...this.items]);
      } catch (err) {
        console.error('[EasyClip] Failed to notify renderer:', err);
      }
    }
  }

  public async getItems(): Promise<EasyClipItem[]> {
    try {
      await this.checkClipboard();
    } catch (err) {
      console.warn('[EasyClip] Failed to check clipboard on getItems:', err);
    }
    return [...this.items];
  }

  public async copyItem(id: string): Promise<boolean> {
    const item = this.items.find((it) => it.id === id);
    if (!item) return false;

    this.isWritingToClipboard = true;
    try {
      if (item.type === 'image') {
        let nativeImg: Electron.NativeImage | null = null;
        if (item.filePath && fs.existsSync(item.filePath)) {
          nativeImg = nativeImage.createFromPath(item.filePath);
        } else if (item.dataUrl) {
          nativeImg = nativeImage.createFromDataURL(item.dataUrl);
        }

        if (nativeImg && !nativeImg.isEmpty()) {
          const size = nativeImg.getSize();
          const buf = nativeImg.toPNG();

          if (typeof ClipboardItem !== 'undefined' && typeof clipboard.write === 'function') {
            const blob = new Blob([new Uint8Array(buf)], { type: 'image/png' });
            const cItem = new ClipboardItem({ 'image/png': blob });
            await clipboard.write([cItem]);
          } else if (typeof (clipboard as any).writeImage === 'function') {
            const res = (clipboard as any).writeImage(nativeImg);
            if (res instanceof Promise) await res;
          }

          this.lastImageHash = `${size.width}x${size.height}_${buf.length}_${buf.subarray(0, 32).toString('hex')}`;
          this.lastText = '';

          this.notificationService?.show({
            type: 'clipboard',
            title: 'Zkopírováno do schránky',
            body: `Obrázek (${item.width || size.width} × ${item.height || size.height} px)`,
          });

          diagnosticsService.logAction({
            type: 'action',
            title: 'EasyClip: Zkopírován obrázek',
            details: `Rozměry: ${item.width || size.width} × ${item.height || size.height} px`,
            status: 'info',
          });
        }
      } else if (item.type === 'text' && item.text) {
        const res = clipboard.writeText(item.text);
        if (res instanceof Promise) await res;
        this.lastText = item.text;
        this.lastImageHash = '';

        const previewSnippet =
          item.text.length > 60 ? `${item.text.substring(0, 60)}...` : item.text;
        this.notificationService?.show({
          type: 'clipboard',
          title: 'Zkopírováno do schránky',
          body: previewSnippet,
        });

        diagnosticsService.logAction({
          type: 'action',
          title: 'EasyClip: Zkopírován text',
          details: `${item.charCount || item.text.length} znaků: ${previewSnippet}`,
          status: 'info',
        });
      }

      // Move to top
      const idx = this.items.indexOf(item);
      if (idx > 0) {
        this.items.splice(idx, 1);
        item.timestamp = Date.now();
        this.items.unshift(item);
        this.saveToDisk();
        this.notifyRenderer();
      }

      return true;
    } catch (err) {
      console.error('[EasyClip] Failed to copy item to clipboard:', err);
      return false;
    } finally {
      setTimeout(() => {
        this.isWritingToClipboard = false;
      }, 500);
    }
  }

  public async copyMultipleItems(ids: string[]): Promise<boolean> {
    if (!ids || ids.length === 0) return false;

    // Filter items matching ids in their current order (newest to oldest, 0 to N)
    const itemMap = new Map(this.items.map((it) => [it.id, it]));
    const selected = ids.map((id) => itemMap.get(id)).filter((it): it is EasyClipItem => Boolean(it));
    if (selected.length === 0) return false;

    // Reverse: bottom item is first, top item is last ("od spodu jako prvni a vrchni jako posledni")
    const reversed = [...selected].reverse();
    const combinedText = reversed
      .map((it) => (it.type === 'text' ? it.text?.trimEnd() || '' : ''))
      .filter((t) => t.length > 0)
      .join('\n');

    if (!combinedText) return false;

    this.isWritingToClipboard = true;
    try {
      const res = clipboard.writeText(combinedText);
      if (res instanceof Promise) await res;
      this.lastText = combinedText;
      this.lastImageHash = '';

      this.notificationService?.show({
        type: 'clipboard',
        title: 'Zkopírováno do schránky',
        body: `${selected.length} položek bylo spojeno (od spodu nahoru) a vloženo do schránky.`,
      });

      diagnosticsService.logAction({
        type: 'action',
        title: 'EasyClip: Spojení a kopírování více položek',
        details: `${selected.length} vybraných položek spojeno odspodu nahoru (${combinedText.length} znaků)`,
        status: 'info',
      });

      return true;
    } catch (err) {
      console.error('[EasyClip] Failed to copy multiple items:', err);
      return false;
    } finally {
      setTimeout(() => {
        this.isWritingToClipboard = false;
      }, 500);
    }
  }

  public deleteItem(id: string): boolean {
    const idx = this.items.findIndex((it) => it.id === id);
    if (idx === -1) return false;

    const [removed] = this.items.splice(idx, 1);
    if (removed.type === 'image' && removed.filePath && fs.existsSync(removed.filePath)) {
      try {
        fs.unlinkSync(removed.filePath);
      } catch {}
    }

    this.saveToDisk();
    this.notifyRenderer();
    return true;
  }

  public deleteMultipleItems(ids: string[]): boolean {
    if (!ids || ids.length === 0) return false;
    const idSet = new Set(ids);
    const toDelete = this.items.filter((it) => idSet.has(it.id));
    for (const item of toDelete) {
      if (item.type === 'image' && item.filePath && fs.existsSync(item.filePath)) {
        try {
          fs.unlinkSync(item.filePath);
        } catch {}
      }
    }
    this.items = this.items.filter((it) => !idSet.has(it.id));
    this.saveToDisk();
    this.notifyRenderer();
    return true;
  }

  public clearHistory(): void {
    // Delete all saved images
    for (const item of this.items) {
      if (item.type === 'image' && item.filePath && fs.existsSync(item.filePath)) {
        try {
          fs.unlinkSync(item.filePath);
        } catch {}
      }
    }

    this.items = [];
    this.saveToDisk();
    this.notifyRenderer();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Verify images exist on disk or retain dataUrls
          this.items = parsed.filter((it: EasyClipItem) => {
            if (it.type === 'image') {
              if (it.filePath && !fs.existsSync(it.filePath) && !it.dataUrl) {
                return false;
              }
            }
            return true;
          });
        }
      }
    } catch (err) {
      console.error('[EasyClip] Failed to load history from disk:', err);
      this.items = [];
    }
  }

  private saveToDisk(): void {
    try {
      // Save items; ensure JSON doesn't fail
      fs.writeFileSync(this.storageFile, JSON.stringify(this.items, null, 2), 'utf-8');
    } catch (err) {
      console.error('[EasyClip] Failed to save history to disk:', err);
    }
  }
}

export const easyClipService = new EasyClipService();
