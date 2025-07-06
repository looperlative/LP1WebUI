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

    // Start device discovery immediately after binding
    findLooperlative();

    // Set up periodic discovery attempts
    setInterval(findLooperlative, 10000); // Try every 10 seconds
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
const DEVICE_HOSTNAME = 'pipad';
// Confirmed device IP address
const DEVICE_IP = '192.168.1.26';
// Device server port
const LP_SERVER_PORT = 5667;
let lpAddress = null;
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

    // Handle client commands
    socket.on('command', (cmd) => {
        if (lpAddress) {
            sendCommandToDevice(cmd);
        } else {
            socket.emit('device_error', 'No device connected');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Function to find the Looperlative device on the network
function findLooperlative() {
    console.log('Connecting to Looperlative device...');

    // Try multiple approaches to find the device
    tryDirectConnection();
    tryBroadcastDiscovery();
}

// Try to connect directly to the device using hostname and confirmed IP
function tryDirectConnection() {
    console.log('Trying direct connection to device...');

    // Try the confirmed IP address first (most reliable)
    console.log('Trying confirmed IP address:', DEVICE_IP);
    tryConnectToHost(DEVICE_IP);

    // Also try the hostname as backup
    setTimeout(() => {
        if (!lpAddress) {
            console.log('Trying hostname:', DEVICE_HOSTNAME);
            tryConnectToHost(DEVICE_HOSTNAME);
        }
    }, 2000);
}

// Try to connect to a specific host
function tryConnectToHost(host) {
    console.log(`Attempting connection to: ${host}`);

    // Send a direct discovery message
    // Using the correct XML format for discovery as per IPLooperlative.cpp
    const discoveryMsg = Buffer.from('<query>id</query>', 'ascii');

    udpSocket.send(discoveryMsg, 0, discoveryMsg.length, LP_SERVER_PORT, host, (err) => {
        if (err) {
            console.error(`Error sending discovery to ${host}:`, err.message);
        } else {
            console.log(`Discovery message sent to ${host}:${LP_SERVER_PORT}`);
        }
    });
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
    } else if (cmd.startsWith('TRACK_')) {
        // Example: TRACK_1_LEVEL_50 -> <track><id>1</id><level>50</level></track>
        const parts = cmd.split('_');
        if (parts.length >= 4) {
            const trackId = parts[1];
            const param = parts[2].toLowerCase();
            const value = parts[3];
            xmlCmd = `<track><id>${trackId}</id><${param}>${value}</${param}></track>`;
        } else {
            xmlCmd = cmd; // Fallback
        }
    } else {
        // Generic command format
        xmlCmd = `<command>${cmd}</command>`;
    }

    const cmdBuffer = Buffer.from(xmlCmd, 'ascii');
    udpSocket.send(cmdBuffer, 0, cmdBuffer.length, LP_SERVER_PORT, lpAddress, (err) => {
        if (err) {
            console.error('Error sending command:', err);
        } else {
            console.log(`Command '${xmlCmd}' sent to ${lpAddress}:${LP_SERVER_PORT}`);
        }
    });
}

// Parse IP status data received from the device
function parseIPStatus(buffer) {
    try {
        // First check if it's XML format (for backward compatibility)
        const dataStr = buffer.toString('ascii', 0, Math.min(20, buffer.length));
        if (dataStr.includes('<status>') || dataStr.includes('<track>')) {
            console.log('Parsing XML status data (legacy format)');
            parseXmlStatus(buffer);
            return;
        }

        // Try to parse as binary compact status format
        // Based on the control_compact_status struct in IPLooperlative.h
        if (buffer.length >= 8) { // Need at least sample_rate + num_tracks (8 bytes)
            console.log('Parsing binary compact status data');

            // Read num_tracks to verify format
            const numTracks = buffer.readInt32BE(4); // second int is num_tracks

            if (numTracks === 8) { // Valid number of tracks
                // Structure offsets based on control_compact_status
                const trackCount = 8;

                // Update our status object
                lpStatus.ntracks = numTracks;

                // Parse track data
                for (let i = 0; i < trackCount; i++) {
                    // Offsets for each array in the struct
                    // Each int is 4 bytes
                    const stateOffset = 8 + (i * 4);  // 8 = sample_rate + num_tracks
                    const lengthOffset = 8 + (trackCount * 4) + (i * 4);
                    const positionOffset = 8 + (trackCount * 8) + (i * 4);
                    const levelOffset = 8 + (trackCount * 12) + (i * 4);
                    const panOffset = 8 + (trackCount * 16) + (i * 4);
                    const feedbackOffset = 8 + (trackCount * 20) + (i * 4);
                    const selectedOffset = 8 + (trackCount * 24) + (i * 4);

                    if (stateOffset + 4 <= buffer.length) {
                        lpStatus.status[i] = buffer.readInt32BE(stateOffset);
                    }

                    if (levelOffset + 4 <= buffer.length) {
                        lpStatus.level[i] = buffer.readInt32BE(levelOffset);
                    }

                    if (panOffset + 4 <= buffer.length) {
                        lpStatus.pan[i] = buffer.readInt32BE(panOffset);
                    }

                    if (feedbackOffset + 4 <= buffer.length) {
                        lpStatus.feedback[i] = buffer.readInt32BE(feedbackOffset);
                    }

                    // Update selected track
                    if (selectedOffset + 4 <= buffer.length && buffer.readInt32BE(selectedOffset)) {
                        lpStatus.selected = i;
                    }
                }

                console.log('Successfully parsed compact status data');
            } else {
                console.log('Invalid track count in compact status:', numTracks);
            }
        } else {
            console.log('Buffer too small for compact status format');
        }

        // Update status and notify clients
        io.emit('status', lpStatus);
    } catch (err) {
        console.error('Error parsing status data:', err);
    }
}

// Parse legacy XML status format
function parseXmlStatus(buffer) {
    try {
        const data = buffer.toString('ascii');

        // Extract track information if available
        const trackMatches = data.match(/<track>(.*?)<\/track>/g);
        if (trackMatches) {
            trackMatches.forEach(trackXml => {
                // Extract track ID
                const idMatch = trackXml.match(/<id>(\d+)<\/id>/);
                if (idMatch && idMatch[1]) {
                    const trackId = parseInt(idMatch[1]) - 1; // 0-based index

                    // Extract track parameters
                    const levelMatch = trackXml.match(/<level>(-?\d+)<\/level>/);
                    if (levelMatch && levelMatch[1]) {
                        lpStatus.level[trackId] = parseInt(levelMatch[1]);
                    }

                    const panMatch = trackXml.match(/<pan>(-?\d+)<\/pan>/);
                    if (panMatch && panMatch[1]) {
                        lpStatus.pan[trackId] = parseInt(panMatch[1]);
                    }

                    const feedbackMatch = trackXml.match(/<feedback>(-?\d+)<\/feedback>/);
                    if (feedbackMatch && feedbackMatch[1]) {
                        lpStatus.feedback[trackId] = parseInt(feedbackMatch[1]);
                    }

                    const statusMatch = trackXml.match(/<status>(\d+)<\/status>/);
                    if (statusMatch && statusMatch[1]) {
                        lpStatus.status[trackId] = parseInt(statusMatch[1]);
                    }
                }
            });
        }

        // Update status and notify clients
        io.emit('status', lpStatus);
    } catch (err) {
        console.error('Error parsing XML status data:', err);
    }
}

// UDP message handling
udpSocket.on('message', (msg, rinfo) => {
    console.log(`Received UDP message from ${rinfo.address}:${rinfo.port}, length: ${msg.length}`);

    try {
        const textContent = msg.toString('ascii');
        console.log(`Message as text: ${textContent.substring(0, 50)}...`);

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

                    // Notify all connected clients
                    io.emit('device_found', { address: lpAddress, id: deviceId });

                    // Request initial status
                    sendCommandToDevice('STATUS');
                }
            } else if (textContent.includes('<status>') || textContent.includes('<track>')) {
                // This is a status response
                parseIPStatus(msg);
            } else if (rinfo.address === lpAddress) {
                // Any other message from our device
                console.log('Received other message from device');
                parseIPStatus(msg);
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
    console.log(`Server running on http://localhost:${PORT}`);

    // Periodically request status updates if we have a device
    setInterval(() => {
        if (lpAddress) {
            console.log(`Requesting status update from ${lpAddress}`);
            sendCommandToDevice('STATUS');
        }
    }, 5000); // Every 5 seconds
});
