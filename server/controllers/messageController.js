const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

// ===============================
// Send Message
// ===============================
const sendMessage = async (req, res) => {
  try {
    const { conversationId, content } = req.body;

    if (
      !conversationId ||
      !content ||
      content.trim() === ""
    ) {
      return res.status(400).json({
        message:
          "Conversation ID and message content are required",
      });
    }

    const conversation =
      await Conversation.findById(
        conversationId
      );

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    const isParticipant =
      conversation.participants.some(
        (participant) =>
          participant.toString() ===
          req.userId.toString()
      );

    if (!isParticipant) {
      return res.status(403).json({
        message:
          "You are not a participant in this conversation",
      });
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: req.userId,
      content: content.trim(),
      messageType: "text",
      readBy: [req.userId],
    });

    conversation.lastMessage =
      message._id;

    await conversation.save();

    const populatedMessage =
      await Message.findById(message._id)
        .populate("sender", "-password")
        .populate("conversation");

    /* -----------------------------------------------------
       BROADCAST SAVED MESSAGE
    ----------------------------------------------------- */

    const io = req.app.get("io");

    if (io) {
      io.to(conversationId.toString()).emit(
        "receiveMessage",
        populatedMessage
      );
    }

    res.status(201).json({
      message:
        "Message sent successfully",
      data: populatedMessage,
    });
  } catch (error) {
    console.error(
      "Send message error:",
      error
    );

    res.status(500).json({
      message:
        "Failed to send message",
      error: error.message,
    });
  }
};
// ===============================
// Get Chat History
// ===============================

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    const isParticipant = conversation.participants.some(
      (participant) => participant.toString() === req.userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        message: "You are not a participant in this conversation",
      });
    }

    const messages = await Message.find({
      conversation: conversationId,
    })
      .populate("sender", "-password")
      .sort({ createdAt: 1 });

    res.status(200).json({
      message: "Messages fetched successfully",
      messages,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
};