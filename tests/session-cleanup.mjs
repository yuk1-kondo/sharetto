import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Exercise the scheduled handler without accessing a production Firebase project.
test('cleanup keeps extended sessions and handles an extension racing cleanup', async () => {
  const now = Date.now();
  const data = {
    sessions: {
      extended: { status: 'active', expiresAt: now + 7200000 },
      expired: { status: 'active', expiresAt: now - 1000 },
      ended: { status: 'ended', expiresAt: now + 7200000 },
      racing: { status: 'active', expiresAt: now - 1000 },
    },
    codes: { '111111': { sessionId: 'extended', timestamp: now - 7200000 }, '222222': { sessionId: 'expired', timestamp: now } },
  };
  for (const path of ['files','outbox','signal','presence']) {
    data[path] = Object.fromEntries(['extended','expired','ended','racing'].map(id => [id, { entry001: { timestamp: now - 7200001 } }]));
  }
  const get = path => path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],data);
  const put = (path,value) => {
    const keys=path.split('/'); const key=keys.pop();
    let node=data; for(const k of keys) node=node[k] ||= {};
    if(value===null)delete node[key]; else node[key]=value;
  };
  const db={ref(path=''){return {
    async get(){return {val:()=>structuredClone(get(path))}},
    async update(values){for(const [k,v]of Object.entries(values))put(path ? `${path}/${k}`:k,v)},
    async transaction(fn){
      if(path==='sessions/racing')data.sessions.racing.expiresAt=now+7200000;
      const value=fn(structuredClone(get(path)));
      if(value===undefined)return {committed:false};
      put(path,value);return {committed:true};
    },
  }}};
  globalThis.__cleanupTestDb=db;
  let source=await readFile(new URL('../functions/index.js',import.meta.url),'utf8');
  source=source.replace(/^import .*;\n/gm,'').replace('initializeApp();','const onSchedule = (_, handler) => handler; const getDatabase = () => globalThis.__cleanupTestDb;');
  try {
    const {cleanupOldEntries}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    await cleanupOldEntries();
    for(const path of ['files','outbox','signal','presence']){
      assert.ok(data[path].extended,`${path}: extended data survives`);
      assert.ok(data[path].racing,`${path}: racing extension survives`);
      assert.equal(data[path].expired,undefined);
      assert.equal(data[path].ended,undefined);
    }
    assert.equal(data.sessions.expired.status,'ended');
    assert.ok(data.codes['111111'],'old PIN remains valid after extension');
    assert.equal(data.codes['222222'],undefined);
  } finally { delete globalThis.__cleanupTestDb; }
});
