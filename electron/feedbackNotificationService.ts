import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { FeedbackItem, FeedbackPriority, FeedbackStatus, FeedbackType } from '../src/types/feedback';
import { AppStore } from './store';
import { notificationService } from './notificationService';
import { WindowManager } from './windowManager';
import { feedbackService } from './feedbackService';

interface CachedFeedbackState {
  status: FeedbackStatus;
  updatedAt: string;
  title: string;
  author: string;
  authorHost?: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  targetVersion?: string;
}

export class FeedbackNotificationService {
  private store: AppStore | null = null;
  private windowManager: WindowManager | null = null;
  private timer: NodeJS.Timeout | null = null;
  private fsWatcher: fs.FSWatcher | null = null;
  private knownFeedbacks: Map<string, CachedFeedbackState> = new Map();
  private isInitialScanDone = false;
  private currentWatchedFolder: string | null = null;
  private isScanning = false;

  public init(store: AppStore, windowManager: WindowManager): void {
    this.store = store;
    this.windowManager = windowManager;
  }

  public start(): void {
    this.stop();

    // První načtení hned 1 sekundu po startu
    setTimeout(() => {
      this.scanFeedbacks().catch((err) => {
        console.error('[FeedbackNotificationService] Initial scan error:', err);
      });
    }, 1000);

    // Periodická kontrola každých 10 sekund (pro spolehlivou detekci na síťových discích / UNC cestách)
    this.timer = setInterval(() => {
      this.scanFeedbacks().catch((err) => {
        console.error('[FeedbackNotificationService] Periodic scan error:', err);
      });
    }, 10000);

    this.setupFsWatcher();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fsWatcher) {
      try {
        this.fsWatcher.close();
      } catch {}
      this.fsWatcher = null;
    }
  }

  public restart(): void {
    this.stop();
    this.isInitialScanDone = false;
    this.knownFeedbacks.clear();
    this.start();
  }

  /**
   * Vyvoláno ihned při vytvoření feedbacku v aplikaci.
   * U vývojáře IHNED odešle notifikaci bez jakéhokoliv filtrování na stejnou osobu.
   */
  public onFeedbackCreated(item: FeedbackItem): void {
    console.log('[FeedbackNotificationService] onFeedbackCreated:', item.id, item.title, 'author:', item.author);

    this.knownFeedbacks.set(item.id, {
      status: item.status,
      updatedAt: item.updatedAt,
      title: item.title,
      author: item.author,
      authorHost: item.authorHost,
      type: item.type,
      priority: item.priority,
      targetVersion: item.targetVersion,
    });

    if (this.isDevelopMode() && item.status === 'new') {
      this.notifyNewFeedbackForDeveloper(item);
    }
  }

  /**
   * Vyvoláno ihned při aktualizaci feedbacku v aplikaci.
   */
  public onFeedbackUpdated(item: FeedbackItem): void {
    console.log('[FeedbackNotificationService] onFeedbackUpdated:', item.id, item.title, 'status:', item.status);
    const prev = this.knownFeedbacks.get(item.id);
    const prevStatus = prev?.status;

    this.knownFeedbacks.set(item.id, {
      status: item.status,
      updatedAt: item.updatedAt,
      title: item.title,
      author: item.author,
      authorHost: item.authorHost,
      type: item.type,
      priority: item.priority,
      targetVersion: item.targetVersion,
    });

    if (prevStatus && prevStatus !== item.status) {
      const isDev = this.isDevelopMode();
      if (!isDev || this.isOwnFeedback(item)) {
        this.notifyStatusChangeForUser(item, prevStatus);
      }
    }
  }

  private getTargetFolder(): string {
    const config = this.store?.getConfig();
    return config?.feedback?.sharedFolder?.trim() || feedbackService.getDefaultFolderPath();
  }

  public isDevelopMode(): boolean {
    if (!app.isPackaged) return true;
    const config = this.store?.getConfig();
    return Boolean(config?.developMode);
  }

  public isOwnFeedback(item: FeedbackItem | CachedFeedbackState): boolean {
    const config = this.store?.getConfig();
    const configuredAuthor = (config?.feedback?.authorName || '').trim().toLowerCase();
    const osUser = (os.userInfo()?.username || '').trim().toLowerCase();
    const osHost = (os.hostname() || '').trim().toLowerCase();

    const itemAuthor = (item.author || '').trim().toLowerCase();
    const itemHost = (item.authorHost || '').trim().toLowerCase();

    if (itemHost && osHost && itemHost === osHost) {
      return true;
    }
    if (configuredAuthor && itemAuthor && configuredAuthor === itemAuthor) {
      return true;
    }
    if (osUser && itemAuthor && osUser === itemAuthor) {
      return true;
    }
    return false;
  }

  private setupFsWatcher(): void {
    const targetFolder = this.getTargetFolder();
    if (this.currentWatchedFolder === targetFolder && this.fsWatcher) {
      return;
    }

    if (this.fsWatcher) {
      try {
        this.fsWatcher.close();
      } catch {}
      this.fsWatcher = null;
    }

    this.currentWatchedFolder = targetFolder;

    if (!fs.existsSync(targetFolder)) {
      return;
    }

    try {
      let debounceTimeout: NodeJS.Timeout | null = null;
      this.fsWatcher = fs.watch(targetFolder, (_eventType, filename) => {
        if (filename && filename.endsWith('.json') && !filename.endsWith('.tmp')) {
          if (debounceTimeout) clearTimeout(debounceTimeout);
          debounceTimeout = setTimeout(() => {
            this.scanFeedbacks().catch((err) => {
              console.error('[FeedbackNotificationService] Watch scan error:', err);
            });
          }, 800);
        }
      });
    } catch (err) {
      console.warn('[FeedbackNotificationService] fs.watch not supported or failed on target folder:', err);
    }
  }

  public async scanFeedbacks(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const targetFolder = this.getTargetFolder();

      if (this.currentWatchedFolder !== targetFolder) {
        this.setupFsWatcher();
      }

      if (!fs.existsSync(targetFolder)) {
        return;
      }

      const res = await feedbackService.listFeedbacks(targetFolder);
      if (!res.success || !res.items) {
        return;
      }

      const items = res.items;

      // Pokud jde o úvodní načtení, pouze naplníme stav známých feedbacků bez spouštění notifikací
      if (!this.isInitialScanDone) {
        for (const item of items) {
          this.knownFeedbacks.set(item.id, {
            status: item.status,
            updatedAt: item.updatedAt,
            title: item.title,
            author: item.author,
            authorHost: item.authorHost,
            type: item.type,
            priority: item.priority,
            targetVersion: item.targetVersion,
          });
        }
        this.isInitialScanDone = true;
        console.log('[FeedbackNotificationService] Initial scan completed, indexed items:', items.length);
        return;
      }

      const isDev = this.isDevelopMode();

      for (const item of items) {
        const prev = this.knownFeedbacks.get(item.id);

        if (!prev) {
          // Zbrusu nový feedback nalezený na disku (např. z jiného PC)
          this.knownFeedbacks.set(item.id, {
            status: item.status,
            updatedAt: item.updatedAt,
            title: item.title,
            author: item.author,
            authorHost: item.authorHost,
            type: item.type,
            priority: item.priority,
            targetVersion: item.targetVersion,
          });

          if (isDev && item.status === 'new') {
            this.notifyNewFeedbackForDeveloper(item);
          }
        } else {
          // Existující feedback - kontrola změny stavu
          if (prev.status !== item.status) {
            const oldStatus = prev.status;
            this.knownFeedbacks.set(item.id, {
              status: item.status,
              updatedAt: item.updatedAt,
              title: item.title,
              author: item.author,
              authorHost: item.authorHost,
              type: item.type,
              priority: item.priority,
              targetVersion: item.targetVersion,
            });

            if (!isDev || this.isOwnFeedback(item)) {
              this.notifyStatusChangeForUser(item, oldStatus);
            }
          }
        }
      }
    } finally {
      this.isScanning = false;
    }
  }

  private getPriorityLabel(priority: FeedbackPriority): string {
    switch (priority) {
      case 'critical':
        return 'Kritická';
      case 'high':
        return 'Vysoká';
      case 'low':
        return 'Nízká';
      case 'normal':
      default:
        return 'Normální';
    }
  }

  private notifyNewFeedbackForDeveloper(item: FeedbackItem): void {
    const priorityLabel = this.getPriorityLabel(item.priority);
    const feedbackType = item.type;

    console.log('[FeedbackNotificationService] Notifying developer of new feedback:', item.title, 'author:', item.author, 'priority:', priorityLabel);

    notificationService.show({
      type: 'feedback',
      feedbackType,
      title: `Nová zpětná vazba: ${item.author}`,
      body: `${item.title}\nKritičnost: ${priorityLabel}`,
      onClick: () => {
        this.windowManager?.openFeedbackWindow('dev');
      },
    });
  }

  private notifyStatusChangeForUser(item: FeedbackItem, prevStatus: FeedbackStatus): void {
    console.log('[FeedbackNotificationService] Notifying status change for user:', item.title, 'new status:', item.status, 'prev status:', prevStatus);

    if (item.status === 'in_progress') {
      notificationService.show({
        type: 'feedback',
        feedbackType: item.type,
        title: 'Zpětná vazba ve zpracování',
        body: `Vaše zpětná vazba „${item.title}“ je ve zpracování.`,
        onClick: () => {
          this.windowManager?.openFeedbackWindow('user');
        },
      });
    } else if (item.status === 'postponed') {
      notificationService.show({
        type: 'feedback',
        feedbackType: item.type,
        title: 'Zpětná vazba odložena',
        body: `Vaše zpětná vazba „${item.title}“ byla odložena.`,
        onClick: () => {
          this.windowManager?.openFeedbackWindow('user');
        },
      });
    } else if (item.status === 'new' && prevStatus !== 'new') {
      notificationService.show({
        type: 'feedback',
        feedbackType: item.type,
        title: 'Zpětná vazba znovu otevřena',
        body: `Vaše zpětná vazba „${item.title}“ je znovu otevřena.`,
        onClick: () => {
          this.windowManager?.openFeedbackWindow('user');
        },
      });
    } else if (item.status === 'resolved') {
      const versionSuffix = item.targetVersion ? ` ve verzi ${item.targetVersion}` : '';
      notificationService.show({
        type: 'feedback',
        feedbackType: 'resolved',
        title: 'Zpětná vazba vyřešena',
        body: `Vaše zpětná vazba „${item.title}“ byla vyřešena${versionSuffix}.`,
        onClick: () => {
          this.windowManager?.openFeedbackWindow('user');
        },
      });
    }
  }
}

export const feedbackNotificationService = new FeedbackNotificationService();
