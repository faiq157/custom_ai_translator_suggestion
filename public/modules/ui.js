// UI Update Functions
import { elements } from './dom.js';
import { state } from './state.js';
import { escapeHtml, formatDuration } from './utils.js';

/**
 * Update status indicator
 */
export function updateStatus(text, statusState) {
    if (elements.statusText) {
        elements.statusText.textContent = text;
    }
    if (elements.statusIndicator) {
        elements.statusIndicator.className = 'status-indicator ' + statusState;
    }
}

/**
 * Show processing indicator
 */
export function showProcessing(message) {
    if (elements.processingText) {
        elements.processingText.textContent = message;
    }
    if (elements.processingIndicator) {
        elements.processingIndicator.classList.add('show');
    }
}

/**
 * Hide processing indicator
 */
export function hideProcessing() {
    if (elements.processingIndicator) {
        elements.processingIndicator.classList.remove('show');
    }
}

/**
 * Add transcription to UI
 */
export function addTranscription(data) {
    hideProcessing();
    
    if (!elements.transcriptionContent) return;
    
    // Remove empty state if present
    const emptyState = elements.transcriptionContent.querySelector('.empty-state');
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
    
    elements.transcriptionContent.appendChild(item);
    elements.transcriptionContent.scrollTop = elements.transcriptionContent.scrollHeight;
}

/**
 * Add suggestions to UI
 */
export function addSuggestions(data) {
    hideProcessing();
    
    if (!elements.suggestionsContent) return;
    
    // Remove empty state if present
    const emptyState = elements.suggestionsContent.querySelector('.empty-state');
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
    elements.suggestionsContent.appendChild(item);
    elements.suggestionsContent.scrollTop = elements.suggestionsContent.scrollHeight;
}

/**
 * Update statistics display
 */
export function updateStats(stats) {
    if (stats.transcription && elements.transcriptionCountEl) {
        elements.transcriptionCountEl.textContent = stats.transcription.transcriptionCount || 0;
    }
    
    if (stats.suggestions && elements.suggestionCountEl) {
        elements.suggestionCountEl.textContent = stats.suggestions.suggestionCount || 0;
    }
    
    if (stats.totalCost !== undefined && elements.totalCostEl) {
        elements.totalCostEl.textContent = `$${stats.totalCost.toFixed(4)}`;
    }
}

/**
 * Clear transcription display
 */
export function clearTranscriptionUI() {
    if (!elements.transcriptionContent) return;
    
    elements.transcriptionContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-microphone empty-icon"></i>
            <p>Start recording to see live transcription</p>
        </div>
    `;
}

/**
 * Clear suggestions display
 */
export function clearSuggestionsUI() {
    if (!elements.suggestionsContent) return;
    
    elements.suggestionsContent.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-robot empty-icon"></i>
            <p>AI suggestions will appear here</p>
        </div>
    `;
}

/**
 * Start duration timer
 */
export function startDurationTimer() {
    state.sessionStartTime = Date.now();
    state.durationInterval = setInterval(() => {
        const elapsed = Date.now() - state.sessionStartTime;
        if (elements.durationEl) {
            elements.durationEl.textContent = formatDuration(elapsed);
        }
    }, 1000);
}

/**
 * Stop duration timer
 */
export function stopDurationTimer() {
    if (state.durationInterval) {
        clearInterval(state.durationInterval);
        state.durationInterval = null;
    }
}

/**
 * Toggle fullscreen mode for suggestions panel
 */
export function toggleFullscreen() {
    if (!elements.suggestionsPanel || !elements.fullscreenBtn) return;
    
    const isFullscreen = elements.suggestionsPanel.classList.contains('fullscreen');
    
    if (isFullscreen) {
        // Exit fullscreen
        elements.suggestionsPanel.classList.remove('fullscreen');
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        elements.fullscreenBtn.title = 'View in fullscreen';
        
        // Remove backdrop
        const backdrop = document.querySelector('.fullscreen-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
    } else {
        // Enter fullscreen
        elements.suggestionsPanel.classList.add('fullscreen');
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        elements.fullscreenBtn.title = 'Exit fullscreen';
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'fullscreen-backdrop';
        backdrop.addEventListener('click', toggleFullscreen);
        document.body.appendChild(backdrop);
    }
}
