const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Cache hardware acceleration and binary status
let ffmpegChecked = false;
let hasFfmpeg = false;
let hasNvenc = false;

function checkFfmpeg() {
  if (ffmpegChecked) return { hasFfmpeg, hasNvenc };
  ffmpegChecked = true;
  try {
    const v = execSync('ffmpeg -version', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString();
    hasFfmpeg = v.includes('ffmpeg version');
  } catch (e) {
    hasFfmpeg = false;
  }

  if (hasFfmpeg) {
    try {
      execSync('ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -c:v h264_nvenc -f null -', {
        stdio: 'ignore',
        timeout: 4000
      });
      hasNvenc = true;
    } catch (e) {
      hasNvenc = false;
    }
  }

  return { hasFfmpeg, hasNvenc };
}

// Probe a media file with ffprobe to detect container, codecs, and embedded subtitle tracks
function probeMedia(filePath) {
  return new Promise((resolve) => {
    const { hasFfmpeg } = checkFfmpeg();
    if (!hasFfmpeg || !fs.existsSync(filePath)) {
      return resolve(getFallbackProbe(filePath));
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];

    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'ignore'] });

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });

    child.on('error', () => resolve(getFallbackProbe(filePath)));

    child.on('close', (code) => {
      if (code !== 0 || !stdout) return resolve(getFallbackProbe(filePath));

      try {
        const data = JSON.parse(stdout);
        const formatName = data.format?.format_name || '';
        const duration = parseFloat(data.format?.duration || 0);
        const streams = data.streams || [];

        const videoStream = streams.find(s => s.codec_type === 'video');
        const audioStream = streams.find(s => s.codec_type === 'audio');
        const subtitleStreams = streams
          .filter(s => s.codec_type === 'subtitle')
          .map(s => ({
            index: s.index,
            codecName: s.codec_name,
            language: s.tags?.language || 'und',
            title: s.tags?.title || s.codec_name
          }));

        const ext = path.extname(filePath).toLowerCase();
        const vCodec = videoStream?.codec_name || '';
        const aCodec = audioStream?.codec_name || '';
        const pixFmt = videoStream?.pix_fmt || '';
        const profile = (videoStream?.profile || '').toLowerCase();

        // 10-bit profiles (High 10) require transcoding for web browsers
        const isTenBit = profile.includes('10') || pixFmt.includes('10');

        // Check if video is natively playable in HTML5 without conversion
        const isContainerNative = (ext === '.mp4' || ext === '.m4v' || ext === '.webm') && !formatName.includes('matroska');
        const isVideoNative = (vCodec === 'h264' && !isTenBit) || vCodec === 'vp8' || vCodec === 'vp9' || vCodec === 'av1';
        const isAudioNative = !audioStream || ['aac', 'mp3', 'opus', 'vorbis'].includes(aCodec);

        const isWebNative = isContainerNative && isVideoNative && isAudioNative;

        // True if video is standard H.264 8-bit (yuv420p), but container is MKV/AVI/MOV or audio is AC3/DTS/EAC3
        const isYuv420 = !pixFmt || pixFmt === 'yuv420p' || pixFmt === 'yuvj420p';
        const canCopyVideo = vCodec === 'h264' && !isTenBit && isYuv420;

        resolve({
          isWebNative,
          canCopyVideo,
          duration,
          video: videoStream ? {
            codec: vCodec,
            width: videoStream.width,
            height: videoStream.height,
            pixFmt,
            profile
          } : null,
          audio: audioStream ? {
            codec: aCodec,
            channels: audioStream.channels,
            sampleRate: audioStream.sample_rate
          } : null,
          subtitles: subtitleStreams,
          format: formatName
        });
      } catch (err) {
        resolve(getFallbackProbe(filePath));
      }
    });
  });
}

function getFallbackProbe(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isWebNative = ['.mp4', '.m4v', '.webm'].includes(ext);
  return {
    isWebNative,
    canCopyVideo: ext === '.mkv' || ext === '.mov',
    duration: 0,
    video: null,
    audio: null,
    subtitles: [],
    format: ext.replace('.', '')
  };
}

// Extract embedded subtitles to WebVTT format
function extractEmbeddedSubtitles(filePath, outputVttPath) {
  return new Promise((resolve) => {
    const { hasFfmpeg } = checkFfmpeg();
    if (!hasFfmpeg) return resolve(false);

    // Extract first subtitle stream (0:s:0) to WebVTT
    const args = [
      '-y',
      '-i', filePath,
      '-map', '0:s:0',
      outputVttPath
    ];

    const child = spawn('ffmpeg', args, { stdio: 'ignore' });

    child.on('error', () => resolve(false));
    child.on('close', (code) => {
      resolve(code === 0 && fs.existsSync(outputVttPath) && fs.statSync(outputVttPath).size > 0);
    });
  });
}

// Universal media preparation: fast remux or GPU-accelerated transcoding
function prepareUniversalMedia(filePath, outputDir) {
  return new Promise(async (resolve, reject) => {
    const { hasFfmpeg, hasNvenc } = checkFfmpeg();
    if (!hasFfmpeg) {
      // If ffmpeg is absent, return original file
      return resolve({
        outputPath: filePath,
        filename: path.basename(filePath),
        isOptimized: false,
        isOriginal: true
      });
    }

    const probe = await probeMedia(filePath);
    const baseName = path.parse(filePath).name;
    const safeOutputName = `${baseName}.web.mp4`;
    const outputPath = path.join(outputDir, safeOutputName);

    // If optimized MP4 already exists and is complete, serve it
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return resolve({
        outputPath,
        filename: safeOutputName,
        isOptimized: true,
        isOriginal: false,
        cached: true,
        probe
      });
    }

    // If original file is already 100% web-native MP4, no conversion required
    if (probe.isWebNative) {
      return resolve({
        outputPath: filePath,
        filename: path.basename(filePath),
        isOptimized: false,
        isOriginal: true,
        probe
      });
    }

    // Auto-extract embedded subtitles if present
    if (probe.subtitles && probe.subtitles.length > 0) {
      const vttPath = path.join(outputDir, `${baseName}.vtt`);
      if (!fs.existsSync(vttPath)) {
        extractEmbeddedSubtitles(filePath, vttPath).catch(() => {});
      }
    }

    // Conversion target (write to temporary file first for atomic commit)
    const tempOutputPath = path.join(outputDir, `${baseName}.web.tmp-${Date.now()}.mp4`);
    let args = [];

    if (probe.canCopyVideo) {
      // Fast remux: Copy video track as-is, convert audio to stereo AAC, write faststart header
      args = [
        '-y',
        '-i', filePath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-movflags', '+faststart',
        tempOutputPath
      ];
    } else {
      // Video transcoding required: Try RTX 2050 NVENC first, fallback to fast CPU
      if (hasNvenc) {
        args = [
          '-y',
          '-hwaccel', 'cuda',
          '-i', filePath,
          '-c:v', 'h264_nvenc',
          '-preset', 'p4',
          '-cq', '22',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ac', '2',
          '-movflags', '+faststart',
          tempOutputPath
        ];
      } else {
        args = [
          '-y',
          '-i', filePath,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ac', '2',
          '-movflags', '+faststart',
          tempOutputPath
        ];
      }
    }

    const child = spawn('ffmpeg', args, { stdio: 'ignore' });

    child.on('error', (err) => {
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      // Resolve with original on failure
      resolve({
        outputPath: filePath,
        filename: path.basename(filePath),
        isOptimized: false,
        isOriginal: true,
        error: err.message
      });
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
        try {
          fs.renameSync(tempOutputPath, outputPath);
          resolve({
            outputPath,
            filename: safeOutputName,
            isOptimized: true,
            isOriginal: false,
            probe
          });
        } catch (renameErr) {
          resolve({
            outputPath: tempOutputPath,
            filename: path.basename(tempOutputPath),
            isOptimized: true,
            isOriginal: false,
            probe
          });
        }
      } else {
        if (fs.existsSync(tempOutputPath)) {
          try { fs.unlinkSync(tempOutputPath); } catch (e) {}
        }
        resolve({
          outputPath: filePath,
          filename: path.basename(filePath),
          isOptimized: false,
          isOriginal: true,
          error: `Transcode exited with code ${code}`
        });
      }
    });
  });
}

// Real-time on-the-fly streaming pipeline (fragmented MP4)
function streamTranscodeOnTheFly(filePath, startTime = 0, res) {
  const { hasFfmpeg } = checkFfmpeg();
  if (!hasFfmpeg) return false;

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  const args = [];
  if (startTime > 0) {
    args.push('-ss', String(startTime));
  }
  args.push(
    '-i', filePath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  );

  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  if (child.unref) child.unref();

  child.stdout.pipe(res);

  const cleanup = () => {
    if (child && !child.killed) {
      try { child.kill('SIGKILL'); } catch (e) {}
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
  child.on('error', cleanup);

  return true;
}

module.exports = {
  checkFfmpeg,
  probeMedia,
  extractEmbeddedSubtitles,
  prepareUniversalMedia,
  streamTranscodeOnTheFly
};
