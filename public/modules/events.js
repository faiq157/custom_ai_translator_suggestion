// Event Handlers Module
import { elements } from './dom.js';
import { startRecording, stopRecording, clearTranscription, clearSuggestions } from './recording.js';
import { downloadTranscriptPDF, downloadSuggestionsPDF, downloadCompleteSummaryPDF } from './pdf.js';
import { toggleFullscreen } from './ui.js';
import { state } from './state.js';

/**
 * Setup all event listeners
 */
export function setupEventListeners() {
    // Recording controls
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startRecording);
    }
    if (elements.stopBtn) {
        elements.stopBtn.addEventListener('click', stopRecording);
    }
    
    // Clear buttons
    if (elements.clearTranscriptBtn) {
        elements.clearTranscriptBtn.addEventListener('click', clearTranscription);
    }
    if (elements.clearSuggestionsBtn) {
        elements.clearSuggestionsBtn.addEventListener('click', clearSuggestions);
    }
    
    // Download buttons
    if (elements.downloadTranscriptBtn) {
        elements.downloadTranscriptBtn.addEventListener('click', downloadTranscriptPDF);
    }
    if (elements.downloadSuggestionsBtn) {
        elements.downloadSuggestionsBtn.addEventListener('click', downloadSuggestionsPDF);
    }
    if (elements.downloadCompleteSummaryBtn) {
        elements.downloadCompleteSummaryBtn.addEventListener('click', downloadCompleteSummaryPDF);
    }
    
    // Fullscreen toggle
    if (elements.fullscreenBtn) {
        elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    
    // Settings button
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', handleSettingsClick);
    }
    
    // Help modal
    setupHelpModal();
    
    // Keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Electron auto-start/stop
    setupElectronListeners();
}

/**
 * Handle settings button click
 */
function handleSettingsClick() {
    console.log('Settings button clicked');
    console.log('window.electronAPI:', window.electronAPI);
    console.log('window.isElectron:', window.isElectron);
    
    // Check if running in Electron
    if (window.electronAPI && window.electronAPI.openSettings) {
        console.log('Opening settings via electronAPI');
        try {
            window.electronAPI.openSettings();
        } catch (error) {
            console.error('Error opening settings:', error);
            alert('Error opening settings. Try using Cmd/Ctrl+, keyboard shortcut.');
        }
    } else if (window.isElectron) {
        // For Electron without direct API
        console.log('Electron detected but no API');
        alert('Settings: Please press Cmd/Ctrl+, to open settings');
    } else {
        // For web version, show alert
        console.log('Web version detected');
        alert('Settings are available in the desktop version. In web mode, configure via .env file.');
    }
}

/**
 * Setup help modal
 */
function setupHelpModal() {
    if (elements.helpBtn && elements.helpModal) {
        elements.helpBtn.addEventListener('click', () => {
            elements.helpModal.style.display = 'flex';
        });
    }
    
    if (elements.closeHelpModal && elements.helpModal) {
        elements.closeHelpModal.addEventListener('click', () => {
            elements.helpModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    if (elements.helpModal) {
        elements.helpModal.addEventListener('click', (e) => {
            if (e.target === elements.helpModal) {
                elements.helpModal.style.display = 'none';
            }
        });
    }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC to exit fullscreen
        if (e.key === 'Escape' && elements.suggestionsPanel?.classList.contains('fullscreen')) {
            toggleFullscreen();
        }
        
        // F key to toggle fullscreen
        if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
            const activeElement = document.activeElement;
            if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'SELECT') {
                e.preventDefault();
                toggleFullscreen();
            }
        }
        
        // Ctrl/Cmd + R to start recording
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            if (!state.isRecording) {
                startRecording();
            }
        }
        
        // Ctrl/Cmd + S to stop recording
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (state.isRecording) {
                stopRecording();
            }
        }
    });
}

/**
 * Setup Electron auto-start/stop listeners
 */
function setupElectronListeners() {
    if (window.electronAPI) {
        if (window.electronAPI.onAutoStartRecording) {
            window.electronAPI.onAutoStartRecording(() => {
                console.log('Auto-starting recording from meeting detection');
                if (!state.isRecording) {
                    startRecording();
                }
            });
        }
        
        if (window.electronAPI.onAutoStopRecording) {
            window.electronAPI.onAutoStopRecording(() => {
                console.log('Auto-stopping recording from meeting detection');
                if (state.isRecording) {
                    stopRecording();
                }
            });
        }
    }
}
