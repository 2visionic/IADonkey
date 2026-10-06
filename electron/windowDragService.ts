import { app, BrowserWindow, screen, ipcMain, Rectangle } from 'electron';

export interface DragSession {
  gripOffsetX: number;
  gripOffsetY: number;
  width: number;
  height: number;
  wasMaximized: boolean;
  wasSnapped: 'left' | 'right' | null;
  allowMaximize: boolean;
}

export type SnapZone = 'top' | 'left' | 'right' | null;

class WindowDragService {
  private snapPreviewWindow: BrowserWindow | null = null;
  private dragSessions = new Map<number, DragSession>();
  private normalBounds = new Map<number, Rectangle>();
  private windowSnapState = new Map<number, 'left' | 'right' | null>();
  private isInitialized = false;

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Track window events globally for all browser windows
    app.on('browser-window-created', (_event, win) => {
      this.attachWindowListeners(win);
    });

    BrowserWindow.getAllWindows().forEach((win) => {
      this.attachWindowListeners(win);
    });

    ipcMain.handle('start-window-drag', (event, data) => this.handleStartDrag(event, data));
    ipcMain.handle('move-window-drag', (event, data) => this.handleMoveDrag(event, data));
    ipcMain.handle('end-window-drag', (event, data) => this.handleEndDrag(event, data));
  }

  private attachWindowListeners(win: BrowserWindow): void {
    if (this.snapPreviewWindow && win.id === this.snapPreviewWindow.id) return;

    win.on('maximize', () => {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('window-maximize-changed', true);
        }
      } catch {
        // ignore
      }
    });

    win.on('unmaximize', () => {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('window-maximize-changed', false);
        }
      } catch {
        // ignore
      }
    });

    const updateNormalBounds = () => {
      try {
        if (
          !win.isDestroyed() &&
          !win.isMaximized() &&
          !win.isMinimized() &&
          !this.windowSnapState.get(win.id) &&
          !this.dragSessions.has(win.id)
        ) {
          this.normalBounds.set(win.id, win.getBounds());
        }
      } catch {
        // ignore
      }
    };

    win.on('resize', updateNormalBounds);
    win.on('move', updateNormalBounds);

    win.once('ready-to-show', () => {
      try {
        if (!win.isDestroyed() && !win.isMaximized()) {
          this.normalBounds.set(win.id, win.getBounds());
        }
      } catch {
        // ignore
      }
    });

    win.on('closed', () => {
      this.dragSessions.delete(win.id);
      this.normalBounds.delete(win.id);
      this.windowSnapState.delete(win.id);
      this.hideSnapPreview();
    });
  }

  public handleMaximizeToggle(win: BrowserWindow): boolean {
    if (!win || win.isDestroyed()) return false;

    if (win.isMaximized()) {
      win.unmaximize();
      const nb = this.normalBounds.get(win.id);
      if (nb) {
        win.setBounds(nb);
      }
      this.windowSnapState.set(win.id, null);
      try {
        win.webContents.send('window-snap-changed', null);
      } catch {
        // ignore
      }
      return false;
    } else {
      if (!this.windowSnapState.get(win.id)) {
        this.normalBounds.set(win.id, win.getBounds());
      }
      this.windowSnapState.set(win.id, null);
      try {
        win.webContents.send('window-snap-changed', null);
      } catch {
        // ignore
      }
      win.maximize();
      return true;
    }
  }

  private ensureSnapPreviewWindow(): BrowserWindow {
    if (this.snapPreviewWindow && !this.snapPreviewWindow.isDestroyed()) {
      return this.snapPreviewWindow;
    }

    this.snapPreviewWindow = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    });

    this.snapPreviewWindow.setIgnoreMouseEvents(true);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: transparent;
      padding: 6px;
    }
    .preview-box {
      width: 100%;
      height: 100%;
      border-radius: 18px;
      background: rgba(99, 102, 241, 0.18);
      border: 2px solid rgba(129, 140, 248, 0.8);
      box-shadow: 0 0 35px rgba(99, 102, 241, 0.35), inset 0 0 20px rgba(99, 102, 241, 0.15);
      backdrop-filter: blur(4px);
    }
  </style>
</head>
<body>
  <div class="preview-box"></div>
</body>
</html>`;

    this.snapPreviewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return this.snapPreviewWindow;
  }

  private showSnapPreview(rect: Rectangle): void {
    try {
      const preview = this.ensureSnapPreviewWindow();
      const current = preview.getBounds();
      if (
        !preview.isVisible() ||
        current.x !== rect.x ||
        current.y !== rect.y ||
        current.width !== rect.width ||
        current.height !== rect.height
      ) {
        preview.setBounds(rect);
        if (!preview.isVisible()) {
          preview.showInactive();
        }
      }
    } catch {
      // ignore
    }
  }

  private hideSnapPreview(): void {
    try {
      if (this.snapPreviewWindow && !this.snapPreviewWindow.isDestroyed() && this.snapPreviewWindow.isVisible()) {
        this.snapPreviewWindow.hide();
      }
    } catch {
      // ignore
    }
  }

  private hasDisplayAt(x: number, y: number): boolean {
    const displays = screen.getAllDisplays();
    return displays.some((d) => {
      const b = d.bounds;
      return x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height;
    });
  }

  private handleStartDrag(
    event: Electron.IpcMainInvokeEvent,
    data: {
      screenX: number;
      screenY: number;
      gripRatioX: number;
      gripOffsetY: number;
      isMaximized: boolean;
      allowMaximize?: boolean;
    }
  ): void {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    const currentDisplay = screen.getDisplayNearestPoint({ x: data.screenX, y: data.screenY });
    const wa = currentDisplay.workArea;

    const wasMaximized = win.isMaximized();
    const wasSnapped = this.windowSnapState.get(win.id) || null;
    const allowMaximize = data.allowMaximize !== false;

    if (wasMaximized || wasSnapped) {
      let restoredBounds = this.normalBounds.get(win.id);
      if (!restoredBounds || restoredBounds.width >= wa.width || restoredBounds.width < 400) {
        restoredBounds = {
          x: wa.x + Math.round((wa.width - 960) / 2),
          y: wa.y + Math.round((wa.height - 750) / 2),
          width: Math.min(960, Math.round(wa.width * 0.75)),
          height: Math.min(750, Math.round(wa.height * 0.8)),
        };
      }

      if (wasMaximized) {
        win.unmaximize();
        win.webContents.send('window-maximize-changed', false);
      }
      this.windowSnapState.set(win.id, null);
      win.webContents.send('window-snap-changed', null);

      const gripX = Math.round(restoredBounds.width * data.gripRatioX);
      const newX = Math.round(data.screenX - gripX);
      const newY = Math.round(data.screenY - data.gripOffsetY);

      win.setBounds({
        x: newX,
        y: newY,
        width: restoredBounds.width,
        height: restoredBounds.height,
      });

      this.dragSessions.set(win.id, {
        gripOffsetX: gripX,
        gripOffsetY: data.gripOffsetY,
        width: restoredBounds.width,
        height: restoredBounds.height,
        wasMaximized,
        wasSnapped,
        allowMaximize,
      });
    } else {
      const bounds = win.getBounds();
      this.normalBounds.set(win.id, bounds);
      this.dragSessions.set(win.id, {
        gripOffsetX: data.screenX - bounds.x,
        gripOffsetY: data.screenY - bounds.y,
        width: bounds.width,
        height: bounds.height,
        wasMaximized: false,
        wasSnapped: null,
        allowMaximize,
      });
    }
  }

  private handleMoveDrag(
    event: Electron.IpcMainInvokeEvent,
    data: { screenX: number; screenY: number }
  ): { snapZone: SnapZone } {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { snapZone: null };

    const session = this.dragSessions.get(win.id);
    if (!session) return { snapZone: null };

    const targetX = Math.round(data.screenX - session.gripOffsetX);
    const targetY = Math.round(data.screenY - session.gripOffsetY);
    win.setPosition(targetX, targetY);

    if (!win.isResizable()) {
      return { snapZone: null };
    }

    const currentDisplay = screen.getDisplayNearestPoint({ x: data.screenX, y: data.screenY });
    const wa = currentDisplay.workArea;

    let snapZone: SnapZone = null;
    let previewBounds: Rectangle | null = null;

    const snapThreshold = 14;

    // 1. Top edge -> Maximize (if allowed)
    if (session.allowMaximize && data.screenY <= wa.y + snapThreshold) {
      snapZone = 'top';
      previewBounds = {
        x: wa.x + 6,
        y: wa.y + 6,
        width: wa.width - 12,
        height: wa.height - 12,
      };
    }
    // 2. Left edge -> Snap left half
    else if (data.screenX <= wa.x + snapThreshold) {
      const hasLeftMonitor = this.hasDisplayAt(wa.x - 20, data.screenY);
      // If there is an adjacent display on the left, only snap if held tight to edge (<= 4px)
      if (!hasLeftMonitor || data.screenX <= wa.x + 4) {
        snapZone = 'left';
        previewBounds = {
          x: wa.x + 6,
          y: wa.y + 6,
          width: Math.floor(wa.width / 2) - 10,
          height: wa.height - 12,
        };
      }
    }
    // 3. Right edge -> Snap right half
    else if (data.screenX >= wa.x + wa.width - snapThreshold) {
      const hasRightMonitor = this.hasDisplayAt(wa.x + wa.width + 20, data.screenY);
      // If there is an adjacent display on the right, only snap if held tight to edge
      if (!hasRightMonitor || data.screenX >= wa.x + wa.width - 4) {
        snapZone = 'right';
        const halfW = Math.floor(wa.width / 2);
        previewBounds = {
          x: wa.x + (wa.width - halfW) + 4,
          y: wa.y + 6,
          width: halfW - 10,
          height: wa.height - 12,
        };
      }
    }

    if (snapZone && previewBounds) {
      this.showSnapPreview(previewBounds);
    } else {
      this.hideSnapPreview();
    }

    return { snapZone };
  }

  private handleEndDrag(
    event: Electron.IpcMainInvokeEvent,
    data: { screenX: number; screenY: number }
  ): void {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    this.hideSnapPreview();
    const session = this.dragSessions.get(win.id);
    this.dragSessions.delete(win.id);

    if (!session || !win.isResizable()) return;

    const currentDisplay = screen.getDisplayNearestPoint({ x: data.screenX, y: data.screenY });
    const wa = currentDisplay.workArea;

    const snapThreshold = 14;

    if (session.allowMaximize && data.screenY <= wa.y + snapThreshold) {
      this.windowSnapState.set(win.id, null);
      win.maximize();
      win.webContents.send('window-maximize-changed', true);
      win.webContents.send('window-snap-changed', null);
      return;
    }

    if (data.screenX <= wa.x + snapThreshold) {
      const hasLeftMonitor = this.hasDisplayAt(wa.x - 20, data.screenY);
      if (!hasLeftMonitor || data.screenX <= wa.x + 4) {
        const halfW = Math.floor(wa.width / 2);
        win.setBounds({
          x: wa.x,
          y: wa.y,
          width: halfW,
          height: wa.height,
        });
        this.windowSnapState.set(win.id, 'left');
        win.webContents.send('window-maximize-changed', false);
        win.webContents.send('window-snap-changed', 'left');
        return;
      }
    }

    if (data.screenX >= wa.x + wa.width - snapThreshold) {
      const hasRightMonitor = this.hasDisplayAt(wa.x + wa.width + 20, data.screenY);
      if (!hasRightMonitor || data.screenX >= wa.x + wa.width - 4) {
        const halfW = Math.floor(wa.width / 2);
        win.setBounds({
          x: wa.x + (wa.width - halfW),
          y: wa.y,
          width: halfW,
          height: wa.height,
        });
        this.windowSnapState.set(win.id, 'right');
        win.webContents.send('window-maximize-changed', false);
        win.webContents.send('window-snap-changed', 'right');
        return;
      }
    }

    // Dropped in normal area
    this.windowSnapState.set(win.id, null);
    this.normalBounds.set(win.id, win.getBounds());
    win.webContents.send('window-snap-changed', null);
  }
}

export const windowDragService = new WindowDragService();
