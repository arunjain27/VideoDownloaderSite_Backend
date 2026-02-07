const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Get user's video history (only for logged-in users)
router.get('/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ videos: user.videos || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Save video to user's history
router.post('/save', auth, async (req, res) => {
  try {
    const { url, title, thumbnail, platform, quality, format } = req.body;
    
    const user = await User.findById(req.user._id);
    user.videos.push({
      url,
      title,
      thumbnail,
      platform,
      quality,
      format
    });
    await user.save();

    res.json({ message: 'Video saved successfully', video: user.videos[user.videos.length - 1] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete video from history
router.delete('/:videoId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.videos = user.videos.filter(v => v._id.toString() !== req.params.videoId);
    await user.save();

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
