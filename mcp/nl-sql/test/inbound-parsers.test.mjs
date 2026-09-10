import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setImmediate as tick } from 'node:timers/promises';
import test from 'node:test';
import tds from 'tedious';
import { installInboundGate, postgresInboundStream, mysqlInboundStream, mssqlInboundStream } from '../dist/drivers/inbound-budget.js';

const require = createRequire(import.meta.url);
const { Parser: PgParser } = require(join(dirname(require.resolve('pg-protocol')), 'parser.js'));
const mysqlRoot = dirname(require.resolve('mysql2'));
const MysqlPacketParser = require(join(mysqlRoot, 'lib/packet_parser.js'));
const MysqlExecute = require(join(mysqlRoot, 'lib/commands/execute.js'));
const tediousRoot = dirname(require.resolve('tedious'));
const IncomingMessageStream = require(join(tediousRoot, 'incoming-message-stream.js'));
const TdsParser = require(join(tediousRoot, 'token/stream-parser.js'));
const debug = { packet() {}, data() {}, token() {}, log() {} };

function fragments(buffer, widths = [1, 2, 5, 7]) {
  const chunks = [];
  for (let offset = 0, index = 0; offset < buffer.length; index++) {
    const size = widths[index % widths.length];
    chunks.push(buffer.subarray(offset, offset + size));
    offset += size;
  }
  return chunks;
}

function pgRow(value) {
  const body = Buffer.from(value);
  const packet = Buffer.alloc(11 + body.length);
  packet[0] = 0x44; packet.writeUInt32BE(packet.length - 1, 1);
  packet.writeUInt16BE(1, 5); packet.writeUInt32BE(body.length, 7); body.copy(packet, 11);
  return packet;
}

test('real pg-protocol fragmented DataRow reaches decoding only within the inbound budget', () => {
  for (const maxBytes of [64, 2048]) {
    const rows = [], failures = [];
    const parser = new PgParser();
    const cleartext = new PassThrough();
    cleartext.on('data', chunk => parser.parse(chunk, message => rows.push(message)));
    const gate = installInboundGate(postgresInboundStream({ connection: { stream: cleartext } }), 'emit', maxBytes, error => {
      failures.push(error); cleartext.destroy();
    });
    for (const chunk of fragments(pgRow('x'.repeat(512)))) cleartext.emit('data', chunk);
    assert.ok(gate.acceptedBytes <= maxBytes);
    if (maxBytes === 64) {
      assert.equal(rows.length, 0);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].code, 'NLSQL_RESULT_LIMIT_EXCEEDED');
      assert.ok(parser.bufferLength <= maxBytes);
    } else {
      assert.equal(rows[0].fields[0].length, 512);
      gate.restore();
    }
    cleartext.destroy();
  }
});

function mysqlRow(value) {
  const bytes = Buffer.from(value);
  const body = Buffer.alloc(5 + bytes.length);
  body[0] = 0; body[1] = 0; body[2] = 0xfc;
  body.writeUInt16LE(bytes.length, 3); bytes.copy(body, 5);
  const header = Buffer.alloc(4); header.writeUIntLE(body.length, 0, 3);
  return Buffer.concat([header, body]);
}

test('real mysql PacketParser state changes cannot bypass the gate before Execute binary decoding', () => {
  for (const maxBytes of [64, 2048]) {
    const rows = [], failures = [], states = new Set();
    const core = { config: { compress: false, disableEval: true, timezone: 'Z' }, stream: new PassThrough() };
    const execute = new MysqlExecute({ sql: 'SELECT value', values: [] });
    execute.options = core.config;
    execute._fields = [[{ name: 'value', columnType: 253, characterSet: 45, encoding: 'utf8', flags: 0 }]];
    execute._currentFields = execute._fields[0];
    execute._currentRows = [];
    execute.fieldsEOF({ isEOF: () => true }, core);
    execute.on('result', row => rows.push(row));
    const parser = new MysqlPacketParser(packet => execute.row(packet, core));
    core.stream.on('data', chunk => { parser.execute(chunk); states.add(parser.execute); });
    const gate = installInboundGate(mysqlInboundStream(core), 'emit', maxBytes, error => { failures.push(error); core.stream.destroy(); });
    for (const chunk of fragments(mysqlRow('x'.repeat(512)))) core.stream.emit('data', chunk);
    assert.ok(states.size > 1, 'actual packet parser changed execute functions between fragments');
    assert.ok(gate.acceptedBytes <= maxBytes);
    assert.equal(execute._currentRows.length, 0);
    if (maxBytes === 64) {
      assert.equal(rows.length, 0);
      assert.equal(failures.length, 1);
      assert.ok(parser.bufferLength <= maxBytes);
    } else {
      assert.equal(rows[0].value.length, 512);
      gate.restore();
    }
    core.stream.destroy();
  }
});

function plpRow(value) {
  const bytes = Buffer.from(value, 'utf16le');
  const header = Buffer.alloc(13);
  header[0] = 0xd1; header.writeBigUInt64LE(BigInt(bytes.length), 1); header.writeUInt32LE(bytes.length, 9);
  return Buffer.concat([header, bytes, Buffer.alloc(4)]);
}

function tdsPackets(body) {
  const packets = [];
  for (let offset = 0; offset < body.length; offset += 32) {
    const payload = body.subarray(offset, offset + 32);
    const header = Buffer.alloc(8); header[0] = 4;
    header[1] = offset + payload.length === body.length ? 1 : 0;
    header.writeUInt16BE(8 + payload.length, 2); header[6] = packets.length + 1;
    packets.push(Buffer.concat([header, payload]));
  }
  return Buffer.concat(packets);
}

test('real Tedious IncomingMessageStream and PLP parser reject oversized fragmented cells before row construction', async () => {
  for (const maxBytes of [64, 2048]) {
    const incoming = new IncomingMessageStream(debug);
    const rows = [], tasks = [], failures = [];
    incoming.on('error', () => {});
    incoming.on('data', message => {
      message.on('error', () => {});
      tasks.push((async () => {
        try {
          const metadata = [{ colName: 'value', type: tds.TYPES.NVarChar, dataLength: 0xffff }];
          for await (const token of TdsParser.parseTokens(message, debug, { useUTC: true, tdsVersion: '7_4' }, metadata)) rows.push(token);
        } catch (error) { if (!failures.length) throw error; }
      })());
    });
    const connection = { messageIo: { incomingMessageStream: incoming } };
    const gate = installInboundGate(mssqlInboundStream(connection), 'write', maxBytes, error => {
      failures.push(error);
      incoming.currentMessage?.destroy(error);
      incoming.destroy(error);
    });
    for (const chunk of fragments(tdsPackets(plpRow('x'.repeat(256))))) {
      incoming.write(chunk);
      await tick();
    }
    if (!gate.error) incoming.end();
    await Promise.all(tasks);
    assert.ok(gate.acceptedBytes <= maxBytes);
    if (maxBytes === 64) {
      assert.equal(rows.length, 0);
      assert.equal(failures.length, 1);
      assert.ok(incoming.bl.length <= maxBytes);
    } else {
      assert.equal(rows[0].columns[0].value.length, 256);
      gate.restore();
    }
    incoming.destroy();
  }
});

test('synthetic TLS placement budgets the current decrypted stream rather than the old raw socket', () => {
  for (const dialect of ['postgres', 'mysql']) {
    const raw = new PassThrough(), cleartext = new PassThrough();
    cleartext.encrypted = true;
    let forwarded = 0;
    cleartext.on('data', chunk => { forwarded += chunk.length; });
    const target = dialect === 'postgres'
      ? postgresInboundStream({ stream: raw, connection: { stream: cleartext } })
      : mysqlInboundStream({ config: { compress: false }, oldStream: raw, stream: cleartext });
    const gate = installInboundGate(target, 'emit', 8, () => cleartext.destroy());
    raw.emit('data', Buffer.alloc(100));
    assert.equal(gate.acceptedBytes, 0);
    cleartext.emit('data', Buffer.alloc(8));
    cleartext.emit('data', Buffer.alloc(1));
    assert.equal(forwarded, 8);
    assert.equal(gate.error.code, 'NLSQL_RESULT_LIMIT_EXCEEDED');
    raw.destroy(); cleartext.destroy();
  }
});

test('synthetic Tedious TLS pipeline gates decrypted writes into the real IncomingMessageStream', () => {
  const raw = new PassThrough(), cleartext = new PassThrough();
  const incoming = new IncomingMessageStream(debug);
  cleartext.pipe(incoming);
  const connection = { messageIo: { socket: raw, securePair: { cleartext }, incomingMessageStream: incoming } };
  const gate = installInboundGate(mssqlInboundStream(connection), 'write', 16, () => {
    cleartext.destroy(); incoming.destroy();
  });
  raw.emit('data', Buffer.alloc(100));
  assert.equal(gate.acceptedBytes, 0);
  cleartext.emit('data', Buffer.from([4, 1, 16, 0, 0, 0, 1, 0]));
  cleartext.emit('data', Buffer.alloc(32));
  assert.equal(gate.acceptedBytes, 8);
  assert.equal(incoming.bl.length, 8);
  assert.equal(gate.error.code, 'NLSQL_RESULT_LIMIT_EXCEEDED');
  raw.destroy(); cleartext.destroy(); incoming.destroy();
});
