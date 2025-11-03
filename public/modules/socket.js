// Socket.io Communication Module
import { state, setRecording, addTranscription as stateAddTranscription, addSuggestion as stateAddSuggestion } from './state.js';
import { addTranscription, addSuggestions, updateStats, showProcessing, hideProcessing, updateStatus, stopDurationTimer, startDurationTimer } from './ui.js';
import { showToast } from './utils.js';
import { showMeetingSummary } from './meeting.js';

// Initialize Socket.io connection
export const socket = io();

/**
 * Setup all socket event listeners
 */
export function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server');
        showToast('Connected to server', 'success');
        updateStatus('Ready', 'ready');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Disconnected from server', 'error');
        updateStatus('Disconnected', 'error');
        if (state.isRecording) {
            // Import dynamically to avoid circular dependency
            import('./recording.js').then(({ stopRecording }) => {
                stopRecording();
            });
        }
    });

    socket.on('recording-started', (data) => {
        console.log('Recording started:', data);
        setRecording(true);
        showToast('Recording started successfully', 'success');
        updateStatus('Recording', 'recording');
        startDurationTimer();
    });

    socket.on('recording-stopped', (data) => {
        console.log('Recording stopped:', data);
        setRecording(false);
        updateStatus('Ready', 'ready');
        stopDurationTimer();
        hideProcessing();
        
        // Show meeting summary notification (disabled)
        // if (data.meeting && data.meeting.meetingId) {
        //     showMeetingSummary(data.meeting);
        // }
        
        showToast('Recording stopped - Meeting summary generated!', 'success');
        
        // Update final stats
        if (data.stats) {
            updateStats(data.stats);
        }
    });

    socket.on('transcription', (data) => {
        // Only show transcription if still recording
        if (!state.isRecording) {
            console.log('Ignoring transcription - recording stopped');
            return;
        }
        console.log('Transcription received:', data);
        addTranscription(data);
        stateAddTranscription({
            text: data.text,
            timestamp: data.timestamp
        });
        
        // Forward to Electron for floating window
        if (window.electronAPI) {
            window.electronAPI.sendTranscription(data.text);
        }
    });

    socket.on('suggestions', (data) => {
        // Only show suggestions if still recording
        if (!state.isRecording) {
            console.log('Ignoring suggestions - recording stopped');
            return;
        }
        console.log('Suggestions received:', data);
        addSuggestions(data);
        stateAddSuggestion({
            questions: data.questions || [],
            resources: data.resources || [],
            actionItems: data.actionItems || [],
            insights: data.insights || [],
            timestamp: data.metadata?.timestamp || new Date().toISOString()
        });
        
        // Forward to Electron for floating window
        if (window.electronAPI) {
            console.log('Forwarding suggestions to floating panel:', data);
            window.electronAPI.sendSuggestion(data);
        }
    });

    socket.on('processing', (data) => {
        // Only show processing indicator if still recording
        if (!state.isRecording) {
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

/**
 * Emit event to start recording
 */
export function emitStartRecording() {
    socket.emit('start-system-recording');
}

/**
 * Emit event to stop recording
 */
export function emitStopRecording() {
    socket.emit('stop-system-recording');
}

/**
 * Update server settings
 */
export function emitUpdateSettings(settings) {
    socket.emit('update-settings', settings);
}

/**
 * Clear context on server
 */
export function emitClearContext() {
    socket.emit('clear-context');
}
