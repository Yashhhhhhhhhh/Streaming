const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { io: Client } = require('socket.io-client');
const { server, io } = require('../server.js');

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
      avatar: 'scout'
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
      avatar: 'recon'
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

  // Clean teardown
  clientHost.disconnect();
  clientViewer.disconnect();
  io.close();
  await new Promise((resolve) => server.close(resolve));
});
