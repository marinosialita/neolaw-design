// A minimal structural DOM double. It cannot verify layout, browser semantics or geometry.
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const voids=new Set(['input','br','hr','img','meta','link']);
export class Element {
 constructor(tag='div',attrs={}){this.tagName=tag;this.attrs={...attrs};this.children=[];this.parentElement=null;this.listeners={};this.scrollTop=0;this.style={};this.inert=false;this._text='';}
 append(node){node.parentElement=this;this.children.push(node)}
 insertAdjacentHTML(_position,html){const fragment=new Element();fragment.innerHTML=html;for(const child of [...fragment.children])this.append(child)}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null}
 get className(){return this.attrs.class||''}set className(value){this.attrs.class=value}
 get isConnected(){let node=this;while(node){if(node===globalThis.document?.body)return true;node=node.parentElement}return false}get scrollHeight(){return 1000}get innerText(){return this.textContent}
 set innerHTML(html){for(const child of this.children)child.parentElement=null;this.children=[];this._text='';const stack=[this];for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){if(stack.length>1)stack.pop();continue}if(token.startsWith('<')){const match=token.match(/^<([\w-]+)/);if(!match)continue;const attrs={};const raw=token.slice(match[0].length).replace(/\/?\s*>$/,'');for(const a of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');const el=new Element(match[1],attrs);stack.at(-1).append(el);if(!voids.has(match[1])&&!token.endsWith('/>'))stack.push(el)}else stack.at(-1)._text+=decode(token)}}
 get innerHTML(){return this.children.map(c=>c.outerHTML).join('')+this._text}
 get outerHTML(){return `<${this.tagName} ${Object.entries(this.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${this.innerHTML}</${this.tagName}>`}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 set textContent(s){for(const child of this.children)child.parentElement=null;this.children=[];this._text=String(s)}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]))}
 get id(){return this.attrs.id||''}get classList(){const self=this;return{add(...a){const s=new Set((self.attrs.class||'').split(/\s+/).filter(Boolean));a.forEach(x=>s.add(x));self.attrs.class=[...s].join(' ')},remove(...a){self.attrs.class=(self.attrs.class||'').split(/\s+/).filter(x=>!a.includes(x)).join(' ')},contains(x){return(self.attrs.class||'').split(/\s+/).includes(x)},toggle(x,force){const on=force??!this.contains(x);on?this.add(x):this.remove(x);return on}}}
 get hidden(){return' hidden ' in this.attrs||Object.hasOwn(this.attrs,'hidden')}set hidden(v){v?this.attrs.hidden='':delete this.attrs.hidden}
 get disabled(){return Object.hasOwn(this.attrs,'disabled')}set disabled(v){v?this.attrs.disabled='':delete this.attrs.disabled}
 get checked(){return Object.hasOwn(this.attrs,'checked')}set checked(v){v?this.attrs.checked='':delete this.attrs.checked}
 get value(){return this._value??this.attrs.value??(this.tagName==='select'?(this.querySelector('option[selected]')||this.querySelector('option'))?.attrs.value:'')??''}set value(v){this._value=v}
 get nextElementSibling(){const list=this.parentElement?.children||[];return list[list.indexOf(this)+1]}
 setAttribute(k,v){this.attrs[k]=String(v)}removeAttribute(k){delete this.attrs[k]}
 matches(selector){return selector.split(',').some(part=>{let s=part.trim();if(s.includes(':not(:disabled)')){if(this.disabled)return false;s=s.replace(':not(:disabled)','')}const tag=s.match(/^[\w-]+/);if(tag&&this.tagName!==tag[0])return false;for(const m of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(m[1]))return false;const id=s.match(/#([\w-]+)/);if(id&&this.id!==id[1])return false;for(const m of s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)){if(!Object.hasOwn(this.attrs,m[1]))return false;if(m[2]!==undefined&&this.attrs[m[1]]!==m[2])return false}return true})}
 querySelectorAll(selector){const found=[];const parts=selector.trim().split(/\s+(?![^\[]*\])/);const walk=n=>{for(const c of n.children){if(c.matches(parts.at(-1))){let okay=true,ancestor=c.parentElement;for(let i=parts.length-2;i>=0;i--){while(ancestor&&!ancestor.matches(parts[i]))ancestor=ancestor.parentElement;if(!ancestor){okay=false;break}ancestor=ancestor.parentElement}if(okay)found.push(c)}walk(c)}};walk(this);return found}
 querySelector(s){return this.querySelectorAll(s)[0]||null}closest(s){let n=this;while(n){if(n.matches(s))return n;n=n.parentElement}return null}contains(n){while(n){if(n===this)return true;n=n.parentElement}return false}
 addEventListener(t,fn){(this.listeners[t]??=[]).push(fn)}removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]||[]).filter(f=>f!==fn)}
 emit(type,extra={}){const event={type,target:this,preventDefault(){this.defaultPrevented=true},...extra};let n=this;while(n){n['on'+type]?.(event);for(const fn of n.listeners[type]||[])fn(event);n=n.parentElement}return event}click(){this.emit('click')}focus(){document.activeElement=this}scrollIntoView(){this.scrolled=true}getClientRects(){return this.hidden?[]:[{}]}
}
