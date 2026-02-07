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
    const { stdout } = await execAsync('yt-dlp --version');
    console.log('✅ yt-dlp version:', stdout.trim());
    return true;
  } catch (error) {
    console.error('❌ yt-dlp not found:', error.message);
    return false;
  }
};

// --- ROUTES ---

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
        message: 'yt-dlp is not installed on the server.',
        details: 'Please install yt-dlp to continue.'
      });
    }

    const platform = detectPlatform(url);
    
    // ✅ ADDED: --cookies-from-browser chrome to bypass "Sign in to prove you are not a bot"
    // ✅ Note: yt-dlp will automatically use your Node.js as the JS runtime
    const { stdout } = await execAsync(`yt-dlp --dump-json --no-playlist --cookies-from-browser chrome "${url}"`, {
      timeout: 30000 
    });
    
    const videoInfo = JSON.parse(stdout);
    
    const response = {
      title: videoInfo.title || 'Untitled',
      thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
      duration: videoInfo.duration || 0,
      platform: platform,
      availableQualities: []
    };

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

      response.availableQualities.push({ quality: 'audio', format_id: 'bestaudio', ext: 'mp3' });

      if (response.availableQualities.length > 0) {
        response.availableQualities.unshift({ quality: 'best', format_id: 'best', ext: 'mp4' });
      }
    } else {
      response.availableQualities = [
        { quality: 'best', format_id: 'best', ext: 'mp4' },
        { quality: 'audio', format_id: 'bestaudio', ext: 'mp3' }
      ];
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to get video info. Make sure Chrome is open and you are logged into YouTube.',
      error: error.message 
    });
  }
});

// Download video
router.post('/video', async (req, res) => {
  try {
    const { url, quality = 'best', format = 'mp4' } = req.body;
    
    if (!url) return res.status(400).json({ message: 'URL is required' });

    const outputPath = '/tmp';
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });

    const outputFile = path.join(outputPath, `video_${Date.now()}.${format}`);
    let formatSelection = quality === 'audio' ? 'bestaudio/best' : 'best';

    // ✅ ADDED: --cookies-from-browser chrome to the download command
    const command = `yt-dlp -f "${formatSelection}" -o "${outputFile}" --no-playlist --cookies-from-browser chrome "${url}"`;
    
    await execAsync(command, { timeout: 120000 });

    if (!fs.existsSync(outputFile)) {
      return res.status(500).json({ message: 'Download failed - file not found' });
    }

    res.download(outputFile, `video.${format}`, (err) => {
      setTimeout(() => {
        if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      }, 10000);
    });
  } catch (error) {
    res.status(500).json({ message: 'Download failed', error: error.message });
  }
});

// QR Code generation
router.post('/qr', async (req, res) => {
  try {
    const { url } = req.body;
    const qrCodeDataURL = await qrcode.toDataURL(url);
    res.json({ qrCode: qrCodeDataURL });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;