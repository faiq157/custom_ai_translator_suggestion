// DOM Elements Cache
export const elements = {
    // Buttons
    startBtn: null,
    stopBtn: null,
    clearTranscriptBtn: null,
    clearSuggestionsBtn: null,
    downloadTranscriptBtn: null,
    downloadSuggestionsBtn: null,
    downloadCompleteSummaryBtn: null,
    fullscreenBtn: null,
    settingsBtn: null,
    helpBtn: null,
    closeHelpModal: null,
    
    // Status
    statusIndicator: null,
    statusText: null,
    processingIndicator: null,
    processingText: null,
    
    // Content areas
    transcriptionContent: null,
    suggestionsContent: null,
    suggestionsPanel: null,
    
    // Modals
    helpModal: null,
    
    // Stats
    durationEl: null,
    transcriptionCountEl: null,
    suggestionCountEl: null,
    totalCostEl: null,
    
    // Audio
    audioSourceInfo: null
};

// Initialize DOM elements
export function initializeElements() {
    elements.startBtn = document.getElementById('startBtn');
    elements.stopBtn = document.getElementById('stopBtn');
    elements.statusIndicator = document.getElementById('statusIndicator');
    elements.statusText = elements.statusIndicator?.querySelector('.status-text');
    elements.transcriptionContent = document.getElementById('transcriptionContent');
    elements.suggestionsContent = document.getElementById('suggestionsContent');
    elements.processingIndicator = document.getElementById('processingIndicator');
    elements.processingText = document.getElementById('processingText');
    elements.clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
    elements.clearSuggestionsBtn = document.getElementById('clearSuggestionsBtn');
    elements.downloadTranscriptBtn = document.getElementById('downloadTranscriptBtn');
    elements.downloadSuggestionsBtn = document.getElementById('downloadSuggestionsBtn');
    elements.downloadCompleteSummaryBtn = document.getElementById('downloadCompleteSummaryBtn');
    elements.fullscreenBtn = document.getElementById('fullscreenBtn');
    elements.suggestionsPanel = document.getElementById('suggestionsPanel');
    elements.audioSourceInfo = document.getElementById('audioSourceInfo');
    elements.settingsBtn = document.getElementById('settingsBtn');
    elements.helpBtn = document.getElementById('helpBtn');
    elements.helpModal = document.getElementById('helpModal');
    elements.closeHelpModal = document.getElementById('closeHelpModal');
    
    // Stats elements
    elements.durationEl = document.getElementById('duration');
    elements.transcriptionCountEl = document.getElementById('transcriptionCount');
    elements.suggestionCountEl = document.getElementById('suggestionCount');
    elements.totalCostEl = document.getElementById('totalCost');
}

export function getElements() {
    return elements;
}
