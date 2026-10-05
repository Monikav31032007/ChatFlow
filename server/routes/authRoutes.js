const express = require("express");

const {
  registerUser,
  loginUser,
} = require("../controllers/authController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerUser);

router.post("/login", loginUser);

router.get("/profile", protect, (req, res) => {
  res.json({
    message: "Protected route accessed successfully",
    userId: req.userId,
  });
});

router.post("/logout", protect, (req, res) => {
  res.json({
    message: "Logout successful",
  });
});

module.exports = router;