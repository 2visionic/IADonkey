import { Notification, app, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { diagnosticsService } from './diagnosticsService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedDefaultIcon: string | undefined = undefined;

const resolveNotificationIconFile = (filename: string): string | undefined => {
  const candidates = [
    path.join(__dirname, 'assets/notifications', filename),
    path.join(__dirname, '../electron/assets/notifications', filename),
    path.join(__dirname, '../dist-electron/assets/notifications', filename),
    path.join(process.resourcesPath || '', 'app.asar/electron/assets/notifications', filename),
    path.join(process.resourcesPath || '', 'electron/assets/notifications', filename),
    path.join(process.cwd(), 'electron/assets/notifications', filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
};

const getDefaultIcon = (): string | undefined => {
  if (cachedDefaultIcon && fs.existsSync(cachedDefaultIcon)) {
    return cachedDefaultIcon;
  }
  const candidates = [
    path.join(__dirname, '../electron/assets/icon.png'),
    path.join(__dirname, 'assets/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../electron/assets/icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar/electron/assets/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar/dist/icon.png'),
    path.join(process.cwd(), 'electron/assets/icon.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cachedDefaultIcon = c;
      return c;
    }
  }
  return undefined;
};
const getNotificationIco = (): string | undefined => {
  const candidates = [
    path.join(__dirname, '../electron/assets/icon.ico'),
    path.join(__dirname, 'assets/icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar/electron/assets/icon.ico'),
    path.join(process.resourcesPath || '', 'electron/assets/icon.ico'),
    path.join(process.resourcesPath || '', 'assets/icon.ico'),
    path.join(process.cwd(), 'electron/assets/icon.ico'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
};

export type NotificationType =
  | 'quickCap'
  | 'colorMaster'
  | 'screenRuler'
  | 'syncComplete'
  | 'update'
  | 'clipboard'
  | 'error'
  | 'test'
  | 'magicPlan'
  | 'feedback';

export type NotificationSubType = 'dev' | 'service' | 'completed' | 'critical' | 'queue';

export interface ShowNotificationOptions {
  type: NotificationType;
  subType?: NotificationSubType;
  feedbackType?: 'bug' | 'idea' | 'other' | 'resolved';
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  onClick?: () => void;
  isTest?: boolean;
  mpSituation?: number;
  isCritical?: boolean;
  taskType?: 'dev' | 'service';
}

const getNotificationIcon = (
  type?: NotificationType,
  subType?: NotificationSubType,
  mpSituation?: number,
  isCritical?: boolean,
  taskType?: 'dev' | 'service',
  feedbackType?: 'bug' | 'idea' | 'other' | 'resolved'
): string | undefined => {
  if (type === 'magicPlan') {
    if (mpSituation && mpSituation >= 1 && mpSituation <= 20) {
      const resolvedTaskType = taskType || (subType === 'service' ? 'service' : 'dev');
      const critSuffix = isCritical ? '-crit' : '';
      const fn = `mp-${mpSituation}-${resolvedTaskType}${critSuffix}.png`;
      const p = resolveNotificationIconFile(fn);
      if (p) return p;
    }

    if (subType === 'critical') {
      const p = resolveNotificationIconFile('plan-critical.png');
      if (p) return p;
    } else if (subType === 'completed') {
      const p = resolveNotificationIconFile('plan-completed.png');
      if (p) return p;
    } else if (subType === 'service') {
      const p = resolveNotificationIconFile('plan-service.png');
      if (p) return p;
    } else if (subType === 'queue') {
      const p = resolveNotificationIconFile('plan-queue.png');
      if (p) return p;
    } else {
      const p = resolveNotificationIconFile('plan-dev.png');
      if (p) return p;
    }
  } else if (type === 'quickCap') {
    const p = resolveNotificationIconFile('quickCap.png');
    if (p) return p;
  } else if (type === 'colorMaster') {
    const p = resolveNotificationIconFile('colorMaster.png');
    if (p) return p;
  } else if (type === 'screenRuler') {
    const p = resolveNotificationIconFile('screenRuler.png');
    if (p) return p;
  } else if (type === 'syncComplete') {
    const p = resolveNotificationIconFile('syncComplete.png');
    if (p) return p;
  } else if (type === 'update') {
    const p = resolveNotificationIconFile('update.png');
    if (p) return p;
  } else if (type === 'clipboard') {
    const p = resolveNotificationIconFile('clipboard.png');
    if (p) return p;
  } else if (type === 'error') {
    const p = resolveNotificationIconFile('error.png');
    if (p) return p;
  } else if (type === 'test') {
    const p = resolveNotificationIconFile('test.png');
    if (p) return p;
  } else if (type === 'feedback') {
    if (feedbackType === 'resolved') {
      const p = resolveNotificationIconFile('feedback-resolved.png');
      if (p) return p;
    } else if (feedbackType === 'bug') {
      const p = resolveNotificationIconFile('feedback-bug.png');
      if (p) return p;
    } else if (feedbackType === 'idea') {
      const p = resolveNotificationIconFile('feedback-idea.png');
      if (p) return p;
    } else if (feedbackType === 'other') {
      const p = resolveNotificationIconFile('feedback-other.png');
      if (p) return p;
    }
    const def = resolveNotificationIconFile('feedback-other.png');
    if (def) return def;
  }

  return getDefaultIcon();
};

export class NotificationService {
  private config: any = null;
  private currentNotification: Notification | null = null;

  private cleanupDevShortcut(): void {
    if (app.isPackaged) return;
    try {
      const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      const electronShortcut = path.join(startMenuDir, 'Electron.lnk');
      if (fs.existsSync(electronShortcut)) {
        fs.unlinkSync(electronShortcut);
      }
    } catch {
      // Ignorujeme případnou chybu při mazání
    }
  }

  public init(config: any): void {
    this.config = config;
    if (process.platform === 'win32') {
      const appId = 'com.iadonkey.launcher';
      try {
        app.setAppUserModelId(appId);
      } catch (err) {
        console.error('[NotificationService] Failed to set AppUserModelId:', err);
      }

      // Windows Toast header attribution:
      // Windows 10 a Windows 11 zobrazují v záhlaví toast notifikace (u křížku pro zavření) název
      // a ikonu zástupce v nabídce Start, jehož System.AppUserModel.ID odpovídá nastavenému AUMID
      // a jehož target odpovídá běžícímu spustitelnému souboru (process.execPath).
      try {
        const startMenuDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        const shortcutPath = path.join(startMenuDir, 'IADonkey.lnk');
        const icoPath = getNotificationIco();

        this.cleanupDevShortcut();

        // Ve vývojovém režimu Chromium při odeslání každé notifikace automaticky znovu vytvoří 'Electron.lnk'.
        // Hlídač složky ho okamžitě maže, aby Windows pro běžící proces viděl výhradně zástupce IADonkey.lnk.
        if (!app.isPackaged && fs.existsSync(startMenuDir)) {
          try {
            fs.watch(startMenuDir, (_eventType, filename) => {
              if (filename && filename.toLowerCase() === 'electron.lnk') {
                this.cleanupDevShortcut();
              }
            });
          } catch {
            // silent
          }
        }

        const shortcutOptions: Electron.ShortcutDetails = {
          target: process.execPath,
          description: 'IADonkey Launcher',
          appUserModelId: appId,
          icon: icoPath,
          iconIndex: 0,
        };

        if (fs.existsSync(startMenuDir)) {
          const operation = fs.existsSync(shortcutPath) ? 'replace' : 'create';
          shell.writeShortcutLink(shortcutPath, operation, shortcutOptions);
          console.log('[NotificationService] Registered Start Menu shortcut with AUMID:', appId, 'target:', process.execPath);
        }
      } catch (err) {
        console.warn('[NotificationService] Failed to register/update Start Menu shortcut for AUMID:', err);
      }
    }
  }

  public updateConfig(config: any): void {
    this.config = config;
  }

  public isSupported(): boolean {
    return Notification.isSupported();
  }

  public show(options: ShowNotificationOptions): boolean {
    if (!Notification.isSupported()) {
      console.warn('[NotificationService] Notifications not supported on this platform.');
      return false;
    }

    const notifConfig = this.config?.notifications;

    // Pokud jsou notifikace globálně vypnuté (výchozí stav je povoleno)
    if (notifConfig && notifConfig.enabled === false && options.type !== 'test' && !options.isTest) {
      return false;
    }

    // Specifické filtry dle typu události
    if (notifConfig && options.type !== 'test' && !options.isTest) {
      if (options.type === 'quickCap' && notifConfig.quickCap === false) return false;
      if (options.type === 'colorMaster' && notifConfig.colorMaster === false) return false;
      if (options.type === 'screenRuler' && notifConfig.screenRuler === false) return false;
      if (options.type === 'syncComplete' && notifConfig.syncComplete === false) return false;
      if (options.type === 'update' && notifConfig.updates === false) return false;
      if (options.type === 'clipboard' && notifConfig.clipboard === false) return false;
      if (options.type === 'error' && notifConfig.errors === false) return false;
      if (options.type === 'magicPlan' && notifConfig.magicplan === false) return false;
      if (options.type === 'feedback' && notifConfig.feedback === false) return false;
    }

    // Tichý režim (z konfigurace nebo parametru)
    const isSilent = options.silent !== undefined
      ? options.silent
      : (notifConfig?.silent ?? false);

    // V dev módu před zobrazením odstraníme případný generický zástupce Electron.lnk
    this.cleanupDevShortcut();

    // Pokud ještě visí předchozí notifikace, okamžitě ji zavřeme, aby systém Windows nezařazoval novou notifikaci do fronty se zpožděním
    if (this.currentNotification) {
      try {
        this.currentNotification.close();
      } catch {
        // ignore
      }
      this.currentNotification = null;
    }

    try {
      const iconPath =
        options.icon ||
        getNotificationIcon(
          options.type,
          options.subType,
          options.mpSituation,
          options.isCritical,
          options.taskType,
          options.feedbackType
        );
      const notification = new Notification({
        title: options.title,
        body: options.body,
        icon: iconPath,
        silent: isSilent,
      });

      if (options.onClick) {
        notification.on('click', () => {
          try {
            options.onClick!();
          } catch (err) {
            console.error('[NotificationService] Error executing notification onClick:', err);
          }
        });
      }

      notification.on('failed', (_event, error) => {
        console.warn('[NotificationService] Notification failed:', error);
      });

      notification.on('close', () => {
        if (this.currentNotification === notification) {
          this.currentNotification = null;
        }
      });

      this.currentNotification = notification;
      notification.show();

      // Chromium ve vývojovém režimu vytváří zástupce asynchronně po zobrazení toastu
      setTimeout(() => this.cleanupDevShortcut(), 100);
      setTimeout(() => this.cleanupDevShortcut(), 500);

      diagnosticsService.logAction({
        type: 'action',
        title: `Systémová notifikace: ${options.title}`,
        details: `${options.body} (tichý: ${isSilent ? 'ano' : 'ne'})`,
        status: 'info',
      });

      return true;
    } catch (err: any) {
      console.error('[NotificationService] Error showing notification:', err);
      diagnosticsService.logAction({
        type: 'error',
        title: 'Chyba zobrazení notifikace',
        details: err?.message || String(err),
        status: 'error',
      });
      return false;
    }
  }
}

export const notificationService = new NotificationService();
