const Conversation = require("../models/Conversation");

// Create or Get 1-to-1 Conversation
const createConversation = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "User ID is required",
      });
    }

    // Prevent chatting with yourself
    if (userId.toString() === req.userId.toString()) {
      return res.status(400).json({
        message: "You cannot chat with yourself",
      });
    }

    // Find an existing 1-to-1 conversation
    // between exactly these two users
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: {
        $all: [req.userId, userId],
        $size: 2,
      },
    }).populate("participants", "-password");

    // If conversation already exists, return it
    if (conversation) {
      return res.status(200).json({
        message: "Conversation already exists",
        conversation,
      });
    }

    // Otherwise create a new conversation
    conversation = await Conversation.create({
      participants: [req.userId, userId],
      isGroup: false,
    });

    // Populate participants before sending response
    conversation = await Conversation.findById(
      conversation._id
    ).populate("participants", "-password");

    res.status(201).json({
      message: "Conversation created successfully",
      conversation,
    });
  } catch (error) {
    console.error(
      "Create conversation error:",
      error
    );

    res.status(500).json({
      message: "Failed to create conversation",
      error: error.message,
    });
  }
};

// Get all conversations of logged-in user
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      isGroup: false,
    })
      .populate("participants", "-password")
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "-password",
        },
      })
      .sort({ updatedAt: -1 });

    res.status(200).json({
      message: "Conversations fetched successfully",
      conversations,
    });
  } catch (error) {
    console.error(
      "Get conversations error:",
      error
    );

    res.status(500).json({
      message: "Failed to fetch conversations",
      error: error.message,
    });
  }
};

module.exports = {
  createConversation,
  getConversations,
};