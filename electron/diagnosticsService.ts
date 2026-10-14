import fs from 'node:fs';
import path from 'node:path';
import { app, shell, dialog } from 'electron';
import type { ActionLogEntry, CrashLogEntry } from '../src/types';

class DiagnosticsService {
  private crashLogDir: string;
  private actionLogs: ActionLogEntry[] = [];
  private maxActionLogs = 150;
  private idCounter = 0;
  private onCrashCallback?: (action: string, error: any, filePath: string) => void;
  private onActionLogCallback?: (logs: ActionLogEntry[]) => void;

  constructor() {
    this.crashLogDir = this.resolveCrashLogDir();
    this.ensureDirectoryExists(this.crashLogDir);
  }

  public setOnActionLogCallback(cb: (logs: ActionLogEntry[]) => void): void {
    this.onActionLogCallback = cb;
  }

  private notifyActionLogsUpdated(): void {
    if (this.onActionLogCallback) {
      try {
        this.onActionLogCallback([...this.actionLogs]);
      } catch {}
    }
  }

  private resolveCrashLogDir(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), 'crashlog');
      }
    } catch {
      // Fallback below
    }
    return path.join(process.cwd(), 'crashlog');
  }

  private ensureDirectoryExists(dir: string): void {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error('[Diagnostics] Failed to create crashlog directory:', err);
    }
  }

  public getCrashLogDirPath(): string {
    this.ensureDirectoryExists(this.crashLogDir);
    return this.crashLogDir;
  }

  /**
   * Log action into memory ring-buffer
   */
  public logAction(
    entry: Omit<ActionLogEntry, 'id' | 'timestamp'> & { timestamp?: string }
  ): ActionLogEntry {
    const id = `act_${Date.now()}_${++this.idCounter}`;
    const timestamp =
      entry.timestamp ||
      new Date().toLocaleString('cs-CZ', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

    const fullEntry: ActionLogEntry = {
      id,
      timestamp,
      type: entry.type,
      title: entry.title,
      details: entry.details,
      status: entry.status,
    };

    this.actionLogs.unshift(fullEntry);
    if (this.actionLogs.length > this.maxActionLogs) {
      this.actionLogs.pop();
    }

    this.notifyActionLogsUpdated();

    return fullEntry;
  }

  public getActionLogs(): ActionLogEntry[] {
    return [...this.actionLogs];
  }

  public clearActionLogs(): void {
    this.actionLogs = [];
    this.logAction({
      type: 'action',
      title: 'Protokol akcí byl vymazán',
      status: 'info',
    });
  }

  /**
   * Record a crash or severe action failure to crashlog/
   */
  public recordCrash(action: string, error: any, context?: Record<string, any>): string {
    const now = new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`;
    const fileName = `crash-${dateStr}.log`;

    this.ensureDirectoryExists(this.crashLogDir);
    const filePath = path.join(this.crashLogDir, fileName);

    const errorMessage = error instanceof Error ? error.message : String(error?.message || error || 'Neznámá chyba');
    const errorStack = error instanceof Error && error.stack ? error.stack : (error?.stack || 'Stack trace není k dispozici');
    const errorCode = error?.code || 'N/A';

    let appVersion = '1.1.17';
    try {
      if (app && typeof app.getVersion === 'function') {
        appVersion = app.getVersion();
      }
    } catch {}

    const localTime = now.toLocaleString('cs-CZ', { hour12: false });
    const isoTime = now.toISOString();

    let contextStr = '';
    if (context && Object.keys(context).length > 0) {
      try {
        contextStr = JSON.stringify(context, null, 2);
      } catch {
        contextStr = String(context);
      }
    }

    const timeline = this.formatActionTimeline(action, errorMessage, localTime);

    const report = [
      '================================================================================',
      '                          IADONKEY CHYBOVÝ CRASHLOG                             ',
      '================================================================================',
      `Datum a čas (místní): ${localTime}`,
      `Datum a čas (ISO):    ${isoTime}`,
      `Verze aplikace:       ${appVersion}`,
      `Prostředí / OS:       ${process.platform} (${process.arch})`,
      `Node / Electron:      Node ${process.versions.node} / Electron ${process.versions.electron}`,
      `Spuštěno z:           ${process.execPath}`,
      `Zabalená aplikace:    ${app ? (app.isPackaged ? 'ANO (Production/Release)' : 'NE (Dev mode)') : 'N/A'}`,
      '--------------------------------------------------------------------------------',
      `Akce / Kontext:       ${action}`,
      `Chybová zpráva:       ${errorMessage}`,
      `Kód chyby:            ${errorCode}`,
      '--------------------------------------------------------------------------------',
      'STACK TRACE:',
      errorStack,
      '--------------------------------------------------------------------------------',
      contextStr ? `DODATEČNÝ KONTEXT / PARAMETRY:\n${contextStr}\n--------------------------------------------------------------------------------` : '',
      'ČASOVÁ OSA POSLEDNÍCH AKCÍ PŘED CHYBOU (ACTION LOG TIMELINE):',
      '(Chronologický sled událostí vedoucích k tomuto pádu/chybě)',
      '--------------------------------------------------------------------------------',
      timeline,
      '================================================================================',
      '',
    ].filter(Boolean).join('\n');

    try {
      fs.writeFileSync(filePath, report, 'utf8');
      console.error(`[Diagnostics] Crash log written to: ${filePath}`);
    } catch (writeErr) {
      console.error(`[Diagnostics] Failed to write crash log to ${filePath}:`, writeErr);
    }

    // Also record in action log as an error
    this.logAction({
      type: 'error',
      title: `Pád/Chyba: ${action}`,
      details: `${errorMessage} (uloženo do ${fileName})`,
      status: 'error',
    });

    if (this.onCrashCallback) {
      try {
        this.onCrashCallback(action, error, filePath);
      } catch (cbErr) {
        console.error('[Diagnostics] Error in onCrashCallback:', cbErr);
      }
    }

    return filePath;
  }

  public setOnCrashCallback(cb: (action: string, error: any, filePath: string) => void): void {
    this.onCrashCallback = cb;
  }

  /**
   * Retrieve all crash logs from crashlog/
   */
  public getCrashLogs(): CrashLogEntry[] {
    this.ensureDirectoryExists(this.crashLogDir);
    const results: CrashLogEntry[] = [];

    try {
      if (!fs.existsSync(this.crashLogDir)) return [];

      const files = fs.readdirSync(this.crashLogDir);
      const logFiles = files.filter((f) => f.endsWith('.log'));

      for (const file of logFiles) {
        const fullPath = path.join(this.crashLogDir, file);
        try {
          const stats = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf8');

          let action = 'Neznámá akce';
          let errorSnippet = 'Chyba';

          const actionMatch = content.match(/Akce \/ Kontext:\s*([^\n]+)/);
          if (actionMatch && actionMatch[1]) {
            action = actionMatch[1].trim();
          }

          const errorMatch = content.match(/Chybová zpráva:\s*([^\n]+)/);
          if (errorMatch && errorMatch[1]) {
            errorSnippet = errorMatch[1].trim();
          }

          results.push({
            id: file,
            fileName: file,
            filePath: fullPath,
            timestamp: stats.mtime.toLocaleString('cs-CZ', { hour12: false }),
            action,
            errorSnippet,
            fullContent: content,
          });
        } catch (e) {
          console.error(`[Diagnostics] Error reading log file ${file}:`, e);
        }
      }

      // Sort newest first
      results.sort((a, b) => b.fileName.localeCompare(a.fileName));
    } catch (err) {
      console.error('[Diagnostics] Failed to read crash log directory:', err);
    }

    return results;
  }

  /**
   * Open crashlog directory in Windows Explorer
   */
  public async openCrashLogFolder(): Promise<void> {
    const dir = this.getCrashLogDirPath();
    await shell.openPath(dir);
  }

  /**
   * Delete all crash log files
   */
  public clearCrashLogs(): void {
    try {
      if (fs.existsSync(this.crashLogDir)) {
        const files = fs.readdirSync(this.crashLogDir);
        for (const file of files) {
          if (file.endsWith('.log')) {
            try {
              fs.unlinkSync(path.join(this.crashLogDir, file));
            } catch {}
          }
        }
      }
      this.logAction({
        type: 'action',
        title: 'Složka crashlog byla vyčištěna',
        status: 'info',
      });
    } catch (err) {
      console.error('[Diagnostics] Failed to clear crash logs:', err);
    }
  }

  /**
   * Format chronological timeline of actions leading up to crash
   */
  public formatActionTimeline(crashAction?: string, crashError?: string, crashTime?: string): string {
    if (this.actionLogs.length === 0) {
      return '  (Před touto chybou nebyly zaznamenány žádné předchozí akce)';
    }

    // Chronological order: oldest first, newest last (just before crash)
    const chronological = [...this.actionLogs].reverse();
    const lines: string[] = [];

    for (const entry of chronological) {
      const typeBadge = `[${entry.type}]`.padEnd(16, ' ');
      const statusIcon = entry.status === 'error' ? '✖' : entry.status === 'warn' ? '▲' : '●';
      lines.push(`  ${statusIcon}  ${entry.timestamp}  ${typeBadge}  ${entry.title}`);
      if (entry.details) {
        lines.push(`                              └─ ${entry.details}`);
      }
    }

    if (crashAction) {
      const timeStr = crashTime || new Date().toLocaleString('cs-CZ', { hour12: false });
      lines.push('  ──────────────────────────────────────────────────────────────────────────────');
      lines.push(`► ✖  ${timeStr}  [CRASH / CHYBA]   ${crashAction}`);
      if (crashError) {
        lines.push(`                              └─ Důvod: ${crashError}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export crash report with action timeline to a chosen destination file
   */
  public async exportCrashReport(fileName: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
    try {
      this.ensureDirectoryExists(this.crashLogDir);
      const safeFileName = path.basename(String(fileName || ''));
      if (!safeFileName) {
        return { success: false, error: 'Neplatný název souboru protokolu.' };
      }
      const sourcePath = path.join(this.crashLogDir, safeFileName);
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: `Protokol ${safeFileName} nebyl nalezen.` };
      }

      let content = fs.readFileSync(sourcePath, 'utf8');

      // If legacy log doesn't contain timeline, append current snapshot
      if (!content.includes('ACTION LOG TIMELINE')) {
        const timeline = this.formatActionTimeline();
        content += `\n\n--------------------------------------------------------------------------------\nČASOVÁ OSA AKCÍ (DODATEČNĚ EXPORTOVÁNO Z AUDIT LOGU):\n--------------------------------------------------------------------------------\n${timeline}\n================================================================================\n`;
      }

      let defaultDir = '';
      try {
        defaultDir = app.getPath('downloads') || app.getPath('desktop') || '';
      } catch {}

      const baseName = safeFileName.replace(/\.log$/i, '');
      const exportFileName = `iadonkey-export-${baseName}.txt`;
      const defaultPath = defaultDir ? path.join(defaultDir, exportFileName) : exportFileName;

      const saveDialogResult = await dialog.showSaveDialog({
        title: 'Exportovat diagnostický protokol chyby a časovou osu akcí',
        defaultPath,
        filters: [
          { name: 'Diagnostický report (*.txt, *.log)', extensions: ['txt', 'log'] },
          { name: 'Všechny soubory (*.*)', extensions: ['*'] },
        ],
      });

      if (saveDialogResult.canceled || !saveDialogResult.filePath) {
        return { success: false, canceled: true };
      }

      fs.writeFileSync(saveDialogResult.filePath, content, 'utf8');

      this.logAction({
        type: 'action',
        title: `Export protokolu ${fileName}`,
        details: `Uloženo do: ${saveDialogResult.filePath}`,
        status: 'success',
      });

      return {
        success: true,
        filePath: saveDialogResult.filePath,
      };
    } catch (err: any) {
      console.error('[Diagnostics] Failed to export crash report:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Hook global process errors to capture unhandled crashes
   */
  public setupGlobalCrashHandlers(): void {
    process.on('uncaughtException', (err) => {
      console.error('[Process] Uncaught Exception:', err);
      this.recordCrash('Globální neošetřená výjimka (uncaughtException)', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
      this.recordCrash('Neošetřené odmítnutí Promise (unhandledRejection)', reason, { promise: String(promise) });
    });
  }
}

export const diagnosticsService = new DiagnosticsService();
