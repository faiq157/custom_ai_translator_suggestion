import OpenAI from 'openai';
import config from '../config/config.js';
import logger from '../config/logger.js';

class SuggestionService {
  constructor() {
    this.enabled = config.openai.enabled;
    
    if (this.enabled) {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey
      });
      this.model = config.openai.gptModel;
    }
    
    this.conversationContext = [];
    this.maxContextLength = config.openai.maxContextLength;
    this.totalCost = 0;
    this.suggestionCount = 0;
    
    // Smart batching for meaningful context
    this.transcriptionBuffer = [];
    this.lastTranscriptionTime = null;
    this.minBatchSize = 30; // Minimum characters before sending (lowered for faster response)
    this.maxBatchWaitTime = 15000; // Max 15 seconds wait
    this.pauseThreshold = 5000; // 5 seconds pause = end of thought
  }

  addTranscription(transcribedText) {
    if (!transcribedText || transcribedText.trim().length < 5) {
      return null;
    }

    this.transcriptionBuffer.push(transcribedText.trim());
    this.lastTranscriptionTime = Date.now();
    
    const bufferText = this.transcriptionBuffer.join(' ');
    
    // Check if we should send to ChatGPT
    const shouldSend = this._shouldSendBatch(bufferText);
    
    if (shouldSend) {
      const textToSend = bufferText;
      this.transcriptionBuffer = []; // Clear buffer
      return textToSend;
    }
    
    return null;
  }
  
  _shouldSendBatch(bufferText) {
    // Don't send if buffer is too small
    if (bufferText.length < this.minBatchSize) {
      return false;
    }
    
    // Send if buffer is large enough (meaningful content)
    if (bufferText.length >= 100) {
      logger.info('Sending batch: sufficient content', { size: bufferText.length });
      return true;
    }
    
    // Send if there's a complete sentence
    if (this._hasCompleteSentence(bufferText)) {
      logger.info('Sending batch: complete sentence detected', { size: bufferText.length });
      return true;
    }
    
    return false;
  }
  
  _hasCompleteSentence(text) {
    // Check for sentence-ending punctuation
    return /[.!?]\s*$/.test(text.trim());
  }
  
  checkPauseTimeout() {
    if (this.transcriptionBuffer.length === 0 || !this.lastTranscriptionTime) {
      return null;
    }
    
    const now = Date.now();
    const timeSinceLastTranscription = now - this.lastTranscriptionTime;
    
    // If there's been a pause, send what we have
    if (timeSinceLastTranscription >= this.pauseThreshold) {
      const bufferText = this.transcriptionBuffer.join(' ');
      
      // Only send if we have meaningful content
      if (bufferText.length >= this.minBatchSize) {
        logger.info('Sending batch: pause detected after speech', { 
          pauseDuration: `${timeSinceLastTranscription}ms`,
          size: bufferText.length 
        });
        
        this.transcriptionBuffer = [];
        this.lastTranscriptionTime = null;
        return bufferText;
      } else {
        // Clear buffer if pause detected but content too short
        logger.debug('Clearing buffer: pause detected but content too short', {
          size: bufferText.length
        });
        this.transcriptionBuffer = [];
        this.lastTranscriptionTime = null;
      }
    }
    
    return null;
  }

  async generateSuggestions(transcribedText) {
    if (!transcribedText || transcribedText.trim().length < 10) {
      return null;
    }

    const startTime = Date.now();

    try {
      // TEST MODE: Return mock suggestions if API key not provided
      if (!this.enabled) {
        const duration = Date.now() - startTime;
        
        logger.info('Mock suggestions generated (test mode)', { 
          duration: `${duration}ms`
        });

        return {
          questions: ['[TEST MODE] Audio capture is working!'],
          resources: [{
            title: 'Audio Test Successful',
            url: '#',
            description: 'Your audio is being captured correctly. Add OpenAI API key to enable transcription.'
          }],
          actionItems: ['Add OPENAI_API_KEY to .env file to enable AI features'],
          insights: ['Audio capture system is functioning properly'],
          metadata: {
            timestamp: new Date().toISOString(),
            duration,
            cost: 0,
            tokens: { input: 0, output: 0, total: 0 }
          }
        };
      }
      
      // Add to context
      this.conversationContext.push(transcribedText);

      // Keep only recent context
      if (this.conversationContext.length > this.maxContextLength) {
        this.conversationContext.shift();
      }

      // Build context string (last 3 exchanges for speed)
      const recentContext = this.conversationContext.slice(-3).join(' ');

      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.7,
        max_tokens: 500, // Limit tokens for faster response
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant helping during a meeting. Provide CONCISE, ACTIONABLE suggestions:
              1. 2-3 relevant questions to deepen discussion
              2. 1-2 related resources (realistic URLs)
              3. Action items if mentioned
              4. 1-2 key insights

              Keep it BRIEF and FAST. Format as JSON:
              {
                "questions": ["q1", "q2"],
                "resources": [{"title": "Title", "url": "https://...", "description": "desc"}],
                "actionItems": ["action1"],
                "insights": ["insight1"]
              }`
          },
          {
            role: 'user',
            content: `Context: ${recentContext}\n\nLatest: ${transcribedText}\n\nProvide quick suggestions.`
          }
        ],
        response_format: { type: "json_object" }
      });

      const duration = Date.now() - startTime;
      const suggestions = JSON.parse(response.choices[0].message.content);

      // Calculate approximate cost (GPT-4o-mini: ~$0.15/1M input, ~$0.60/1M output tokens)
      const inputTokens = response.usage.prompt_tokens;
      const outputTokens = response.usage.completion_tokens;
      const estimatedCost = (inputTokens * 0.15 / 1000000) + (outputTokens * 0.60 / 1000000);
      
      this.totalCost += estimatedCost;
      this.suggestionCount++;

      logger.info('Suggestions generated', {
        duration: `${duration}ms`,
        tokens: `${inputTokens + outputTokens}`,
        cost: `$${estimatedCost.toFixed(6)}`
      });

      return {
        ...suggestions,
        metadata: {
          timestamp: new Date().toISOString(),
          duration,
          cost: estimatedCost,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens
          }
        }
      };

    } catch (error) {
      logger.error('Suggestion generation error', {
        error: error.message
      });
      throw error;
    }
  }

  clearBuffer() {
    this.transcriptionBuffer = [];
    this.lastTranscriptionTime = null;
    logger.info('Transcription buffer cleared');
  }

  clearContext() {
    this.conversationContext = [];
    this.transcriptionBuffer = [];
    this.lastTranscriptionTime = null;
    logger.info('Conversation context and buffer cleared');
  }

  getStats() {
    return {
      suggestionCount: this.suggestionCount,
      totalCost: this.totalCost,
      averageCost: this.suggestionCount > 0 
        ? this.totalCost / this.suggestionCount 
        : 0,
      contextLength: this.conversationContext.length
    };
  }

  resetStats() {
    this.totalCost = 0;
    this.suggestionCount = 0;
    logger.info('Stats reset');
  }
}

export default SuggestionService;
