// Application State Management
export const state = {
    isRecording: false,
    sessionStartTime: null,
    durationInterval: null,
    audioDevices: null,
    selectedAudioDevice: null,
    currentTranscriptions: [],
    currentSuggestions: [],
    mediaRecorder: null,
    audioStream: null,
    recordingChunks: [],
    chunkInterval: null
};

// State getters
export function getState() {
    return state;
}

export function isRecording() {
    return state.isRecording;
}

export function setRecording(value) {
    state.isRecording = value;
}

export function getTranscriptions() {
    return state.currentTranscriptions;
}

export function getSuggestions() {
    return state.currentSuggestions;
}

export function addTranscription(transcription) {
    state.currentTranscriptions.push(transcription);
}

export function addSuggestion(suggestion) {
    state.currentSuggestions.push(suggestion);
}

export function clearTranscriptions() {
    state.currentTranscriptions = [];
}

export function clearSuggestions() {
    state.currentSuggestions = [];
}
