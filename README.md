# Meeting AI Assistant

AI-powered desktop application for real-time meeting transcription and intelligent suggestions.

## Features

- 🎤 **Audio Capture**: Microphone or System Audio + Microphone
- 🗣️ **Voice Activity Detection (VAD)**: Filters silence to save costs
- 📝 **Real-time Transcription**: Powered by OpenAI Whisper API
- 🤖 **AI Suggestions**: Context-aware meeting insights
- 📊 **Meeting History**: Automatic PDF summaries
- 🖥️ **Desktop-Only**: Electron-based application

## Requirements

- Node.js v18+ 
- OpenAI API Key

### Platform-Specific

**Linux:**
- PulseAudio (pre-installed on most systems)

**Windows:**
- Enable "Stereo Mix" in Sound settings OR
- Install VB-Audio Virtual Cable (free)

**macOS:**
- Install BlackHole (free virtual audio device)

## Installation

### For Users (Windows)
1. Download `Meeting AI Assistant-Setup-1.0.0.exe`
2. Run the installer
3. Choose installation directory
4. Desktop shortcut will be created automatically
5. Launch and configure your OpenAI API key

### For Developers
```bash
# Install dependencies
npm install

# Run the application in development mode
npm run electron

# Build Windows installer
npm run build:win:installer
```

📖 **See [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md) for complete build guide**

## Configuration

1. Click **Settings** (⚙️ icon)
2. Enter your **OpenAI API Key**
3. Configure **Audio Capture Mode**:
   - Microphone Only (self-contained)
   - System Audio + Microphone (desktop apps)
4. Save Settings

## Usage

1. **Start Recording**: Click the microphone button
2. **Speak or Join Meeting**: Audio is captured automatically
3. **View Transcriptions**: Real-time text appears on screen
4. **Get AI Suggestions**: Context-aware insights during meeting
5. **Stop Recording**: Meeting summary PDF is generated

## Audio Modes

### Microphone Only
- Captures your voice only
- No external dependencies
- Works on all platforms

### System Audio + Microphone
- Captures desktop app audio (Slack, Teams, Zoom)
- Captures your microphone
- Automatically mixed
- Platform-specific setup required

## Project Structure

```
├── electron/          # Electron main process
├── public/            # Frontend UI
├── src/
│   ├── config/        # Configuration
│   ├── services/      # Core services
│   │   ├── SelfContainedAudioService.js
│   │   ├── SystemAudioService.js
│   │   ├── CombinedAudioService.js
│   │   ├── VADService.js
│   │   ├── TranscriptionService.js
│   │   └── SuggestionService.js
│   └── websocket/     # Socket handlers
└── meetings/          # Generated PDFs

## Technologies

- **Electron**: Desktop application framework
- **Node.js**: Backend runtime
- **Socket.IO**: Real-time communication
- **OpenAI Whisper**: Speech-to-text
- **OpenAI GPT**: AI suggestions
- **ffmpeg**: Audio processing (bundled)
- **mic**: Microphone capture
- **PulseAudio**: System audio (Linux)

## Building for Distribution

### Quick Build
```bash
npm run build:win:installer
```

Output: `dist/Meeting AI Assistant-Setup-1.0.0.exe`

### Documentation
- 📖 [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md) - Quick start guide
- 📖 [WINDOWS_BUILD_GUIDE.md](WINDOWS_BUILD_GUIDE.md) - Complete Windows build guide
- 📖 [CODE_SIGNING_GUIDE.md](CODE_SIGNING_GUIDE.md) - Prevent security warnings

### Features of Built Installer
- ✅ Professional NSIS installer (like VSCode)
- ✅ Custom installation directory selection
- ✅ Desktop shortcut creation
- ✅ Start Menu integration
- ✅ Uninstaller included
- ✅ Run after installation option
- ✅ Code signing support (prevents Windows warnings)

## License

MIT

## Support

For issues or questions:
- 📧 Email: faiqa5122@gmail.com
- 🐛 GitHub Issues: [Create an issue](https://github.com/yourusername/meeting-ai-assistant/issues)
- 📖 Documentation: See guides in repository
