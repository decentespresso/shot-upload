const assert = require('node:assert/strict');
const test = require('node:test');
const { loadPlugin, shot, pump } = require('./helpers');

test('ownership policy describes a generic host notification and HTTPS action', async () => {
  const harness = loadPlugin({ shots: [shot('a')], registeredSerials: [] });
  await harness.runNextTimer();
  const notice = harness.notifications.at(-1);
  assert.ok(notice);
  assert.match(notice.message, /serial 6262.*isn't linked/);
  assert.equal(notice.action.type, 'openExternalUrl');
  assert.equal(notice.action.url, 'https://decentespresso.com/support/');
  assert.equal(notice.action.label, 'Support');
  assert.equal(harness.emits.filter(event => event.name === 'uploadPaused').length, 1);
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 1);
});

test('authentication requests the approved account settings action', async () => {
  const harness = loadPlugin({ shots: [shot('a')], machineListResponses: [{ status: 401, body: '' }] });
  await harness.runNextTimer();
  const notice = harness.notifications.at(-1);
  assert.ok(notice);
  assert.match(notice.message, /sign in/);
  assert.equal(notice.action.type, 'openDecentAccount');
  assert.equal(notice.action.label, 'Sign In');
  assert.equal(notice.action.url, undefined);
});

test('Support lookup outage retains the unresolved notice without uploading', async () => {
  const harness = loadPlugin({ shots: [shot('a')], machineListResponses: [{ status: 200, body: '' }, { status: 503, body: '' }] });
  await harness.runNextTimer();
  harness.plugin.onEvent({ name: 'notificationAction', payload: { id: 'ownership', actionId: 'support', phase: 'returned' } });
  await harness.runNextTimer();
  assert.equal(harness.dismissedNotifications.length, 0);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.proxyCalls.length, 0);
});

test('resolving one serial revises the condition to the remaining paused serial', async () => {
  const harness = loadPlugin({
    shots: [shot('a'), shot('b', { serialNumber: '7000' })],
    machineListResponses: [{ status: 200, body: '' }, { status: 200, body: '6262 DE-DE1PRO' }],
  });
  harness.plugin.onEvent({ name: 'shotStored', payload: { id: 'a' } });
  await pump();
  harness.plugin.onEvent({ name: 'shotStored', payload: { id: 'b' } });
  await pump();
  harness.plugin.onEvent({ name: 'notificationAction', payload: { id: 'ownership', actionId: 'support', phase: 'returned' } });
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 2);
  assert.match(harness.notifications.at(-1).message, /serial 7000/);
  const status = JSON.parse((await harness.plugin.__httpRequestHandler({ endpoint: 'status' })).body);
  assert.deepEqual(status.pausedSerials, ['7000']);
  assert.equal(harness.proxyCalls.length, 1);
});

test('additional paused serials do not replace an outstanding support action', async () => {
  const harness = loadPlugin({
    shots: [shot('a'), shot('b', { serialNumber: '7000' })],
    registeredSerials: [],
  });
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 1);
  const response = await harness.plugin.__httpRequestHandler({ endpoint: 'status' });
  assert.equal(JSON.parse(response.body).pausedSerials.length, 2);
});

test('additional paused serials keep the same unresolved condition', async () => {
  const harness = loadPlugin({
    shots: [shot('a'), shot('b', { serialNumber: '7000' })],
    registeredSerials: [],
  });
  harness.plugin.onEvent({ name: 'shotStored', payload: { id: 'a' } });
  await pump();
  assert.equal(harness.notifications.length, 1);
  harness.plugin.onEvent({ name: 'shotStored', payload: { id: 'a' } });
  await pump();
  assert.equal(harness.notifications.length, 1);
  harness.plugin.onEvent({ name: 'shotStored', payload: { id: 'b' } });
  await pump();
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications.at(-1).message, /serial 6262/);
  assert.equal(harness.notifications.at(-1).action.id, 'support');
  assert.equal(harness.notifications.at(-1).action.type, 'openExternalUrl');
  assert.equal(harness.proxyCalls.length, 0);
  const response = await harness.plugin.__httpRequestHandler({ endpoint: 'status' });
  assert.deepEqual(JSON.parse(response.body).pausedSerials, ['6262', '7000']);
});

test('returning from Support does not withdraw or republish an unresolved pause', async () => {
  const harness = loadPlugin({
    shots: [shot('a')],
    registeredSerials: [],
  });
  await harness.runNextTimer();
  harness.plugin.onEvent({ name: 'notificationAction', payload: { id: 'ownership', actionId: 'support', phase: 'returned' } });
  assert.equal(harness.dismissedNotifications.length, 0);
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.proxyCalls.length, 0);
});

test('authentication supersedes the ownership notice without another support action', async () => {
  const harness = loadPlugin({
    shots: [shot('linked', { serialNumber: '7000' }), shot('missing')],
    registeredSerials: ['7000'],
    responseStatuses: [401],
  });
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 2);
  assert.equal(harness.notifications.at(-1).id, 'authentication');
  assert.ok(harness.dismissedNotifications.includes('ownership'));
});

test('only return from this plugin support action rechecks ownership', async () => {
  const harness = loadPlugin({
    shots: [shot('a')],
    machineListResponses: [{ status: 200, body: '' }, { status: 200, body: '6262 DE-DE1PRO' }],
  });
  await harness.runNextTimer();
  const notice = harness.notifications.at(-1);
  assert.ok(notice);
  for (const payload of [
    { id: notice.id, actionId: notice.action.id, phase: 'activated' },
    { id: 'unrelated', actionId: notice.action.id, phase: 'returned' },
    { id: notice.id, actionId: 'unrelated', phase: 'returned' },
  ]) harness.plugin.onEvent({ name: 'notificationAction', payload });
  await pump();
  assert.equal(harness.machineListCalls.length, 1);
  harness.plugin.onEvent({
    name: 'notificationAction',
    payload: { id: notice.id, actionId: notice.action.id, phase: 'returned' },
  });
  await harness.runNextTimer();
  assert.equal(harness.machineListCalls.length, 2);
  assert.equal(harness.proxyCalls.length, 1);
  assert.ok(harness.dismissedNotifications.includes(undefined));
});

test('account changes clear stale native notices, not another plugin UI', async () => {
  const harness = loadPlugin({ shots: [shot('a')], registeredSerials: [] });
  await harness.runNextTimer();
  assert.ok(harness.notifications.length);
  harness.plugin.onEvent({ name: 'decentAccountChanged', payload: {} });
  assert.ok(harness.dismissedNotifications.includes(undefined));
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 2);
});

test('missing optional notification methods do not bypass the ownership guard', async () => {
  const harness = loadPlugin({ shots: [shot('a')], registeredSerials: [], notificationsAvailable: false });
  await harness.runNextTimer();
  assert.equal(harness.proxyCalls.length, 0);
  assert.equal(harness.emits.filter(event => event.name === 'uploadPaused').length, 1);
  const response = await harness.plugin.__httpRequestHandler({ endpoint: 'status' });
  assert.equal(JSON.parse(response.body).pausedSerials[0], '6262');
});

for (const reason of ['capacity', 'storage']) {
  for (const authentication of [false, true]) {
    test(`${reason} rejection retries ${authentication ? 'authentication' : 'ownership'} notices independently of paused reconciliation`, async () => {
      const harness = loadPlugin({
        shots: [shot('a')], registeredSerials: [],
        machineListResponses: authentication ? [{ status: 401, body: '' }] : [],
        notificationResults: [{ status: 'rejected', reason }, { status: 'accepted' }],
      });
      await harness.runNextTimer();
      assert.equal(harness.notifications.length, 1);
      assert.equal(harness.nextTimerDelay, 60000);
      const checks = harness.machineListCalls.length;
      await harness.runNextTimer();
      assert.equal(harness.notifications.length, 2);
      assert.equal(harness.machineListCalls.length, checks);
      assert.equal(harness.proxyCalls.length, 0);
      assert.equal(harness.nextTimerDelay, authentication ? null : 300000);
      const status = JSON.parse((await harness.plugin.__httpRequestHandler({ endpoint: 'status' })).body);
      assert.equal(status.authenticationPaused, authentication);
      if (!authentication) assert.deepEqual(status.pausedSerials, ['6262']);
    });
  }
}

test('pending delivery is not accepted and stale results cannot resurrect retired notices', async () => {
  const harness = loadPlugin({ shots: [shot('a')], registeredSerials: [], notificationResults: null });
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.nextTimerDelay, 300000);
  harness.plugin.onEvent({ name: 'notificationResult', payload: { id: 'ownership', requestId: 'unrelated', status: 'rejected', reason: 'capacity' } });
  assert.equal(harness.nextTimerDelay, 300000);
  harness.plugin.onEvent({ name: 'decentAccountChanged', payload: {} });
  harness.plugin.onEvent({ name: 'notificationResult', payload: { id: 'ownership', requestId: 'notification-1', status: 'rejected', reason: 'storage' } });
  assert.equal(harness.nextTimerDelay, 0);
  assert.equal(harness.proxyCalls.length, 0);
});

for (const event of ['decentAccountChanged', 'unload']) {
  test(`${event} cancels rejected-notice retries without bypassing upload policy`, async () => {
    const harness = loadPlugin({ shots: [shot('a')], registeredSerials: [], notificationResults: [{ status: 'rejected', reason: 'capacity' }] });
    await harness.runNextTimer();
    assert.equal(harness.nextTimerDelay, 60000);
    if (event === 'unload') harness.plugin.onUnload();
    else harness.plugin.onEvent({ name: event, payload: { id: 'ownership' } });
    if (event === 'decentAccountChanged') {
      assert.equal(harness.nextTimerDelay, 0);
      await harness.runNextTimer();
      assert.equal(harness.notifications.length, 2);
    } else {
      assert.equal(await harness.runNextTimer(), false);
      assert.equal(harness.notifications.length, 1);
    }
    assert.equal(harness.proxyCalls.length, 0);
  });
}

test('validation rejection does not start an endless retry', async () => {
  const harness = loadPlugin({ shots: [shot('a')], registeredSerials: [], notificationResults: [{ status: 'rejected', reason: 'validation' }] });
  await harness.runNextTimer();
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.nextTimerDelay, 300000);
});

test('authentication supersession cancels a rejected ownership retry', async () => {
  const harness = loadPlugin({
    shots: [shot('linked', { serialNumber: '7000' }), shot('missing')], registeredSerials: ['7000'], responseStatuses: [401],
    notificationResults: [{ status: 'rejected', reason: 'capacity' }, { status: 'accepted' }],
  });
  await harness.runNextTimer();
  assert.deepEqual(harness.notifications.map(notice => notice.id), ['ownership', 'authentication']);
  assert.equal(harness.nextTimerDelay, null);
  harness.plugin.onEvent({ name: 'notificationResult', payload: { id: 'ownership', requestId: 'notification-1', status: 'rejected', reason: 'storage' } });
  assert.equal(await harness.runNextTimer(), false);
  assert.equal(harness.proxyCalls.length, 1);
});
