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

    // Create track UI
    createTrackUI();

    // Add event listeners to buttons
    midiMsgType.addEventListener('change', handleMidiMsgTypeChange);
    midiMsgNumber.addEventListener('change', handleMidiMsgNumberChange);
}

// Create the track UI elements
function createTrackUI() {
    for (let i = 0; i < lpStatus.ntracks; i++) {
        const track = document.createElement('div');
        track.className = 'track';
        track.id = `track-${i}`;
        if (i === lpStatus.selected) {
            track.classList.add('selected');
        }

        // Track header
        const header = document.createElement('div');
        header.className = 'track-header';

        const title = document.createElement('div');
        title.className = 'track-title';
        title.textContent = `Track ${i + 1}`;

        const status = document.createElement('div');
        status.className = 'track-status';
        status.id = `track-${i}-status`;
        status.textContent = STATUS_LABELS[lpStatus.status[i]] || 'Unknown';
        status.classList.add(STATUS_LABELS[lpStatus.status[i]].toLowerCase());

        header.appendChild(title);
        header.appendChild(status);
        track.appendChild(header);

        // Track controls
        const controls = document.createElement('div');
        controls.className = 'track-controls';

        // Level slider
        const levelGroup = document.createElement('div');
        levelGroup.className = 'track-slider-group';

        const levelLabel = document.createElement('div');
        levelLabel.className = 'track-slider-label';
        levelLabel.innerHTML = '<span>Level:</span><span id="track-' + i + '-level-value">' + lpStatus.level[i] + '</span>';

        const levelSlider = document.createElement('input');
        levelSlider.type = 'range';
        levelSlider.className = 'track-slider';
        levelSlider.min = '-40';
        levelSlider.max = '0';
        levelSlider.value = lpStatus.level[i];
        levelSlider.id = `track-${i}-level`;
        levelSlider.dataset.track = i;
        levelSlider.dataset.param = 'level';
        levelSlider.addEventListener('input', handleTrackParamChange);

        levelGroup.appendChild(levelLabel);
        levelGroup.appendChild(levelSlider);
        controls.appendChild(levelGroup);

        // Pan slider
        const panGroup = document.createElement('div');
        panGroup.className = 'track-slider-group';

        const panLabel = document.createElement('div');
        panLabel.className = 'track-slider-label';
        panLabel.innerHTML = '<span>Pan:</span><span id="track-' + i + '-pan-value">' + lpStatus.pan[i] + '</span>';

        const panSlider = document.createElement('input');
        panSlider.type = 'range';
        panSlider.className = 'track-slider';
        panSlider.min = '-64';
        panSlider.max = '63';
        panSlider.value = lpStatus.pan[i];
        panSlider.id = `track-${i}-pan`;
        panSlider.dataset.track = i;
        panSlider.dataset.param = 'pan';
        panSlider.addEventListener('input', handleTrackParamChange);

        panGroup.appendChild(panLabel);
        panGroup.appendChild(panSlider);
        controls.appendChild(panGroup);

        // Feedback slider
        const feedbackGroup = document.createElement('div');
        feedbackGroup.className = 'track-slider-group';

        const feedbackLabel = document.createElement('div');
        feedbackLabel.className = 'track-slider-label';
        feedbackLabel.innerHTML = '<span>Feedback:</span><span id="track-' + i + '-feedback-value">' + lpStatus.feedback[i] + '</span>';

        const feedbackSlider = document.createElement('input');
        feedbackSlider.type = 'range';
        feedbackSlider.className = 'track-slider';
        feedbackSlider.min = '0';
        feedbackSlider.max = '100';
        feedbackSlider.value = lpStatus.feedback[i];
        feedbackSlider.id = `track-${i}-feedback`;
        feedbackSlider.dataset.track = i;
        feedbackSlider.dataset.param = 'feedback';
        feedbackSlider.addEventListener('input', handleTrackParamChange);

        feedbackGroup.appendChild(feedbackLabel);
        feedbackGroup.appendChild(feedbackSlider);
        controls.appendChild(feedbackGroup);

        // Track buttons
        track.appendChild(controls);
    }
}

// Helper function to create a button
function createButton(text, className, trackIndex, action) {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = `btn ${className} small`;
    button.dataset.track = trackIndex;
    button.dataset.action = action;
    button.addEventListener('click', handleTrackButtonClick);
    return button;
}

// Update the UI with the latest status
function updateUI() {
    // Update track status and controls
    for (let i = 0; i < lpStatus.ntracks; i++) {
        const track = document.getElementById(`track-${i}`);
        if (!track) continue;

        // Update selected state
        if (i === lpStatus.selected) {
            track.classList.add('selected');
        } else {
            track.classList.remove('selected');
        }

        // Update status
        const statusEl = document.getElementById(`track-${i}-status`);
        if (statusEl) {
            const statusText = STATUS_LABELS[lpStatus.status[i]] || 'Unknown';
            statusEl.textContent = statusText;
            statusEl.className = 'track-status ' + statusText.toLowerCase();
        }

        // Update sliders and values
        updateSliderValue(`track-${i}-level`, lpStatus.level[i]);
        updateSliderValue(`track-${i}-pan`, lpStatus.pan[i]);
        updateSliderValue(`track-${i}-feedback`, lpStatus.feedback[i]);
    }
}

// Helper function to update a slider value
function updateSliderValue(id, value) {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(`${id}-value`);

    if (slider) slider.value = value;
    if (valueEl) valueEl.textContent = value;
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
    console.log('Received status update:', status);
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
function handleReadConfig() {
    socket.emit('command', 'READ_CONFIG');
    statusMessage.textContent = 'Reading configuration...';
}

function handleSaveConfig() {
    socket.emit('command', 'SAVE_CONFIG');
    statusMessage.textContent = 'Saving configuration...';
}

function handleLoadConfig() {
    // This would typically open a file dialog
    // For now, just send a command to load a default config
    socket.emit('command', 'LOAD_CONFIG');
    statusMessage.textContent = 'Loading configuration...';
}

function handleUpgrade() {
    // This would typically open a file dialog
    // For now, just send a command to initiate upgrade
    socket.emit('command', 'UPGRADE');
    statusMessage.textContent = 'Initiating upgrade...';
}

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

function handleFunctionChange(event) {
    const functionIndex = parseInt(event.target.dataset.index);
    const functionValue = parseInt(event.target.value);
    const selectedType = parseInt(midiMsgType.value);
    const selectedNumber = parseInt(midiMsgNumber.value);
    const btnIndex = selectedType * 128 + selectedNumber;

    // Update local button config
    buttonConfig[btnIndex][functionIndex] = functionValue;

    // Send update to server
    socket.emit('updateButtonConfig', {
        btnIndex,
        functionIndex,
        value: functionValue
    });
}

function handleTrackParamChange(event) {
    const trackIndex = parseInt(event.target.dataset.track);
    const param = event.target.dataset.param;
    const value = parseInt(event.target.value);

    // Update value display
    const valueEl = document.getElementById(`track-${trackIndex}-${param}-value`);
    if (valueEl) valueEl.textContent = value;

    // Send command to server
    socket.emit('trackParam', {
        track: trackIndex,
        param,
        value
    });
}

function handleTrackButtonClick(event) {
    const trackIndex = parseInt(event.target.dataset.track);
    const action = event.target.dataset.action;

    // Send command to server
    socket.emit('trackAction', {
        track: trackIndex,
        action
    });
}

// Initialize the UI when the DOM is loaded
document.addEventListener('DOMContentLoaded', initUI);
