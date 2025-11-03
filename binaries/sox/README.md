# SoX Binaries for Windows

## Download Instructions

1. **Download SoX for Windows:**
   - Visit: https://sourceforge.net/projects/sox/files/sox/
   - Download the latest version (e.g., `sox-14.4.2-win32.zip`)
   - Or direct link: https://sourceforge.net/projects/sox/files/sox/14.4.2/sox-14.4.2-win32.zip/download

2. **Extract the files:**
   - Extract the downloaded ZIP file
   - Copy the following files to this directory (`binaries/sox/`):
     - `sox.exe` (main executable)
     - All `.dll` files from the extracted folder

3. **Required files:**
   ```
   binaries/sox/
   ├── sox.exe
   ├── libgomp-1.dll
   ├── libmad-0.dll
   ├── libmp3lame-0.dll
   ├── libpng16-16.dll
   ├── libsox-3.dll
   ├── libssp-0.dll
   ├── libwavpack-1.dll
   ├── libwinpthread-1.dll
   ├── zlib1.dll
   └── README.md (this file)
   ```

## Verification

After placing the files, run:
```bash
.\binaries\sox\sox.exe --version
```

You should see output like:
```
sox:      SoX v14.4.2
```

## Why SoX?

- **Lightweight**: Much smaller than ffmpeg (~5MB vs ~100MB)
- **Reliable**: Industry-standard audio processing tool
- **Native Windows support**: Works directly with Windows audio APIs
- **No external dependencies**: Self-contained executable

## Audio Capture on Windows

SoX will capture from your **default recording device**. To capture:

### Microphone Only:
- Set your microphone as the default recording device in Windows Sound Settings

### System Audio (Speakers/Applications):
1. Open **Sound Settings** → **Sound Control Panel**
2. Go to **Recording** tab
3. Right-click and enable **Show Disabled Devices**
4. Enable **Stereo Mix** (if available)
5. Set **Stereo Mix** as the default recording device

### Both Microphone and System Audio:
- Use Windows' built-in **Listen to this device** feature
- Or use virtual audio cable software like VB-Audio Cable

## Troubleshooting

**"SoX not found" error:**
- Ensure `sox.exe` is in the `binaries/sox/` folder
- Check that all DLL files are present

**"Can't open input" error:**
- Check Windows Sound Settings
- Ensure a recording device is enabled and set as default
- Try enabling Stereo Mix for system audio capture

**No audio captured:**
- Test your recording device in Windows Sound Settings
- Ensure the device is not muted
- Check application permissions for microphone access
