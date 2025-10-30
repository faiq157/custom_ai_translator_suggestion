# System Architecture

## 📐 Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Meeting AI Assistant                      │
│                                                              │
│  Browser ←→ WebSocket ←→ Node.js Server ←→ OpenAI APIs     │
└─────────────────────────────────────────────────────────────┘
```

## 🏗️ Backend Architecture

### Core Services

#### 1. **AudioCaptureService** (`src/services/AudioCaptureService.js`)
- Captures system audio in 5-second chunks
- Uses `node-record-lpcm16` with sox
- Optimized for Whisper (16kHz, mono, WAV)
- Auto-cleanup of temporary files

#### 2. **TranscriptionService** (`src/services/TranscriptionService.js`)
- Integrates OpenAI Whisper API
- Processes audio chunks asynchronously
- Tracks costs and performance metrics
- Automatic file cleanup after processing

#### 3. **SuggestionService** (`src/services/SuggestionService.js`)
- Uses GPT-4o-mini for cost efficiency
- Maintains conversation context (last 10 exchanges)
- Generates structured JSON responses:
  - Questions to deepen discussion
  - Relevant resources with URLs
  - Action items
  - Key insights

### WebSocket Handler (`src/websocket/socketHandler.js`)

Orchestrates the entire pipeline:

```
Audio Chunk → Transcription → Suggestions → Client Update
```

**Events:**
- `start-recording`: Initialize audio capture
- `stop-recording`: Stop and cleanup
- `transcription`: Send transcribed text to client
- `suggestions`: Send AI suggestions to client
- `stats`: Real-time cost and performance metrics
- `error`: Error notifications

### Configuration (`src/config/`)

- **config.js**: Centralized configuration with environment variables
- **logger.js**: Winston-based logging (console + file)
  - Separate error logs
  - Rotating log files (5MB max)
  - Structured JSON logging

## 🎨 Frontend Architecture

### Components

#### 1. **UI Layout** (`public/index.html`)
- Header with controls and status
- Stats bar (duration, count, cost)
- Dual-panel layout:
  - Transcription panel (left)
  - Suggestions panel (right)
- Processing indicator
- Toast notifications

#### 2. **Real-time Updates** (`public/app.js`)
- Socket.io client for WebSocket communication
- Event-driven UI updates
- Auto-scroll for new content
- Keyboard shortcuts support

#### 3. **Styling** (`public/styles.css`)
- Modern, gradient design
- Responsive layout
- Smooth animations
- Dark mode ready

## 🔄 Data Flow

### Recording Session Flow

```
1. User clicks "Start Recording"
   ↓
2. Client emits 'start-recording' via WebSocket
   ↓
3. Server starts AudioCaptureService
   ↓
4. Every 5 seconds:
   - Audio chunk saved to temp file
   - Sent to TranscriptionService
   - Whisper API transcribes
   - Text sent to SuggestionService
   - GPT generates suggestions
   - Results pushed to client via WebSocket
   ↓
5. Client updates UI in real-time
   ↓
6. User clicks "Stop Recording"
   ↓
7. Server stops capture and cleans up
```

## 🔐 Security Features

- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin requests
- **Environment Variables**: Sensitive data protection
- **Input Validation**: Sanitized user inputs
- **Error Handling**: Graceful error recovery

## 📊 Performance Optimizations

- **Compression**: Gzip compression for responses
- **Streaming**: Audio processed in chunks
- **Async Processing**: Non-blocking operations
- **Connection Pooling**: Efficient WebSocket management
- **Auto-cleanup**: Temporary files deleted immediately

## 🎯 Production Considerations

### Scalability
- Stateless design (can run multiple instances)
- WebSocket sticky sessions needed for load balancing
- Consider Redis for shared state in multi-instance setup

### Monitoring
- Winston logging to files
- Real-time cost tracking
- Performance metrics (duration, token usage)
- Error tracking and alerting

### Deployment
- PM2 for process management
- Nginx reverse proxy
- SSL/TLS encryption
- Environment-based configuration

## 🔧 Technology Stack

**Backend:**
- Node.js 18+ (ES Modules)
- Express.js (Web server)
- Socket.io (WebSocket)
- OpenAI SDK (Whisper + GPT)
- Winston (Logging)
- node-record-lpcm16 (Audio capture)

**Frontend:**
- Vanilla JavaScript (No framework overhead)
- Socket.io Client
- Modern CSS (Grid, Flexbox, Animations)
- Google Fonts (Inter)

**DevOps:**
- npm (Package management)
- nodemon (Development)
- dotenv (Environment config)

## 📈 Future Enhancements

- Speaker diarization (identify who's speaking)
- Meeting summaries and export
- Integration with calendar apps
- Multi-language support
- Voice activity detection
- Cloud deployment options
- Mobile app version
