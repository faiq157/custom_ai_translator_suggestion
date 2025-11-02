import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import logger from '../config/logger.js';
import config from '../config/config.js';
import OpenAI from 'openai';

class PDFExportService {
  constructor() {
    this.exportDir = config.paths.exports;
    this._ensureExportDir();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
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
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(range.start + i);
          doc.fontSize(10)
             .fillColor('#94a3b8')
             .text(
               `Page ${i + 1} of ${range.count}`,
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
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(range.start + i);
          doc.fontSize(10)
             .fillColor('#94a3b8')
             .text(
               `Page ${i + 1} of ${range.count}`,
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

  async generateMeetingSummary(transcriptions) {
    try {
      logger.info('Generating AI meeting summary', { transcriptionCount: transcriptions.length });

      // Combine all transcriptions
      const fullTranscript = transcriptions
        .map(t => t.text)
        .join(' ');

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert meeting summarizer. Create a comprehensive, professional meeting summary that includes:
1. Executive Summary (2-3 sentences overview)
2. Key Discussion Points (main topics discussed)
3. Important Decisions Made
4. Action Items (who needs to do what)
5. Relevant Resources/Links mentioned
6. Next Steps

Format the response as JSON with these exact keys: executiveSummary, keyPoints (array), decisions (array), actionItems (array), resources (array of {title, url, description}), nextSteps (array).`
          },
          {
            role: 'user',
            content: `Please summarize this meeting transcript:\n\n${fullTranscript}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      });

      const summary = JSON.parse(response.choices[0].message.content);
      logger.info('Meeting summary generated successfully');
      
      return summary;
    } catch (error) {
      logger.error('Error generating meeting summary', { error: error.message });
      throw error;
    }
  }

  async generateCompleteMeetingPDF(content) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ===== COVER PAGE =====
        doc.fontSize(32)
           .fillColor('#2563eb')
           .text('Meeting Summary Report', { align: 'center' });
        
        doc.moveDown(0.5);
        doc.fontSize(14)
           .fillColor('#64748b')
           .text(content.date, { align: 'center' });
        
        doc.moveDown(2);
        
        // Generate AI summary if transcriptions exist
        let summary = null;
        if (content.transcriptions && content.transcriptions.length > 0) {
          doc.fontSize(12)
             .fillColor('#94a3b8')
             .text('Generating AI summary...', { align: 'center' });
          
          summary = await this.generateMeetingSummary(content.transcriptions);
        }

        doc.addPage();

        // ===== EXECUTIVE SUMMARY =====
        if (summary) {
          doc.fontSize(20)
             .fillColor('#2563eb')
             .text('Executive Summary', { underline: true });
          
          doc.moveDown(0.5);
          doc.fontSize(12)
             .fillColor('#0f172a')
             .text(String(summary.executiveSummary || 'No summary available'), { align: 'justify', lineGap: 5 });
          
          doc.moveDown(1.5);

          // Key Discussion Points
          if (summary.keyPoints && summary.keyPoints.length > 0) {
            doc.fontSize(16)
               .fillColor('#2563eb')
               .text('Key Discussion Points', { underline: true });
            
            doc.moveDown(0.5);
            summary.keyPoints.forEach(point => {
              if (doc.y > 700) doc.addPage();
              doc.fontSize(11)
                 .fillColor('#0f172a')
                 .list([String(point)], { bulletRadius: 2, lineGap: 3 });
            });
            doc.moveDown(1);
          }

          // Important Decisions
          if (summary.decisions && summary.decisions.length > 0) {
            if (doc.y > 650) doc.addPage();
            doc.fontSize(16)
               .fillColor('#2563eb')
               .text('Important Decisions', { underline: true });
            
            doc.moveDown(0.5);
            summary.decisions.forEach(decision => {
              if (doc.y > 700) doc.addPage();
              doc.fontSize(11)
                 .fillColor('#0f172a')
                 .list([String(decision)], { bulletRadius: 2, lineGap: 3 });
            });
            doc.moveDown(1);
          }

          // Action Items
          if (summary.actionItems && summary.actionItems.length > 0) {
            if (doc.y > 650) doc.addPage();
            doc.fontSize(16)
               .fillColor('#2563eb')
               .text('Action Items', { underline: true });
            
            doc.moveDown(0.5);
            summary.actionItems.forEach(item => {
              if (doc.y > 700) doc.addPage();
              doc.fontSize(11)
                 .fillColor('#dc2626')
                 .list([String(item)], { bulletRadius: 2, lineGap: 3 });
            });
            doc.moveDown(1);
          }

          // Relevant Resources
          if (summary.resources && summary.resources.length > 0) {
            if (doc.y > 650) doc.addPage();
            doc.fontSize(16)
               .fillColor('#2563eb')
               .text('Relevant Resources', { underline: true });
            
            doc.moveDown(0.5);
            summary.resources.forEach(resource => {
              if (doc.y > 700) doc.addPage();
              doc.fontSize(11)
                 .fillColor('#2563eb')
                 .text(String(resource.title || 'Resource'), { link: resource.url, underline: true });
              
              if (resource.description) {
                doc.fontSize(10)
                   .fillColor('#64748b')
                   .text(String(resource.description), { indent: 15, lineGap: 2 });
              }
              doc.moveDown(0.5);
            });
            doc.moveDown(0.5);
          }

          // Next Steps
          if (summary.nextSteps && summary.nextSteps.length > 0) {
            if (doc.y > 650) doc.addPage();
            doc.fontSize(16)
               .fillColor('#2563eb')
               .text('Next Steps', { underline: true });
            
            doc.moveDown(0.5);
            summary.nextSteps.forEach(step => {
              if (doc.y > 700) doc.addPage();
              doc.fontSize(11)
                 .fillColor('#0f172a')
                 .list([String(step)], { bulletRadius: 2, lineGap: 3 });
            });
            doc.moveDown(1);
          }

          doc.addPage();
        }

        // ===== FULL TRANSCRIPT =====
        doc.fontSize(20)
           .fillColor('#2563eb')
           .text('Full Transcript', { underline: true });
        
        doc.moveDown(1);

        if (content.transcriptions && content.transcriptions.length > 0) {
          content.transcriptions.forEach((item, index) => {
            const timestamp = new Date(item.timestamp).toLocaleTimeString();
            
            if (doc.y > 700) doc.addPage();

            doc.fontSize(10)
               .fillColor('#94a3b8')
               .text(String(timestamp), { continued: false });
            
            doc.fontSize(11)
               .fillColor('#0f172a')
               .text(String(item.text || ''), { align: 'left', lineGap: 4 });
            
            doc.moveDown(0.6);
          });
        } else {
          doc.fontSize(12)
             .fillColor('#64748b')
             .text('No transcriptions available', { align: 'center' });
        }

        // ===== AI SUGGESTIONS =====
        if (content.suggestions && content.suggestions.length > 0) {
          doc.addPage();
          doc.fontSize(20)
             .fillColor('#2563eb')
             .text('AI Suggestions', { underline: true });
          
          doc.moveDown(1);

          content.suggestions.forEach((suggestion, index) => {
            const timestamp = new Date(suggestion.timestamp).toLocaleTimeString();
            
            doc.fontSize(10)
               .fillColor('#94a3b8')
               .text(`Generated at ${String(timestamp)}`, { continued: false });
            
            doc.moveDown(0.5);

            // Questions
            if (suggestion.questions && suggestion.questions.length > 0) {
              if (doc.y > 650) doc.addPage();
              doc.fontSize(14)
                 .fillColor('#2563eb')
                 .text('Questions', { underline: true });
              doc.moveDown(0.3);
              suggestion.questions.forEach(q => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11)
                   .fillColor('#0f172a')
                   .list([String(q)], { bulletRadius: 2 });
              });
              doc.moveDown(0.8);
            }

            // Resources
            if (suggestion.resources && suggestion.resources.length > 0) {
              if (doc.y > 650) doc.addPage();
              doc.fontSize(14)
                 .fillColor('#2563eb')
                 .text('Resources', { underline: true });
              doc.moveDown(0.3);
              suggestion.resources.forEach(r => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11)
                   .fillColor('#2563eb')
                   .text(String(r.title || 'Resource'), { link: r.url, underline: true });
                if (r.description) {
                  doc.fontSize(10)
                     .fillColor('#64748b')
                     .text(String(r.description), { indent: 15 });
                }
                doc.moveDown(0.3);
              });
              doc.moveDown(0.5);
            }

            if (index < content.suggestions.length - 1) {
              doc.moveDown(0.5);
              doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#e2e8f0');
              doc.moveDown(1);
            }
          });
        }

        // Footer on all pages
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(range.start + i);
          doc.fontSize(10)
             .fillColor('#94a3b8')
             .text(
               `Page ${i + 1} of ${range.count}`,
               50,
               doc.page.height - 50,
               { align: 'center' }
             );
        }

        doc.end();
      } catch (error) {
        logger.error('Error generating complete meeting PDF', { error: error.message });
        reject(error);
      }
    });
  }
}

export default PDFExportService;
