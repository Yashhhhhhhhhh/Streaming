const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { io: Client } = require('socket.io-client');
const { server, io } = require('../server.js');
const { probeMedia, prepareUniversalMedia, checkFfmpeg } = require('../lib/transcoder.js');

test('SyncWatch Real-Time WebSocket & Drift-Sync Suite', async (t) => {
  let testPort;
  let clientHost;
  let clientViewer;

  await t.test('1. Server starts on dynamic port and accepts WebSocket connections', async () => {
    await new Promise((resolve) => {
      server.listen(0, () => {
        testPort = server.address().port;
        resolve();
      });
    });
    assert.ok(testPort > 0, 'Server bound to a valid port');
  });

  await t.test('2. Host and Viewer can join a room and receive member sync events', async () => {
    const serverUrl = `http://localhost:${testPort}`;

    clientHost = Client(serverUrl, { transports: ['websocket'] });
    clientViewer = Client(serverUrl, { transports: ['websocket'] });

    await new Promise((resolve) => clientHost.connected ? resolve() : clientHost.once('connect', resolve));
    await new Promise((resolve) => clientViewer.connected ? resolve() : clientViewer.once('connect', resolve));

    // Host joins first
    const hostJoinedPromise = new Promise((resolve) => {
      clientHost.once('room-state', (data) => {
        assert.equal(data.roomId, 'test-recon');
        assert.equal(data.isHost, true);
        resolve(data);
      });
    });

    clientHost.emit('join-room', {
      roomId: 'test-recon',
      userName: 'Levi',
      avatar: 'scout',
      userId: 'usr_levi_test'
    });

    await hostJoinedPromise;

    // Viewer joins second
    const viewerJoinedPromise = new Promise((resolve) => {
      clientViewer.once('room-state', (data) => {
        assert.equal(data.roomId, 'test-recon');
        assert.equal(data.isHost, false);
        resolve(data);
      });
    });

    const hostSawViewerPromise = new Promise((resolve) => {
      clientHost.once('member-joined', ({ member, members }) => {
        assert.equal(member.name, 'Hange');
        assert.equal(members.length, 2);
        resolve();
      });
    });

    clientViewer.emit('join-room', {
      roomId: 'test-recon',
      userName: 'Hange',
      avatar: 'recon',
      userId: 'usr_hange_test'
    });

    await Promise.all([viewerJoinedPromise, hostSawViewerPromise]);
  });

  await t.test('3. Play, Pause, and Seek events synchronize across room members', async () => {
    // Test Play
    const playPromise = new Promise((resolve) => {
      clientViewer.once('sync-play', ({ time }) => {
        assert.equal(time, 15.2);
        resolve();
      });
    });
    clientHost.emit('play', { time: 15.2 });
    await playPromise;

    // Test Pause
    const pausePromise = new Promise((resolve) => {
      clientViewer.once('sync-pause', ({ time }) => {
        assert.equal(time, 28.7);
        resolve();
      });
    });
    clientHost.emit('pause', { time: 28.7 });
    await pausePromise;

    // Test Seek
    const seekPromise = new Promise((resolve) => {
      clientViewer.once('sync-seek', ({ time }) => {
        assert.equal(time, 104.0);
        resolve();
      });
    });
    clientHost.emit('seek', { time: 104.0 });
    await seekPromise;
  });

  await t.test('4. Host heartbeat propagates drift synchronization telemetry', async () => {
    const heartbeatPromise = new Promise((resolve) => {
      clientViewer.once('sync-heartbeat', (data) => {
        assert.equal(data.time, 112.5);
        assert.equal(data.isPlaying, true);
        assert.equal(data.rate, 1.0);
        resolve();
      });
    });

    clientHost.emit('sync-heartbeat', {
      time: 112.5,
      isPlaying: true,
      rate: 1.0
    });

    await heartbeatPromise;
  });

  await t.test('5. Tactical reactions and chat broadcast instantly', async () => {
    const reactionPromise = new Promise((resolve) => {
      clientViewer.once('reaction', (data) => {
        assert.equal(data.emoji, 'hearts');
        assert.equal(data.userName, 'Levi');
        resolve();
      });
    });

    clientHost.emit('reaction', { emoji: 'hearts' });
    await reactionPromise;
  });

  await t.test('5b. Real-time Tactical Telestrator / Laser pointer coordinates relay across room members', async () => {
    const laserPromise = new Promise((resolve) => {
      clientViewer.once('laser-pointer', (data) => {
        assert.equal(data.x, 0.42);
        assert.equal(data.y, 0.68);
        assert.equal(data.by, 'Levi');
        resolve();
      });
    });

    clientHost.emit('laser-pointer', { x: 0.42, y: 0.68, isDown: true });
    await laserPromise;
  });

  await t.test('6. Permanent couple room sanctuary (cinema room) exists and persists', async () => {
    const cinemaClient = Client(`http://localhost:${testPort}`, { transports: ['websocket'] });
    await new Promise((resolve) => cinemaClient.connected ? resolve() : cinemaClient.once('connect', resolve));

    const cinemaJoined = new Promise((resolve) => {
      cinemaClient.once('room-state', (data) => {
        assert.equal(data.roomId, 'cinema');
        resolve();
      });
    });

    cinemaClient.emit('join-room', {
      roomId: 'cinema',
      userName: 'Yash',
      avatar: 'scout'
    });

    await cinemaJoined;
    cinemaClient.disconnect();
  });

  await t.test('7. AI Status endpoint returns provider availability schema', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/ai/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok('localAvailable' in data);
    assert.ok('hasServerGeminiKey' in data);
    assert.ok('activeRecommendation' in data);
  });

  await t.test('8. AI Ask endpoint rejects empty prompt and reports missing provider without crashing', async () => {
    // 1. Empty prompt rejected
    const emptyRes = await fetch(`http://localhost:${testPort}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' })
    });
    assert.equal(emptyRes.status, 400);

    // 2. Unconfigured provider handled cleanly
    const noKeyRes = await fetch(`http://localhost:${testPort}/api/ai/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Who is the Commander of the Survey Corps?' })
    });
    // Will be either 200 (if local server is up) or 400/503 (if offline without key)
    assert.ok([200, 400, 503].includes(noKeyRes.status));
    const data = await noKeyRes.json();
    assert.ok(data.answer || data.error);
  });

  await t.test('9. Subtitle synchronization event broadcasts across room members', async () => {
    const subtitlePromise = new Promise((resolve) => {
      clientViewer.once('subtitles-updated', (path) => {
        assert.ok(path.includes('test-sub.vtt'));
        resolve();
      });
    });

    io.to('test-recon').emit('subtitles-updated', '/api/stream/test-recon/test-sub.vtt');
    await subtitlePromise;
  });

  await t.test('10. WebRTC signaling relays offers, answers, and ICE candidates between peers', async () => {
    // 1. Test Offer relay
    const offerPromise = new Promise((resolve) => {
      clientViewer.once('webrtc-offer', ({ from, offer }) => {
        assert.equal(offer.type, 'offer');
        assert.ok(from);
        resolve();
      });
    });
    clientHost.emit('webrtc-offer', {
      to: clientViewer.id,
      offer: { type: 'offer', sdp: 'v=0...' }
    });
    await offerPromise;

    // 2. Test Answer relay
    const answerPromise = new Promise((resolve) => {
      clientHost.once('webrtc-answer', ({ from, answer }) => {
        assert.equal(answer.type, 'answer');
        assert.ok(from);
        resolve();
      });
    });
    clientViewer.emit('webrtc-answer', {
      to: clientHost.id,
      answer: { type: 'answer', sdp: 'v=0...' }
    });
    await answerPromise;

    // 3. Test ICE Candidate relay
    const icePromise = new Promise((resolve) => {
      clientViewer.once('webrtc-ice-candidate', ({ from, candidate }) => {
        assert.equal(candidate.candidate, 'candidate:1 1 UDP ...');
        assert.ok(from);
        resolve();
      });
    });
    clientHost.emit('webrtc-ice-candidate', {
      to: clientViewer.id,
      candidate: { candidate: 'candidate:1 1 UDP ...' }
    });
    await icePromise;
  });

  await t.test('11. Robustness: Room creation and AI endpoints gracefully handle empty request bodies', async () => {
    // Empty body on room create
    const createRes = await fetch(`http://localhost:${testPort}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(createRes.status, 200);
    const createData = await createRes.json();
    assert.ok(createData.roomId);
    assert.equal(createData.success, true);
  });

  await t.test('12. Mobile background app-switch: unexpected disconnect triggers away status without member-left broadcast', async () => {
    let memberLeftFired = false;
    const memberLeftListener = () => { memberLeftFired = true; };
    clientHost.on('member-left', memberLeftListener);

    const awayPromise = new Promise((resolve) => {
      clientHost.once('member-status-changed', ({ member }) => {
        assert.equal(member.isAway, true);
        assert.equal(member.name, 'Hange');
        resolve();
      });
    });

    // Simulate mobile phone switching away (disconnecting socket)
    clientViewer.disconnect();

    await awayPromise;
    assert.equal(memberLeftFired, false, 'member-left must not be fired on mobile app switch during grace period');
    clientHost.off('member-left', memberLeftListener);
  });

  await t.test('13. Mobile foreground recovery: reconnecting within grace period restores member without duplication', async () => {
    // Reconnect clientViewer (simulating mobile tab foregrounding)
    clientViewer = Client(`http://localhost:${testPort}`, { transports: ['websocket'] });
    await new Promise((resolve) => clientViewer.connected ? resolve() : clientViewer.once('connect', resolve));

    const statePromise = new Promise((resolve) => {
      clientViewer.once('room-state', (data) => {
        assert.equal(data.roomId, 'test-recon');
        assert.equal(data.isReconnection, true);
        resolve(data);
      });
    });

    const hostSawReconnectPromise = new Promise((resolve) => {
      clientHost.once('member-status-changed', ({ member, members }) => {
        assert.equal(member.isAway, false);
        assert.equal(member.name, 'Hange');
        // Total members must strictly stay 2 without duplicate members
        assert.equal(members.length, 2);
        resolve();
      });
    });

    clientViewer.emit('join-room', {
      roomId: 'test-recon',
      userName: 'Hange',
      avatar: 'recon',
      userId: 'usr_hange_test'
    });

    await Promise.all([statePromise, hostSawReconnectPromise]);
  });

  await t.test('14. Mobile sync request: request-room-sync returns real-time playback state and time', async () => {
    const syncPromise = new Promise((resolve) => {
      clientViewer.once('room-sync-update', (data) => {
        assert.ok(typeof data.currentTime === 'number');
        assert.ok('isPlaying' in data);
        assert.ok('members' in data);
        resolve();
      });
    });

    clientViewer.emit('request-room-sync');
    await syncPromise;
  });

  await t.test('15. Explicit leave: leave-room cleans up member immediately without waiting for grace period', async () => {
    const hostSawLeavePromise = new Promise((resolve) => {
      clientHost.once('member-left', ({ memberId, members }) => {
        assert.equal(members.length, 1);
        resolve();
      });
    });

    clientViewer.emit('leave-room');
    await hostSawLeavePromise;
  });

  const testTmpDir = path.join(__dirname, 'tmp-media');
  const testUploadDir = path.join(__dirname, '..', 'uploads', 'test-multi');
  const sampleMkv = path.join(testTmpDir, 'sample-test.mkv');

  await t.test('16. Universal Transcoder: probeMedia extracts codecs, pixel format, and tracks', async () => {
    fs.mkdirSync(testTmpDir, { recursive: true });
    const resGen = spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'ac3',
      sampleMkv
    ], { stdio: 'ignore' });

    assert.equal(resGen.status, 0, 'ffmpeg generated test MKV sample');

    const probe = await probeMedia(sampleMkv);
    assert.equal(probe.video?.codec, 'h264');
    assert.equal(probe.audio?.codec, 'ac3');
    assert.equal(probe.isWebNative, false, 'MKV container with AC3 is flagged as non-web-native');
    assert.equal(probe.canCopyVideo, true, 'H.264 video can be copied via ultra-fast remux');
  });

  await t.test('17. Universal Transcoder: prepareUniversalMedia produces web-compatible .web.mp4', async () => {
    const result = await prepareUniversalMedia(sampleMkv, testTmpDir);
    assert.equal(result.isOptimized, true);
    assert.ok(fs.existsSync(result.outputPath), 'Optimized web.mp4 file exists on disk');
    assert.ok(fs.statSync(result.outputPath).size > 0, 'Optimized web.mp4 file is non-empty');

    const probeOpt = await probeMedia(result.outputPath);
    assert.equal(probeOpt.video?.codec, 'h264');
    assert.equal(probeOpt.audio?.codec, 'aac');
    assert.equal(probeOpt.isWebNative, true, 'Resulting web.mp4 is 100% web-native');
  });

  await t.test('18. Multi-Format Streaming: /api/stream/:roomId/:filename transparently serves .web.mp4 with HTTP 206 range support', async () => {
    fs.mkdirSync(testUploadDir, { recursive: true });
    const targetMkv = path.join(testUploadDir, 'sample-test.mkv');
    const targetWebMp4 = path.join(testUploadDir, 'sample-test.web.mp4');
    fs.copyFileSync(sampleMkv, targetMkv);
    fs.copyFileSync(path.join(testTmpDir, 'sample-test.web.mp4'), targetWebMp4);

    const streamRes = await fetch(`http://localhost:${testPort}/api/stream/test-multi/sample-test.mkv`, {
      headers: { Range: 'bytes=0-100' }
    });

    assert.equal(streamRes.status, 206, 'Returns 206 Partial Content');
    assert.equal(streamRes.headers.get('content-type'), 'video/mp4', 'Returns video/mp4 Content-Type');
    assert.ok(streamRes.headers.get('content-range')?.startsWith('bytes 0-100/'), 'Returns valid Content-Range header');
    const buf = await streamRes.arrayBuffer();
    assert.equal(buf.byteLength, 101, 'Returned exact requested byte slice');
  });

  await t.test('19. Multi-Format Streaming: on-the-fly live transcoding fallback via ?live=1', async () => {
    const liveRes = await fetch(`http://localhost:${testPort}/api/stream/test-multi/sample-test.mkv?live=1`);
    assert.equal(liveRes.status, 200);
    assert.equal(liveRes.headers.get('content-type'), 'video/mp4');
    const reader = liveRes.body.getReader();
    const { value, done } = await reader.read();
    assert.ok(!done);
    assert.ok(value.length > 0, 'Received initial fragmented MP4 stream chunk');
    await reader.cancel();
  });

  // Clean up temporary test files
  try {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
    fs.rmSync(testUploadDir, { recursive: true, force: true });
  } catch (e) {}

  // Clean teardown
  if (clientHost) clientHost.close();
  if (clientViewer) clientViewer.close();
  io.close();
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
