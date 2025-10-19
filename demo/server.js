import express from "express";
import http from "http";
import { Server as SocketIo } from "socket.io";
import cors from "cors";
import Redis from "ioredis";
import { RedisSaver } from "checkpoint-redis";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ChatBot {
  constructor(checkpointSaver, ollamaUrl) {
    this.checkpointSaver = checkpointSaver;
    this.ollamaUrl = ollamaUrl;
    this.sessions = new Map(); // Store active chat sessions
    this.model = null; // Will be set after checking available models
    this.availableModels = [];
    this.initializeModel();
  }

  async initializeModel() {
    try {
      // Get available models
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        this.availableModels = data.models || [];

        // Try to find a suitable model
        const preferredModels = [
          "llama3.2:latest",
          "llama3.2:3b",
          "llama3.2",
          "llama3",
          "llama2",
          "mistral",
          "codellama",
        ];
        this.model =
          preferredModels.find((model) =>
            this.availableModels.some((m) => m.name.includes(model))
          ) || this.availableModels[0]?.name;

        console.log(`🤖 Using Ollama model: ${this.model || "none available"}`);
        if (this.availableModels.length > 0) {
          console.log(
            `📋 Available models: ${this.availableModels.map((m) => m.name).join(", ")}`
          );
        }
      }
    } catch {
      console.log(
        "⚠️  Could not connect to Ollama, will use fallback responses"
      );
    }
  }

  async setModel(modelName) {
    if (this.availableModels.some((m) => m.name === modelName)) {
      this.model = modelName;
      console.log(`🤖 Switched to Ollama model: ${this.model}`);
      return true;
    }
    return false;
  }

  async getOllamaStatus() {
    try {
      // Check Ollama status in real-time
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const availableModels = data.models || [];

        // Update cached models
        this.availableModels = availableModels;

        // Try to find a suitable model if we don't have one
        if (!this.model && availableModels.length > 0) {
          const preferredModels = [
            "llama3.2:latest",
            "llama3.2:3b",
            "llama3.2",
            "llama3",
            "llama2",
            "mistral",
            "codellama",
          ];
          this.model =
            preferredModels.find((model) =>
              availableModels.some((m) => m.name.includes(model))
            ) || availableModels[0]?.name;
        }

        return {
          connected: true,
          model: this.model,
          availableModels: availableModels.map((m) => m.name),
        };
      } else {
        return {
          connected: false,
          model: null,
          availableModels: [],
        };
      }
    } catch {
      return {
        connected: false,
        model: null,
        availableModels: [],
      };
    }
  }

  async processMessage(threadId, message, userId) {
    // Get or create session
    if (!this.sessions.has(threadId)) {
      this.sessions.set(threadId, {
        messages: [],
        userId,
        createdAt: new Date(),
      });
    }

    const session = this.sessions.get(threadId);
    session.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Simulate AI processing with checkpoint persistence
    const config = {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: "chat",
        user_id: userId,
      },
    };

    // Create a simple checkpoint representing the conversation state
    const checkpoint = {
      v: 1,
      ts: new Date().toISOString(),
      id: `checkpoint_${Date.now()}`,
      channel_values: {
        messages: session.messages,
      },
      channel_versions: {},
      versions_seen: {},
    };

    const metadata = {
      source: "chat",
      step: session.messages.length,
      user_id: userId,
    };

    // Save checkpoint
    await this.checkpointSaver.put(config, checkpoint, metadata);

    // Generate AI response using Ollama (pass all messages including the current user message)
    const aiResponse = await this.generateResponse(message, session.messages);

    session.messages.push({
      role: "assistant",
      content: aiResponse,
      timestamp: new Date(),
    });

    // Update checkpoint with AI response
    const updatedCheckpoint = {
      ...checkpoint,
      channel_values: {
        messages: session.messages,
      },
    };

    await this.checkpointSaver.put(config, updatedCheckpoint, metadata);

    return {
      response: aiResponse,
      session: session,
      checkpointId: checkpoint.id,
      config: config,
      metadata: metadata,
    };
  }

  async generateResponse(userMessage, messageHistory) {
    // If no model is available, use fallback
    if (!this.model) {
      return this.getFallbackResponse();
    }

    try {
      // Build conversation context
      const conversationContext = messageHistory
        .slice(-10) // Keep last 10 messages for context
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n");

      const prompt = `You are a helpful AI assistant in a chat application. You're having a conversation with a user. Be friendly, helpful, and engaging. Keep responses concise but meaningful.

Previous conversation:
${conversationContext}

Assistant:`;

      // Call Ollama API
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 200,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      return (
        data.response || "I'm sorry, I couldn't generate a response right now."
      );
    } catch (error) {
      console.error("Error calling Ollama:", error);
      return this.getFallbackResponse();
    }
  }

  getFallbackResponse() {
    const fallbackResponses = [
      "I'm having trouble connecting to my AI model right now, but I'd love to chat! What's on your mind?",
      "Sorry, there seems to be a technical issue. Let me try a different approach - what would you like to talk about?",
      "I'm experiencing some connectivity issues, but I'm still here to chat! What's going on in your world?",
      "I'm here to chat! What would you like to talk about?",
      "That's interesting! Tell me more about that.",
      "I understand what you're saying. How do you feel about it?",
      "That's a great point. What made you think of that?",
      "I see. Can you elaborate on that?",
    ];

    return fallbackResponses[
      Math.floor(Math.random() * fallbackResponses.length)
    ];
  }

  async getSessionHistory(threadId) {
    return this.sessions.get(threadId) || null;
  }

  async deleteSession(threadId) {
    this.sessions.delete(threadId);
    // Also delete from checkpoint store
    await this.checkpointSaver.deleteThread(threadId);
  }
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new SocketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Initialize Redis and checkpoint saver
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
let checkpointSaver = new RedisSaver({
  connection: redis,
  // TTL disabled by default
});

// Initialize chat bot
const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
const chatBot = new ChatBot(checkpointSaver, ollamaUrl);

// Routes
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/ollama-status", async (req, res) => {
  const status = await chatBot.getOllamaStatus();
  res.json(status);
});

app.post("/api/set-model", async (req, res) => {
  const { modelName } = req.body;
  const success = await chatBot.setModel(modelName);
  res.json({ success, model: chatBot.model });
});

app.post("/api/toggle-ttl", (req, res) => {
  const { useTtl } = req.body;
  const ttlValue = useTtl ? 3600 : undefined; // 1 hour or no TTL

  // Create new checkpoint saver with updated TTL
  checkpointSaver = new RedisSaver({
    connection: redis,
    ttl: ttlValue,
  });

  // Update chat bot with new saver
  chatBot.checkpointSaver = checkpointSaver;

  res.json({
    success: true,
    ttl: ttlValue,
    message: useTtl ? "TTL enabled (1 hour)" : "TTL disabled",
  });
});

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_chat", (data) => {
    const { threadId, userId } = data;
    socket.join(threadId);
    console.log(`User ${userId} joined thread ${threadId}`);

    // Send Ollama status
    chatBot.getOllamaStatus().then((status) => {
      socket.emit("ollama_status", status);
    });

    // Send existing session history if available
    chatBot.getSessionHistory(threadId).then((session) => {
      if (session) {
        socket.emit("session_restored", {
          threadId,
          messages: session.messages,
        });
      }
    });
  });

  socket.on("set_model", async (data) => {
    const { modelName } = data;
    const success = await chatBot.setModel(modelName);
    socket.emit("model_changed", { success, model: chatBot.model });
  });

  socket.on("send_message", async (data) => {
    const { threadId, message, userId } = data;

    try {
      const result = await chatBot.processMessage(threadId, message, userId);

      // Broadcast to all clients in the thread
      io.to(threadId).emit("message_received", {
        threadId,
        message: {
          role: "user",
          content: message,
          timestamp:
            result.session.messages[result.session.messages.length - 2]
              .timestamp,
        },
      });

      io.to(threadId).emit("message_received", {
        threadId,
        message: {
          role: "assistant",
          content: result.response,
          timestamp:
            result.session.messages[result.session.messages.length - 1]
              .timestamp,
        },
      });

      // Send detailed checkpoint info
      socket.emit("checkpoint_saved", {
        threadId,
        checkpointId: result.checkpointId,
        messageCount: result.session.messages.length,
        timestamp: new Date().toISOString(),
        config: result.config.configurable,
        metadata: result.metadata,
        sessionCreated: result.session.createdAt,
        totalMessages: result.session.messages.length,
      });
    } catch (error) {
      console.error("Error processing message:", error);
      socket.emit("error", {
        message: "Failed to process message",
        error: error.message,
      });
    }
  });

  socket.on("clear_chat", async (data) => {
    const { threadId } = data;

    try {
      await chatBot.deleteSession(threadId);
      io.to(threadId).emit("chat_cleared", { threadId });
      console.log(`Chat cleared for thread ${threadId}`);
    } catch (error) {
      console.error("Error clearing chat:", error);
      socket.emit("error", {
        message: "Failed to clear chat",
        error: error.message,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Chat demo server running on port ${PORT}`);
  console.log(`📊 Redis connected: ${redis.status}`);
  console.log(`💾 Checkpoint saver initialized with TTL: 3600s`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  await redis.quit();
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
