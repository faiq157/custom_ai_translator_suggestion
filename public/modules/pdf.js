// PDF Export Module
import { getTranscriptions, getSuggestions } from './state.js';
import { showToast } from './utils.js';
import { showProcessing, hideProcessing } from './ui.js';

/**
 * Download transcript as PDF
 */
export function downloadTranscriptPDF() {
    const transcriptions = getTranscriptions();
    
    if (transcriptions.length === 0) {
        showToast('No transcriptions to download', 'info');
        return;
    }

    try {
        showProcessing('Generating transcript PDF...');
        
        // Create PDF content
        const content = {
            title: 'Meeting Transcript',
            date: new Date().toLocaleString(),
            transcriptions: transcriptions
        };

        // Send to server to generate PDF
        fetch('/api/export/transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content)
        })
        .then(response => response.blob())
        .then(blob => {
            downloadBlob(blob, `transcript_${Date.now()}.pdf`);
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

/**
 * Download suggestions as PDF
 */
export function downloadSuggestionsPDF() {
    const suggestions = getSuggestions();
    
    if (suggestions.length === 0) {
        showToast('No suggestions to download', 'info');
        return;
    }

    try {
        showProcessing('Generating suggestions PDF...');
        
        // Create PDF content
        const content = {
            title: 'AI Suggestions',
            date: new Date().toLocaleString(),
            suggestions: suggestions
        };

        // Send to server to generate PDF
        fetch('/api/export/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content)
        })
        .then(response => response.blob())
        .then(blob => {
            downloadBlob(blob, `suggestions_${Date.now()}.pdf`);
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

/**
 * Download complete meeting summary as PDF
 */
export function downloadCompleteSummaryPDF() {
    const transcriptions = getTranscriptions();
    const suggestions = getSuggestions();
    
    if (transcriptions.length === 0) {
        showToast('No meeting data to export', 'info');
        return;
    }

    try {
        showProcessing('Generating complete meeting summary with AI...');
        
        // Create PDF content
        const content = {
            title: 'Meeting Summary Report',
            date: new Date().toLocaleString(),
            transcriptions: transcriptions,
            suggestions: suggestions
        };

        // Send to server to generate PDF with AI summary
        fetch('/api/export/complete-meeting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content)
        })
        .then(response => response.blob())
        .then(blob => {
            downloadBlob(blob, `meeting_summary_${Date.now()}.pdf`);
            hideProcessing();
            showToast('Complete meeting summary downloaded successfully! 🎉', 'success');
        })
        .catch(error => {
            console.error('Error downloading complete summary:', error);
            hideProcessing();
            showToast('Failed to download meeting summary', 'error');
        });
    } catch (error) {
        console.error('Error generating complete summary:', error);
        hideProcessing();
        showToast('Failed to generate meeting summary', 'error');
    }
}

/**
 * Helper function to download blob as file
 */
function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

/**
 * Download PDF by meeting ID (called from meeting summary)
 */
export function downloadPDF(meetingId) {
    window.open(`/api/meetings/${meetingId}/pdf`, '_blank');
    showToast('Downloading meeting summary...', 'success');
}
