// Main Application Entry Point
import { initializeElements } from './modules/dom.js';
import { setupSocketListeners } from './modules/socket.js';
import { setupEventListeners } from './modules/events.js';
import { toggleAudio } from './modules/recording.js';

/**
 * Initialize the application
 */
function initializeApp() {
    console.log('Initializing Meeting AI Assistant...');
    
    // Initialize DOM elements cache
    initializeElements();
    
    // Setup socket communication
    setupSocketListeners();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('Application initialized successfully');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// Expose toggleAudio to window for legacy audio controls
window.toggleAudio = toggleAudio;
