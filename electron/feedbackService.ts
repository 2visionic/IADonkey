import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { FeedbackItem, FeedbackPriority, FeedbackStatus, FeedbackType } from '../src/types/feedback';

export class FeedbackService {
  /**
   * Získá výchozí složku pro feedback, pokud není nakonfigurovaná.
   */
  public getDefaultFolderPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.user_data');
    return path.join(userData, 'Feedback');
  }

  /**
   * Zkontroluje a případně vytvoří adresář pro feedback.
   */
  private ensureDirectory(folderPath: string): void {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }

  /**
   * Načte všechny feedbacky ze zadané složky.
   * Každý záznam je samostatný JSON soubor.
   */
  public async listFeedbacks(folderPath?: string): Promise<{ success: boolean; items: FeedbackItem[]; error?: string }> {
    const targetFolder = folderPath?.trim() || this.getDefaultFolderPath();

    if (!fs.existsSync(targetFolder)) {
      return { success: true, items: [] };
    }

    try {
      const files = await fs.promises.readdir(targetFolder);
      const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'));

      const items: FeedbackItem[] = [];

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(targetFolder, file);
          const raw = await fs.promises.readFile(filePath, 'utf-8');
          const parsed = JSON.parse(raw) as FeedbackItem;

          if (parsed && parsed.id) {
            // Ověříme, zda existuje screenshot
            if (parsed.screenshotFilename) {
              const ssPath = path.join(targetFolder, parsed.screenshotFilename);
              parsed.hasScreenshot = fs.existsSync(ssPath);
            }
            items.push(parsed);
          }
        } catch (err) {
          console.warn(`[FeedbackService] Chyba při čtení feedback souboru ${file}:`, err);
        }
      }

      // Seřazení od nejnovějších
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { success: true, items };
    } catch (err: any) {
      console.error('[FeedbackService] Chyba při listování složky feedbacku:', err);
      return { success: false, items: [], error: err?.message || 'Chyba při čtení složky' };
    }
  }

  /**
   * Vytvoří nový feedback a uloží jej atomicky do JSON souboru (případně se screenshotem).
   */
  public async createFeedback(
    folderPath: string,
    data: Partial<FeedbackItem>,
    screenshotBase64?: string
  ): Promise<{ success: boolean; item?: FeedbackItem; error?: string }> {
    const targetFolder = folderPath?.trim() || this.getDefaultFolderPath();

    try {
      this.ensureDirectory(targetFolder);

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const id = `fb_${timestamp}_${randomSuffix}`;
      const nowIso = new Date().toISOString();

      let screenshotFilename: string | undefined;
      let hasScreenshot = false;

      // Uložení screenshotu (pokud byl předán jako base64 nebo cesta k souboru)
      if (screenshotBase64 && screenshotBase64.length > 5) {
        screenshotFilename = `${id}.png`;
        const ssPath = path.join(targetFolder, screenshotFilename);
        const ssTmpPath = `${ssPath}.tmp`;

        if (!screenshotBase64.startsWith('data:') && fs.existsSync(screenshotBase64)) {
          await fs.promises.copyFile(screenshotBase64, ssTmpPath);
          await fs.promises.rename(ssTmpPath, ssPath);
          hasScreenshot = true;
        } else if (screenshotBase64.startsWith('data:') || screenshotBase64.length > 50) {
          const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
          await fs.promises.writeFile(ssTmpPath, Buffer.from(cleanBase64, 'base64'));
          await fs.promises.rename(ssTmpPath, ssPath);
          hasScreenshot = true;
        }
      }

      const item: FeedbackItem = {
        id,
        createdAt: nowIso,
        updatedAt: nowIso,
        author: data.author?.trim() || os.userInfo().username || 'Neznámý',
        authorHost: os.hostname(),
        type: (data.type as FeedbackType) || 'bug',
        title: data.title?.trim() || 'Bez názvu',
        description: data.description?.trim() || '',
        priority: (data.priority as FeedbackPriority) || 'normal',
        status: 'new',
        appVersion: data.appVersion || this.getCurrentVersion(),
        osVersion: `${os.type()} ${os.release()}`,
        hasScreenshot,
        screenshotFilename,
      };

      // Atomický zápis JSONu
      const jsonPath = path.join(targetFolder, `${id}.json`);
      const jsonTmpPath = `${jsonPath}.tmp`;

      await fs.promises.writeFile(jsonTmpPath, JSON.stringify(item, null, 2), 'utf-8');
      await fs.promises.rename(jsonTmpPath, jsonPath);

      return { success: true, item };
    } catch (err: any) {
      console.error('[FeedbackService] Chyba při vytváření feedbacku:', err);
      return { success: false, error: err?.message || 'Chyba při ukládání feedbacku' };
    }
  }

  /**
   * Aktualizuje existující feedback (atomický zápis).
   */
  public async updateFeedback(
    folderPath: string,
    item: FeedbackItem,
    newScreenshotBase64?: string
  ): Promise<{ success: boolean; item?: FeedbackItem; error?: string }> {
    const targetFolder = folderPath?.trim() || this.getDefaultFolderPath();

    try {
      this.ensureDirectory(targetFolder);

      const jsonPath = path.join(targetFolder, `${item.id}.json`);
      if (!fs.existsSync(jsonPath)) {
        return { success: false, error: `Feedback se souborem ${item.id}.json nebyl nalezen.` };
      }

      const nowIso = new Date().toISOString();
      const updatedItem: FeedbackItem = {
        ...item,
        updatedAt: nowIso,
      };

      // Nový screenshot, pokud byl přiložen (base64 nebo cesta k souboru)
      if (newScreenshotBase64 && newScreenshotBase64.length > 5) {
        const screenshotFilename = `${item.id}.png`;
        const ssPath = path.join(targetFolder, screenshotFilename);
        const ssTmpPath = `${ssPath}.tmp`;

        if (!newScreenshotBase64.startsWith('data:') && fs.existsSync(newScreenshotBase64)) {
          await fs.promises.copyFile(newScreenshotBase64, ssTmpPath);
          await fs.promises.rename(ssTmpPath, ssPath);
          updatedItem.screenshotFilename = screenshotFilename;
          updatedItem.hasScreenshot = true;
        } else if (newScreenshotBase64.startsWith('data:') || newScreenshotBase64.length > 50) {
          const cleanBase64 = newScreenshotBase64.replace(/^data:image\/\w+;base64,/, '');
          await fs.promises.writeFile(ssTmpPath, Buffer.from(cleanBase64, 'base64'));
          await fs.promises.rename(ssTmpPath, ssPath);
          updatedItem.screenshotFilename = screenshotFilename;
          updatedItem.hasScreenshot = true;
        }
      }

      // Atomický zápis aktualizovaného JSONu
      const jsonTmpPath = `${jsonPath}.tmp`;
      await fs.promises.writeFile(jsonTmpPath, JSON.stringify(updatedItem, null, 2), 'utf-8');
      await fs.promises.rename(jsonTmpPath, jsonPath);

      return { success: true, item: updatedItem };
    } catch (err: any) {
      console.error('[FeedbackService] Chyba při aktualizaci feedbacku:', err);
      return { success: false, error: err?.message || 'Chyba při aktualizaci' };
    }
  }

  /**
   * Smaže feedback a případný asociovaný screenshot.
   */
  public async deleteFeedback(folderPath: string, feedbackId: string): Promise<{ success: boolean; error?: string }> {
    const targetFolder = folderPath?.trim() || this.getDefaultFolderPath();

    try {
      const cleanId = path.basename(feedbackId).replace(/\.json$/i, '');
      const jsonPath = path.join(targetFolder, `${cleanId}.json`);
      const ssPath = path.join(targetFolder, `${cleanId}.png`);

      let deleted = false;

      if (fs.existsSync(jsonPath)) {
        await fs.promises.unlink(jsonPath);
        deleted = true;
      } else if (fs.existsSync(targetFolder)) {
        const files = await fs.promises.readdir(targetFolder);
        for (const f of files) {
          const fClean = f.replace(/\.json$/i, '');
          if (fClean.toLowerCase() === cleanId.toLowerCase() || f.toLowerCase() === feedbackId.toLowerCase()) {
            await fs.promises.unlink(path.join(targetFolder, f));
            deleted = true;
            break;
          }
        }
      }

      if (fs.existsSync(ssPath)) {
        try {
          await fs.promises.unlink(ssPath);
        } catch {}
      } else if (fs.existsSync(targetFolder)) {
        try {
          const files = await fs.promises.readdir(targetFolder);
          for (const f of files) {
            const fClean = f.replace(/\.png$/i, '');
            if (fClean.toLowerCase() === cleanId.toLowerCase() && f.endsWith('.png')) {
              await fs.promises.unlink(path.join(targetFolder, f));
              break;
            }
          }
        } catch {}
      }

      if (!deleted) {
        console.warn(`[FeedbackService] Soubor ${cleanId}.json nebyl nalezen v ${targetFolder}`);
        return { success: false, error: `Soubor ${cleanId}.json nebyl nalezen ve složce.` };
      }

      return { success: true };
    } catch (err: any) {
      console.error('[FeedbackService] Chyba při mazání feedbacku:', err);
      return { success: false, error: err?.message || 'Chyba při mazání' };
    }
  }

  /**
   * Načte screenshot ze souboru jako data URL.
   */
  public async getScreenshot(
    folderPath: string,
    filename: string
  ): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
    const targetFolder = folderPath?.trim() || this.getDefaultFolderPath();

    try {
      const cleanName = path.basename(filename);
      const ssPath = path.join(targetFolder, cleanName);

      if (!fs.existsSync(ssPath)) {
        return { success: false, error: 'Screenshot soubor neexistuje' };
      }

      const buffer = await fs.promises.readFile(ssPath);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      return { success: true, dataUrl };
    } catch (err: any) {
      console.error('[FeedbackService] Chyba při čtení screenshotu:', err);
      return { success: false, error: err?.message || 'Chyba při čtení obrázku' };
    }
  }

  /**
   * Vrátí aktuální verzi aplikace z Electron app, package.json nebo default.
   */
  public getCurrentVersion(): string {
    try {
      if (app && typeof app.getVersion === 'function') {
        const v = app.getVersion();
        if (v && v !== '0.0.0') return v;
      }
    } catch {}

    try {
      const candidates = [
        path.join(process.cwd(), 'package.json'),
        path.join(__dirname, '..', 'package.json'),
        path.join(__dirname, 'package.json'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
          if (pkg.version) return pkg.version;
        }
      }
    } catch {}
    return '2.1.6';
  }

  /**
   * Spočítá odhadovanou budoucí verzi (patch + 1).
   */
  public getNextVersion(currentVersion?: string): string {
    const v = currentVersion || this.getCurrentVersion();
    const clean = v.replace(/^v/, '').trim();
    const parts = clean.split('.').map((p) => parseInt(p, 10));

    if (parts.length >= 3 && !parts.slice(0, 3).some(isNaN)) {
      return `v${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }
    return `v${clean}.1`;
  }
}

export const feedbackService = new FeedbackService();
