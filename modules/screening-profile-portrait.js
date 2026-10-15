import {escape as e} from '../core.js';
import {explainMatch} from './screening-match.js';
import {providerSource} from './screening-provider.js';
import {providerRecordId} from './screening-review.js';
import {loadCandidatePortrait} from './screening-portrait.js';

// This chooses a candidate illustration, never a verified client identity.
// Do not prefer the candidate with a photograph when the name is ambiguous.
export function overviewPortraitSource(report={}){
  const result=report.research?.opensanctions,query=report.query||{};
  if(result?.status!=='completed'||result.atLimit||query.type==='entity')return null;
  // Loading a specific source photo explicitly chooses an illustration. A name
  // variation is allowed here, but conflicting identifiers and dismissals are not.
  if(report.overviewPortraitCandidateId){
    const chosen=(result.candidates||[]).filter(candidate=>providerRecordId(candidate)===report.overviewPortraitCandidateId);
    if(chosen.length!==1||chosen[0].schema!=='Person'||report.decisions?.[report.overviewPortraitCandidateId]?.status==='dismissed')return null;
    const source=providerSource(chosen[0],result,query),comparison=explainMatch(source.match,query);
    return source.portrait?.status==='available_to_check'&&!comparison.conflicts?source:null;
  }
  const candidates=(result.candidates||[]).filter(candidate=>{
    if(candidate.schema!=='Person'||report.decisions?.[providerRecordId(candidate)]?.status==='dismissed')return false;
    const source=providerSource(candidate,result,query),comparison=explainMatch(source.match,query);
    const exactName=comparison.comparisons.find(field=>field.label==='Name')?.status==='match';
    // A sole above-threshold provider candidate may have a spelling variant.
    // Illustrate that record, not an assumed identity; never choose by photo
    // availability or silently pick among several fuzzy name candidates.
    const solePossibleMatch=result.candidates.length===1&&candidate.possibleMatch===true;
    return (exactName||solePossibleMatch)&&!comparison.conflicts;
  });
  if(candidates.length!==1)return null;
  const source=providerSource(candidates[0],result,query);
  return source.portrait?.status==='available_to_check'?source:null;
}

// Page-memory cache only. Polling replaces the header but must not repeat the
// same public metadata requests. No client identifiers or images are persisted.
const photos=new Map();
const photoKey=source=>JSON.stringify([source.portrait.wikidataId,source.portrait.wikipediaUrl]);
export function selectOverviewPortrait(report,candidateId,photo){
  if(typeof candidateId!=='string'||!candidateId)return null;
  const next={...report,overviewPortraitCandidateId:candidateId},source=overviewPortraitSource(next);
  if(!source||photo?.wikidataUrl!==`https://www.wikidata.org/wiki/${source.portrait.wikidataId}`)return null;
  // Reuse the successful panel request. Persist only the chosen record ID, never
  // public image bytes or a second identity decision in screening history.
  photos.set(photoKey(source),Promise.resolve(photo));
  if(photos.size>60)photos.delete(photos.keys().next().value);
  return next;
}
function requestPhoto(source){
  const {wikidataId,wikipediaUrl}=source.portrait,key=photoKey(source);
  if(!photos.has(key)){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const promise=loadCandidatePortrait(wikidataId,{wikipediaUrl,signal:controller.signal}).catch(()=>{photos.delete(key);return null;}).finally(()=>clearTimeout(timer));
    photos.set(key,promise);
    if(photos.size>60)photos.delete(photos.keys().next().value);
  }
  return photos.get(key);
}

// Export the same candidate and cached photo as the overview. Image bytes are
// transient: only the local PDF renderer receives them, never a research API.
export async function reportPortrait(report,{resolvePhoto=requestPhoto,encode=portraitDataURL}={}){
  const source=overviewPortraitSource(report);
  if(!source)return null;
  try{
    const photo=await resolvePhoto(source);
    if(!photo)throw new Error('No photograph');
    const imageData=await encode(photo.url);
    return {...photo,status:'available',candidateId:source.match.record.id,candidateName:source.title,wikidataId:source.portrait.wikidataId,imageData};
  }catch{return {status:'unavailable',note:'Source candidate photo could not be included in this export.'};}
}

export async function portraitDataURL(url){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(parsed.hostname)||!parsed.pathname.startsWith('/wikipedia/commons/'))throw new Error('Unsupported photo source');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  let bitmap;
  try{
    const response=await fetch(parsed.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    if(!response.ok||!/^image\/(jpeg|png|webp|gif)(;|$)/i.test(response.headers.get('content-type')||''))throw new Error('Photo unavailable');
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000){await reader.cancel();throw new Error('Photo too large');}chunks.push(value);}
    bitmap=await createImageBitmap(new Blob(chunks,{type:response.headers.get('content-type')}));
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>12_000_000)throw new Error('Photo dimensions unsupported');
    const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.9);
  }finally{clearTimeout(timer);bitmap?.close();}
}
export function mountOverviewPortrait(container,report,{resolvePhoto=requestPhoto}={}){
  if(!container)return()=>{};
  let active=true;
  const fallback=container.innerHTML,source=overviewPortraitSource(report);
  if(!source)return()=>{};
  const fallbackLabel=container.getAttribute('aria-label');
  Promise.resolve().then(()=>resolvePhoto(source)).then(photo=>{
    if(!active||!photo)return;
    const credit=`Source candidate: ${source.title}. ${photo.artist} · ${photo.license}. Identity not verified. Open photo source and credit.`;
    container.setAttribute('aria-label','Source candidate photo; identity not verified');
    container.innerHTML=`<a class="sc-profile-photo" href="${e(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="${e(credit)}" aria-label="${e(credit)}"><img src="${e(photo.url)}" alt="Source candidate: ${e(source.title)}" referrerpolicy="no-referrer" crossorigin="anonymous" decoding="async"><span>Candidate photo</span></a>`;
    container.querySelector('img').onerror=()=>{if(active){container.innerHTML=fallback;container.setAttribute('aria-label',fallbackLabel||'Initials only; no verified portrait');}};
  }).catch(()=>{});
  return()=>{active=false;};
}
