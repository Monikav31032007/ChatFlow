const dns = require("dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const conversationRoutes = require("./routes/conversationRoutes");
const messageRoutes = require("./routes/messageRoutes");

const User = require("./models/User");

const app = express();
const server = http.createServer(app);

/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.set("io", io);

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(express.json());

/* =========================================================
   ROUTES
========================================================= */

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {
  res.json({
    message: "Real-Time Chat API is running",
  });
});

/* =========================================================
   ONLINE USERS TRACKING
========================================================= */

// Keeps track of how many active socket connections
// each user currently has.
const onlineUsers = new Map();

/* =========================================================
   SOCKET.IO CONNECTION
========================================================= */

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  /* -------------------------------------------------------
     JOIN PERSONAL USER ROOM
  ------------------------------------------------------- */

  socket.on("joinUser", async (userId) => {
    try {
      if (!userId) return;

      const userRoom = `user_${userId}`;

      socket.join(userRoom);

      socket.userId = userId.toString();

      // Track number of active connections for this user
      const currentConnections =
        onlineUsers.get(socket.userId) || 0;

      onlineUsers.set(
        socket.userId,
        currentConnections + 1
      );

      // Update user as online
      const user = await User.findByIdAndUpdate(
        userId,
        {
          isOnline: true,
        },
        {
          new: true,
        }
      ).select("-password");

      console.log(
        `User ${userId} joined personal room`
      );

      console.log(
        `Active connections for ${userId}:`,
        onlineUsers.get(socket.userId)
      );

      // Tell all connected clients that user is online
      io.emit("userStatusChanged", {
        userId: userId.toString(),
        isOnline: true,
        lastSeen: user?.lastSeen || null,
      });
    } catch (error) {
      console.error(
        "joinUser error:",
        error.message
      );
    }
  });

  /* -------------------------------------------------------
     JOIN CONVERSATION ROOM
  ------------------------------------------------------- */

  socket.on(
    "joinConversation",
    (conversationId) => {
      if (!conversationId) return;

      socket.join(conversationId.toString());

      console.log(
        `Socket ${socket.id} joined conversation ${conversationId}`
      );
    }
  );

  /* -------------------------------------------------------
     LEAVE CONVERSATION ROOM
  ------------------------------------------------------- */

  socket.on(
    "leaveConversation",
    (conversationId) => {
      if (!conversationId) return;

      socket.leave(conversationId.toString());

      console.log(
        `Socket ${socket.id} left conversation ${conversationId}`
      );
    }
  );

  /* -------------------------------------------------------
     TYPING
  ------------------------------------------------------- */

  socket.on("typing", (data) => {
    try {
      if (!data?.conversationId) return;

      socket
        .to(data.conversationId.toString())
        .emit("userTyping", {
          conversationId:
            data.conversationId.toString(),
          userId: data.userId?.toString(),
        });
    } catch (error) {
      console.error(
        "Typing event error:",
        error.message
      );
    }
  });

  /* -------------------------------------------------------
     STOP TYPING
  ------------------------------------------------------- */

  socket.on("stopTyping", (data) => {
    try {
      if (!data?.conversationId) return;

      socket
        .to(data.conversationId.toString())
        .emit("userStoppedTyping", {
          conversationId:
            data.conversationId.toString(),
          userId: data.userId?.toString(),
        });
    } catch (error) {
      console.error(
        "Stop typing event error:",
        error.message
      );
    }
  });

  /* -------------------------------------------------------
     MESSAGE EVENT
     
     IMPORTANT:
     Messages are now saved through the REST API.
     The messageController broadcasts the saved message.

     This event is kept only for compatibility.
  ------------------------------------------------------- */

  socket.on("sendMessage", (message) => {
    if (!message) return;

    console.log(
      "Socket sendMessage received:",
      message._id || "message"
    );
  });

  /* -------------------------------------------------------
     DISCONNECT
  ------------------------------------------------------- */

  socket.on("disconnect", async () => {
    try {
      console.log(
        "Socket disconnected:",
        socket.id
      );

      const userId = socket.userId;

      if (!userId) {
        return;
      }

      const currentConnections =
        onlineUsers.get(userId) || 1;

      if (currentConnections <= 1) {
        onlineUsers.delete(userId);

        const lastSeen = new Date();

        const user =
          await User.findByIdAndUpdate(
            userId,
            {
              isOnline: false,
              lastSeen,
            },
            {
              new: true,
            }
          ).select("-password");

        console.log(
          `User ${userId} is now offline`
        );

        // Tell all clients that user went offline
        io.emit("userStatusChanged", {
          userId: userId.toString(),
          isOnline: false,
          lastSeen:
            user?.lastSeen || lastSeen,
        });
      } else {
        onlineUsers.set(
          userId,
          currentConnections - 1
        );

        console.log(
          `User ${userId} still has ${
            currentConnections - 1
          } active connection(s)`
        );
      }
    } catch (error) {
      console.error(
        "Disconnect error:",
        error.message
      );
    }
  });
});

/* =========================================================
   MONGODB + SERVER
========================================================= */

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(
      "MongoDB connected successfully"
    );

    server.listen(PORT, () => {
      console.log(
        `Server running on http://localhost:${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );
  });