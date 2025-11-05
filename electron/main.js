import { app, BrowserWindow, ipcMain, Menu, dialog, shell, globalShortcut, Tray, nativeImage, screen } from 'electron';
import { spawn } from 'child_process';
import { createServer } from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import SettingsManager from './settings.js';
import MeetingDetector from './meetingDetector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress harmless OpenGL/VSync warnings (these are harmless Chromium messages)
// These warnings occur when Chromium can't determine VSync parameters, which is common on Linux
// They don't affect functionality and can be safely ignored

// Filter console.error to suppress these specific warnings
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.join(' ');
  // Suppress OpenGL/VSync related errors that are harmless
  if (message.includes('GetVSyncParametersIfAvailable') || 
      message.includes('gl_surface_presentation_helper')) {
    return; // Suppress these specific warnings
  }
  originalConsoleError.apply(console, args);
};

// Note: These errors come from Chromium's internal stderr and may still appear in terminal
// They occur when Chromium can't determine VSync parameters (common on Linux)
// These warnings are harmless and don't affect application functionality

let mainWindow;
let settingsWindow;
let floatingWindow;
let serverProcess;
let settingsManager;
let meetingDetector;
let tray;
let SERVER_PORT = 3000;
let isInMeeting = false;

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
    // Determine if we're in development or production
    const isDev = !app.isPackaged;
    
    let serverPath, cwdPath;
    
    if (isDev) {
      // Development mode: server is in project src folder
      serverPath = path.join(__dirname, '..', 'src', 'server.js');
      cwdPath = path.join(__dirname, '..');
      console.log('Running in DEVELOPMENT mode');
    } else {
      // Production mode: server is in app.asar.unpacked
      const resourcesPath = process.resourcesPath;
      serverPath = path.join(resourcesPath, 'app.asar.unpacked', 'src', 'server.js');
      cwdPath = path.join(resourcesPath, 'app.asar.unpacked');
      console.log('Running in PRODUCTION mode');
    }
    
    console.log('Starting server from:', serverPath);
    console.log('Working directory:', cwdPath);
    
    // Verify paths exist
    if (!fs.existsSync(serverPath)) {
      const error = `Server file not found at: ${serverPath}`;
      console.error(error);
      reject(new Error(error));
      return;
    }
    
    // Get settings to pass to server
    const settings = settingsManager.getSettings();
    
    // Get installation directory for SoX binaries
    // In production, resourcesPath is like: C:\Users\...\Meeting AI Assistant\resources
    // Installation directory is the parent: C:\Users\...\Meeting AI Assistant
    const installationDir = isDev 
      ? path.join(__dirname, '..')
      : path.dirname(process.resourcesPath);
    
    serverProcess = spawn('node', [serverPath], {
      cwd: cwdPath,
      env: { 
        ...process.env, 
        NODE_ENV: 'production',
        // Pass installation directory for SoX binaries
        APP_INSTALL_DIR: installationDir,
        APP_RESOURCES_PATH: process.resourcesPath || '',
        // Pass settings as environment variables
        OPENAI_API_KEY: settings.openai.apiKey,
        GPT_MODEL: settings.openai.model || 'gpt-3.5-turbo',
        WHISPER_MODEL: settings.openai.whisperModel,
        PORT: settings.server.port.toString(),
        AUDIO_SAMPLE_RATE: settings.audio.sampleRate.toString(),
        AUDIO_CHANNELS: settings.audio.channels.toString(),
        AUDIO_DEVICE: settings.audio.device,
        // VAD settings
        VAD_ENABLED: settings.audio?.vad?.enabled !== false ? 'true' : 'false',
        VAD_ENERGY_THRESHOLD: (settings.audio?.vad?.energyThreshold || 0.02).toString(),
        VAD_MIN_SPEECH_DURATION: (settings.audio?.vad?.minSpeechDuration || 300).toString(),
        VAD_SILENCE_THRESHOLD: (settings.audio?.vad?.silenceThreshold || 0.003).toString()
      },
      stdio: 'pipe',
      shell: false
    });

    let resolved = false;
    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
      if (!resolved && data.toString().includes('Server started')) {
        resolved = true;
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

    // Resolve after 5 seconds if no confirmation message
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 5000);
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

  const iconPath = getIconPath();
  
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
    icon: iconPath,
    title: 'Settings - Meeting AI Assistant',
    backgroundColor: '#1a1a2e',
    parent: mainWindow,
    modal: false,
    show: false
  });
  
  // Set window icon explicitly
  if (fs.existsSync(iconPath)) {
    try {
      settingsWindow.setIcon(iconPath);
    } catch (error) {
      console.warn('Failed to set settings window icon:', error);
    }
  }

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Create floating suggestion window
function createFloatingWindow() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    console.log('Creating floating window at position:', { x: width - 520, y: 50, width: 500, height: height - 100 });

    const iconPath = getIconPath();
    
    floatingWindow = new BrowserWindow({
      width: 500,
      height: height - 100,
      x: width - 520,
      y: 50,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: false, // Show in taskbar for easier debugging
      resizable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      },
      icon: iconPath,
      backgroundColor: '#1a1a2e',
      show: false
    });
    
    // Set window icon explicitly
    if (fs.existsSync(iconPath)) {
      try {
        floatingWindow.setIcon(iconPath);
      } catch (error) {
        console.warn('Failed to set floating window icon:', error);
      }
    }

    const floatingURL = `http://localhost:${SERVER_PORT}/floating`;
    console.log('Loading floating window URL:', floatingURL);
    
    floatingWindow.loadURL(floatingURL);

    floatingWindow.webContents.on('did-finish-load', () => {
      console.log('Floating window loaded successfully');
    });

    floatingWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Floating window failed to load:', errorCode, errorDescription);
    });

    floatingWindow.on('closed', () => {
      console.log('Floating window closed');
      floatingWindow = null;
    });

    return floatingWindow;
  } catch (error) {
    console.error('Error creating floating window:', error);
    return null;
  }
}

// Get icon path helper
function getIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'public', 'icon.png');
  } else {
    return path.join(__dirname, '..', 'public', 'icon.png');
  }
}

// Create the main application window
function createWindow() {
  const iconPath = getIconPath();
  
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
    icon: iconPath,
    title: 'Meeting AI Assistant',
    backgroundColor: '#1a1a2e',
    show: false
  });
  
  // Set window icon explicitly (works better on Linux)
  if (fs.existsSync(iconPath)) {
    try {
      mainWindow.setIcon(iconPath);
      console.log('Window icon set:', iconPath);
    } catch (error) {
      console.warn('Failed to set window icon:', error);
    }
  } else {
    console.warn('Icon file not found at:', iconPath);
  }

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

  // Wait a bit more before loading to ensure server is ready
  setTimeout(() => {
    // Load the app
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`).catch(err => {
      console.error('Failed to load URL:', err);
    });
  }, 1000);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle load failures with retry
  let retryCount = 0;
  const maxRetries = 5;
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -102 || errorCode === -6) { // ERR_CONNECTION_REFUSED or ERR_CONNECTION_CLOSED
      console.error('Page failed to load:', errorCode, errorDescription);
      
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = 1000 * retryCount; // Increasing delay
        console.log(`Retrying to load page... (attempt ${retryCount}/${maxRetries}) in ${delay}ms`);
        
        setTimeout(() => {
          mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
        }, delay);
      } else {
        console.error('Max retries reached. Server may not have started properly.');
        dialog.showErrorBox('Connection Error', 
          'Could not connect to the application server. Please restart the application.');
      }
    }
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('Main window hidden (minimized to tray)');
    }
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

// Forward transcriptions to floating window
ipcMain.on('transcription', (event, data) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('transcription', data);
  }
});

// Forward AI suggestions to floating window
ipcMain.on('suggestion', (event, data) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('suggestion', data);
  }
});

// Create system tray
function createTray() {
  try {
    const iconPath = getIconPath();
    
    console.log('Tray icon path:', iconPath);
    console.log('Icon exists:', fs.existsSync(iconPath));
    
    let trayIcon;
    if (fs.existsSync(iconPath)) {
      try {
        trayIcon = nativeImage.createFromPath(iconPath);
        if (trayIcon.isEmpty()) {
          console.warn('Tray icon is empty, trying to create from template');
          // Try to create a simple icon if loading fails
          trayIcon = nativeImage.createEmpty();
        } else {
          // Resize for tray - Linux typically needs 22x22 or 24x24
          const size = process.platform === 'linux' ? 22 : 16;
          trayIcon = trayIcon.resize({ width: size, height: size });
          console.log('Tray icon loaded and resized to', size, 'x', size);
        }
      } catch (error) {
        console.error('Failed to load tray icon:', error);
        trayIcon = nativeImage.createEmpty();
      }
    } else {
      console.warn('Tray icon not found at:', iconPath);
      trayIcon = nativeImage.createEmpty();
    }
    
    tray = new Tray(trayIcon);
    console.log('Tray created successfully');
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show App',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          } else {
            createWindow();
          }
        }
      },
      {
        label: 'Settings',
        click: () => createSettingsWindow()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    
    tray.setToolTip('Meeting AI Assistant');
    tray.setContextMenu(contextMenu);
    
    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      } else {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

// Handle meeting detection
function handleMeetingStart(meetingApp) {
  console.log(`Meeting started in ${meetingApp}`);
  
  // Show dialog asking if user wants to use AI assistant
  const response = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['OK', 'Cancel'],
    title: 'Meeting Detected',
    message: `${meetingApp} meeting detected!`,
    detail: 'Would you like to use AI Assistant for this meeting?'
  });
  
  if (response === 0) { // OK clicked
    console.log('User accepted AI Assistant');
    isInMeeting = true;
    
    // Create and show floating window
    if (!floatingWindow) {
      console.log('Creating floating window...');
      createFloatingWindow();
    }
    
    // Wait for window to be ready before showing
    setTimeout(() => {
      if (floatingWindow) {
        console.log('Showing floating window');
        floatingWindow.show();
        floatingWindow.webContents.send('start-meeting', { app: meetingApp });
        
        // Create main window if it doesn't exist (but keep it hidden)
        if (!mainWindow) {
          console.log('Creating main window for auto-start (hidden)...');
          createWindow();
          // Hide it immediately - only floating panel should be visible
          setTimeout(() => {
            if (mainWindow) {
              mainWindow.hide();
            }
          }, 100);
        }
        // Don't show main window - only floating panel should be visible
        
        // Auto-start recording after a delay to ensure page is fully loaded
        setTimeout(() => {
          if (mainWindow && mainWindow.webContents) {
            console.log('Auto-starting recording...');
            mainWindow.webContents.send('auto-start-recording');
            console.log('Auto-start signal sent to main window');
          } else {
            console.error('Main window not available for auto-start');
          }
        }, 3000); // Increased to 3 seconds
      } else {
        console.error('Floating window not created!');
      }
    }, 1000);
  } else {
    console.log('User declined AI Assistant');
  }
}

function handleMeetingEnd(meetingApp) {
  console.log(`Meeting ended in ${meetingApp}`);
  isInMeeting = false;
  
  // Notify floating window to clear suggestions
  if (floatingWindow) {
    floatingWindow.webContents.send('end-meeting', { app: meetingApp });
  }
  
  // Auto-stop recording if active
  if (mainWindow) {
    console.log('Auto-stopping recording...');
    mainWindow.webContents.send('auto-stop-recording');
  }
  
  // Wait a moment for recording to stop, then hide floating window
  setTimeout(() => {
    if (floatingWindow) {
      floatingWindow.hide();
    }
    
    // Show dialog asking about summary download
    const response = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Download Summary', 'No Thanks'],
      title: 'Meeting Ended',
      message: 'Your meeting has ended.',
      detail: 'Would you like to download the meeting summary?'
    });
    
    if (response === 0) { // Download Summary clicked
      // Trigger summary download
      if (mainWindow) {
        mainWindow.webContents.send('download-summary');
        mainWindow.show();
      }
    }
  }, 1000);
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    console.log('Starting Meeting AI Assistant...');
    
    // Set app icon (works better on Linux) - only if method exists
    const iconPath = getIconPath();
    if (fs.existsSync(iconPath) && typeof app.setIcon === 'function') {
      try {
        app.setIcon(iconPath);
        console.log('App icon set:', iconPath);
      } catch (error) {
        console.warn('Failed to set app icon:', error);
      }
    }
    
    // Set app to launch at startup
    if (!app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: false // Disable in development
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true
      });
    }
    
    // Initialize settings manager
    settingsManager = new SettingsManager();
    const settings = settingsManager.getSettings();
    SERVER_PORT = settings.server.port;
    
    // Check if API key is configured
    if (!settingsManager.isConfigured()) {
      console.log('First run or API key not configured');
    }
    
    await startServer();
    console.log('Server started successfully');
    
    // Create system tray
    createTray();
    
    // Initialize meeting detector
    meetingDetector = new MeetingDetector();
    meetingDetector.startMonitoring(handleMeetingStart, handleMeetingEnd);
    
    // Only create main window if not started hidden
    if (!app.getLoginItemSettings().wasOpenedAsHidden) {
      createWindow();
      
      // Show settings on first run
      if (settings.firstRun) {
        setTimeout(() => {
          createSettingsWindow();
          settingsManager.completeFirstRun();
        }, 1000);
      }
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
  // Don't quit on window close - keep running in tray
  if (process.platform !== 'darwin' && !app.isQuitting) {
    // Keep app running in background
    return;
  }
  
  if (meetingDetector) {
    meetingDetector.stopMonitoring();
  }
  stopServer();
  globalShortcut.unregisterAll();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (meetingDetector) {
    meetingDetector.stopMonitoring();
  }
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
