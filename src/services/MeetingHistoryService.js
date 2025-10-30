import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import logger from '../config/logger.js';

class MeetingHistoryService {
  constructor() {
    this.currentMeeting = null;
    this.meetingsDir = path.join(process.cwd(), 'meetings');
    this._ensureMeetingsDir();
  }

  _ensureMeetingsDir() {
    if (!fs.existsSync(this.meetingsDir)) {
      fs.mkdirSync(this.meetingsDir, { recursive: true });
      logger.info('Created meetings directory', { path: this.meetingsDir });
    }
  }

  startMeeting() {
    const timestamp = new Date();
    this.currentMeeting = {
      id: Date.now(),
      startTime: timestamp.toISOString(),
      transcriptions: [],
      suggestions: [],
      metadata: {
        duration: 0,
        totalChunks: 0,
        totalCost: 0
      }
    };
    
    logger.info('Meeting started', { meetingId: this.currentMeeting.id });
    return this.currentMeeting.id;
  }

  addTranscription(text, timestamp) {
    if (!this.currentMeeting) return;
    
    this.currentMeeting.transcriptions.push({
      text,
      timestamp: timestamp || new Date().toISOString()
    });
  }

  addSuggestion(suggestion) {
    if (!this.currentMeeting) return;
    
    this.currentMeeting.suggestions.push({
      ...suggestion,
      timestamp: new Date().toISOString()
    });
  }

  updateMetadata(metadata) {
    if (!this.currentMeeting) return;
    
    this.currentMeeting.metadata = {
      ...this.currentMeeting.metadata,
      ...metadata
    };
  }

  async endMeeting() {
    if (!this.currentMeeting) {
      logger.warn('No active meeting to end');
      return null;
    }

    this.currentMeeting.endTime = new Date().toISOString();
    
    // Calculate duration
    const start = new Date(this.currentMeeting.startTime);
    const end = new Date(this.currentMeeting.endTime);
    this.currentMeeting.metadata.duration = Math.floor((end - start) / 1000);

    // Save meeting data as JSON
    const jsonPath = path.join(
      this.meetingsDir, 
      `meeting_${this.currentMeeting.id}.json`
    );
    
    fs.writeFileSync(jsonPath, JSON.stringify(this.currentMeeting, null, 2));
    logger.info('Meeting data saved', { path: jsonPath });

    // Generate PDF
    const pdfPath = await this.generatePDF(this.currentMeeting);
    
    const meetingData = { ...this.currentMeeting };
    this.currentMeeting = null;
    
    return {
      meetingId: meetingData.id,
      jsonPath,
      pdfPath
    };
  }

  async generatePDF(meeting) {
    return new Promise((resolve, reject) => {
      const pdfPath = path.join(
        this.meetingsDir,
        `meeting_${meeting.id}.pdf`
      );

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(pdfPath);

      doc.pipe(stream);

      // Header
      doc.fontSize(24)
         .fillColor('#6366f1')
         .text('Meeting Summary', { align: 'center' });
      
      doc.moveDown();
      
      // Meeting Info
      doc.fontSize(12)
         .fillColor('#000000')
         .text(`Meeting ID: ${meeting.id}`, { align: 'left' });
      
      doc.text(`Date: ${new Date(meeting.startTime).toLocaleString()}`);
      doc.text(`Duration: ${this._formatDuration(meeting.metadata.duration)}`);
      doc.text(`Total Cost: $${meeting.metadata.totalCost.toFixed(4)}`);
      
      doc.moveDown(2);

      // Transcription Section
      doc.fontSize(18)
         .fillColor('#6366f1')
         .text('📝 Transcription', { underline: true });
      
      doc.moveDown();

      if (meeting.transcriptions.length > 0) {
        doc.fontSize(11)
           .fillColor('#000000');
        
        meeting.transcriptions.forEach((trans, index) => {
          const time = new Date(trans.timestamp).toLocaleTimeString();
          doc.fontSize(9)
             .fillColor('#666666')
             .text(`[${time}]`, { continued: true })
             .fontSize(11)
             .fillColor('#000000')
             .text(` ${trans.text}`);
          doc.moveDown(0.5);
        });
      } else {
        doc.fontSize(11)
           .fillColor('#666666')
           .text('No transcriptions recorded.');
      }

      doc.moveDown(2);

      // AI Suggestions Section
      doc.fontSize(18)
         .fillColor('#6366f1')
         .text('💡 AI Suggestions', { underline: true });
      
      doc.moveDown();

      if (meeting.suggestions.length > 0) {
        meeting.suggestions.forEach((suggestion, index) => {
          // Questions
          if (suggestion.questions && suggestion.questions.length > 0) {
            doc.fontSize(14)
               .fillColor('#000000')
               .text('❓ Questions to Consider:');
            doc.moveDown(0.3);
            
            suggestion.questions.forEach(q => {
              doc.fontSize(11)
                 .fillColor('#333333')
                 .text(`• ${q}`, { indent: 20 });
            });
            doc.moveDown();
          }

          // Resources
          if (suggestion.resources && suggestion.resources.length > 0) {
            doc.fontSize(14)
               .fillColor('#000000')
               .text('🔗 Relevant Resources:');
            doc.moveDown(0.3);
            
            suggestion.resources.forEach(r => {
              doc.fontSize(11)
                 .fillColor('#333333')
                 .text(`• ${r}`, { indent: 20 });
            });
            doc.moveDown();
          }

          // Action Items
          if (suggestion.actionItems && suggestion.actionItems.length > 0) {
            doc.fontSize(14)
               .fillColor('#000000')
               .text('✅ Action Items:');
            doc.moveDown(0.3);
            
            suggestion.actionItems.forEach(a => {
              doc.fontSize(11)
                 .fillColor('#333333')
                 .text(`• ${a}`, { indent: 20 });
            });
            doc.moveDown();
          }

          // Key Insights
          if (suggestion.keyInsights && suggestion.keyInsights.length > 0) {
            doc.fontSize(14)
               .fillColor('#000000')
               .text('💭 Key Insights:');
            doc.moveDown(0.3);
            
            suggestion.keyInsights.forEach(k => {
              doc.fontSize(11)
                 .fillColor('#333333')
                 .text(`• ${k}`, { indent: 20 });
            });
            doc.moveDown();
          }

          doc.moveDown();
        });
      } else {
        doc.fontSize(11)
           .fillColor('#666666')
           .text('No AI suggestions generated.');
      }

      // Footer
      doc.moveDown(3);
      doc.fontSize(9)
         .fillColor('#999999')
         .text(
           `Generated by Meeting AI Assistant on ${new Date().toLocaleString()}`,
           { align: 'center' }
         );

      doc.end();

      stream.on('finish', () => {
        logger.info('PDF generated', { path: pdfPath });
        resolve(pdfPath);
      });

      stream.on('error', (err) => {
        logger.error('PDF generation error', { error: err.message });
        reject(err);
      });
    });
  }

  _formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  getCurrentMeeting() {
    return this.currentMeeting;
  }

  listMeetings() {
    try {
      const files = fs.readdirSync(this.meetingsDir);
      const meetings = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const data = JSON.parse(
            fs.readFileSync(path.join(this.meetingsDir, f), 'utf-8')
          );
          return {
            id: data.id,
            startTime: data.startTime,
            endTime: data.endTime,
            duration: data.metadata.duration,
            transcriptionCount: data.transcriptions.length,
            suggestionCount: data.suggestions.length
          };
        })
        .sort((a, b) => b.id - a.id); // Most recent first

      return meetings;
    } catch (error) {
      logger.error('Error listing meetings', { error: error.message });
      return [];
    }
  }

  getMeeting(meetingId) {
    try {
      const jsonPath = path.join(this.meetingsDir, `meeting_${meetingId}.json`);
      if (!fs.existsSync(jsonPath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (error) {
      logger.error('Error getting meeting', { error: error.message, meetingId });
      return null;
    }
  }
}

export default MeetingHistoryService;
