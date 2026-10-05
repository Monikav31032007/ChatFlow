const express = require("express");

const {
  sendMessage,
  getMessages,
} = require("../controllers/messageController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Send message
router.post("/", protect, sendMessage);

// Get chat history
router.get("/:conversationId", protect, getMessages);

module.exports = router;