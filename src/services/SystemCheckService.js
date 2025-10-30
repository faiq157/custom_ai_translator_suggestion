import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../config/logger.js';
import fs from 'fs';

const execAsync = promisify(exec);

class SystemCheckService {
  constructor() {
    this.dependencies = {
      nodejs: {
        name: 'Node.js',
        checkCommand: 'node --version',
        installCommands: {} // Already installed if running this
      },
      npm: {
        name: 'npm',
        checkCommand: 'npm --version',
        installCommands: {} // Already installed if running this
      }
    };
  }

  async checkAllDependencies() {
    logger.info('Checking system dependencies...');
    
    const results = {
      os: await this.detectOS(),
      dependencies: {},
      allInstalled: true,
      permissions: await this.checkPermissions()
    };

    for (const [key, dep] of Object.entries(this.dependencies)) {
      const status = await this.checkDependency(dep.checkCommand, dep.name);
      results.dependencies[key] = status;
      
      if (!status.installed && key !== 'nodejs') {
        results.allInstalled = false;
      }
    }

    logger.info('Dependency check complete', { 
      allInstalled: results.allInstalled,
      os: results.os 
    });

    return results;
  }

  async checkDependency(command, name) {
    try {
      const { stdout, stderr } = await execAsync(command);
      const version = stdout.trim().split('\n')[0];
      
      logger.debug(`${name} found`, { version });
      
      return {
        installed: true,
        version,
        name
      };
    } catch (error) {
      logger.warn(`${name} not found`, { error: error.message });
      
      return {
        installed: false,
        version: null,
        name,
        error: error.message
      };
    }
  }

  async detectOS() {
    try {
      // Check for Debian/Ubuntu
      if (fs.existsSync('/etc/debian_version')) {
        return 'debian';
      }
      
      // Check for RHEL/CentOS/Fedora
      if (fs.existsSync('/etc/redhat-release')) {
        return 'rhel';
      }
      
      // Check for Arch
      if (fs.existsSync('/etc/arch-release')) {
        return 'arch';
      }

      // Try to detect from /etc/os-release
      if (fs.existsSync('/etc/os-release')) {
        const content = fs.readFileSync('/etc/os-release', 'utf8');
        
        if (content.includes('Ubuntu') || content.includes('Debian')) {
          return 'debian';
        }
        if (content.includes('CentOS') || content.includes('Red Hat') || content.includes('Fedora')) {
          return 'rhel';
        }
        if (content.includes('Arch')) {
          return 'arch';
        }
      }

      return 'unknown';
    } catch (error) {
      logger.error('Error detecting OS', { error: error.message });
      return 'unknown';
    }
  }

  async installDependency(dependencyKey) {
    const dep = this.dependencies[dependencyKey];
    
    if (!dep) {
      throw new Error(`Unknown dependency: ${dependencyKey}`);
    }

    const os = await this.detectOS();
    const installCommand = dep.installCommands[os];

    if (!installCommand) {
      throw new Error(`No installation command for ${dep.name} on ${os}`);
    }

    logger.info(`Installing ${dep.name}...`, { os, command: installCommand });

    try {
      // Execute installation command
      const { stdout, stderr } = await execAsync(installCommand, {
        timeout: 300000 // 5 minutes timeout
      });

      logger.info(`${dep.name} installed successfully`, { 
        stdout: stdout.substring(0, 200),
        stderr: stderr.substring(0, 200)
      });

      // Verify installation
      const verification = await this.checkDependency(dep.checkCommand, dep.name);

      return {
        success: verification.installed,
        message: verification.installed 
          ? `${dep.name} installed successfully` 
          : `Installation completed but verification failed`,
        version: verification.version,
        logs: {
          stdout: stdout.substring(0, 500),
          stderr: stderr.substring(0, 500)
        }
      };

    } catch (error) {
      logger.error(`Failed to install ${dep.name}`, { error: error.message });
      
      return {
        success: false,
        message: `Failed to install ${dep.name}: ${error.message}`,
        error: error.message
      };
    }
  }

  async installAllMissing() {
    const check = await this.checkAllDependencies();
    const results = [];

    for (const [key, status] of Object.entries(check.dependencies)) {
      if (!status.installed && key !== 'nodejs') {
        logger.info(`Installing missing dependency: ${key}`);
        const result = await this.installDependency(key);
        results.push({ dependency: key, ...result });
      }
    }

    return {
      installed: results,
      allSuccess: results.every(r => r.success)
    };
  }

  async checkPermissions() {
    const permissions = {
      audioAccess: false,
      sudoAccess: false
    };

    try {
      // Check if user has audio group access
      const { stdout } = await execAsync('groups');
      permissions.audioAccess = stdout.includes('audio') || stdout.includes('pulse-access');
    } catch (error) {
      logger.warn('Could not check audio permissions', { error: error.message });
    }

    try {
      // Check sudo access (non-interactive)
      await execAsync('sudo -n true', { timeout: 1000 });
      permissions.sudoAccess = true;
    } catch (error) {
      permissions.sudoAccess = false;
      logger.debug('Sudo requires password');
    }

    return permissions;
  }

  async requestAudioPermissions() {
    try {
      const username = process.env.USER || process.env.USERNAME;
      
      if (!username) {
        throw new Error('Could not determine username');
      }

      // Add user to audio group
      const command = `sudo usermod -a -G audio ${username}`;
      await execAsync(command);

      logger.info('Audio permissions granted', { username });

      return {
        success: true,
        message: 'Audio permissions granted. Please log out and log back in for changes to take effect.',
        requiresRelogin: true
      };

    } catch (error) {
      logger.error('Failed to grant audio permissions', { error: error.message });
      
      return {
        success: false,
        message: `Failed to grant audio permissions: ${error.message}`,
        error: error.message
      };
    }
  }

  getInstallationInstructions(os) {
    const instructions = {
      debian: {
        title: 'Ubuntu/Debian Installation',
        commands: [
          'sudo apt-get update',
          'sudo apt-get install -y sox libsox-fmt-all pulseaudio pavucontrol'
        ]
      },
      rhel: {
        title: 'CentOS/RHEL/Fedora Installation',
        commands: [
          'sudo yum install -y sox pulseaudio'
        ]
      },
      arch: {
        title: 'Arch Linux Installation',
        commands: [
          'sudo pacman -S --noconfirm sox pulseaudio'
        ]
      },
      unknown: {
        title: 'Manual Installation Required',
        commands: [
          'Please install SoX and PulseAudio manually for your system'
        ]
      }
    };

    return instructions[os] || instructions.unknown;
  }
}

export default SystemCheckService;
