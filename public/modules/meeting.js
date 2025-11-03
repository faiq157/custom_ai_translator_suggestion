// Meeting Summary Module
import { downloadPDF } from './pdf.js';

/**
 * Show meeting summary notification
 */
export function showMeetingSummary(meeting) {
    const toast = document.createElement('div');
    toast.className = 'meeting-summary-toast';
    toast.innerHTML = `
        <div class="summary-content">
            <i class="fas fa-file-pdf summary-icon"></i>
            <div class="summary-text">
                <strong>Meeting Summary Ready!</strong>
                <p>Your meeting has been saved and summarized</p>
            </div>
            <button class="btn btn-primary btn-small" onclick="window.downloadMeetingPDF('${meeting.meetingId}')">
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

// Expose to window for onclick handler
window.downloadMeetingPDF = function(meetingId) {
    downloadPDF(meetingId);
};
