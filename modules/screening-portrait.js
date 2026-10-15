import {escape as e,icon} from '../core.js';

const qidPattern=/^Q[1-9][0-9]{0,17}$/;
const photoNote='Photo belongs to the source candidate. It does not confirm the client’s identity.';
const responseLimit=3000000;
const list=value=>Array.isArray(value)?value:[];
const cleanText=value=>String(value||'').slice(0,4000).replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot|lt|gt|#39);/g,x=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&#39;':"'"}[x])).replace(/\s+/g,' ').trim().slice(0,600);

export function publicProfileURL(value){
  if(typeof value!=='string'||value.length>4096||/[\u0000-\u0020\\]/.test(value))return '';
  try{
    const url=new URL(value),host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.startsWith('[')||/^[\d.]+$/.test(host))return '';
    return url.href;
  }catch{return '';}
}
export function candidateInitials(name=''){
  const words=String(name).match(/[\p{L}\p{N}]+/gu)||[];
  return words.length?words.slice(0,2).map(w=>Array.from(w)[0]).join('').toLocaleUpperCase():'?';
}
export function wikipediaReference(value){
  const safe=publicProfileURL(value);if(!safe)return null;
  const url=new URL(safe);
  if(!/^[a-z][a-z0-9-]*\.wikipedia\.org$/.test(url.hostname)||!url.pathname.startsWith('/wiki/')||url.search)return null;
  let title;try{title=decodeURIComponent(url.pathname.slice(6)).replaceAll('_',' ').trim();}catch{return null;}
  if(!title||title.length>240||/[\u0000-\u001f\u007f|#]/.test(title)||title.includes(':'))return null;
  url.hash='';return {url:url.href,title,host:url.hostname};
}
export function chooseWikipediaReference(values){
  const refs=[...new Map(list(values).map(wikipediaReference).filter(Boolean).map(ref=>[ref.url,ref])).values()];
  const english=refs.filter(ref=>ref.host==='en.wikipedia.org');
  return english.length===1?english[0]:english.length===0&&refs.length===1?refs[0]:null;
}
export function candidateProfileLinks(candidate={}){
  const result=[],seen=new Set(),add=(url,label,kind)=>{const safe=publicProfileURL(url);if(safe&&!seen.has(safe)){seen.add(safe);result.push({url:safe,label,kind});}};
  add(candidate.url,'Open provider profile','provider');
  for(const id of list(candidate.wikidataIds))if(qidPattern.test(id))add(`https://www.wikidata.org/wiki/${id}`,'Wikidata record','wikidata');
  for(const url of list(candidate.wikipediaUrls)){const safe=publicProfileURL(url);if(safe&&/^[a-z][a-z0-9-]*\.wikipedia\.org$/.test(new URL(safe).hostname))add(safe,'Linked biography','biography');}
  for(const url of list(candidate.sourceUrls)){const safe=publicProfileURL(url);if(safe)add(safe,new URL(safe).hostname.replace(/^www\./,''),'publisher');}
  return result.slice(0,8);
}
export function candidatePortrait(candidate={}){
  const ids=[...new Set(list(candidate.wikidataIds).filter(v=>typeof v==='string'&&qidPattern.test(v)))];
  // A provider must explicitly supply the identifier. Never infer a Q-ID from a name or record URL.
  const person=candidate.schema==='Person';
  return {status:person&&ids.length===1?'available_to_check':'not_supplied',initials:candidateInitials(candidate.name),wikidataId:person&&ids.length===1?ids[0]:null,wikipediaUrl:chooseWikipediaReference(candidate.wikipediaUrls)?.url||null,note:photoNote};
}
export function renderCandidatePortrait(source={}){
  const portrait=source.portrait||candidatePortrait(source),name=source.title||source.name||'Source candidate';
  const available=portrait.status==='available_to_check'&&qidPattern.test(portrait.wikidataId||'');
  const links=(source.profileLinks||candidateProfileLinks(source)).map(link=>({...link,url:publicProfileURL(link.url)})).filter(link=>link.url).slice(0,8);
  return `<section class="sc-candidate-media" aria-label="Source candidate photo"><div class="sc-candidate-media-top"><span class="sc-candidate-initials" aria-label="Initials for ${e(name)}">${e(candidateInitials(name))}</span><div class="sc-candidate-media-controls"><strong>Source candidate</strong>${available?'<button type="button" data-candidate-photo>Load source photo</button>':'<span class="sc-candidate-photo-status">Photo not supplied</span>'}${links[0]?`<a href="${e(links[0].url)}" target="_blank" rel="noopener noreferrer">${e(links[0].label)} ${icon('external',12)}</a>`:''}</div></div><div data-candidate-photo-result aria-live="polite"></div>${available?'<p class="sc-candidate-photo-hint">Loads from linked Wikidata / Wikipedia and Wikimedia Commons on request.</p>':''}${links.length>1?`<details class="sc-candidate-profile-links"><summary>Linked source profiles (${links.length-1})</summary>${links.slice(1).map(link=>`<a href="${e(link.url)}" target="_blank" rel="noopener noreferrer">${e(link.label)} ${icon('external',12)}</a>`).join('')}<p>References supplied for this candidate; they do not establish a match to the client.</p></details>`:''}</section>`;
}
async function publicJSON(url,fetcher,signal){
  if(signal?.aborted)throw signal.reason||new DOMException('Photo request stopped.','AbortError');
  const response=await fetcher(url,{signal,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('The photo source is unavailable. Open the source profile instead.');
  if(Number(response.headers?.get?.('content-length'))>responseLimit)throw Error('The photo response was too large. Open the source profile instead.');
  const raw=await response.text();
  if(signal?.aborted)throw signal.reason||new DOMException('Photo request stopped.','AbortError');
  if(raw.length>responseLimit)throw Error('The photo response was too large. Open the source profile instead.');
  let data;try{data=JSON.parse(raw);}catch{throw Error('The photo source could not be read. Open the source profile instead.');}
  if(data.error){const error=Error(data.error.code==='maxlag'?'Wikimedia is temporarily busy. Try the photo again later or open the source profile.':'The photo source could not complete the request. Open the source profile instead.');error.code=data.error.code==='maxlag'?'maxlag':'source_error';throw error;}
  return data;
}
export function wikidataPhotoFile(data,qid){
  const entity=data?.entities?.[qid];
  if(entity?.id!==qid||entity.missing!==undefined)throw Error('No photo record was found for this source identifier.');
  const claims=list(entity.claims?.P18).filter(claim=>claim.rank!=='deprecated'&&claim.mainsnak?.snaktype==='value'&&claim.mainsnak?.datatype==='commonsMedia');
  const chosen=claims.find(claim=>claim.rank==='preferred')||claims[0],file=chosen?.mainsnak?.datavalue?.value;
  if(typeof file!=='string'||file.length>240||/[\u0000-\u001f\u007f|]/.test(file)||!file.trim())throw Error('No source photo is available for this candidate.');
  return file;
}
export function commonsPhotoInfo(data,qid,file){
  const pages=Object.values(data?.query?.pages||{}),page=pages.find(item=>item.ns===6&&item.missing===undefined),info=page?.imageinfo?.[0];
  const url=publicProfileURL(info?.thumburl||''),sourceUrl=publicProfileURL(info?.descriptionurl||'');
  const mime=info?.thumbmime||info?.mime;
  if(!url||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(url).hostname)||!new URL(url).pathname.startsWith('/wikipedia/commons/')||!['image/jpeg','image/png','image/webp','image/gif'].includes(mime))throw Error('A supported source photo was not supplied. Open the source profile instead.');
  if(!sourceUrl||new URL(sourceUrl).hostname!=='commons.wikimedia.org'||!new URL(sourceUrl).pathname.startsWith('/wiki/File:'))throw Error('The photo attribution could not be verified. Open the source profile instead.');
  const metadata=info.extmetadata||{},artist=cleanText(metadata.Artist?.value),license=cleanText(metadata.LicenseShortName?.value),licenseURL=publicProfileURL(metadata.LicenseUrl?.value||'');
  if(!artist||!license)throw Error('Photo credit or licence is missing. Open the source profile instead.');
  return {url,sourceUrl,wikidataUrl:`https://www.wikidata.org/wiki/${qid}`,artist,license,licenseURL,file,checkedAt:new Date().toISOString(),note:photoNote};
}
export function wikipediaPhotoFile(data,qid){
  const pages=Object.values(data?.query?.pages||{});
  if(pages.length!==1||pages[0].ns!==0||pages[0].missing!==undefined||pages[0].pageprops?.disambiguation!==undefined||pages[0].pageprops?.wikibase_item!==qid)throw Error('The linked biography does not corroborate this source identifier. Open the source profile instead.');
  const file=pages[0].pageimage;
  if(typeof file!=='string'||file.length>240||/[\u0000-\u001f\u007f|]/.test(file)||!file.trim())throw Error('No source photo is available from the linked biography.');
  return file;
}
export async function loadCandidatePortrait(qid,{fetcher=globalThis.fetch,signal,wikipediaUrl}={}){
  if(!qidPattern.test(qid||''))throw Error('No source identifier was supplied for a photo.');
  const entityURL=new URL('https://www.wikidata.org/w/api.php');
  entityURL.search=new URLSearchParams({action:'wbgetentities',ids:qid,props:'claims',format:'json',origin:'*',maxlag:'5'}).toString();
  let file,recordUrl=`https://www.wikidata.org/wiki/${qid}`,recordLabel='Linked Wikidata record',method='wikidata_p18';
  try{const entity=await publicJSON(entityURL.href,fetcher,signal);file=wikidataPhotoFile(entity,qid);}
  catch(error){
    const biography=wikipediaReference(wikipediaUrl);
    // One exact, already-supplied alternative. Do not retry, search by name, or bypass access failures.
    if(error.code!=='maxlag'||!biography||signal?.aborted)throw error;
    const articleURL=new URL(`https://${biography.host}/w/api.php`);
    articleURL.search=new URLSearchParams({action:'query',titles:biography.title,prop:'pageimages|pageprops',piprop:'name',pilicense:'free',ppprop:'wikibase_item|disambiguation',redirects:'1',format:'json',origin:'*',maxlag:'5'}).toString();
    const article=await publicJSON(articleURL.href,fetcher,signal);file=wikipediaPhotoFile(article,qid);
    recordUrl=biography.url;recordLabel='Provider-linked Wikipedia biography';method='wikipedia_pageimage';
  }
  const commonsURL=new URL('https://commons.wikimedia.org/w/api.php');
  commonsURL.search=new URLSearchParams({action:'query',titles:`File:${file}`,prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'240',iiextmetadatalanguage:'en',format:'json',origin:'*',maxlag:'5'}).toString();
  const commons=await publicJSON(commonsURL.href,fetcher,signal);
  return {...commonsPhotoInfo(commons,qid,file),recordUrl,recordLabel,method};
}
export function mountCandidatePortrait(container,source,options={}){
  if(!container)return()=>{};
  const {onPhotoLoaded,...loadOptions}=options;
  let active=true,controller=null,timer=null;
  const portrait=source.portrait||candidatePortrait(source);
  container.innerHTML=renderCandidatePortrait(source);
  const button=container.querySelector('[data-candidate-photo]'),output=container.querySelector('[data-candidate-photo-result]');
  if(button)button.onclick=async()=>{
    button.disabled=true;button.textContent='Loading source photo…';controller=new AbortController();timer=setTimeout(()=>controller.abort(),15000);
    try{
      const wikipediaUrl=portrait.wikipediaUrl||chooseWikipediaReference(list(source.profileLinks).filter(link=>link.kind==='biography').map(link=>link.url))?.url;
      const photo=await loadCandidatePortrait(portrait.wikidataId,{...loadOptions,wikipediaUrl,signal:controller.signal});
      if(!active)return;
      output.innerHTML=`<figure class="sc-candidate-photo"><img src="${e(photo.url)}" alt="Source candidate photo: ${e(source.title||source.name||'candidate')}" referrerpolicy="no-referrer" crossorigin="anonymous" decoding="async"><figcaption><strong>Source candidate photo</strong><span>${e(photo.note)}</span><details><summary>Photo source &amp; credit</summary><p>${e(photo.artist)} · ${photo.licenseURL?`<a href="${e(photo.licenseURL)}" target="_blank" rel="noopener noreferrer">${e(photo.license)}</a>`:e(photo.license)}</p><a href="${e(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons file</a> · <a href="${e(photo.recordUrl)}" target="_blank" rel="noopener noreferrer">${e(photo.recordLabel)}</a></details></figcaption></figure>`;
      const image=output.querySelector('img');let notified=false;
      const loaded=()=>{if(active&&!notified){notified=true;onPhotoLoaded?.(photo);}};
      image.onload=loaded;
      image.onerror=()=>{if(active){output.innerHTML='<p class="sc-candidate-photo-error">The source photo could not be displayed. Open the source profile instead.</p>';button.hidden=false;button.disabled=false;button.textContent='Retry source photo';}};
      button.hidden=true;
      if(image.complete&&image.naturalWidth>0)loaded();
    }catch(error){if(active){output.innerHTML=`<p class="sc-candidate-photo-error">${e(error.name==='AbortError'?'The photo request timed out. Open the source profile instead.':error.message)}</p>`;button.disabled=false;button.textContent='Retry source photo';}}
    finally{clearTimeout(timer);}
  };
  return()=>{active=false;clearTimeout(timer);controller?.abort();};
}
