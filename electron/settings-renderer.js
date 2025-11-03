// Settings window renderer script

let currentSettings = {};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadAudioDevices();
    setupTabs();
    setupEventListeners();
    await loadAppInfo();
});

// Load settings from main process
async function loadSettings() {
    try {
        currentSettings = await window.electronAPI.getSettings();
        populateForm(currentSettings);
    } catch (error) {
        showMessage('Error loading settings: ' + error.message, 'error');
    }
}

// Load available audio devices
async function loadAudioDevices() {
    try {
        const response = await fetch('http://localhost:3000/api/devices/audio');
        const data = await response.json();
        
        if (data.success && data.devices) {
            const select = document.getElementById('audioDevice');
            select.innerHTML = ''; // Clear existing options
            
            data.devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device;
                
                if (device === 'auto') {
                    option.textContent = 'Auto-detect (Recommended)';
                } else {
                    option.textContent = device;
                }
                
                select.appendChild(option);
            });
            
            // Set current value
            if (currentSettings.audio?.device) {
                select.value = currentSettings.audio.device;
            }
        }
    } catch (error) {
        console.error('Error loading audio devices:', error);
        // Keep default option if loading fails
    }
}

// Populate form with settings
function populateForm(settings) {
    // OpenAI settings
    document.getElementById('apiKey').value = settings.openai?.apiKey || '';
    document.getElementById('gptModel').value = settings.openai?.model || 'gpt-4';
    document.getElementById('whisperModel').value = settings.openai?.whisperModel || 'whisper-1';
    document.getElementById('temperature').value = settings.openai?.temperature || 0.7;
    document.getElementById('maxTokens').value = settings.openai?.maxTokens || 1000;

    // Audio settings
    document.getElementById('captureMode').value = settings.audio?.captureMode || 'microphone';
    document.getElementById('audioDevice').value = settings.audio?.device || 'default';
    document.getElementById('sampleRate').value = settings.audio?.sampleRate || 16000;
    document.getElementById('channels').value = settings.audio?.channels || 1;
    document.getElementById('autoStart').checked = settings.audio?.autoStart || false;
    
    // VAD settings
    document.getElementById('vadEnabled').checked = settings.audio?.vad?.enabled !== false;
    document.getElementById('vadEnergyThreshold').value = settings.audio?.vad?.energyThreshold || 0.02;
    document.getElementById('vadMinDuration').value = settings.audio?.vad?.minSpeechDuration || 300;

    // Server settings
    document.getElementById('serverPort').value = settings.server?.port || 3000;
    document.getElementById('autoStartServer').checked = settings.server?.autoStartServer !== false;
}

// Save settings
async function saveSettings() {
    try {
        const settings = {
            openai: {
                apiKey: document.getElementById('apiKey').value.trim(),
                model: document.getElementById('gptModel').value,
                whisperModel: document.getElementById('whisperModel').value,
                temperature: parseFloat(document.getElementById('temperature').value),
                maxTokens: parseInt(document.getElementById('maxTokens').value)
            },
            audio: {
                captureMode: document.getElementById('captureMode').value,
                device: document.getElementById('audioDevice').value,
                sampleRate: parseInt(document.getElementById('sampleRate').value),
                channels: parseInt(document.getElementById('channels').value),
                autoStart: document.getElementById('autoStart').checked,
                vad: {
                    enabled: document.getElementById('vadEnabled').checked,
                    energyThreshold: parseFloat(document.getElementById('vadEnergyThreshold').value),
                    minSpeechDuration: parseInt(document.getElementById('vadMinDuration').value)
                }
            },
            server: {
                port: parseInt(document.getElementById('serverPort').value),
                autoStartServer: document.getElementById('autoStartServer').checked
            }
        };

        // Validate API key
        if (!settings.openai.apiKey) {
            showMessage('Please enter your OpenAI API key', 'error');
            switchTab('openai');
            document.getElementById('apiKey').focus();
            return;
        }

        if (!settings.openai.apiKey.startsWith('sk-')) {
            showMessage('Invalid API key format. OpenAI keys start with "sk-"', 'error');
            switchTab('openai');
            document.getElementById('apiKey').focus();
            return;
        }

        // Save settings
        const success = await window.electronAPI.saveSettings(settings);
        
        if (success) {
            showMessage('Settings saved successfully! Restart the app for changes to take effect.', 'success');
            currentSettings = settings;
            
            // Close window after 2 seconds
            setTimeout(() => {
                window.close();
            }, 2000);
        } else {
            showMessage('Failed to save settings', 'error');
        }
    } catch (error) {
        showMessage('Error saving settings: ' + error.message, 'error');
    }
}

// Reset settings to defaults
async function resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
        try {
            const success = await window.electronAPI.resetSettings();
            if (success) {
                showMessage('Settings reset to defaults', 'success');
                await loadSettings();
            } else {
                showMessage('Failed to reset settings', 'error');
            }
        } catch (error) {
            showMessage('Error resetting settings: ' + error.message, 'error');
        }
    }
}

// Test microphone
async function testMicrophone() {
    try {
        showMessage('Testing microphone... Speak now!', 'success');
        
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create audio context to visualize
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        // Check audio levels
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let maxLevel = 0;
        
        const checkLevel = () => {
            analyser.getByteFrequencyData(dataArray);
            const level = Math.max(...dataArray);
            maxLevel = Math.max(maxLevel, level);
        };
        
        const interval = setInterval(checkLevel, 100);
        
        // Stop after 3 seconds
        setTimeout(() => {
            clearInterval(interval);
            stream.getTracks().forEach(track => track.stop());
            audioContext.close();
            
            if (maxLevel > 50) {
                showMessage('Microphone is working! Max level: ' + maxLevel, 'success');
            } else {
                showMessage('Microphone detected but no sound. Please check your mic.', 'error');
            }
        }, 3000);
        
    } catch (error) {
        showMessage('Microphone access denied or not available: ' + error.message, 'error');
    }
}

// Load app info
async function loadAppInfo() {
    try {
        const version = await window.electronAPI.getAppVersion();
        const settingsPath = await window.electronAPI.getSettingsPath();
        
        document.getElementById('appVersion').textContent = version;
        document.getElementById('settingsPath').textContent = settingsPath;
    } catch (error) {
        console.error('Error loading app info:', error);
    }
}

// Show status message
function showMessage(message, type) {
    const messageEl = document.getElementById('statusMessage');
    messageEl.textContent = message;
    messageEl.className = 'status-message ' + type;
    messageEl.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// Setup tabs
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

// Switch tab
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + '-tab').classList.add('active');
}

// Setup event listeners
function setupEventListeners() {
    // Auto-save on Enter key
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveSettings();
            }
        });
    });
}

// Make functions available globally
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;
window.testMicrophone = testMicrophone;
