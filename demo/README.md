# Checkpoint Redis Chat Demo

A simple chat application demonstrating the `checkpoint-redis` library with persistent conversation state using Redis and WebSockets.

## Features

- 🤖 **AI-Powered Chat** - Uses Ollama for intelligent responses with model selection
- 💾 **Persistent State** - All conversations are saved as checkpoints in Redis
- ⏰ **TTL Support** - Toggleable TTL (1 hour) or persistent checkpoints
- 📋 **Checkpoint Log** - Detailed sidebar showing all checkpoints with copy functionality
- 📈 **Live Stats** - Real-time checkpoint statistics

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Ollama installed locally (for AI responses)

### Running the Demo

1. **Start Ollama locally:**
   ```bash
   ollama serve
   # In another terminal, pull a model:
   ollama pull llama3.2:latest
   ```

2. **Start the services:**
   ```bash
   docker-compose up --build
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

4. **Start chatting!**
   - Type messages and see them saved as checkpoints
   - Select different AI models from the dropdown
   - Toggle TTL on/off for checkpoint expiration
   - View detailed checkpoint log in the sidebar
   - Copy checkpoint data with the copy button

## How It Works

Every message exchange creates a checkpoint in Redis:

```javascript
const checkpoint = {
  v: 1,
  ts: new Date().toISOString(),
  id: `checkpoint_${Date.now()}`,
  channel_values: {
    messages: session.messages
  }
};

await checkpointSaver.put(config, checkpoint, metadata);
```

## Configuration

Environment variables:

- `REDIS_URL` - Redis connection URL (default: `redis://redis:6379` for Docker)
- `OLLAMA_URL` - Ollama API URL (default: `http://host.docker.internal:11434` for Docker)
- `PORT` - Server port (default: `3000`)

## What This Demonstrates

1. **Checkpoint Persistence** - How to save conversation state
2. **TTL Management** - Toggleable automatic cleanup of old data
3. **Session Restoration** - Recovering state after disconnection
4. **Real-time Updates** - WebSocket integration with checkpoint saving
5. **Model Selection** - Dynamic AI model switching
6. **Checkpoint Logging** - Real-time checkpoint monitoring and debugging
