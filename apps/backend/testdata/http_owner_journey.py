"""Real full selfhost HTTP journey; every status/semantic oracle fails the run.

Called by TestOwnerDurableHTTPJourney. Own PostgreSQL18, auth credentials,
backend storage and loopback ports; restarts backend AND database in place.
Only artifact paths are supplied, never reusable credentials.
"""
import json,pathlib,urllib.request,urllib.error,http.cookiejar,secrets,time
import os,sys,tempfile,subprocess,socket,signal,shutil
R=pathlib.Path(os.environ['SMITHERS_HTTP_JOURNEY_RECEIPTS']);R.mkdir(parents=True,exist_ok=True)
S=pathlib.Path(tempfile.mkdtemp(prefix='smithers-http-owner-'));os.chmod(S,0o700)
root=pathlib.Path(sys.argv[1]);P=pathlib.Path(os.environ['SMITHERS_POSTGRES_TEST_BIN'])
def port():
 s=socket.socket();s.bind(('127.0.0.1',0));p=s.getsockname()[1];s.close();return p
pgport,httpport=port(),port();BASE=f'http://127.0.0.1:{httpport}'
records=[];private=[];jar=http.cookiejar.CookieJar();web=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));raw=urllib.request.build_opener()
USER='httpauditowner';PASSWORD='HttpAudit-'+secrets.token_hex(20);bootstrap=secrets.token_hex(32);private=[PASSWORD,bootstrap];TOKEN=None
(S/'bootstrap').write_text(bootstrap)
backend=None;pgstarted=False
log=open(R/'process.log','w')
def start():
 global backend,pgstarted
 subprocess.run([str(P/'pg_ctl'),'-D',str(S/'postgres'),'-l',str(R/'postgres.log'),'-o',f'-h 127.0.0.1 -p {pgport} -k {S}','-w','start'],stdout=log,stderr=log,check=True);pgstarted=True
 env={**os.environ,'SMITHERS_DATABASE_URL':f'postgres://httpaudit@127.0.0.1:{pgport}/postgres?sslmode=disable','SMITHERS_DATA_ROOT':str(S/'data'),'SMITHERS_AUTH_BOOTSTRAP_TOKEN':bootstrap,'SMITHERS_SERVER_ADDR':f'127.0.0.1:{httpport}','SMITHERS_PUBLIC_URL':BASE,'SMITHERS_OTEL_EXPORTER':'none'}
 backend=subprocess.Popen([os.environ['SMITHERS_HTTP_BACKEND_BINARY']],cwd=root,env=env,stdout=log,stderr=log)
 deadline=time.monotonic()+60
 while time.monotonic()<deadline:
  if backend.poll() is not None:raise RuntimeError('backend exited before readiness')
  try:
   with raw.open(BASE+'/api/bootstrap',timeout=1) as r:
    if r.status==200:return
  except (urllib.error.URLError,TimeoutError):pass
  time.sleep(.1)
 raise TimeoutError('backend readiness')
def stop():
 global backend,pgstarted
 if backend is not None and backend.poll() is None:
  backend.send_signal(signal.SIGTERM)
  try:backend.wait(timeout=20)
  except subprocess.TimeoutExpired:backend.kill();backend.wait();raise
 if pgstarted:
  subprocess.run([str(P/'pg_ctl'),'-D',str(S/'postgres'),'-m','fast','-w','stop'],stdout=log,stderr=log,check=True);pgstarted=False
def restart():
 stop();start()

def clean(v):
 if isinstance(v,dict):return {k:('[redacted]' if k.lower() in ['token','password','set-cookie','csrf_token','bootstrap_token'] else clean(x)) for k,x in v.items()}
 if isinstance(v,list):return [clean(x) for x in v]
 if isinstance(v,str):
  for x in private:
   if x:v=v.replace(x,'[redacted]')
 return v

def call(name,method,path,body=None,status=200,token=None,browser=False,headers=None,_deadline=None,_observe=True):
 h={'Origin':BASE};h.update(headers or {})
 if token:h['Authorization']='token '+token
 data=body.encode() if isinstance(body,str) else json.dumps(body,ensure_ascii=False).encode() if body is not None else None
 if data is not None:h['Content-Type']='application/json'
 if browser and method not in ('GET','HEAD','OPTIONS'):
  for cookie in jar:
   if 'csrf' in cookie.name:h['X-CSRF-Token']=cookie.value;private.append(cookie.value)
 try:r=(web if browser else raw).open(urllib.request.Request(BASE+path,data=data,headers=h,method=method),timeout=30)
 except urllib.error.HTTPError as e:r=e
 text=r.read().decode(); result=json.loads(text) if text and text[0] in '[{' else text
 expected=status if isinstance(status,list) else [status]
 if r.status==429 and path.startswith('/api/auth/local/') and 429 not in expected:
  deadline=_deadline or time.monotonic()+90
  retry=int(r.headers.get('Retry-After','0'))
  check('auth-rate-limit-honors-bounded-retry',0 < retry <= 60 and time.monotonic()+retry < deadline,{'retry_after':retry})
  records.append({'name':'auth-rate-limit-response','status':429,'expected':[429],'passed':True})
  time.sleep(retry)
  return call(name,method,path,body,status,token,browser,headers,deadline,_observe)
 record={'name':name,'method':method,'path':path,'status':r.status,'expected':expected,'passed':r.status in expected,'response':clean(result),'request':clean(body),'headers':{k:('[redacted]' if k.lower()=='set-cookie' else clean(v)) for k,v in r.headers.items()}}
 if _observe or not record['passed']:records.append(record)
 (R/'http-journeys.json').write_text(json.dumps(records,indent=2))
 if _observe or not record['passed']:print(name,r.status,'PASS' if record['passed'] else 'FAIL',flush=True)
 if not record['passed']:raise AssertionError(f'{name}: HTTP {r.status}, expected {expected}')
 return result,r

def check(name,condition,detail=None):
 records.append({'name':name,'semantic':True,'passed':bool(condition),'detail':clean(detail)});(R/'http-journeys.json').write_text(json.dumps(records,indent=2));print(name,'PASS' if condition else 'FAIL',flush=True)
 if not condition:raise AssertionError(name)


tokenids=[]
try:
 subprocess.run([str(P/'initdb'),'-D',str(S/'postgres'),'-U','httpaudit','--auth=trust','--no-locale','--encoding=UTF8'],stdout=log,stderr=log,check=True)
 start()
 call('unauthenticated-bootstrap','GET','/api/bootstrap')
 call('initial-local-auth-status','GET','/api/auth/local/status')
 call('unauthenticated-user-refused','GET','/api/user',status=401)
 call('wrong-bootstrap-refused','POST','/api/auth/local/bootstrap',{'username':USER,'password':PASSWORD},status=[401,403],headers={'X-Smithers-Bootstrap-Token':'wrong'})
 call('owner-public-bootstrap','POST','/api/auth/local/bootstrap',{'username':USER,'password':PASSWORD,'email':'httpaudit@example.invalid'},status=[200,201],browser=True,headers={'X-Smithers-Bootstrap-Token':(S/'bootstrap').read_text()})
 call('browser-user-identity','GET','/api/user',browser=True)
 call('bootstrap-repeat-refused','POST','/api/auth/local/bootstrap',{'username':USER,'password':PASSWORD},status=409,headers={'X-Smithers-Bootstrap-Token':(S/'bootstrap').read_text()})
 pat,_=call('password-pat-admission','POST','/api/auth/local/token',{'username':USER,'password':PASSWORD,'name':'http2979-owned','scopes':['read:user','write:user','read:repository','write:repository']})
 tokenids.append(pat['token_id']);TOKEN=pat.get('token');private.append(TOKEN or '');(S/'auth.json').write_text(json.dumps({'token':TOKEN,'id':pat.get('token_id'),'username':USER,'password':PASSWORD}));(S/'auth.json').chmod(0o600)
 # Replace any initial token response before retaining the receipt.
 for rec in records:
  rec['response']=clean(rec.get('response'))
 (R/'http-journeys.json').write_text(json.dumps(records,indent=2))
 if not TOKEN:raise RuntimeError('Public PAT issuance failed; no privileged fixture bypass')
 call('pat-user-identity','GET','/api/user',token=TOKEN)
 repo,_=call('private-repository-create','POST','/api/user/repos',{'name':'http-journeys-2979','private':True,'auto_init':True},status=201,token=TOKEN)
 REPO=f'/api/repos/{USER}/http-journeys-2979'
 call('repository-readback','GET',REPO,token=TOKEN)
 call('private-repository-anonymous-refusal','GET',REPO,status=[401,404],token=None)
 issue,_=call('unicode-issue-create','POST',REPO+'/issues',{'title':'HTTP audit Ω 🧪','body':'First line\nSecond line'},status=201,token=TOKEN)
 N=issue.get('number',1);read,_=call('issue-exact-readback','GET',REPO+f'/issues/{N}',token=TOKEN)
 check('issue-unicode-and-newlines-durable',read.get('title')=='HTTP audit Ω 🧪' and read.get('body')=='First line\nSecond line')
 call('second-issue-create','POST',REPO+'/issues',{'title':'Second audit issue'},status=201,token=TOKEN)
 page,resp=call('issue-pagination-first','GET',REPO+'/issues?limit=1',token=TOKEN)
 check('issue-pagination-bounded',isinstance(page,list) and len(page)==1,resp.headers.get('Link'))
 call('invalid-issue-pagination-refused','GET',REPO+'/issues?page=not-a-number',status=400,token=TOKEN)
 call('malformed-issue-json-refused','POST',REPO+'/issues','{"title":"must not exist"} {}',status=400,token=TOKEN)
 rows,_=call('issue-no-side-effect-after-refusal','GET',REPO+'/issues?limit=100',token=TOKEN)
 check('refused-issue-not-created',isinstance(rows,list) and len(rows)==2,rows)
 call('active-stack-absent','GET',REPO+'/stacks/active',status=404,token=TOKEN)
 call('repository-change-list','GET',REPO+'/changes',token=TOKEN)
 call('workspace-list-empty','GET',REPO+'/workspaces',token=TOKEN)
 call('workspace-create','POST',REPO+'/workspaces',{'name':'http-audit','kind':'container'},status=[201,202],token=TOKEN)
 (S/'session.json').write_text(json.dumps({'repo':REPO,'issue':N,'cookies':[{'name':c.name,'value':c.value,'domain':c.domain,'path':c.path} for c in jar]}));(S/'session.json').chmod(0o600)
 
 page,response=call('cursor-issue-pagination-first','GET',REPO+'/issues?limit=1',token=TOKEN)
 check('cursor-first-page-exact-bound',len(page)==1,response.headers.get('Link'))
 link=response.headers.get('Link',''); nextlink=next((piece.split('>')[0].lstrip(' <') for piece in link.split(',') if 'rel="next"' in piece),None)
 check('cursor-next-link-present',bool(nextlink),link)
 if nextlink:
  nextpage,_=call('cursor-issue-pagination-next','GET',nextlink,token=TOKEN)
  check('cursor-pages-no-duplicate',len(nextpage)==1 and nextpage[0]['number']!=page[0]['number'])
 call('malformed-cursor-refused','GET',REPO+'/issues?cursor=not-valid',status=400,token=TOKEN)
 changes,_=call('canonical-change-identities','GET',REPO+'/changes',token=TOKEN); change=changes['items'][0]['change_id']
 stack,_=call('active-stack-create','POST',REPO+'/stacks/active',{'target_ref':'main','changes':[{'branch_name':'audit-stack','change_id':change,'position':0}]},token=TOKEN)
 stackread,_=call('active-stack-readback','GET',REPO+'/stacks/active',token=TOKEN)
 check('stack-change-identity-preserved',any(x.get('change_id')==change for x in stackread.get('changes',[])))
 call('invalid-stack-json-refused','POST',REPO+'/stacks/active','{} {}',status=400,token=TOKEN)
 unchanged,_=call('stack-unchanged-after-refusal','GET',REPO+'/stacks/active',token=TOKEN);check('stack-refusal-no-overwrite',unchanged==stackread)
 wsid=next(x['response']['id'] for x in records if x['name']=='workspace-create');WP=REPO+'/workspaces/'+wsid
 for i in range(30):
  workspace,_=call('workspace-authoritative-state','GET',WP,token=TOKEN,_observe=False)
  if workspace.get('status') not in ('starting','pending'):break
  time.sleep(.2)
 check('workspace-admission-reached-running',workspace.get('status')=='running',workspace)
 if workspace.get('status')=='running':
  result,_=call('workspace-command-admission','POST',WP+'/command-runs',{'operation_id':'http2979-write','args':['/bin/sh','-c','printf "durable Ω" > http-audit.txt; printf command-ok']},status=202,token=TOKEN)
  write=result['operationId']
  for i in range(50):
   done,_=call('workspace-command-durable-result','GET',WP+'/command-runs/'+write,token=TOKEN,_observe=False)
   if done.get('state') in ('completed','failed','cancelled'):break
   time.sleep(.1)
  check('workspace-command-success-and-output',done.get('state')=='completed' and done.get('result',{}).get('stdout')=='command-ok',done)
  file,_=call('workspace-file-effect-readback','GET',WP+'/files/content?path=http-audit.txt',token=TOKEN);check('workspace-exact-unicode-file-effect',file.get('content')=='durable Ω',file)
  admission,_=call('workspace-long-command-admission','POST',WP+'/command-runs',{'operation_id':'http2979-cancel','args':['/bin/sh','-c','sleep 600']},status=202,token=TOKEN)
  long=admission['operationId']
  for i in range(50):
   pending,_=call('workspace-cancel-target-running','GET',WP+'/command-runs/'+long,token=TOKEN,_observe=False)
   if pending.get('state')=='running':break
   time.sleep(.1)
  check('cancel-target-actually-running',pending.get('state')=='running',pending)
  call('workspace-command-cancel','POST',WP+'/command-runs/'+long+'/cancel',status=[200,202],token=TOKEN)
  for i in range(50):
   cancelled,_=call('workspace-cancel-durable-result','GET',WP+'/command-runs/'+long,token=TOKEN,_observe=False)
   if cancelled.get('state')=='cancelled':break
   time.sleep(.1)
  check('workspace-cancellation-settled',cancelled.get('state')=='cancelled',cancelled)
  call('workspace-cancel-repeat','POST',WP+'/command-runs/'+long+'/cancel',status=[200,202],token=TOKEN)
 (S/'session.json').write_text(json.dumps({'repo':REPO,'workspace':wsid,'issue':1,'cookies':[{'name':c.name,'value':c.value,'domain':c.domain,'path':c.path} for c in jar]}));(S/'session.json').chmod(0o600)
 
 completed,_=call('returned-operation-write-readback','GET',WP+'/command-runs/'+write,token=TOKEN)
 check('returned-operation-success-and-output',completed.get('state')=='completed' and completed.get('result',{}).get('stdout')=='command-ok',completed)
 file,_=call('post-cancel-file-readback','GET',WP+'/files/content?path=http-audit.txt',token=TOKEN);check('cancel-preserves-prior-completed-file',file.get('content')=='durable Ω')
 again,_=call('repeat-completed-admission','POST',WP+'/command-runs',{'operation_id':'http2979-write','args':['/bin/sh','-c','printf "durable Ω" > http-audit.txt; printf command-ok']},status=202,token=TOKEN);check('request-id-deduplicates-operation',again.get('operationId')==write,again)
 call('strict-command-invalid-json-refused','POST',WP+'/command-runs','{"operation_id":"invalid-no-effect","args":["/bin/sh","-c","touch must-not-exist"]} {}',status=400,token=TOKEN)
 call('strict-command-no-file-effect','GET',WP+'/files/content?path=must-not-exist',status=404,token=TOKEN)
 
 restart()
 state=json.loads((S/'session.json').read_text());WP=REPO+'/workspaces/'+state['workspace']
 call('post-restart-pat-identity','GET','/api/user',token=TOKEN)
 issue,_=call('post-restart-issue-readback','GET',REPO+'/issues/1',token=TOKEN);check('issue-persists-backend-and-pg-restart',issue.get('title')=='HTTP audit Ω 🧪' and issue.get('body')=='First line\nSecond line')
 stack,_=call('post-restart-stack-readback','GET',REPO+'/stacks/active',token=TOKEN);check('stack-persists-backend-and-pg-restart',stack.get('changes',[{}])[0].get('branch_name')=='audit-stack')
 write=next(x['response']['operationId'] for x in records if x['name']=='workspace-command-admission');long=next(x['response']['operationId'] for x in records if x['name']=='workspace-long-command-admission')
 completed,_=call('post-restart-completed-command','GET',WP+'/command-runs/'+write,token=TOKEN);check('completed-command-persists-restart',completed.get('state')=='completed' and completed.get('result',{}).get('stdout')=='command-ok')
 cancelled,_=call('post-restart-cancelled-command','GET',WP+'/command-runs/'+long,token=TOKEN);check('cancelled-command-persists-restart',cancelled.get('state')=='cancelled')
 file,_=call('post-restart-workspace-file','GET',WP+'/files/content?path=http-audit.txt',token=TOKEN);check('workspace-file-persists-restart',file.get('content')=='durable Ω',file)
 call('fresh-browser-login','POST','/api/auth/local/login',{'username':USER,'password':PASSWORD},browser=True)
 readpat,_=call('read-only-pat-create','POST','/api/auth/local/token',{'username':USER,'password':PASSWORD,'name':'http2979-readonly','scopes':['read:user','read:repository']});tokenids.append(readpat['token_id']);readtoken=readpat.get('token');private.append(readtoken or '')
 if readtoken:
  call('read-only-pat-can-read-issue','GET',REPO+'/issues/1',token=readtoken)
  call('read-only-pat-mutation-refused','POST',REPO+'/issues',{'title':'must not create read-only'},status=403,token=readtoken)
  issues,_=call('read-only-refusal-issue-readback','GET',REPO+'/issues?limit=100',token=TOKEN);check('read-only-refusal-no-durable-issue',len(issues)==2)
  call('read-only-token-revoke','DELETE','/api/user/tokens/'+str(readpat['token_id']),status=204,browser=True)
  tokenids.remove(readpat['token_id'])
  call('revoked-read-token-refused','GET','/api/user',status=401,token=readtoken)
 call('owned-workspace-cleanup','DELETE',WP,status=[200,202,204],token=TOKEN)
 call('owned-repository-cleanup','DELETE',REPO,status=[200,202,204],token=TOKEN)
 call('deleted-repository-unavailable','GET',REPO,status=404,token=TOKEN)
 call('owner-pat-revoke','DELETE','/api/user/tokens/'+str(pat['token_id']),status=204,browser=True)
 tokenids.remove(pat['token_id'])
 call('revoked-owner-pat-refused','GET','/api/user',status=401,token=TOKEN)
 # Redact secrets from newly generated response records as well.
 for record in records:record['response']=clean(record.get('response'))
 (R/'http-journeys.json').write_text(json.dumps(records,indent=2))
 
 rotated='HttpRotated-'+secrets.token_hex(20);private.append(rotated)
 call('public-owner-password-rotation','POST','/api/auth/local/password',{'current_password':PASSWORD,'new_password':rotated},browser=True)
 restart()
 call('old-password-refused-after-rotation','POST','/api/auth/local/login',{'username':USER,'password':PASSWORD},status=401)
 call('rotated-password-login','POST','/api/auth/local/login',{'username':USER,'password':rotated},browser=True)
 call('rotated-owner-final-logout','POST','/api/auth/logout',status=204,browser=True)
 call('rotated-session-final-refusal','GET','/api/user',status=401,browser=True)
 
 PASSWORD=rotated

finally:
 # Best effort public revocation runs even after an oracle fails. The owned
 # realm is then stopped and removed, including all sessions/credentials.
 if tokenids and backend is not None and backend.poll() is None:
  try:
   call('finally-cleanup-login','POST','/api/auth/local/login',{'username':USER,'password':PASSWORD},browser=True)
   for tokenid in tokenids:call('finally-revoke-owned-token','DELETE','/api/user/tokens/'+str(tokenid),status=[204,404],browser=True)
   call('finally-logout','POST','/api/auth/logout',status=204,browser=True)
  except Exception as error:print('Public cleanup failed:',type(error).__name__,flush=True)
 try:stop()
 finally:log.close();shutil.rmtree(S)
