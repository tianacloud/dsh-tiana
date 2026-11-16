import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {listSpaces, switchSpace} from '../tiana-api.js';

// Set TIANA_TEST_CLI to a released native CLI to verify the real executable.
test('published CLI lists all spaces and persists switch before success, including pending sync', {skip: !process.env.TIANA_TEST_CLI}, async t => {
  const root=await mkdtemp(join(tmpdir(),'dsh-spaces-'));
  const old={...process.env};
  t.after(async()=>{for(const key of Object.keys(process.env)) if(!(key in old)) delete process.env[key]; Object.assign(process.env,old); await rm(root,{recursive:true,force:true});});
  const requests=[];
  let fail=false;
  const server=createServer(async(req,res)=>{
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('content-type','application/json');
    if(req.url.startsWith('/api/v1/me/tenants')) {
      const second=new URL(req.url,'http://localhost').searchParams.has('after');
      res.end(JSON.stringify({items:[{tenant_id:second?'ten-b':'ten-a',display_name:second?'Shared':'Home',role:'tenant_owner',is_default:!second}],next_cursor:second?'':'ten-a'}));
    } else if(req.url==='/api/v1/me/tenant' && req.method==='POST') {
      let body=''; for await(const chunk of req) body+=chunk;
      assert.equal(JSON.parse(body).tenant_id,'ten-b');
      if(fail) {res.statusCode=503;res.end(JSON.stringify({code:'RESULT_UNKNOWN',message:'synthetic unknown'}));return;}
      res.end(JSON.stringify({access_token:'fixture-new-access',refresh_token:'fixture-new-refresh',token_type:'Bearer',expires_in:3600,user:{user_id:'fixture-user',tenant_id:'ten-b'},sync_status:'pending',job_id:7}));
    } else {res.statusCode=404;res.end('{}');}
  }).listen(0,'127.0.0.1');
  await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  await mkdir(join(root,'bin')); await mkdir(join(root,'config','tiana'),{recursive:true});
  // The launcher path is passed as an argument, never interpolated into shell source.
  await writeFile(join(root,'bin','tiana'),`#!${process.execPath}\nimport {spawnSync} from 'node:child_process';\nconst p=spawnSync(process.env.TIANA_TEST_CLI,process.argv.slice(2),{stdio:'inherit'});process.exit(p.status??1);`,{mode:0o700});
  process.env.PATH=`${join(root,'bin')}:${old.PATH}`;
  process.env.XDG_CONFIG_HOME=join(root,'config'); process.env.DSH_HOME=join(root,'dsh');process.env.TIANA_API_ORIGIN=origin;
  const credentialPath=join(root,'config','tiana','credentials.json');
  const initial={version:1,credentials:{[origin]:{access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'Bearer',expires_at:new Date(Date.now()+3600000).toISOString(),user:{user_id:'fixture-user',tenant_id:'ten-a'}}}};
  await writeFile(credentialPath,JSON.stringify(initial),{mode:0o600});
  const list=await listSpaces();
  assert.equal(list.ok,true);assert.equal(list.currentTenantId,'ten-a');assert.deepEqual(list.items.map(s=>s.tenantId),['ten-a','ten-b']);
  const result=await switchSpace('ten-b');
  assert.equal(result.ok,true);assert.equal(result.tenantId,'ten-b');assert.equal(result.syncStatus,'pending');
  const saved=JSON.parse(await readFile(credentialPath,'utf8'));
  assert.equal(saved.credentials[origin].user.tenant_id,'ten-b');
  assert.equal(JSON.stringify(result).includes('fixture-new'),false);
  assert.equal((await listSpaces()).currentTenantId,'ten-b');
  fail=true;
  const unknown=await switchSpace('ten-b');assert.equal(unknown.ok,false);assert.equal(unknown.requiresLogin,true);
  assert.equal(requests.filter(r=>r==='POST /api/v1/me/tenant').length,2);
  assert.equal(requests.some(r=>r.includes('tenant-creation')),false);
});

test('switch rejects invalid targets before executing a command',async()=>{
  assert.equal((await switchSpace('--help')).error.code,'INVALID_SPACE_ID');
});
