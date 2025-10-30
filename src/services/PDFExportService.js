import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import logger from '../config/logger.js';

class PDFExportService {
  constructor() {
    this.exportDir = path.join(process.cwd(), 'exports');
    this._ensureExportDir();
  }

  _ensureExportDir() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
      logger.info('Export directory created', { path: this.exportDir });
    }
  }

  async generateTranscriptPDF(content) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(24)
           .fillColor('#2563eb')
           .text(content.title, { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(12)
           .fillColor('#64748b')
           .text(content.date, { align: 'center' });
        
        doc.moveDown(1);
        doc.moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke('#e2e8f0');
        
        doc.moveDown(1.5);

        // Transcriptions
        if (content.transcriptions && content.transcriptions.length > 0) {
          content.transcriptions.forEach((item, index) => {
            const timestamp = new Date(item.timestamp).toLocaleTimeString();
            
            // Check if we need a new page
            if (doc.y > 700) {
              doc.addPage();
            }

            // Timestamp
            doc.fontSize(10)
               .fillColor('#94a3b8')
               .text(timestamp, { continued: false });
            
            // Text
            doc.fontSize(12)
               .fillColor('#0f172a')
               .text(item.text, { 
                 align: 'left',
                 lineGap: 4
               });
            
            doc.moveDown(0.8);
          });
        } else {
          doc.fontSize(12)
             .fillColor('#64748b')
             .text('No transcriptions available', { align: 'center' });
        }

        // Footer
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(10)
             .fillColor('#94a3b8')
             .text(
               `Page ${i + 1} of ${pages.count}`,
               50,
               doc.page.height - 50,
               { align: 'center' }
             );
        }

        doc.end();
      } catch (error) {
        logger.error('Error generating transcript PDF', { error: error.message });
        reject(error);
      }
    });
  }

  async generateSuggestionsPDF(content) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(24)
           .fillColor('#2563eb')
           .text(content.title, { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(12)
           .fillColor('#64748b')
           .text(content.date, { align: 'center' });
        
        doc.moveDown(1);
        doc.moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke('#e2e8f0');
        
        doc.moveDown(1.5);

        // Suggestions
        if (content.suggestions && content.suggestions.length > 0) {
          content.suggestions.forEach((suggestion, index) => {
            const timestamp = new Date(suggestion.timestamp).toLocaleTimeString();
            
            // Suggestion header
            doc.fontSize(10)
               .fillColor('#94a3b8')
               .text(`Generated at ${timestamp}`, { continued: false });
            
            doc.moveDown(0.5);

            // Questions
            if (suggestion.questions && suggestion.questions.length > 0) {
              if (doc.y > 650) doc.addPage();
              
              doc.fontSize(14)
                 .fillColor('#2563eb')
                 .text('❓ Questions to Consider', { underline: true });
              
              doc.moveDown(0.3);
              
              suggestion.questions.forEach(q => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11)
                   .fillColor('#0f172a')
                   .list([q], { bulletRadius: 2 });
              });
              
              doc.moveDown(0.8);
            }

            // Resources
            if (suggestion.resources && suggestion.resources.length > 0) {
              if (doc.y > 650) doc.addPage();
              
              doc.fontSize(14)
                 .fillColor('#2563eb')
                 .text('🔗 Relevant Resources', { underline: true });
              
              doc.moveDown(0.3);
              
              suggestion.resources.forEach(r => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11)
                   .fillColor('#2563eb')
                   .text(r.title, { link: r.url, underline: true });
                
                if (r.description) {
                  doc.fontSize(10)
                     .fillColor('#64748b')
                     .text(r.description, { indent: 15 });
                }
                doc.moveDown(0.3);
              });
              
              doc.moveDown(0.5);
            }

            // Action Items
            if (suggestion.actionItems && suggestion.actionItems.length > 0) {
              if (doc.y > 650) doc.addPage();
              
              doc.fontSize(14)
                 .fillColor('#2563eb')
                 .text('✅ Action Items', { underline: true });
              
              doc.moveDown(0.3);
              
              suggestion.actionItems.forEach(a => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11)
                   .fillColor('#0f172a')
                   .list([a], { bulletRadius: 2 });
              });
              
              doc.moveDown(0.8);
            }

            // Insights
            if (suggestion.insights && suggestion.insights.length > 0) {
              if (doc.y > 650) doc.addPage();
              
              doc.fontSize(14)
                 .fillColor('#2563eb')
                 .text('💭 Key Insights', { underline: true });
              
              doc.moveDown(0.3);
              
              suggestion.insights.forEach(i => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11)
                   .fillColor('#0f172a')
                   .list([i], { bulletRadius: 2 });
              });
              
              doc.moveDown(0.8);
            }

            // Separator between suggestions
            if (index < content.suggestions.length - 1) {
              doc.moveDown(0.5);
              doc.moveTo(50, doc.y)
                 .lineTo(550, doc.y)
                 .stroke('#e2e8f0');
              doc.moveDown(1);
            }
          });
        } else {
          doc.fontSize(12)
             .fillColor('#64748b')
             .text('No suggestions available', { align: 'center' });
        }

        // Footer
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(10)
             .fillColor('#94a3b8')
             .text(
               `Page ${i + 1} of ${pages.count}`,
               50,
               doc.page.height - 50,
               { align: 'center' }
             );
        }

        doc.end();
      } catch (error) {
        logger.error('Error generating suggestions PDF', { error: error.message });
        reject(error);
      }
    });
  }
}

export default PDFExportService;
