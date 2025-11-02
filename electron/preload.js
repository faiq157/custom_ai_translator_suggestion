const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: (name) => ipcRenderer.invoke('get-app-path', name),
  
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  getSettingsPath: () => ipcRenderer.invoke('get-settings-path'),
  openSettings: () => ipcRenderer.send('open-settings'),
  
  // Dialog methods
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Event listeners
  onNewMeeting: (callback) => {
    ipcRenderer.on('new-meeting', callback);
  },
  onExportTranscript: (callback) => {
    ipcRenderer.on('export-transcript', callback);
  },
  onExportSuggestions: (callback) => {
    ipcRenderer.on('export-suggestions', callback);
  },
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', callback);
  },
  onStartMeeting: (callback) => {
    ipcRenderer.on('start-meeting', (event, data) => callback(data));
  },
  onEndMeeting: (callback) => {
    ipcRenderer.on('end-meeting', (event, data) => callback(data));
  },
  onDownloadSummary: (callback) => {
    ipcRenderer.on('download-summary', callback);
  },
  onTranscription: (callback) => {
    ipcRenderer.on('transcription', (event, text) => callback(text));
  },
  onSuggestion: (callback) => {
    ipcRenderer.on('suggestion', (event, text) => callback(text));
  },
  onAutoStartRecording: (callback) => {
    ipcRenderer.on('auto-start-recording', callback);
  },
  onAutoStopRecording: (callback) => {
    ipcRenderer.on('auto-stop-recording', callback);
  },
  sendTranscription: (text) => {
    ipcRenderer.send('transcription', text);
  },
  sendSuggestion: (text) => {
    ipcRenderer.send('suggestion', text);
  },
  
  // Platform info
  platform: process.platform,
  isElectron: true
});

// Expose a flag to detect if running in Electron
contextBridge.exposeInMainWorld('isElectron', true);

console.log('Preload script loaded successfully');
console.log('Exposed electronAPI with openSettings');
