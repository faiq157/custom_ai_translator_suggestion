import { app, BrowserWindow, ipcMain, Menu, dialog, shell, globalShortcut } from 'electron';
import { spawn } from 'child_process';
import { createServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import SettingsManager from './settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let settingsWindow;
let serverProcess;
let settingsManager;
let SERVER_PORT = 3000;

// Check if server is already running
function isServerRunning(port) {
  return new Promise((resolve) => {
    const tester = createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.close();
        resolve(false);
      })
      .listen(port);
  });
}

// Start the Express server
async function startServer() {
  const serverRunning = await isServerRunning(SERVER_PORT);
  
  if (serverRunning) {
    console.log(`Server already running on port ${SERVER_PORT}`);
    return;
  }

  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'src', 'server.js');
    
    console.log('Starting server from:', serverPath);
    
    // Get settings to pass to server
    const settings = settingsManager.getSettings();
    
    serverProcess = spawn('node', [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: { 
        ...process.env, 
        NODE_ENV: 'production',
        // Pass settings as environment variables
        OPENAI_API_KEY: settings.openai.apiKey,
        OPENAI_MODEL: settings.openai.model,
        WHISPER_MODEL: settings.openai.whisperModel,
        PORT: settings.server.port.toString(),
        AUDIO_SAMPLE_RATE: settings.audio.sampleRate.toString(),
        AUDIO_CHANNELS: settings.audio.channels.toString(),
        AUDIO_DEVICE: settings.audio.device
      },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
      if (data.toString().includes('Server started')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
    });

    // Resolve after 3 seconds if no confirmation message
    setTimeout(() => resolve(), 3000);
  });
}

// Stop the Express server
function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

// Create settings window
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    title: 'Settings - Meeting AI Assistant',
    backgroundColor: '#1a1a2e',
    parent: mainWindow,
    modal: false,
    show: false
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    title: 'Meeting AI Assistant',
    backgroundColor: '#1a1a2e',
    show: false
  });

  // Hide the menu bar
  Menu.setApplicationMenu(null);
  
  // Register global keyboard shortcuts
  // Settings shortcut
  globalShortcut.register('CommandOrControl+,', () => {
    createSettingsWindow();
  });
  
  // Reload shortcut
  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow) {
      mainWindow.reload();
    }
  });
  
  // DevTools shortcut
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });
  
  // Quit shortcut
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });

  // Load the app
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return await dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return await dialog.showOpenDialog(mainWindow, options);
});

// Settings IPC handlers
ipcMain.handle('get-settings', () => {
  return settingsManager.getSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
  const success = settingsManager.updateSettings(settings);
  if (success && mainWindow) {
    mainWindow.webContents.send('settings-changed', settings);
  }
  return success;
});

ipcMain.handle('reset-settings', () => {
  return settingsManager.resetSettings();
});

ipcMain.handle('get-settings-path', () => {
  return settingsManager.getSettingsPath();
});

// Open settings window from renderer
ipcMain.on('open-settings', () => {
  console.log('IPC: open-settings received');
  createSettingsWindow();
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    console.log('Starting Meeting AI Assistant...');
    
    // Initialize settings manager
    settingsManager = new SettingsManager();
    const settings = settingsManager.getSettings();
    SERVER_PORT = settings.server.port;
    
    // Check if API key is configured
    if (!settingsManager.isConfigured()) {
      console.log('First run or API key not configured');
      // We'll still start the app but show settings window
    }
    
    await startServer();
    console.log('Server started successfully');
    createWindow();
    
    // Show settings on first run
    if (settings.firstRun) {
      setTimeout(() => {
        createSettingsWindow();
        settingsManager.completeFirstRun();
      }, 1000);
    }
  } catch (error) {
    console.error('Failed to start application:', error);
    dialog.showErrorBox('Startup Error', `Failed to start the application: ${error.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
  globalShortcut.unregisterAll();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An error occurred: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});
