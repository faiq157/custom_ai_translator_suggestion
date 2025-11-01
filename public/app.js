// Initialize Socket.io connection
const socket = io();

// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = statusIndicator.querySelector('.status-text');
const transcriptionContent = document.getElementById('transcriptionContent');
const suggestionsContent = document.getElementById('suggestionsContent');
const processingIndicator = document.getElementById('processingIndicator');
const processingText = document.getElementById('processingText');
const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
const clearSuggestionsBtn = document.getElementById('clearSuggestionsBtn');
const downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
const downloadSuggestionsBtn = document.getElementById('downloadSuggestionsBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const suggestionsPanel = document.getElementById('suggestionsPanel');
const audioSourceInfo = document.getElementById('audioSourceInfo');

// Stats elements
const durationEl = document.getElementById('duration');
const transcriptionCountEl = document.getElementById('transcriptionCount');
const suggestionCountEl = document.getElementById('suggestionCount');
const totalCostEl = document.getElementById('totalCost');

// State
let isRecording = false;
let sessionStartTime = null;
let durationInterval = null;
let audioDevices = null;
let selectedAudioDevice = null;
let currentTranscriptions = [];
let currentSuggestions = [];
let mediaRecorder = null;
let audioStream = null;
let recordingChunks = [];
let chunkInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupSocketListeners();
});

// Event Listeners
function setupEventListeners() {
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    clearTranscriptBtn.addEventListener('click', clearTranscription);
    clearSuggestionsBtn.addEventListener('click', clearSuggestions);
    downloadTranscriptBtn.addEventListener('click', downloadTranscriptPDF);
    downloadSuggestionsBtn.addEventListener('click', downloadSuggestionsPDF);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
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
        });
    }
    
    // Help modal
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelpModal = document.getElementById('closeHelpModal');
    
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });
    }
    
    if (closeHelpModal) {
        closeHelpModal.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    if (helpModal) {
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.style.display = 'none';
            }
        });
    }
}

// Socket Listeners
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server');
        showToast('Connected to server', 'success');
        updateStatus('Ready', 'ready');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Disconnected from server', 'error');
        updateStatus('Disconnected', 'error');
        if (isRecording) {
            stopRecording();
        }
    });

    socket.on('recording-started', (data) => {
        console.log('Recording started:', data);
        isRecording = true;
        showToast('Recording started successfully', 'success');
        updateStatus('Recording', 'recording');
        startDurationTimer();
    });

    socket.on('recording-stopped', (data) => {
        console.log('Recording stopped:', data);
        isRecording = false;
        updateStatus('Ready', 'ready');
        stopDurationTimer();
        hideProcessing();
        
        // Show meeting summary notification
        if (data.meeting && data.meeting.meetingId) {
            showMeetingSummary(data.meeting);
        }
        
        showToast('Recording stopped - Meeting summary generated!', 'success');
        
        // Update final stats
        if (data.stats) {
            updateStats(data.stats);
        }
    });

    socket.on('transcription', (data) => {
        // Only show transcription if still recording
        if (!isRecording) {
            console.log('Ignoring transcription - recording stopped');
            return;
        }
        console.log('Transcription received:', data);
        addTranscription(data);
    });

    socket.on('suggestions', (data) => {
        // Only show suggestions if still recording
        if (!isRecording) {
            console.log('Ignoring suggestions - recording stopped');
            return;
        }
        console.log('Suggestions received:', data);
        addSuggestions(data);
    });

    socket.on('processing', (data) => {
        // Only show processing indicator if still recording
        if (!isRecording) {
            console.log('Ignoring processing - recording stopped');
            return;
        }
        console.log('Processing:', data);
        showProcessing(data.message);
    });

    socket.on('stats', (stats) => {
        updateStats(stats);
    });

    socket.on('error', (data) => {
        console.error('Error:', data);
        showToast(data.message || 'An error occurred', 'error');
        hideProcessing();
    });

    socket.on('context-cleared', (data) => {
        showToast('Context cleared', 'info');
    });

}

// Recording Controls
async function startRecording() {
    if (isRecording) return;
    
    try {
        // Desktop mode only
        if (!window.isElectron) {
            showToast('❌ This app only works in desktop mode. Please use the desktop application.', 'error');
            return;
        }
        
        // Use desktop mode
        showProcessing('Starting audio capture...');
        
        // Get user settings from Electron and send to server
        if (window.electronAPI && window.electronAPI.getSettings) {
            try {
                const settings = await window.electronAPI.getSettings();
                socket.emit('update-settings', settings);
            } catch (error) {
                console.error('Failed to get settings:', error);
            }
        }
        
        socket.emit('start-system-recording');
        
        isRecording = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // Clear previous session data
        clearTranscription();
        clearSuggestions();
        clearAudioChunks();
        
        hideProcessing();
        showToast('🎤 Recording started', 'success');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        hideProcessing();
        showToast('❌ Failed to start recording: ' + error.message, 'error');
    }
}

function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    
    // Desktop mode only
    socket.emit('stop-system-recording');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    showToast('Recording stopped', 'info');
    hideProcessing();
}

// Send audio chunk to server
function sendAudioChunk() {
    if (recordingChunks.length === 0) return;
    
    const audioBlob = new Blob(recordingChunks, { type: 'audio/webm' });
    recordingChunks = [];
    
    // Convert to base64 and send via socket
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        socket.emit('audio-data', {
            audio: base64Audio,
            timestamp: new Date().toISOString()
        });
    };
    reader.readAsDataURL(audioBlob);
}

// UI Updates
function updateStatus(text, state) {
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator ' + state;
}

function addTranscription(data) {
    hideProcessing();
    
    // Store transcription for PDF export
    currentTranscriptions.push({
        text: data.text,
        timestamp: data.timestamp
    });
    
    // Remove empty state if present
    const emptyState = transcriptionContent.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const item = document.createElement('div');
    item.className = 'transcription-item';
    
    const time = new Date(data.timestamp).toLocaleTimeString();
    
    item.innerHTML = `
        <div class="transcription-time">${time}</div>
        <div class="transcription-text">${escapeHtml(data.text)}</div>
    `;
    
    transcriptionContent.appendChild(item);
    transcriptionContent.scrollTop = transcriptionContent.scrollHeight;
}

function addSuggestions(data) {
    hideProcessing();
    
    // Store suggestions for PDF export
    currentSuggestions.push({
        questions: data.questions || [],
        resources: data.resources || [],
        actionItems: data.actionItems || [],
        insights: data.insights || [],
        timestamp: data.metadata?.timestamp || new Date().toISOString()
    });
    
    // Remove empty state if present
    const emptyState = suggestionsContent.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const item = document.createElement('div');
    item.className = 'suggestion-item';
    
    let html = '';

    // Questions
    if (data.questions && data.questions.length > 0) {
        html += `
            <div class="suggestion-section">
                <div class="suggestion-title">❓ Questions to Consider</div>
                <ul class="suggestion-list">
                    ${data.questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Resources
    if (data.resources && data.resources.length > 0) {
        html += `
            <div class="suggestion-section">
                <div class="suggestion-title">🔗 Relevant Resources</div>
                <div>
                    ${data.resources.map(r => `
                        <div class="resource-item">
                            <div class="resource-title">
                                <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
                                    ${escapeHtml(r.title)}
                                </a>
                                <span>→</span>
                            </div>
                            ${r.description ? `<div class="resource-description">${escapeHtml(r.description)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Action Items
    if (data.actionItems && data.actionItems.length > 0) {
        html += `
            <div class="suggestion-section">
                <div class="suggestion-title">✅ Action Items</div>
                <ul class="suggestion-list">
                    ${data.actionItems.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Insights
    if (data.insights && data.insights.length > 0) {
        html += `
            <div class="suggestion-section">
                <div class="suggestion-title">💭 Key Insights</div>
                <ul class="suggestion-list">
                    ${data.insights.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Timestamp
    if (data.metadata && data.metadata.timestamp) {
        const time = new Date(data.metadata.timestamp).toLocaleTimeString();
        html += `<div class="suggestion-timestamp">Generated at ${time}</div>`;
    }

    item.innerHTML = html;
    suggestionsContent.appendChild(item);
    suggestionsContent.scrollTop = suggestionsContent.scrollHeight;
}

function updateStats(stats) {
    if (stats.transcription) {
        transcriptionCountEl.textContent = stats.transcription.transcriptionCount || 0;
    }
    
    if (stats.suggestions) {
        suggestionCountEl.textContent = stats.suggestions.suggestionCount || 0;
    }
    
    if (stats.totalCost !== undefined) {
        totalCostEl.textContent = `$${stats.totalCost.toFixed(4)}`;
    }
}

function showProcessing(message) {
    processingText.textContent = message;
    processingIndicator.classList.add('show');
}

function hideProcessing() {
    processingIndicator.classList.remove('show');
}

function clearTranscription() {
    currentTranscriptions = [];
    transcriptionContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-microphone empty-icon"></i>
            <p>Start recording to see live transcription</p>
        </div>
    `;
}

function clearSuggestions() {
    currentSuggestions = [];
    suggestionsContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-robot empty-icon"></i>
            <p>AI suggestions will appear here</p>
        </div>
    `;
    socket.emit('clear-context');
}

function clearAudioChunks() {
    // Audio chunks feature removed for browser-based recording
    // No longer needed since audio is captured in browser
}

function addAudioChunk(data) {
    // Audio chunks feature removed for browser-based recording
    // No longer needed since audio is captured in browser
}

// Audio playback control
window.toggleAudio = function(chunkId, audioUrl) {
    const audio = document.getElementById(`audio-${chunkId}`);
    const playBtn = document.getElementById(`play-${chunkId}`);
    
    if (audio.paused) {
        // Stop all other audio
        document.querySelectorAll('.audio-player').forEach(a => {
            if (a.id !== `audio-${chunkId}`) {
                a.pause();
                a.currentTime = 0;
            }
        });
        
        // Reset all play buttons
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.classList.remove('playing');
        });
        
        // Play this audio
        audio.play();
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playBtn.classList.add('playing');
    } else {
        audio.pause();
        audio.currentTime = 0;
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
    }
    
    // Reset button when audio ends
    audio.onended = function() {
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
    };
};

// Duration Timer
function startDurationTimer() {
    sessionStartTime = Date.now();
    durationInterval = setInterval(() => {
        const elapsed = Date.now() - sessionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        durationEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function stopDurationTimer() {
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// System Check Functions
async function checkSystemDependencies() {
    try {
        showProcessing('Checking system dependencies...');
        
        const response = await fetch('/api/system/check');
        const result = await response.json();
        
        systemCheckResult = result;
        hideProcessing();
        
        console.log('System check result:', result);
        
        if (!result.allInstalled) {
            // Show banner with missing dependencies
            const missing = [];
            for (const [key, dep] of Object.entries(result.dependencies)) {
                if (!dep.installed) {
                    missing.push(dep.name);
                }
            }
            
            bannerMessage.textContent = `Missing: ${missing.join(', ')}. Click to install automatically.`;
            systemCheckBanner.style.display = 'block';
            showToast('Some dependencies are missing', 'error');
        } else {
            systemCheckBanner.style.display = 'none';
            showToast('All dependencies installed ✓', 'success');
        }
        
        // Check permissions
        if (!result.permissions.audioAccess) {
            showToast('Audio permissions may be required', 'info');
        }
        
    } catch (error) {
        console.error('System check error:', error);
        hideProcessing();
        showToast('Failed to check system dependencies', 'error');
    }
}

async function installDependencies() {
    if (!systemCheckResult) {
        showToast('Please check system first', 'error');
        return;
    }
    
    try {
        installDepsBtn.disabled = true;
        installDepsBtn.innerHTML = '<span class="spinner"></span> Installing...';
        
        showProcessing('Installing dependencies... This may take a few minutes.');
        showToast('Installing dependencies. Please wait...', 'info');
        
        const response = await fetch('/api/system/install-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        hideProcessing();
        installDepsBtn.disabled = false;
        installDepsBtn.innerHTML = '<span class="btn-icon">📦</span> Install Dependencies';
        
        console.log('Installation result:', result);
        
        if (result.allSuccess) {
            showToast('All dependencies installed successfully!', 'success');
            systemCheckBanner.style.display = 'none';
            
            // Re-check system
            setTimeout(() => checkSystemDependencies(), 2000);
        } else {
            showToast('Some installations failed. Check console for details.', 'error');
            
            // Show which ones failed
            const failed = result.installed.filter(r => !r.success);
            if (failed.length > 0) {
                console.error('Failed installations:', failed);
            }
        }
        
    } catch (error) {
        console.error('Installation error:', error);
        hideProcessing();
        installDepsBtn.disabled = false;
        installDepsBtn.innerHTML = '<span class="btn-icon">📦</span> Install Dependencies';
        showToast('Installation failed: ' + error.message, 'error');
    }
}

// Audio Device Functions
async function loadAudioDevices() {
    try {
        refreshDevicesBtn.disabled = true;
        audioSourceSelect.innerHTML = '<option value="">Loading...</option>';
        
        const response = await fetch('/api/audio/devices');
        const data = await response.json();
        
        audioDevices = data;
        
        // Clear and populate select
        audioSourceSelect.innerHTML = '';
        
        if (data.sources.length === 0) {
            audioSourceSelect.innerHTML = '<option value="">No audio devices found</option>';
            updateAudioSourceInfo('No audio devices detected', 'warning');
            return;
        }
        
        // Add options
        data.sources.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            
            // Mark recommended
            if (device.recommended) {
                option.textContent += ' (Recommended for meetings)';
                option.selected = true;
                selectedAudioDevice = device.id;
            }
            
            audioSourceSelect.appendChild(option);
        });
        
        // Set initial description
        if (selectedAudioDevice) {
            const device = data.sources.find(d => d.id === selectedAudioDevice);
            updateAudioSourceInfo(
                device.type === 'system_audio' 
                    ? '✅ Captures ALL meeting participants (your voice + others)'
                    : '⚠️ Only captures your microphone (not other participants)',
                device.type === 'system_audio' ? 'success' : 'warning'
            );
        }
        
        refreshDevicesBtn.disabled = false;
        
    } catch (error) {
        console.error('Error loading audio devices:', error);
        audioSourceSelect.innerHTML = '<option value="">Error loading devices</option>';
        updateAudioSourceInfo('Failed to load audio devices', 'warning');
        refreshDevicesBtn.disabled = false;
    }
}

async function handleAudioSourceChange() {
    const deviceId = audioSourceSelect.value;
    
    if (!deviceId || !audioDevices) return;
    
    const device = audioDevices.sources.find(d => d.id === deviceId);
    
    if (!device) return;
    
    try {
        // Update backend
        const response = await fetch('/api/audio/device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            selectedAudioDevice = deviceId;
            
            // Update info
            if (device.type === 'system_audio') {
                updateAudioSourceInfo(
                    '✅ Captures ALL meeting participants (your voice + others)',
                    'success'
                );
                showToast('Audio source updated: Will capture all meeting audio', 'success');
            } else {
                updateAudioSourceInfo(
                    '⚠️ Only captures your microphone (not other participants)',
                    'warning'
                );
                showToast('Audio source updated: Microphone only', 'info');
            }
        }
        
    } catch (error) {
        console.error('Error setting audio device:', error);
        showToast('Failed to update audio source', 'error');
    }
}

function updateAudioSourceInfo(message, type = 'info') {
    audioSourceDescription.textContent = message;
    audioSourceInfo.className = 'audio-source-info ' + type;
}

// Meeting Summary
function showMeetingSummary(meeting) {
    const toast = document.createElement('div');
    toast.className = 'meeting-summary-toast';
    toast.innerHTML = `
        <div class="summary-content">
            <i class="fas fa-file-pdf summary-icon"></i>
            <div class="summary-text">
                <strong>Meeting Summary Ready!</strong>
                <p>Your meeting has been saved and summarized</p>
            </div>
            <button class="btn btn-primary btn-small" onclick="downloadPDF('${meeting.meetingId}')">
                <i class="fas fa-download"></i> Download PDF
            </button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        toast.remove();
    }, 10000);
}

window.downloadPDF = function(meetingId) {
    window.open(`/api/meetings/${meetingId}/pdf`, '_blank');
    showToast('Downloading meeting summary...', 'success');
};

// Fullscreen Toggle
function toggleFullscreen() {
    const isFullscreen = suggestionsPanel.classList.contains('fullscreen');
    
    if (isFullscreen) {
        // Exit fullscreen
        suggestionsPanel.classList.remove('fullscreen');
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.title = 'View in fullscreen';
        
        // Remove backdrop
        const backdrop = document.querySelector('.fullscreen-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
    } else {
        // Enter fullscreen
        suggestionsPanel.classList.add('fullscreen');
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        fullscreenBtn.title = 'Exit fullscreen';
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'fullscreen-backdrop';
        backdrop.addEventListener('click', toggleFullscreen);
        document.body.appendChild(backdrop);
    }
}

// PDF Download Functions
function downloadTranscriptPDF() {
    if (currentTranscriptions.length === 0) {
        showToast('No transcriptions to download', 'info');
        return;
    }

    try {
        showProcessing('Generating transcript PDF...');
        
        // Create PDF content
        const content = {
            title: 'Meeting Transcript',
            date: new Date().toLocaleString(),
            transcriptions: currentTranscriptions
        };

        // Send to server to generate PDF
        fetch('/api/export/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content)
        })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcript_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            hideProcessing();
            showToast('Transcript PDF downloaded successfully!', 'success');
        })
        .catch(error => {
            console.error('Error downloading transcript:', error);
            hideProcessing();
            showToast('Failed to download transcript PDF', 'error');
        });
    } catch (error) {
        console.error('Error generating transcript PDF:', error);
        hideProcessing();
        showToast('Failed to generate transcript PDF', 'error');
    }
}

function downloadSuggestionsPDF() {
    if (currentSuggestions.length === 0) {
        showToast('No suggestions to download', 'info');
        return;
    }

    try {
        showProcessing('Generating suggestions PDF...');
        
        // Create PDF content
        const content = {
            title: 'AI Suggestions',
            date: new Date().toLocaleString(),
            suggestions: currentSuggestions
        };

        // Send to server to generate PDF
        fetch('/api/export/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content)
        })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `suggestions_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            hideProcessing();
            showToast('Suggestions PDF downloaded successfully!', 'success');
        })
        .catch(error => {
            console.error('Error downloading suggestions:', error);
            hideProcessing();
            showToast('Failed to download suggestions PDF', 'error');
        });
    } catch (error) {
        console.error('Error generating suggestions PDF:', error);
        hideProcessing();
        showToast('Failed to generate suggestions PDF', 'error');
    }
}

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // ESC to exit fullscreen
    if (e.key === 'Escape' && suggestionsPanel.classList.contains('fullscreen')) {
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
        if (!isRecording) {
            startRecording();
        }
    }
    
    // Ctrl/Cmd + S to stop recording
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isRecording) {
            stopRecording();
        }
    }
});
