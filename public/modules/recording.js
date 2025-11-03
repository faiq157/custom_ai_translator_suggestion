// Recording Control Module
import { state, setRecording, clearTranscriptions, clearSuggestions as clearSuggestionsState } from './state.js';
import { showToast } from './utils.js';
import { showProcessing, hideProcessing, clearTranscriptionUI, clearSuggestionsUI } from './ui.js';
import { emitStartRecording, emitStopRecording, emitUpdateSettings, emitClearContext, socket } from './socket.js';
import { elements } from './dom.js';

/**
 * Start recording
 */
export async function startRecording() {
    if (state.isRecording) return;
    
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
                emitUpdateSettings(settings);
            } catch (error) {
                console.error('Failed to get settings:', error);
            }
        }
        
        emitStartRecording();
        
        setRecording(true);
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.stopBtn) elements.stopBtn.disabled = false;
        
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

/**
 * Stop recording
 */
export function stopRecording() {
    if (!state.isRecording) return;
    
    setRecording(false);
    
    // Desktop mode only
    emitStopRecording();
    if (elements.startBtn) elements.startBtn.disabled = false;
    if (elements.stopBtn) elements.stopBtn.disabled = true;
    showToast('Recording stopped', 'info');
    hideProcessing();
}

/**
 * Clear transcription data
 */
export function clearTranscription() {
    clearTranscriptions();
    clearTranscriptionUI();
}

/**
 * Clear suggestions data
 */
export function clearSuggestions() {
    clearSuggestionsState(); // Clear state from state.js
    clearSuggestionsUI(); // Clear UI
    emitClearContext(); // Clear context on server
}

/**
 * Clear audio chunks (legacy function)
 */
export function clearAudioChunks() {
    // Audio chunks feature removed for browser-based recording
    // No longer needed since audio is captured in browser
}

/**
 * Send audio chunk to server (legacy function)
 */
export function sendAudioChunk() {
    if (state.recordingChunks.length === 0) return;
    
    const audioBlob = new Blob(state.recordingChunks, { type: 'audio/webm' });
    state.recordingChunks = [];
    
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

/**
 * Toggle audio playback (legacy function)
 */
export function toggleAudio(chunkId, audioUrl) {
    const audio = document.getElementById(`audio-${chunkId}`);
    const playBtn = document.getElementById(`play-${chunkId}`);
    
    if (!audio || !playBtn) return;
    
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
}
