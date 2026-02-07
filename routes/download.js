const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');

const execAsync = promisify(exec);
const router = express.Router();

// Helper function to detect platform from URL
const detectPlatform = (url) => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('tiktok.com')) return 'tiktok';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('facebook.com')) return 'facebook';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('vimeo.com')) return 'vimeo';
  if (url.includes('dailymotion.com')) return 'dailymotion';
  if (url.includes('pinterest.com')) return 'pinterest';
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('reddit.com')) return 'reddit';
  if (url.includes('snapchat.com')) return 'snapchat';
  return 'unknown';
};

// Check if yt-dlp is available
const checkYtDlp = async () => {
  try {
    await execAsync('yt-dlp --version');
    return true;
  } catch (error) {
    return false;
  }
};

// Get video info
router.post('/info', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      return res.status(500).json({ 
        message: 'yt-dlp is not installed. Please install it to use this service.',
        installInstructions: 'Install yt-dlp: pip install yt-dlp or brew install yt-dlp'
      });
    }

    const platform = detectPlatform(url);
    
    // Get video information using yt-dlp
    const { stdout } = await execAsync(`yt-dlp --dump-json --no-playlist "${url}"`);
    const videoInfo = JSON.parse(stdout);
    
    const response = {
      title: videoInfo.title || 'Untitled',
      thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0] || '',
      duration: videoInfo.duration || 0,
      platform: platform,
      availableQualities: []
    };

    // Extract available formats
    if (videoInfo.formats && Array.isArray(videoInfo.formats)) {
      const qualityMap = {};
      videoInfo.formats.forEach(format => {
        const height = format.height || format.resolution?.split('x')[1] || 'unknown';
        if (height !== 'unknown' && (!qualityMap[height] || format.filesize > (qualityMap[height].filesize || 0))) {
          qualityMap[height] = format;
        }
      });

      response.availableQualities = Object.keys(qualityMap)
        .filter(q => q !== 'unknown')
        .sort((a, b) => parseInt(b) - parseInt(a))
        .map(q => ({
          quality: q + 'p',
          format_id: qualityMap[q].format_id,
          ext: qualityMap[q].ext || 'mp4'
        }));

      // Add audio-only option
      response.availableQualities.push({
        quality: 'audio',
        format_id: 'bestaudio',
        ext: 'mp3'
      });

      // Add best quality option
      if (response.availableQualities.length > 0) {
        response.availableQualities.unshift({
          quality: 'best',
          format_id: 'best',
          ext: 'mp4'
        });
      }
    } else {
      // Fallback options
      response.availableQualities = [
        { quality: 'best', format_id: 'best', ext: 'mp4' },
        { quality: 'audio', format_id: 'bestaudio', ext: 'mp3' }
      ];
    }

    res.json(response);
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ 
      message: 'Failed to get video information',
      error: error.message 
    });
  }
});

// Download video
router.post('/video', async (req, res) => {
  try {
    const { url, quality = 'best', format = 'mp4' } = req.body;
    
    if (!url) {
      return res.status(400).json({ message: 'URL is required' });
    }

    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      return res.status(500).json({ 
        message: 'yt-dlp is not installed. Please install it first.' 
      });
    }

    const platform = detectPlatform(url);
    const outputPath = path.join(__dirname, '../downloads');
    
    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const timestamp = Date.now();
    const outputFile = path.join(outputPath, `video_${timestamp}.${format}`);
    
    // Determine format selection - always use best quality
    let formatSelection = 'best';
    if (quality === 'audio') {
      formatSelection = 'bestaudio/best';
    } else {
      // Always use best video quality (highest available)
      formatSelection = 'best';
    }

    // Download video using yt-dlp
    const command = `yt-dlp -f "${formatSelection}" -o "${outputFile}" --no-playlist "${url}"`;
    
    await execAsync(command);

    // Check if file exists
    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({ message: 'Download failed - file not found' });
    }

    // Send file
    res.download(outputFile, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up file after sending (with delay to ensure download completes)
      setTimeout(() => {
        if (fs.existsSync(outputFile)) {
          try {
            fs.unlinkSync(outputFile);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
        }
      }, 10000); // 10 second delay
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(500).json({ 
      message: 'Failed to download video',
      error: error.message 
    });
  }
});

// Generate QR code for download link
router.post('/qr', async (req, res) => {
  try {
    const { url } = req.body;
    const qrCodeDataURL = await qrcode.toDataURL(url);
    res.json({ qrCode: qrCodeDataURL });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Batch download
router.post('/batch', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ message: 'URLs array is required' });
    }

    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      return res.status(500).json({ 
        message: 'yt-dlp is not installed' 
      });
    }

    const results = [];
    
    for (const url of urls) {
      try {
        const { stdout } = await execAsync(`yt-dlp --dump-json --no-playlist "${url}"`);
        const videoInfo = JSON.parse(stdout);
        results.push({
          url,
          success: true,
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error.message
        });
      }
    }

    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
