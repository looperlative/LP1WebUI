document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const errorMessage = document.getElementById('error-message');

    // Populate select dropdowns
    populateSelectOptions();

    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Add handlers for server events
    socket.on('device_found', (data) => {
        console.log('Device found:', data);
        errorMessage.textContent = '';
    });

    socket.on('device_not_found', () => {
        console.log('Device not found');
    });

    socket.on('error', (error) => {
        errorMessage.textContent = error;
    });

    socket.on('status-update', (data) => {
        console.log('Status update:', data);
        updateTracksDisplay(data);
    });

    // Function to update tracks display
    function updateTracksDisplay(data) {
        if (!data || !data.tracks) {
            console.error('Invalid status data received');
            return;
        }

        // Update each track's information
        data.tracks.forEach((track, index) => {
            const trackNum = index + 1;

            // Map state values to display text
            let stateText = 'empty';
            if (track.state === 'recording') stateText = 'recording';
            else if (track.state === 'playing') stateText = 'playing';
            else if (track.state === 'overdubbing') stateText = 'overdub';
            else if (track.state === 'paused') stateText = 'paused';

            // Update track elements
            document.getElementById(`track-${trackNum}-status`).textContent = stateText;
            document.getElementById(`track-${trackNum}-length`).textContent = formatSamples(track.length || 0);
            document.getElementById(`track-${trackNum}-position`).textContent = formatSamples(track.position || 0);
            document.getElementById(`track-${trackNum}-level`).textContent = track.level || 0;
            document.getElementById(`track-${trackNum}-pan`).textContent = track.pan || 0;
            document.getElementById(`track-${trackNum}-feedback`).textContent = track.feedback || 100;

            // Add appropriate classes based on state
            const statusElement = document.getElementById(`track-${trackNum}-status`);
            statusElement.className = 'track-status';
            if (track.state) {
                statusElement.classList.add(track.state);
            }
        });
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

    function populateSelectOptions() {
        // Populate MIDI channel options (1-16)
        const midiChannelSelect = document.getElementById('midi-channel');
        for (let i = 1; i <= 16; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            midiChannelSelect.appendChild(option);
        }

        // Populate MIDI message number options (0-127)
        const midiMsgNumberSelect = document.getElementById('midi-msg-number');
        for (let i = 0; i <= 127; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            midiMsgNumberSelect.appendChild(option);
        }

        // Populate controller min/max options (0-127)
        const controllerMinSelect = document.getElementById('controller-min');
        const controllerMaxSelect = document.getElementById('controller-max');
        for (let i = 0; i <= 127; i++) {
            const minOption = document.createElement('option');
            minOption.value = i;
            minOption.textContent = i;
            controllerMinSelect.appendChild(minOption);

            const maxOption = document.createElement('option');
            maxOption.value = i;
            maxOption.textContent = i;
            controllerMaxSelect.appendChild(maxOption);
        }

        // Populate MIDI BPM options (4-64)
        const midiBpmSelect = document.getElementById('midi-bpm');
        for (let i = 4; i <= 64; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            midiBpmSelect.appendChild(option);
        }

        // Populate volume fade time options (1-99)
        const volumeFadeTimeSelect = document.getElementById('volume-fade-time');
        for (let i = 1; i <= 99; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            volumeFadeTimeSelect.appendChild(option);
        }

        // Populate random restart min options (0-5)
        const randomRestartMinSelect = document.getElementById('random-restart-min');
        for (let i = 0; i <= 5; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            randomRestartMinSelect.appendChild(option);
        }

        // Populate random restart max options (1-20)
        const randomRestartMaxSelect = document.getElementById('random-restart-max');
        for (let i = 1; i <= 20; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            randomRestartMaxSelect.appendChild(option);
        }

        // Populate function options
        const functionOptions = [
            { value: 0, text: 'None' },
            { value: 1, text: 'Record' },
            { value: 2, text: 'Play' },
            { value: 3, text: 'Overdub' },
            { value: 4, text: 'Multiply' },
            { value: 5, text: 'Insert' },
            { value: 6, text: 'Replace' },
            { value: 7, text: 'Mute' },
            { value: 8, text: 'Reverse' },
            { value: 9, text: 'Undo' },
            { value: 10, text: 'Redo' },
            { value: 11, text: 'Clear' }
        ];

        for (let i = 1; i <= 8; i++) {
            const functionSelect = document.getElementById(`function-${i}`);
            functionOptions.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.text;
                functionSelect.appendChild(optionElement);
            });
        }

        // Populate controller function options
        const controllerFunctionOptions = [
            { value: 0, text: 'None' },
            { value: 1, text: 'Level' },
            { value: 2, text: 'Pan' },
            { value: 3, text: 'Feedback' }
        ];

        const controllerFuncSelect = document.getElementById('controller-func');
        controllerFunctionOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            controllerFuncSelect.appendChild(optionElement);
        });
    }

    // Initial status request
    socket.emit('get-status');
});
