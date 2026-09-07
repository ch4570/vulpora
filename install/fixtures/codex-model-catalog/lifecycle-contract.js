'use strict';
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {PassThrough, Writable} = require('node:stream');
const {setTimeout: delay} = require('node:timers/promises');

module.exports = async function lifecycleContracts(collect) {
  let checks = 0;
  async function scenario(mode, expectedError = null) {
    const child = new EventEmitter(), signals = new EventEmitter(), sent = [];
    const calls = [], inspections = [];
    let unreferenced = false, observedExit = false;
    Object.assign(child, {pid: 31415, exitCode: null, signalCode: null,
      stdout: new PassThrough(), stderr: new PassThrough(), unref() {unreferenced = true;}});
    function exit(code = 0, signal = null, close = true, update = true) {
      if (update) {child.exitCode = code; child.signalCode = signal;}
      observedExit = true;
      child.emit('exit', code, signal);
      if (close) child.emit('close', code, signal);
    }
    function reply(id, result) {child.stdout.write(JSON.stringify({id, result}) + '\n');}
    child.stdin = new Writable({write(bytes, _encoding, callback) {
      const request = JSON.parse(bytes.toString()); sent.push(request.method);
      queueMicrotask(() => {
        if (request.method === 'initialize') reply(request.id, {});
        if (request.method !== 'model/list') return;
        if (mode === 'early-close') {exit(); return;}
        if (mode === 'observed-exit') exit(0, null, false, false);
        if (mode === 'exit-code') child.exitCode = 0;
        if (mode === 'signal-code') child.signalCode = 'SIGTERM';
        if (mode === 'invalid-pid') child.pid = 1;
        reply(request.id, {data: [{model:'synthetic-model', supportedReasoningEfforts:[]}], nextCursor:null});
        if (['observed-exit', 'exit-code', 'signal-code', 'invalid-pid'].includes(mode)) child.emit('close', 0, null);
        if (mode === 'cancel-during-cleanup') signals.emit('SIGINT');
      });
      callback();
    }});
    const processApi = {
      signals,
      spawn(_file, args, options) {
        assert.deepEqual(args, ['app-server']);
        assert.equal(options.detached, true); assert.equal(options.shell, false);
        return child;
      },
      kill(pid, signal) {
        calls.push({pid, signal, observedExit, exitCode:child.exitCode, signalCode:child.signalCode});
        assert.equal(pid, -31415); assert.equal(observedExit, false);
        assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
        if (mode === 'denied-kill') throw Object.assign(new Error('denied'), {code:'EPERM'});
        if (mode === 'kill-escalation' && signal === 'SIGTERM') return;
        if (mode === 'exit-with-open-pipes') exit(0, null, false);
        else exit(signal === 'SIGKILL' ? null : 0, signal === 'SIGKILL' ? 'SIGKILL' : null);
      },
      groupMembers(pid) {
        inspections.push(pid);
        if (mode === 'inspection-error') throw new Error('private inspection detail');
        if (mode === 'invalid-inspection') return null;
        if (mode === 'leftover-group' || mode === 'frozen-wall-clock') return [31416];
        if (['transient-group', 'cancel-during-cleanup'].includes(mode) && inspections.length < 3) return [31416];
        return [];
      },
    };
    const originalNow = Date.now;
    if (mode === 'frozen-wall-clock') Date.now = () => 1000;
    const started = performance.now();
    try {
      const pending = collect({codexBin:'synthetic-only', timeoutMs:1200, processApi});
      if (expectedError) await assert.rejects(pending, error => error.code === expectedError);
      else assert.equal((await pending).models[0].id, 'synthetic-model');
      assert(performance.now() - started < 2000, `${mode}: cleanup is bounded`);
    } finally {Date.now = originalNow;}
    assert.equal(unreferenced, true, `${mode}: caller releases its child handle`);
    assert(child.stdin.destroyed && child.stdout.destroyed && child.stderr.destroyed);
    for (const signal of ['SIGINT','SIGTERM','SIGHUP']) assert.equal(signals.listenerCount(signal), 0);
    assert(sent.every(method => ['initialize','initialized','model/list'].includes(method)));
    if (['observed-exit','exit-code','signal-code','early-close','invalid-pid'].includes(mode)) assert.deepEqual(calls, []);
    else if (['kill-escalation','denied-kill'].includes(mode)) assert.deepEqual(calls.map(call => call.signal), ['SIGTERM','SIGKILL']);
    else assert.deepEqual(calls.map(call => call.signal), ['SIGTERM']);
    const before = calls.length;
    await delay(175);
    assert.equal(calls.length, before, `${mode}: no delayed signal after settlement/reaping`);
    checks += 1;
  }
  for (const mode of ['normal','observed-exit','exit-code','signal-code','kill-escalation','transient-group']) await scenario(mode);
  for (const [mode, error] of [
    ['early-close','INCOMPLETE_MODEL_CATALOG'], ['invalid-pid','CLEANUP_UNVERIFIED'],
    ['leftover-group','CLEANUP_UNVERIFIED'], ['inspection-error','CLEANUP_UNVERIFIED'],
    ['invalid-inspection','CLEANUP_UNVERIFIED'], ['exit-with-open-pipes','CLEANUP_UNVERIFIED'],
    ['denied-kill','CLEANUP_UNVERIFIED'], ['frozen-wall-clock','CLEANUP_UNVERIFIED'],
    ['cancel-during-cleanup','INTERRUPTED'],
  ]) await scenario(mode, error);
  return checks;
};
