const express = require('express');
const cors    = require('cors');
const { exec } = require('child_process');
const path   = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── /api/info ─────────────────────────────────────────────────────────────
// Returns video title, thumbnail, formats
app.get('/api/info', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required' });

  const cmd = `yt-dlp --dump-json --no-playlist --no-warnings "${url.replace(/"/g, '')}"`;

  exec(cmd, { maxBuffer: 20 * 1024 * 1024, timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      const msg = stderr || err.message || 'yt-dlp failed';
      return res.status(500).json({ error: msg.split('\n')[0] });
    }

    try {
      const info = JSON.parse(stdout.trim());

      // Build clean format list
      const raw = (info.formats || []).filter(f =>
        f.url && f.protocol !== 'mhtml' &&
        (f.vcodec !== 'none' || f.acodec !== 'none')
      );

      // Deduplicate by quality key
      const seen = new Set();
      const formats = [];

      // Best combined mp4 first
      formats.push({
        id:      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
        label:   'Best Quality (MP4)',
        ext:     'mp4',
        type:    'video',
        quality: 'best',
      });

      // Specific resolutions
      const heights = [2160, 1440, 1080, 720, 480, 360, 240, 144];
      heights.forEach(h => {
        const match = raw.find(f =>
          f.height === h && f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4'
        ) || raw.find(f => f.height === h && f.vcodec !== 'none');
        if (match) {
          const key = `${h}p`;
          if (!seen.has(key)) {
            seen.add(key);
            formats.push({
              id:       match.format_id,
              label:    `${h}p`,
              ext:      match.ext || 'mp4',
              type:     'video',
              quality:  key,
              filesize: match.filesize || match.filesize_approx || null,
            });
          }
        }
      });

      // Audio only
      const bestAudio = raw.find(f => f.vcodec === 'none' && f.acodec !== 'none' &&
        (f.ext === 'm4a' || f.ext === 'mp3' || f.ext === 'webm'));
      if (bestAudio) {
        formats.push({
          id:       bestAudio.format_id,
          label:    'Audio Only',
          ext:      bestAudio.ext || 'mp3',
          type:     'audio',
          quality:  'audio',
          filesize: bestAudio.filesize || bestAudio.filesize_approx || null,
        });
      }

      res.json({
        title:     info.title,
        thumbnail: info.thumbnail,
        duration:  info.duration,
        uploader:  info.uploader || info.channel || '',
        platform:  info.extractor_key || info.ie_key || '',
        formats,
      });

    } catch (e) {
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// ── /api/download ─────────────────────────────────────────────────────────
// Streams video directly to browser
app.get('/api/download', (req, res) => {
  const { url, format_id, title, ext } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const safeTitle = (title || 'video').replace(/[^\w\s\-]/g, '').trim().slice(0, 80) || 'video';
  const safeExt   = (ext || 'mp4').replace(/[^a-z0-9]/gi, '');
  const fmt       = format_id || 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b';

  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${safeExt}"`);
  res.setHeader('Content-Type', safeExt === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const cmd = `yt-dlp -f "${fmt}" --merge-output-format mp4 --no-playlist --no-warnings -o - "${url.replace(/"/g, '')}"`;

  const proc = exec(cmd, { maxBuffer: 1024 * 1024 * 1024, timeout: 300000 });

  proc.stdout.pipe(res);

  proc.stderr.on('data', d => process.stdout.write(d)); // log progress

  proc.on('error', err => {
    console.error('Download error:', err.message);
    if (!res.headersSent) res.status(500).end('Download failed');
  });

  req.on('close', () => { try { proc.kill('SIGTERM'); } catch {} });
});

// ── /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  exec('yt-dlp --version', (err, stdout) => {
    res.json({
      status:  err ? 'error' : 'ok',
      version: err ? null : stdout.trim(),
      message: err ? 'yt-dlp not found' : null,
    });
  });
});

app.listen(PORT, () => console.log(`✅ VidSnap running on port ${PORT}`));
