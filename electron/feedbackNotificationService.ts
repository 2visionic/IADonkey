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
  private locallyCreatedIds: Set<string> = new Set();
  private locallyUpdatedIds: Set<string> = new Set();
  private isInitialScanDone = false;
  private currentWatchedFolder: string | null = null;
  private isScanning = false;

  public init(store: AppStore, windowManager: WindowManager): void {
    this.store = store;
    this.windowManager = windowManager;
  }

  public start(): void {
    this.stop();
    // První načtení se zpožděním 3 sekundy po startu aplikace
    setTimeout(() => {
      this.scanFeedbacks().catch((err) => {
        console.error('[FeedbackNotificationService] Initial scan error:', err);
      });
    }, 3000);

    // Periodická kontrola každých 25 sekund (pro spolehlivou detekci i na síťových discích / UNC cestách)
    this.timer = setInterval(() => {
      this.scanFeedbacks().catch((err) => {
        console.error('[FeedbackNotificationService] Periodic scan error:', err);
      });
    }, 25000);

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

  public recordLocalCreation(item: FeedbackItem): void {
    this.locallyCreatedIds.add(item.id);
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

  public recordLocalUpdate(item: FeedbackItem): void {
    this.locallyUpdatedIds.add(item.id);
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
          }, 1000);
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
        return;
      }

      const isDev = this.isDevelopMode();

      for (const item of items) {
        const prev = this.knownFeedbacks.get(item.id);

        if (!prev) {
          // Zbrusu nový feedback
          const isLocal = this.locallyCreatedIds.has(item.id);
          this.locallyCreatedIds.delete(item.id);

          if (!isLocal) {
            if (isDev && item.status === 'new') {
              // Vývojář: nová zpětná vazba od kohokoliv
              this.notifyNewFeedbackForDeveloper(item);
            }
          }
        } else {
          // Existující feedback
          const isLocalUpdate = this.locallyUpdatedIds.has(item.id);
          this.locallyUpdatedIds.delete(item.id);

          if (prev.status !== item.status) {
            if (!isLocalUpdate) {
              if (!isDev) {
                // Běžný uživatel: pouze vlastní zpětné vazby
                if (this.isOwnFeedback(item)) {
                  this.notifyStatusChangeForUser(item, prev.status);
                }
              }
            }
          }
        }

        // Aktualizujeme stav položky v paměti
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
