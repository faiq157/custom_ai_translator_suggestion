import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class MeetingDetector {
  constructor() {
    this.checkInterval = null;
    this.isMonitoring = false;
    this.onMeetingStart = null;
    this.onMeetingEnd = null;
    this.currentMeetingApp = null;
  }

  // Start monitoring for meetings
  startMonitoring(onMeetingStart, onMeetingEnd) {
    if (this.isMonitoring) return;
    
    this.onMeetingStart = onMeetingStart;
    this.onMeetingEnd = onMeetingEnd;
    this.isMonitoring = true;

    console.log('Meeting detector started');
    
    // Check every 2 seconds for faster response
    this.checkInterval = setInterval(() => {
      this.checkForMeetings();
    }, 2000);

    // Initial check
    this.checkForMeetings();
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isMonitoring = false;
    console.log('Meeting detector stopped');
  }

  // Check if Slack or Teams is in a meeting
  async checkForMeetings() {
    try {
      const platform = process.platform;
      const wasInMeeting = this.currentMeetingApp !== null;
      let inMeeting = false;
      let detectedApp = null;

      // Store previous state
      const previousApp = this.currentMeetingApp;

      if (platform === 'win32') {
        inMeeting = await this.checkWindowsProcesses();
        detectedApp = inMeeting ? this.currentMeetingApp : null;
      } else if (platform === 'darwin') {
        inMeeting = await this.checkMacProcesses();
        detectedApp = inMeeting ? this.currentMeetingApp : null;
      } else if (platform === 'linux') {
        inMeeting = await this.checkLinuxProcesses();
        detectedApp = inMeeting ? this.currentMeetingApp : null;
      }

      // Meeting started (wasn't in meeting before, now is)
      if (inMeeting && !wasInMeeting) {
        console.log(`Meeting STARTED: ${detectedApp}`);
        if (this.onMeetingStart) {
          this.onMeetingStart(detectedApp);
        }
      }
      // Meeting ended (was in meeting before, now isn't)
      else if (!inMeeting && wasInMeeting) {
        console.log(`Meeting ENDED: ${previousApp}`);
        this.currentMeetingApp = null;
        if (this.onMeetingEnd) {
          this.onMeetingEnd(previousApp);
        }
      }
      // Still in meeting (optional logging)
      else if (inMeeting && wasInMeeting) {
        // console.log(`Meeting ongoing: ${detectedApp}`);
      }
    } catch (error) {
      console.error('Error checking for meetings:', error);
    }
  }

  // Check Windows processes
  async checkWindowsProcesses() {
    try {
      const { stdout } = await execAsync('tasklist /FI "STATUS eq running" /FO CSV /NH');
      
      // Check for Slack in call
      if (stdout.includes('slack.exe')) {
        // Check window title for Call, Meeting, or Huddle
        try {
          const { stdout: windowInfo } = await execAsync(
            'powershell "Get-Process slack -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -ne \'\' -and ($_.MainWindowTitle -match \'Call|Meeting|Huddle\')} | Select-Object -ExpandProperty MainWindowTitle"'
          );
          
          if (windowInfo.trim()) {
            console.log('Slack meeting detected:', windowInfo.trim());
            this.currentMeetingApp = 'Slack';
            return true;
          }
        } catch (e) {
          // Try alternative method: check ALL Slack windows
          try {
            const { stdout: audioCheck } = await execAsync(
              'powershell "Get-Process slack -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object -ExpandProperty MainWindowTitle"'
            );
            
            // If Slack has any active window, check if it's likely in a call
            if (audioCheck.trim()) {
              const lowerTitle = audioCheck.toLowerCase();
              
              if (lowerTitle.includes('call') || 
                  lowerTitle.includes('meeting') ||
                  lowerTitle.includes('huddle')) {
                console.log('Slack meeting detected');
                this.currentMeetingApp = 'Slack';
                return true;
              }
            }
          } catch (e2) {
            // Silent fail
          }
        }
      }

      // Check for Teams in call
      if (stdout.includes('Teams.exe') || stdout.includes('ms-teams.exe')) {
        // Check for Teams window with meeting/call
        try {
          const { stdout: windowInfo } = await execAsync(
            'powershell "Get-Process Teams,ms-teams -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -match \'Meeting|Call\'} | Select-Object -ExpandProperty MainWindowTitle"'
          );
          if (windowInfo.trim()) {
            console.log('Teams meeting detected via window title');
            this.currentMeetingApp = 'Microsoft Teams';
            return true;
          }
        } catch (e) {
          // Fallback: assume in meeting if Teams is running
          console.log('Teams detected (process running)');
          this.currentMeetingApp = 'Microsoft Teams';
          return true;
        }
      }

      // Check for Zoom
      if (stdout.includes('Zoom.exe') || stdout.includes('CptHost.exe')) {
        console.log('Zoom detected');
        this.currentMeetingApp = 'Zoom';
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking Windows processes:', error);
      return false;
    }
  }

  // Check macOS processes
  async checkMacProcesses() {
    try {
      const { stdout } = await execAsync('ps aux');
      
      // Check for Slack
      if (stdout.includes('Slack.app') || stdout.includes('slack')) {
        this.currentMeetingApp = 'Slack';
        return true;
      }

      // Check for Teams
      if (stdout.includes('Microsoft Teams') || stdout.includes('Teams.app')) {
        this.currentMeetingApp = 'Microsoft Teams';
        return true;
      }

      // Check for Zoom
      if (stdout.includes('zoom.us') || stdout.includes('Zoom.app')) {
        this.currentMeetingApp = 'Zoom';
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking macOS processes:', error);
      return false;
    }
  }

  // Check Linux processes
  async checkLinuxProcesses() {
    try {
      const { stdout } = await execAsync('ps aux');
      let inMeeting = false;
      
      // Check for Slack
      if (stdout.includes('slack')) {
        // First check if audio is being captured (most reliable)
        try {
          const { stdout: audioCheck } = await execAsync('pactl list source-outputs 2>/dev/null || echo ""');
          if (audioCheck.includes('Slack') || audioCheck.includes('slack')) {
            console.log('Slack meeting detected via audio capture');
            this.currentMeetingApp = 'Slack';
            return true;
          }
        } catch (e) {
          console.log('Audio check failed, trying alternative methods');
        }
        
        // Alternative: Check for Slack window titles containing "Call" or "Meeting"
        try {
          const { stdout: windowCheck } = await execAsync('wmctrl -l 2>/dev/null || echo ""');
          if (windowCheck.toLowerCase().includes('slack') && 
              (windowCheck.toLowerCase().includes('call') || 
               windowCheck.toLowerCase().includes('meeting') ||
               windowCheck.toLowerCase().includes('huddle'))) {
            console.log('Slack meeting detected via window title');
            this.currentMeetingApp = 'Slack';
            return true;
          }
        } catch (e) {
          console.log('Window check failed');
        }
        
        // Fallback: Check if any audio input/output is active
        try {
          const { stdout: sinkCheck } = await execAsync('pactl list sink-inputs 2>/dev/null || echo ""');
          if (sinkCheck.includes('Slack') || sinkCheck.includes('slack')) {
            console.log('Slack meeting detected via audio output');
            this.currentMeetingApp = 'Slack';
            return true;
          }
        } catch (e) {
          // Silent fail
        }
      }

      // Check for Teams
      if (stdout.includes('teams') || stdout.includes('Teams')) {
        try {
          const { stdout: audioCheck } = await execAsync('pactl list source-outputs 2>/dev/null || echo ""');
          if (audioCheck.includes('Teams') || audioCheck.includes('teams')) {
            console.log('Teams meeting detected via audio');
            this.currentMeetingApp = 'Microsoft Teams';
            return true;
          }
        } catch (e) {
          // Fallback
        }
        
        // Check window titles
        try {
          const { stdout: windowCheck } = await execAsync('wmctrl -l 2>/dev/null || echo ""');
          if (windowCheck.toLowerCase().includes('teams') && 
              (windowCheck.toLowerCase().includes('meeting') || 
               windowCheck.toLowerCase().includes('call'))) {
            console.log('Teams meeting detected via window title');
            this.currentMeetingApp = 'Microsoft Teams';
            return true;
          }
        } catch (e) {
          // Silent fail
        }
      }

      // Check for Zoom
      if (stdout.includes('zoom')) {
        console.log('Zoom detected');
        this.currentMeetingApp = 'Zoom';
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking Linux processes:', error);
      return false;
    }
  }
}

export default MeetingDetector;
