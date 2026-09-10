import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function classroomApi() {
  const memberships = new Set(['first-room']);
  const calls = [];
  const rooms = { FIRST: 'first-room', SECOND: 'second-room', THIRD: 'third-room' };
  const context = {
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'student-1' } } } }) },
      rpc: async (name, { code }) => {
        calls.push(code);
        assert.equal(name, 'join_classroom_by_code');
        if (!rooms[code]) return { error: new Error('Invalid or closed room.') };
        memberships.add(rooms[code]);
        return { data: rooms[code] };
      },
      from: table => {
        assert.equal(table, 'classroom_members');
        return { select: () => ({ eq: async (key, value) => {
          assert.equal(key, 'student_id');
          assert.equal(value, 'student-1');
          return { data: [...memberships].map(id => ({ classrooms: { id } })) };
        } }) };
      }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(new URL('../src/lib/classroom.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/, '').replaceAll('export ', ''), context);
  return { api: context, memberships, calls };
}

test('joining several codes preserves the first room, deduplicates input, and reports partial failures', async () => {
  const { api, memberships, calls } = classroomApi();
  const results = await api.joinClassroomsByCodes(' first, SECOND\nsecond; CLOSED third ');
  assert.deepEqual(calls, ['FIRST', 'SECOND', 'CLOSED', 'THIRD']);
  assert.deepEqual([...memberships], ['first-room', 'second-room', 'third-room']);
  assert.equal(results[2].error, 'Invalid or closed room.');
  assert.equal(results[3].roomId, 'third-room');
  await api.joinClassroomsByCodes('SECOND');
  assert.equal(memberships.size, 3);
  const joined = await api.getStudentClassrooms();
  assert.deepEqual(Array.from(joined, room => room.id), [...memberships]);
});

test('empty and oversized requests do not submit membership changes', async () => {
  const { api, calls } = classroomApi();
  await assert.rejects(() => api.joinClassroomsByCodes(' , ; '), /at least one/);
  await assert.rejects(() => api.joinClassroomsByCodes(Array.from({ length: 21 }, (_, i) => `ROOM${i}`).join(',')), /up to 20/);
  assert.equal(calls.length, 0);
});

test('joined-room UI remains available for existing members and escapes room names', () => {
  const context = {};
  vm.createContext(context);
  const source = fs.readFileSync(new URL('../src/components/studentRooms.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/, '').replaceAll('export ', ''), context);
  const html = context.renderStudentRooms([{ name: '<script>alert(1)</script>', join_code: 'FIRST', is_open: true }]);
  assert.match(html, /data-join-rooms/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Adding a room keeps your existing classrooms/);
});


test('room quiz status keeps attempts separate and permits teacher-configured retries', () => {
  const context = {};
  vm.createContext(context);
  const source = fs.readFileSync(new URL('../src/pages/studentRooms.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', ''), context);
  const attempts = [{ quiz_id: 'a' }, { quiz_id: 'b' }];
  assert.equal(context.quizState({ id: 'a', max_attempts: 1 }, attempts).complete, true);
  assert.equal(context.quizState({ id: 'a', max_attempts: 2 }, attempts).complete, false);
  assert.equal(context.quizState({ id: 'c', max_attempts: 1 }, attempts).used, 0);
  assert.equal(context.quizState({ id: 'b' }, attempts).complete, true);
});
