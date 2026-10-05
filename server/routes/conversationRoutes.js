const express = require("express");

const {
  createConversation,
  getConversations,
} = require("../controllers/conversationController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createConversation);

router.get("/", protect, getConversations);

module.exports = router;