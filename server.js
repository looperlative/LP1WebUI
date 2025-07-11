const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// UDP socket for communication with the device software
const udpSocket = dgram.createSocket('udp4');

// Configure UDP socket
udpSocket.bind(() => {
    udpSocket.setBroadcast(true);
    console.log('UDP socket ready and broadcast enabled');
});

// Add more detailed UDP socket event handlers
udpSocket.on('listening', () => {
    const address = udpSocket.address();
    console.log(`UDP socket listening on ${address.address}:${address.port}`);
});

udpSocket.on('error', (err) => {
    console.error('UDP socket error:', err);
});

// Constants
const PORT = 3000;
const BROADCAST_ADDR = '255.255.255.255';
const LP_SERVER_PORT = 5667;
// Connection timeout in milliseconds (5 seconds)
const CONNECTION_TIMEOUT = 5000;
// Reconnection interval in milliseconds (1 second)
const RECONNECTION_INTERVAL = 1000;

let lpAddress = null;
let lastStatusTime = 0;
let reconnectionTimer = null;
let connectionCheckTimer = null;
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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.get('/api/status', (req, res) => {
    res.json(lpStatus);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    // Send current status to the client
    socket.emit('status', lpStatus);

    // If we already have a device address, inform the client
    if (lpAddress) {
        socket.emit('device_found', lpAddress);
    } else {
        socket.emit('device_not_found');
    }

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Function to find the Looperlative device on the network
function findLooperlative() {
    console.log('Connecting to Looperlative device...');
    tryBroadcastDiscovery();
}

// Function to check if device connection has timed out
function checkConnectionTimeout() {
    if (lpAddress && (Date.now() - lastStatusTime > CONNECTION_TIMEOUT)) {
        console.log('Device connection timed out - no status received for 5 seconds');
        // Clear device address and notify clients
        lpAddress = null;
        io.emit('device_not_found');

        // Start reconnection attempts
        startReconnectionTimer();
    }
}

// Function to start reconnection timer
function startReconnectionTimer() {
    // Clear any existing timer
    if (reconnectionTimer) {
        clearInterval(reconnectionTimer);
    }

    // Start new reconnection timer
    reconnectionTimer = setInterval(() => {
        if (!lpAddress) {
            console.log('Attempting to reconnect to device...');
            findLooperlative();
        } else {
            // If we're connected, stop the reconnection timer
            clearInterval(reconnectionTimer);
            reconnectionTimer = null;
        }
    }, RECONNECTION_INTERVAL);
}

// Try broadcast discovery as a fallback
function tryBroadcastDiscovery() {
    console.log('Trying broadcast discovery...');

    // Send a broadcast discovery message
    // Using the correct XML format for discovery as per IPLooperlative.cpp
    const discoveryMsg = Buffer.from('<query>id</query>', 'ascii');

    udpSocket.send(discoveryMsg, 0, discoveryMsg.length, LP_SERVER_PORT, BROADCAST_ADDR, (err) => {
        if (err) {
            console.error('Error sending broadcast discovery:', err.message);
        } else {
            console.log('Broadcast discovery message sent');
        }
    });
}

// Function to send commands to the device
function sendCommandToDevice(cmd) {
    if (!lpAddress) {
        console.error('No Looperlative device found');
        return;
    }

    // Format command as XML based on IPLooperlative.cpp protocol
    let xmlCmd;
    if (cmd === 'STATUS') {
        // Use the compact status format as it's more efficient
        xmlCmd = '<query>status compact</query>';
    }

    const cmdBuffer = Buffer.from(xmlCmd, 'ascii');
    udpSocket.send(cmdBuffer, 0, cmdBuffer.length, LP_SERVER_PORT, lpAddress, (err) => {
        if (err) {
            console.error('Error sending command:', err);
	}
    });
}

// Parse IP status data received from the device
function parseIPStatus(buffer) {
    try {
	if (buffer[0] === 0xf0) {
	    //console.warn("Unhandled Sysex packet received");
	    return;
	}

        // Try to parse as binary compact status format
        // Based on the control_compact_status struct in IPLooperlative.h
        if (buffer.length >= 8) { // Need at least sample_rate + num_tracks (8 bytes)
            // Read num_tracks to verify format
            const numTracks = buffer.readInt32BE(4); // second int is num_tracks

            if (numTracks === 8 &&  buffer.length >= (8 + (numTracks * 28))) {
                lpStatus.ntracks = numTracks;

                // Parse track data
                for (let i = 0; i < numTracks; i++) {
                    // Offsets for each array in the struct
                    // Each int is 4 bytes
                    const stateOffset = 8 + (i * 4);  // 8 = sample_rate + num_tracks
                    const lengthOffset = 8 + (numTracks * 4) + (i * 4);
                    const positionOffset = 8 + (numTracks * 8) + (i * 4);
                    const levelOffset = 8 + (numTracks * 12) + (i * 4);
                    const panOffset = 8 + (numTracks * 16) + (i * 4);
                    const feedbackOffset = 8 + (numTracks * 20) + (i * 4);
                    const selectedOffset = 8 + (numTracks * 24) + (i * 4);

		    lpStatus.length[i] = buffer.readInt32BE(lengthOffset);
		    lpStatus.position[i] = buffer.readInt32BE(positionOffset);
                    lpStatus.status[i] = buffer.readInt32BE(stateOffset);
                    lpStatus.level[i] = buffer.readInt32BE(levelOffset);
                    lpStatus.pan[i] = buffer.readInt32BE(panOffset);
                    lpStatus.feedback[i] = buffer.readInt32BE(feedbackOffset);
                    if (buffer.readInt32BE(selectedOffset)) {
                        lpStatus.selected = i;
                    }
                }
            } else {
                console.warn('Invalid track count in compact status:', numTracks);
            }
        } else {
            console.warn('Buffer too small for compact status format');
        }

        // Update status and notify clients
        io.emit('status', lpStatus);
    } catch (err) {
        console.error('Error parsing status data:', err);
    }
}

// UDP message handling
udpSocket.on('message', (msg, rinfo) => {
    try {
        const textContent = msg.toString('ascii');

        // If this is a response to our discovery message
        if (rinfo.port === LP_SERVER_PORT) {
            // Check if it's an XML response with device ID
            if (textContent.includes('<id>')) {
                // Extract device ID using regex similar to IPLooperlative.cpp
                const idMatch = textContent.match(/<id>(.*?)<\/id>/);
                if (idMatch && idMatch[1]) {
                    const deviceId = idMatch[1];
                    lpAddress = rinfo.address;
                    console.log(`Found Looperlative device at ${lpAddress} with ID: ${deviceId}`);

                    // Update last status time
                    lastStatusTime = Date.now();

                    // Stop reconnection timer if it's running
                    if (reconnectionTimer) {
                        clearInterval(reconnectionTimer);
                        reconnectionTimer = null;
                    }

                    // Notify all connected clients
                    io.emit('device_found', { address: lpAddress, id: deviceId });

                    // Request initial status
                    sendCommandToDevice('STATUS');
                }
            } else if (textContent.includes('<status>') || textContent.includes('<track>')) {
                // This is a status response
                parseIPStatus(msg);
                // Update last status time
                lastStatusTime = Date.now();
            } else if (rinfo.address === lpAddress) {
                // Any other message from our device
                parseIPStatus(msg);
                // Update last status time
                lastStatusTime = Date.now();
            }
        }
    } catch (err) {
        console.error('Error processing UDP message:', err);
    }
});

// Error handling
udpSocket.on('error', (err) => {
    console.error('UDP socket error:', err);
    io.emit('device_error', err.message);
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start the connection check timer
    connectionCheckTimer = setInterval(checkConnectionTimeout, 1000);

    // Start initial device discovery
    findLooperlative();

    // Start reconnection timer if not connected
    if (!lpAddress) {
        startReconnectionTimer();
    }

    // Periodically request status updates if we have a device
    setInterval(() => {
        if (lpAddress) {
            sendCommandToDevice('STATUS');
        }
    }, 500);
});
