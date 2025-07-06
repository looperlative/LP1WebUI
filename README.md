# LP1WebUI - Looperlative Web Interface

A web-based UI for controlling Looperlative devices over IP. This embedded web server runs on Linux and provides a modern interface similar to the desktop LinuxConfigure application.

## Features

- Web-based interface accessible from any browser
- Real-time status updates via Socket.IO
- Track control (level, pan, feedback)
- Configuration management
- MIDI button configuration
- Device upgrade capability

## Requirements

- Node.js (v12 or higher)
- npm (v6 or higher)

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
cd LP1WebUI
npm install
```

## Usage

Start the server:

```bash
node server.js
```

Then open a web browser and navigate to:

```
http://localhost:3000
```

## Configuration

The server is configured to:
- Run on port 3000 by default
- Automatically discover Looperlative devices on the local network
- Communicate with the device using the IP-based protocol
