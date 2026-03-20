import assert from 'node:assert/strict';

const {
  waitForSoftTimeout,
  runAbortableTaskWithBudget,
} = await import('../src/utils/asyncBudget.ts');

let softSettled = false;
const softStart = Date.now();
const softResult = await waitForSoftTimeout(
  new Promise((resolve) => {
    setTimeout(() => {
      softSettled = true;
      resolve('late');
    }, 60);
  }),
  10,
);

assert.equal(softResult.timedOut, true, 'waitForSoftTimeout should time out slow promises');
assert.equal(softResult.value, null, 'waitForSoftTimeout should return null on timeout');
assert(Date.now() - softStart < 50, 'waitForSoftTimeout should return quickly after budget expires');

await new Promise((resolve) => setTimeout(resolve, 80));
assert.equal(softSettled, true, 'waitForSoftTimeout should not cancel the underlying promise');

let taskAborted = false;
const taskStart = Date.now();
const taskResult = await runAbortableTaskWithBudget(
  (signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('too-late'), 100);
    signal.addEventListener('abort', () => {
      taskAborted = true;
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  }),
  20,
);

assert.equal(taskResult.timedOut, true, 'runAbortableTaskWithBudget should time out slow abortable tasks');
assert.equal(taskResult.value, null, 'runAbortableTaskWithBudget should return null on timeout');
assert.equal(taskAborted, true, 'runAbortableTaskWithBudget should abort the inner task on timeout');
assert(Date.now() - taskStart < 80, 'runAbortableTaskWithBudget should stop waiting after budget expires');

const parentAbort = new AbortController();
const abortedPromise = runAbortableTaskWithBudget(
  (signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('never'), 100);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  }),
  100,
  { signal: parentAbort.signal },
);
setTimeout(() => parentAbort.abort(), 10);
await assert.rejects(abortedPromise, /AbortError|취소|aborted/i, 'parent abort should propagate immediately');

console.log(JSON.stringify({
  ok: true,
  softTimedOut: softResult.timedOut,
  taskTimedOut: taskResult.timedOut,
  taskAborted,
}, null, 2));
