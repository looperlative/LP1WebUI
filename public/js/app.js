// Connect to the server using Socket.IO
const socket = io();

// DOM Elements
const deviceVersion = document.getElementById('device-version');
const statusMessage = document.getElementById('status-message');
const midiMsgType = document.getElementById('midi-msg-type');
const midiMsgNumber = document.getElementById('midi-msg-number');
const midiFunctions = document.getElementById('midi-functions');
const midiChannel = document.getElementById('midi-channel');
const mainLevel = document.getElementById('main-level');

// Device status
let deviceConnected = false;
let connectionAttempts = 0;
let lpStatus = {
    status: Array(8).fill(0),
    level: Array(8).fill(0),
    pan: Array(8).fill(0),
    feedback: Array(8).fill(0),
    length: Array(8).fill(0),
    position: Array(8).fill(0),
    selected: 0,
    ntracks: 8
};

// Status bar is now part of the HTML structure, no need to create it dynamically

// Status styles are now defined in the CSS file

let connected = false;
let buttonConfig = Array(384).fill().map(() => Array(8).fill(0));
let lpConfig = {};

// Constants
const STATUS_LABELS = ['Empty', 'Recording', 'Overdubbing', 'Stopped', 'Playing', 'Replacing'];
const FUNCTION_NAMES = [
    'None', 'Record', 'Overdub', 'Replace', 'Mute', 'Play', 'Stop', 'Clear',
    'Undo', 'Redo', 'Reverse', 'Half Speed', 'Double Speed', 'Full Speed',
    'Next Track', 'Prev Track', 'Select Track 1', 'Select Track 2',
    'Select Track 3', 'Select Track 4', 'Select Track 5', 'Select Track 6',
    'Select Track 7', 'Select Track 8'
];

// Initialize the UI
function initUI() {
    // Populate MIDI channel dropdown
    for (let i = 1; i <= 16; i++) {
        const option = document.createElement('option');
        option.value = i - 1;
        option.textContent = i.toString();
        midiChannel.appendChild(option);
    }

    // Populate MIDI message number dropdown
    for (let i = 0; i < 128; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i.toString();
        midiMsgNumber.appendChild(option);
    }

    // Populate main level dropdown
    for (let i = -40; i <= 0; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i.toString() + ' dB';
        mainLevel.appendChild(option);
    }

    // Add event listeners to buttons
    midiMsgType.addEventListener('change', handleMidiMsgTypeChange);
    midiMsgNumber.addEventListener('change', handleMidiMsgNumberChange);
}

// Update the UI with the latest status
function updateUI() {
    // Update track status and controls
    for (let i = 0; i < lpStatus.ntracks; i++) {
	const tracknum = i + 1;
        const track = document.getElementById(`track-${tracknum}`);
        if (!track) {
	    console.log('Could not find track ' + tracknum);
	    continue;
	}

        // Update selected state
        if (i === lpStatus.selected) {
            track.classList.add('selected');
        } else {
            track.classList.remove('selected');
        }

        // Update status
        const statusEl = document.getElementById(`track-${tracknum}-status`);
        if (statusEl) {
            const statusText = STATUS_LABELS[lpStatus.status[i]] || 'Unknown';
            statusEl.textContent = statusText;
            statusEl.className = 'track-status ' + statusText.toLowerCase();
        }

        document.getElementById(`track-${tracknum}-length`).textContent =
	    formatSamples(lpStatus.length[i] || 0);
        document.getElementById(`track-${tracknum}-position`).textContent =
	    formatSamples(lpStatus.position[i] || 0);
        document.getElementById(`track-${tracknum}-level`).textContent =
	    lpStatus.level[i] || 0;
        document.getElementById(`track-${tracknum}-pan`).textContent =
	    lpStatus.pan[i] || 0;
        document.getElementById(`track-${tracknum}-feedback`).textContent =
	    lpStatus.feedback[i] || 10;
    }
}

function formatSamples(samples) {
    // Format sample count to be more readable
    if (samples >= 1000000) {
        return (samples / 1000000).toFixed(2) + 'M';
    } else if (samples >= 1000) {
        return (samples / 1000).toFixed(1) + 'k';
    }
    return samples;
}

// Socket.IO event handlers
socket.on('connect', () => {
    connected = true;
    statusMessage.textContent = 'Connected to server';
    updateUI();
});

socket.on('disconnect', () => {
    connected = false;
    statusMessage.textContent = 'Disconnected from server';
    updateUI();
});

socket.on('status', (status) => {
    //console.log('Received status update:', status);
    if (status) {
        lpStatus = status;
        updateUI();
    }
});

socket.on('version', (version) => {
    deviceVersion.textContent = `Version: ${version}`;
});

socket.on('config', (config) => {
    lpConfig = config;
    // Update configuration UI elements with received config
    updateConfigUI();
});

socket.on('buttonConfig', (config) => {
    buttonConfig = config;
    updateButtonConfigUI();
});

// Add handlers for device connection events
socket.on('device_found', (data) => {
    console.log('Device found:', data);
    deviceConnected = true;

    // Update status message with version string if available
    if (data && data.id) {
        statusMessage.textContent = data.id;
    } else {
        statusMessage.textContent = 'Connected';
    }
});

socket.on('device_not_found', () => {
    console.log('Device not found');
    deviceConnected = false;
    // Update status message in status bar
    statusMessage.textContent = 'Not connected';
});

// Update the configuration UI based on received config
function updateConfigUI() {
    // This would be implemented based on the actual config structure
    // For now, just a placeholder
    console.log('Received config:', lpConfig);
}

// Update the button configuration UI
function updateButtonConfigUI() {
    const selectedType = parseInt(midiMsgType.value);
    const selectedNumber = parseInt(midiMsgNumber.value);
    const btnIndex = selectedType * 128 + selectedNumber;

    // Update function selectors
    for (let i = 0; i < 8; i++) {
        const select = document.getElementById(`function-${i}`);
        if (select) {
            select.value = buttonConfig[btnIndex][i];
        }
    }
}

// Event handlers
function handleMidiMsgTypeChange() {
    const selectedType = parseInt(midiMsgType.value);
    // Clear the message number dropdown and repopulate based on type
    midiMsgNumber.innerHTML = '';

    const count = selectedType === 0 ? 128 : 128; // All types use 0-127 for now

    for (let i = 0; i < count; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i.toString();
        midiMsgNumber.appendChild(option);
    }

    // Reset to first option
    midiMsgNumber.value = '0';

    // Update button config UI
    updateButtonConfigUI();
}

function handleMidiMsgNumberChange() {
    // Update button config UI
    updateButtonConfigUI();
}

// Initialize the UI when the DOM is loaded
document.addEventListener('DOMContentLoaded', initUI);
