import fs from 'node:fs';
let source=fs.readFileSync('app/workspace.tsx','utf8');
function one(a,b){if(!source.includes(a))throw Error('Missing UI match: '+a.slice(0,80));source=source.replace(a,()=>b);}
one('target.live=toDoc(target,next);target.publishedAt=', 'target.live=toDoc(target,next);target.publicEnabled=!localPreview;target.publishedAt=');
one('p.live=toDoc(p,next);p.publishedAt=', 'p.live=toDoc(p,next);p.publicEnabled=!localPreview;p.publishedAt=');
one("setNotice('Published revision saved. This preview remains owner-private.')", "setNotice(localPreview?'Demo revision saved locally.':'Public card published. Your dashboard remains protected.')");
one('This version is owner-private. Publishing here makes a saved revision available in the private profile preview; it does not enable public customer access.', "{localPreview?'This local demo saves a revision without putting it online.':'Publishing makes the contact details, images and blocks shown in this card available to anyone with its URL. Dashboard records, drafts and billing information stay private.'}");
one('Group brand defaults apply. All destinations remain owner-private.', "{localPreview?'This is a local demo only.':'Group brand defaults apply. This publishes the displayed card data for every active member to public URLs.'}");
source=source.replace(/Private test link[^\"]*customer fulfilment\./, 'Only profiles explicitly published online can be reached through this link.');
source=source.replace(/Private build[^']*NFC destinations currently require your sign-in\./, 'Owner dashboard - only explicitly published card revisions are public.');
one('This build is private. Use these links to test assignments while signed in. Public client access and your permanent domain must be configured before encoding customer cards.', 'Publish a profile, assign its NFC card and save the workspace. Then test the URL and QR code on a signed-out phone. Choose a permanent domain before encoding customer cards.');
source=source.replace(/Owner-private[^']*ChatGPT sign-in/,'Owner only - ChatGPT sign-in');
source=source.replaceAll('CARD STUDIO V0.2','CARD STUDIO V0.3').replaceAll('BUILD V0.2','BUILD V0.3');
source=source.replaceAll("p.live?'Published':'Draft'", "p.live?(localPreview?'Demo revision':p.publicEnabled?'Public':'Private revision'):'Draft'");
source=source.replaceAll("p.live?'Published + draft':'Draft'", "p.live?(localPreview?'Demo revision':p.publicEnabled?'Public + draft':'Private revision'):'Draft'");
one('published=active.filter(p=>p.live)', 'published=active.filter(p=>p.live&&(localPreview||p.publicEnabled))');
one('<button className="secondary full" onClick={()=>setConfirmArchive(true)}>', '<div className="info-note"><p>{localPreview?\'Local demo only.\':p.publicEnabled?\'Public card enabled. Save draft keeps the current public revision unchanged.\':\'Private revision. Publish explicitly to enable its public link.\'}</p></div>{p.publicEnabled&&<button className="secondary full" onClick={()=>commit({...p,publicEnabled:false})}>Unpublish link on next save</button>}<button className="secondary full" onClick={()=>setConfirmArchive(true)}>');
one('{preview.live&&<a className="secondary full"', '{preview.live&&(localPreview||preview.publicEnabled)&&<a className="secondary full"');
one('Published revision opens separately.', 'Public revision opens separately when enabled.');
// A file imported from the demo must never become public as a side effect of restoring a backup.
one('restoreRef.current=validated;', 'restoreRef.current={...validated,profiles:validated.profiles.map(p=>({...p,publicEnabled:false}))};');
one('Restored data is not saved until you choose Save workspace.', 'Restored data is not saved until you choose Save workspace. Public links from the backup are disabled; explicitly republish the profiles you want to share.');
fs.writeFileSync('app/workspace.tsx',source);
let entry=fs.readFileSync('app/entry.tsx','utf8');
entry=entry.replace("offline?'Local browser demo':'Private workspace preview'", "offline?'Local browser demo':'Published digital card'");
entry=entry.replace('href={offline?location.pathname:\'/\'}', 'href={offline?location.pathname:\'/\'}');
entry=entry.replace(/<a className="back-studio"[\s\S]*?<\/a>/, `{offline&&<a className="back-studio" href={location.pathname}>Back to your studio</a>}`);
fs.writeFileSync('app/entry.tsx',entry);
console.log('Hosted publication controls and import privacy updated.');
