const express = require("express");

const {
  getProfile,
  uploadProfilePicture,
  updateProfile,
  searchUsers,
  updateOnlineStatus,
} = require("../controllers/userController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// Get user profile
router.get("/profile", protect, getProfile);

// Update name and email
router.put("/profile", protect, updateProfile);

// Upload profile picture
router.put(
  "/profile-picture",
  protect,
  upload.single("profilePicture"),
  uploadProfilePicture
);

// Search users
router.get("/search", protect, searchUsers);

// Update online/offline status
router.put("/status", protect, updateOnlineStatus);

module.exports = router;