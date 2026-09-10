import assert from 'node:assert/strict';
import test from 'node:test';
import { ResultBudget, ResultLimitError } from '../dist/drivers/result-budget.js';

test('result budget rejects excess rows before retaining them', () => {
  const budget = new ResultBudget({ maxRows: 1, maxResultBytes: 1024 });
  budget.setFields(['value']);
  budget.addRow({ value: 1 });
  assert.throws(() => budget.addRow({ value: 2 }), ResultLimitError);
  assert.equal(budget.rows.length, 1);
});

test('byte budget includes UTF-8 field names, strings and binary values', () => {
  for (const value of ['界'.repeat(100), Buffer.alloc(300), { nested: 'x'.repeat(300) }]) {
    const budget = new ResultBudget({ maxRows: 100, maxResultBytes: 128 });
    budget.setFields(['value']);
    assert.throws(() => budget.addRow({ value }), ResultLimitError);
    assert.equal(budget.rows.length, 0);
  }
  assert.throws(() => new ResultBudget({ maxRows: 1, maxResultBytes: 128 }).setFields(['界'.repeat(100)]), ResultLimitError);
});

test('budget bounds deep, cyclic and accessor objects without serialization', () => {
  const cyclic = {}; cyclic.self = cyclic;
  let deep = {}; for (let i = 0; i < 40; i++) deep = { deep };
  let invoked = false;
  const accessor = { get secret() { invoked = true; return 'secret'; } };
  for (const value of [cyclic, deep, accessor]) {
    const budget = new ResultBudget({ maxRows: 1, maxResultBytes: 1024 * 1024 });
    assert.throws(() => budget.addRow({ value }), ResultLimitError);
  }
  assert.equal(invoked, false);
});

test('normal JSON, dates, null and binary fit a finite budget', () => {
  const budget = new ResultBudget({ maxRows: 2, maxResultBytes: 2048 });
  budget.setFields(['value']);
  const row = { value: { array: [true, null, 12], date: new Date(0), bytes: Buffer.from('ok') } };
  budget.addRow(row);
  assert.deepEqual(budget.rows, [row]);
  assert.deepEqual(budget.fields, ['value']);
});

test('sparse arrays cannot expand beyond the budget during later JSON formatting', () => {
  for (const value of [new Array(100000000), [1, , 3]]) {
    const budget = new ResultBudget({ maxRows: 1, maxResultBytes: 1024 });
    assert.throws(() => budget.addRow({ value }), ResultLimitError);
    assert.equal(budget.rows.length, 0);
  }
});

test('unexpected prototypes fail closed while own __proto__ JSON fields are measured', () => {
  const budget = () => new ResultBudget({ maxRows: 1, maxResultBytes: 1024 });
  assert.throws(() => budget().addRow(Object.create({ hidden: 'x'.repeat(10000) })), ResultLimitError);
  assert.throws(() => budget().addRow({ value: Object.create({ hidden: 'x'.repeat(10000) }) }), ResultLimitError);
  const row = JSON.parse('{"__proto__":"safe own field","value":1}');
  assert.doesNotThrow(() => budget().addRow(row));
  assert.doesNotThrow(() => budget().addRow(Object.assign(Object.create(null), { value: 1 })));
});
