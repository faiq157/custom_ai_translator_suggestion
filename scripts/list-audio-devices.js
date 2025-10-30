#!/usr/bin/env node

/**
 * Helper script to list available audio devices
 * Run: node scripts/list-audio-devices.js
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function listAudioDevices() {
  console.log('\n🎤 Available Audio Devices:\n');
  console.log('=' .repeat(60));

  try {
    // Try PulseAudio (Linux)
    const { stdout } = await execAsync('pactl list sources short');
    console.log('\n📍 PulseAudio Sources (Linux):');
    console.log('-'.repeat(60));
    
    const sources = stdout.trim().split('\n');
    sources.forEach((source, index) => {
      const parts = source.split('\t');
      const name = parts[1];
      const description = parts[3] || '';
      
      console.log(`\n${index + 1}. ${name}`);
      console.log(`   Type: ${description}`);
      
      // Highlight monitor devices (system audio)
      if (name.includes('monitor')) {
        console.log('   ⭐ SYSTEM AUDIO - Use this to capture meeting participants!');
      } else {
        console.log('   🎤 MICROPHONE - Only captures your voice');
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('\n💡 To capture ALL meeting audio (including other participants):');
    console.log('   1. Find a device with "monitor" in the name above');
    console.log('   2. Copy the device name');
    console.log('   3. Add to .env file:');
    console.log('      AUDIO_DEVICE=<device_name>');
    console.log('\n   Example:');
    console.log('      AUDIO_DEVICE=alsa_output.pci-0000_00_1f.3.analog-stereo.monitor');
    console.log('\n');

  } catch (error) {
    console.log('\n⚠️  PulseAudio not found. Trying alternative methods...\n');
    
    // Try ALSA (Linux alternative)
    try {
      const { stdout } = await execAsync('arecord -L');
      console.log('📍 ALSA Devices (Linux):');
      console.log('-'.repeat(60));
      console.log(stdout);
    } catch (err) {
      console.log('⚠️  ALSA not found either.');
    }

    console.log('\n💡 For Windows/Mac:');
    console.log('   - Windows: Install VB-Audio Virtual Cable');
    console.log('   - Mac: Install BlackHole or Loopback');
    console.log('   - Then set AUDIO_DEVICE in .env to the virtual device name\n');
  }
}

listAudioDevices().catch(console.error);
