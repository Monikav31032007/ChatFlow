const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

// ===============================
// Get Profile
// ===============================

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "Profile fetched successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// ===============================
// Upload Profile Picture
// ===============================

const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please select an image",
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "real-time-chat/profile-pictures",
      },

      async (error, result) => {
        if (error) {
          return res.status(500).json({
            message: "Image upload failed",
            error: error.message,
          });
        }

        const user = await User.findByIdAndUpdate(
          req.userId,
          {
            profilePicture: result.secure_url,
          },
          {
            new: true,
          }
        ).select("-password");

        res.status(200).json({
          message: "Profile picture uploaded successfully",
          user,
        });
      }
    );

    streamifier
      .createReadStream(req.file.buffer)
      .pipe(uploadStream);
  } catch (error) {
    res.status(500).json({
      message: "Profile picture upload failed",
      error: error.message,
    });
  }
};

// ===============================
// Update Profile
// ===============================

const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required",
      });
    }

    const existingUser = await User.findOne({
      email,
      _id: { $ne: req.userId },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email is already in use",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        name,
        email,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// ===============================
// Search Users
// ===============================

const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({
        message: "Search query is required",
      });
    }

    const users = await User.find({
      _id: { $ne: req.userId },

      $or: [
        {
          name: {
            $regex: query.trim(),
            $options: "i",
          },
        },
        {
          email: {
            $regex: query.trim(),
            $options: "i",
          },
        },
      ],
    })
      .select("-password")
      .limit(20);

    res.status(200).json({
      message: "Users found successfully",
      users,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to search users",
      error: error.message,
    });
  }
};
// ===============================
// Update Online / Offline Status
// ===============================

const updateOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({
        message: "isOnline must be true or false",
      });
    }

    const updateData = {
      isOnline,
    };

    if (!isOnline) {
      updateData.lastSeen = new Date();
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      {
        new: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: isOnline
        ? "User is now online"
        : "User is now offline",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update online status",
      error: error.message,
    });
  }
};
// ===============================
// Export Controllers
// ===============================

module.exports = {
  getProfile,
  uploadProfilePicture,
  updateProfile,
  searchUsers,
  updateOnlineStatus,
};