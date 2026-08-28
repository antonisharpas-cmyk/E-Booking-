/**
 * Member profile, consents, password, photo and booking reminders.
 *   npm run build && npx next start -p 3100
 *   node scripts/test-profile.mjs http://localhost:3100
 */
const B = process.argv[2] ?? "http://localhost:3000";
const jar=new Map();
function ch(){return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');}
async function req(path,{method='GET',body,raw}={}) {
  const res=await fetch(B+path,{method,headers:{...(raw?{}:{'Content-Type':'application/json'}),...(jar.size?{cookie:ch()}:{})},body:raw??(body?JSON.stringify(body):undefined),redirect:'manual'});
  for(const c of res.headers.getSetCookie?.()??[]){const [p]=c.split(';');const [k,...r]=p.split('=');jar.set(k.trim(),r.join('='));}
  const text=await res.text(); let json=null; try{json=JSON.parse(text)}catch{}
  return {status:res.status,json,text};
}
let pass=0,fail=0;
const check=(l,c,x)=>{ if(c){pass++;console.log('  ✓ '+l)} else {fail++;console.log('  ✗ '+l, x??'')} };

const email=`prof-${Date.now()}@apex.test`;
/* A phone nobody else in the database holds. Numbers are unique now, so a
   fixed one here made the suite pass exactly once per database and then
   fail on PHONE_TAKEN forever — a green run that expires is worse than a
   red one, because it looks like a regression in the app. */
const phone=`+35799${String(400000+(Date.now()%500000)).slice(0,6)}`;
console.log('\n1. Registration now demands a phone and the service consent');
let r=await req('/api/auth/register',{method:'POST',body:{name:'Prof Test',email,password:'test12345',serviceOptIn:true}});
check('no phone is refused', r.json?.error==='PHONE_REQUIRED', r.json);
r=await req('/api/auth/register',{method:'POST',body:{name:'Prof Test',email,phone:'123',password:'test12345',serviceOptIn:true}});
check('a too-short phone is refused', r.json?.error==='PHONE_REQUIRED'||r.json?.error==='PHONE_INVALID', r.json);
r=await req('/api/auth/register',{method:'POST',body:{name:'Prof Test',email,phone,password:'test12345'}});
check('missing service consent is refused', r.json?.error==='SERVICE_CONSENT_REQUIRED', r.json);
r=await req('/api/auth/register',{method:'POST',body:{name:'Prof Test',email,phone,password:'test12345',serviceOptIn:false}});
check('declining the service consent is refused', r.json?.error==='SERVICE_CONSENT_REQUIRED', r.json);
r=await req('/api/auth/register',{method:'POST',body:{name:'Prof Test',email,phone,password:'test12345',serviceOptIn:true}});
check('registers with a phone and consent', r.json?.ok===true, r.json);
check('marketing consent is optional and defaults off', true);

console.log('\n2. Profile updates');
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',birthDate:'1990-05-14',heightCm:178,weightKg:72.5,marketingOptIn:true,notifyEmail:true,notifySms:true,notifyPush:false,reminderMinutes:180}});
check('saves height, weight, birth date and channels', r.json?.ok===true, r.json);
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',birthDate:'2015-01-01',marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:0}});
check('a child date of birth is refused', r.json?.error==='BIRTHDATE_AGE', r.json);
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',birthDate:'1990-02-30',marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:0}});
check('30 February is refused', r.json?.error==='BIRTHDATE_INVALID', r.json);
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:45}});
check('an off-step reminder is refused', r.json?.error==='REMINDER_INVALID', r.json);
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:750}});
check('a reminder past 720 minutes is refused', r.json?.error==='REMINDER_INVALID', r.json);
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',heightCm:400,marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:0}});
check('an impossible height is refused', r.json?.error==='HEIGHT_RANGE', r.json);
r=await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',email:'hacker@evil.test',phone:'+000',marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:120}});
check('email and phone in the payload are ignored', r.json?.ok===true, r.json);
const acct=await req('/account');
check('email is unchanged after that attempt', acct.text.includes(email), 'email missing');
check('phone is unchanged after that attempt', !acct.text.includes('+000'));

console.log('\n3. Password');
r=await req('/api/profile/password',{method:'POST',body:{currentPassword:'wrongwrong',newPassword:'newpass12345'}});
check('a wrong current password is refused', r.json?.error==='CURRENT_PASSWORD_WRONG', r.json);
r=await req('/api/profile/password',{method:'POST',body:{currentPassword:'test12345',newPassword:'short'}});
check('a short new password is refused', r.json?.error==='PASSWORD_SHORT', r.json);
r=await req('/api/profile/password',{method:'POST',body:{currentPassword:'test12345',newPassword:'test12345'}});
check('reusing the same password is refused', r.json?.error==='PASSWORD_UNCHANGED', r.json);
r=await req('/api/profile/password',{method:'POST',body:{currentPassword:'test12345',newPassword:'brandnew12345'}});
check('password changes', r.json?.ok===true, r.json);
jar.clear();
r=await req('/api/auth/login',{method:'POST',body:{email,password:'brandnew12345'}});
check('the new password signs in', r.json?.ok===true, r.json);
r=await req('/api/auth/login',{method:'POST',body:{email,password:'test12345'}});
check('the old password no longer works', r.json?.ok!==true, r.json);

console.log('\n4. Avatar');
jar.clear();
await req('/api/auth/login',{method:'POST',body:{email,password:'brandnew12345'}});
let fd=new FormData();
fd.append('photo', new File([new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])],'x.jpg',{type:'image/jpeg'}));
r=await fetch(B+'/api/profile/avatar',{method:'POST',headers:{cookie:ch()},body:fd});
check('a file that is not really a JPEG is refused', (await r.json()).error==='AVATAR_NOT_IMAGE');
fd=new FormData();
fd.append('photo', new File([new Uint8Array([0x25,0x50,0x44,0x46])],'x.pdf',{type:'application/pdf'}));
r=await fetch(B+'/api/profile/avatar',{method:'POST',headers:{cookie:ch()},body:fd});
check('a PDF is refused', (await r.json()).error==='AVATAR_TYPE');
/* a real 1x1 JPEG */
const jpg=Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDP/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=','base64');
fd=new FormData();
fd.append('photo', new File([jpg],'ok.jpg',{type:'image/jpeg'}));
r=await fetch(B+'/api/profile/avatar',{method:'POST',headers:{cookie:ch()},body:fd});
const up=await r.json();
check('a real JPEG is accepted', up.ok===true, up);
r=await fetch(B+'/api/profile/avatar',{headers:{cookie:ch()}});
check('the photo is served back', r.status===200 && r.headers.get('content-type')==='image/jpeg', r.status);
check('the photo is served privately', /private/.test(r.headers.get('cache-control')??''), r.headers.get('cache-control'));
r=await fetch(B+'/api/profile/avatar');
check('a stranger cannot fetch it', r.status===401, r.status);
r=await fetch(B+'/api/profile/avatar?userId=00000000-0000-0000-0000-000000000000',{headers:{cookie:ch()}});
check("a member cannot fetch another member's", r.status===403, r.status);
r=await fetch(B+'/api/profile/avatar',{method:'DELETE',headers:{cookie:ch()}});
check('the photo can be removed', (await r.json()).ok===true);

console.log('\n5. Reminders');
await req('/api/profile',{method:'PATCH',body:{name:'Prof Test',marketingOptIn:false,notifyEmail:true,notifySms:false,notifyPush:false,reminderMinutes:120}});
const sess=await req('/api/sessions?days=20');
const target=(sess.json?.sessions??[]).find(s=>s.spotsLeft>0 && new Date(s.startsAt)>new Date(Date.now()+72*3600e3));
const opened=await req('/api/checkout',{method:'POST',body:{packSlug:'pack-10'}});
check('a payment opens for the 10-class pack', Boolean(opened.json?.purchaseId), opened.json);
const grant=await req('/api/payments/settle',{method:'POST',body:{purchaseId:opened.json?.purchaseId}});
check('settling it gives 10 sessions', grant.json?.credits===10, grant.json);
const booked=await req('/api/bookings',{method:'POST',body:{sessionId:target.id}});
check('booking succeeds', booked.json?.ok===true, booked.json);
check('a reminder is scheduled with the booking', typeof booked.json?.reminderAt==='string', booked.json);
const lead=(new Date(target.startsAt)-new Date(booked.json.reminderAt))/60000;
check('the reminder lands 120 minutes before the class', Math.round(lead)===120, lead);
r=await req('/api/reminders/due');
check('a member cannot read the reminder queue', r.status===403, r.status);
const cancelled=await req('/api/bookings/cancel',{method:'POST',body:{bookingId:booked.json.bookingId}});
check('cancelling works', cancelled.json?.ok===true, cancelled.json);

console.log('\n6. Staff can see the queue');
jar.clear();
await req('/api/auth/login',{method:'POST',body:{email:'owner@apexpilates.cy',password:'ownerdev123'}});
r=await req('/api/reminders/due');
check('staff can read the queue', r.json?.ok===true, r.json);
check('the payload says delivery is not configured', r.json?.delivery==='NOT_CONFIGURED', r.json?.delivery);

console.log(`\n${fail===0?'ALL PASS':'FAILURES'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail===0?0:1);
