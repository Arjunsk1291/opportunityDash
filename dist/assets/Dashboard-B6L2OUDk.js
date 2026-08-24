var wt=t=>{throw TypeError(t)};var ze=(t,s,a)=>s.has(t)||wt("Cannot "+a);var u=(t,s,a)=>(ze(t,s,"read from private field"),a?a.call(t):s.get(t)),U=(t,s,a)=>s.has(t)?wt("Cannot add the same private member more than once"):s instanceof WeakSet?s.add(t):s.set(t,a),L=(t,s,a,n)=>(ze(t,s,"write to private field"),n?n.call(t,a):s.set(t,a),a),V=(t,s,a)=>(ze(t,s,"access private method"),a);import{j as e}from"./vendor-mui-CT6Q18nW.js";import{r as f,b as Nt}from"./vendor-charts-CHTCYRNf.js";import{c as Bt,S as Ms,p as jt,r as ee,s as Ye,a as Re,n as Xe,i as Je,b as Rt,t as Ps,f as Fs,d as Vs,e as St,g as Wt,h as _s,u as Kt,j as Dt,C as Se,B as De,k as zt,l as Us,m as Gt,o as Bs,q as Ht,v as Ze,w as Ws,x as Qt,y as ct,P as Ue,z as et,A as Ks,D as zs,E as Gs,F as qt,G as Hs,H as Qs,R as qs,I as Ys,J as Yt,K as Xs,L as dt,M as fe,N as Ct,O as ut,Q as mt,T as ht,U as pt,V as Xt,W as Js,X as Zs,Y as ea,Z as ta,_ as sa,$ as aa,a0 as na,a1 as ra,a2 as Ne,a3 as ia,a4 as oa,a5 as Ge}from"./index-BiplDhEv.js";import{u as la,A as ca}from"./ActionProgressBar-D3E-r_n3.js";import{C as ke,a as $e,b as Oe,c as Le}from"./card-Bs7rb-wM.js";import{T as Jt,d as Et,a as Pe,b as da,C as ua,c as ma,A as ha,O as pa,e as xa,f as ga}from"./OpportunityDetailDialog-B1u6RRVx.js";import{T as fa}from"./triangle-alert-Wh3JFsjD.js";import{P as Zt}from"./progress-BYjpzHMQ.js";import{T as va,a as ba,b as At}from"./tabs-CLz8BE98.js";import{E as ya}from"./ExportButton-DlDY8z32.js";import{c as wa,a as es,g as ts,b as Na}from"./opportunityData-CbLtlV61.js";import{g as P,n as M}from"./opportunityStatus-BAr3wSWw.js";import{T as ss,a as as,b as Ce,c as re,d as ns,e as se}from"./table-CpyeG8q6.js";import{T as Fe}from"./target-CXJYlfkg.js";import{C as ja}from"./circle-x-DOPkrnn_.js";import{S as Tt}from"./send-DYAeWz2-.js";import{R as Ra}from"./refresh-cw-m-tdBkWa.js";import{I as He}from"./info-C37CfMGs.js";import"./vendor-exceljs-w88fy-c4.js";import"./vendor-react-bJ5OgUEW.js";import"./pagination-CJrya_eq.js";import"./chevron-left-Cn2QpmQm.js";import"./calendar-AVyjgUm3.js";import"./columns-C7eZMXkD.js";import"./filter-Jv0IL9HT.js";import"./arrow-right-PLA1q5ly.js";import"./tenderFollowUps-QTkPYKT-.js";import"./plus-D_QhTJwi.js";import"./exportTemplate-BWERR8Az.js";import"./download-DKN18EZi.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Sa=Bt("CircleDollarSign",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8",key:"1h4pet"}],["path",{d:"M12 18V6",key:"zqpxq5"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Da=Bt("ListOrdered",[["path",{d:"M10 12h11",key:"6m4ad9"}],["path",{d:"M10 18h11",key:"11hvi2"}],["path",{d:"M10 6h11",key:"c7qv1k"}],["path",{d:"M4 10h2",key:"16xx2s"}],["path",{d:"M4 6h1v4",key:"cnovpq"}],["path",{d:"M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",key:"m9a95d"}]]);var Q,S,Ae,G,ue,ve,ie,oe,Te,be,ye,me,he,le,we,A,je,tt,st,at,nt,rt,it,ot,rs,Ut,Ca=(Ut=class extends Ms{constructor(s,a){super();U(this,A);U(this,Q);U(this,S);U(this,Ae);U(this,G);U(this,ue);U(this,ve);U(this,ie);U(this,oe);U(this,Te);U(this,be);U(this,ye);U(this,me);U(this,he);U(this,le);U(this,we,new Set);this.options=a,L(this,Q,s),L(this,oe,null),L(this,ie,jt()),this.options.experimental_prefetchInRender||u(this,ie).reject(new Error("experimental_prefetchInRender feature flag is not enabled")),this.bindMethods(),this.setOptions(a)}bindMethods(){this.refetch=this.refetch.bind(this)}onSubscribe(){this.listeners.size===1&&(u(this,S).addObserver(this),kt(u(this,S),this.options)?V(this,A,je).call(this):this.updateResult(),V(this,A,nt).call(this))}onUnsubscribe(){this.hasListeners()||this.destroy()}shouldFetchOnReconnect(){return lt(u(this,S),this.options,this.options.refetchOnReconnect)}shouldFetchOnWindowFocus(){return lt(u(this,S),this.options,this.options.refetchOnWindowFocus)}destroy(){this.listeners=new Set,V(this,A,rt).call(this),V(this,A,it).call(this),u(this,S).removeObserver(this)}setOptions(s){const a=this.options,n=u(this,S);if(this.options=u(this,Q).defaultQueryOptions(s),this.options.enabled!==void 0&&typeof this.options.enabled!="boolean"&&typeof this.options.enabled!="function"&&typeof ee(this.options.enabled,u(this,S))!="boolean")throw new Error("Expected enabled to be a boolean or a callback that returns a boolean");V(this,A,ot).call(this),u(this,S).setOptions(this.options),a._defaulted&&!Ye(this.options,a)&&u(this,Q).getQueryCache().notify({type:"observerOptionsUpdated",query:u(this,S),observer:this});const i=this.hasListeners();i&&$t(u(this,S),n,this.options,a)&&V(this,A,je).call(this),this.updateResult(),i&&(u(this,S)!==n||ee(this.options.enabled,u(this,S))!==ee(a.enabled,u(this,S))||Re(this.options.staleTime,u(this,S))!==Re(a.staleTime,u(this,S)))&&V(this,A,tt).call(this);const r=V(this,A,st).call(this);i&&(u(this,S)!==n||ee(this.options.enabled,u(this,S))!==ee(a.enabled,u(this,S))||r!==u(this,le))&&V(this,A,at).call(this,r)}getOptimisticResult(s){const a=u(this,Q).getQueryCache().build(u(this,Q),s),n=this.createResult(a,s);return Aa(this,n)&&(L(this,G,n),L(this,ve,this.options),L(this,ue,u(this,S).state)),n}getCurrentResult(){return u(this,G)}trackResult(s,a){return new Proxy(s,{get:(n,i)=>(this.trackProp(i),a==null||a(i),Reflect.get(n,i))})}trackProp(s){u(this,we).add(s)}getCurrentQuery(){return u(this,S)}refetch({...s}={}){return this.fetch({...s})}fetchOptimistic(s){const a=u(this,Q).defaultQueryOptions(s),n=u(this,Q).getQueryCache().build(u(this,Q),a);return n.fetch().then(()=>this.createResult(n,a))}fetch(s){return V(this,A,je).call(this,{...s,cancelRefetch:s.cancelRefetch??!0}).then(()=>(this.updateResult(),u(this,G)))}createResult(s,a){var Me;const n=u(this,S),i=this.options,r=u(this,G),o=u(this,ue),d=u(this,ve),x=s!==n?s.state:u(this,Ae),{state:y}=s;let h={...y},b=!1,m;if(a._optimisticResults){const H=this.hasListeners(),ge=!H&&kt(s,a),W=H&&$t(s,n,a,i);(ge||W)&&(h={...h,...Vs(y.data,s.options)}),a._optimisticResults==="isRestoring"&&(h.fetchStatus="idle")}let{error:N,errorUpdatedAt:C,status:j}=h;m=h.data;let p=!1;if(a.placeholderData!==void 0&&m===void 0&&j==="pending"){let H;r!=null&&r.isPlaceholderData&&a.placeholderData===(d==null?void 0:d.placeholderData)?(H=r.data,p=!0):H=typeof a.placeholderData=="function"?a.placeholderData((Me=u(this,ye))==null?void 0:Me.state.data,u(this,ye)):a.placeholderData,H!==void 0&&(j="success",m=St(r==null?void 0:r.data,H,a),b=!0)}if(a.select&&m!==void 0&&!p)if(r&&m===(o==null?void 0:o.data)&&a.select===u(this,Te))m=u(this,be);else try{L(this,Te,a.select),m=a.select(m),m=St(r==null?void 0:r.data,m,a),L(this,be,m),L(this,oe,null)}catch(H){L(this,oe,H)}u(this,oe)&&(N=u(this,oe),m=u(this,be),C=Date.now(),j="error");const O=h.fetchStatus==="fetching",ce=j==="pending",pe=j==="error",xe=ce&&O,Ie=m!==void 0,k={status:j,fetchStatus:h.fetchStatus,isPending:ce,isSuccess:j==="success",isError:pe,isInitialLoading:xe,isLoading:xe,data:m,dataUpdatedAt:h.dataUpdatedAt,error:N,errorUpdatedAt:C,failureCount:h.fetchFailureCount,failureReason:h.fetchFailureReason,errorUpdateCount:h.errorUpdateCount,isFetched:h.dataUpdateCount>0||h.errorUpdateCount>0,isFetchedAfterMount:h.dataUpdateCount>x.dataUpdateCount||h.errorUpdateCount>x.errorUpdateCount,isFetching:O,isRefetching:O&&!ce,isLoadingError:pe&&!Ie,isPaused:h.fetchStatus==="paused",isPlaceholderData:b,isRefetchError:pe&&Ie,isStale:xt(s,a),refetch:this.refetch,promise:u(this,ie),isEnabled:ee(a.enabled,s)!==!1};if(this.options.experimental_prefetchInRender){const H=q=>{k.status==="error"?q.reject(k.error):k.data!==void 0&&q.resolve(k.data)},ge=()=>{const q=L(this,ie,k.promise=jt());H(q)},W=u(this,ie);switch(W.status){case"pending":s.queryHash===n.queryHash&&H(W);break;case"fulfilled":(k.status==="error"||k.data!==W.value)&&ge();break;case"rejected":(k.status!=="error"||k.error!==W.reason)&&ge();break}}return k}updateResult(){const s=u(this,G),a=this.createResult(u(this,S),this.options);if(L(this,ue,u(this,S).state),L(this,ve,this.options),u(this,ue).data!==void 0&&L(this,ye,u(this,S)),Ye(a,s))return;L(this,G,a);const n=()=>{if(!s)return!0;const{notifyOnChangeProps:i}=this.options,r=typeof i=="function"?i():i;if(r==="all"||!r&&!u(this,we).size)return!0;const o=new Set(r??u(this,we));return this.options.throwOnError&&o.add("error"),Object.keys(u(this,G)).some(d=>{const c=d;return u(this,G)[c]!==s[c]&&o.has(c)})};V(this,A,rs).call(this,{listeners:n()})}onQueryUpdate(){this.updateResult(),this.hasListeners()&&V(this,A,nt).call(this)}},Q=new WeakMap,S=new WeakMap,Ae=new WeakMap,G=new WeakMap,ue=new WeakMap,ve=new WeakMap,ie=new WeakMap,oe=new WeakMap,Te=new WeakMap,be=new WeakMap,ye=new WeakMap,me=new WeakMap,he=new WeakMap,le=new WeakMap,we=new WeakMap,A=new WeakSet,je=function(s){V(this,A,ot).call(this);let a=u(this,S).fetch(this.options,s);return s!=null&&s.throwOnError||(a=a.catch(Xe)),a},tt=function(){V(this,A,rt).call(this);const s=Re(this.options.staleTime,u(this,S));if(Je||u(this,G).isStale||!Rt(s))return;const n=Ps(u(this,G).dataUpdatedAt,s)+1;L(this,me,setTimeout(()=>{u(this,G).isStale||this.updateResult()},n))},st=function(){return(typeof this.options.refetchInterval=="function"?this.options.refetchInterval(u(this,S)):this.options.refetchInterval)??!1},at=function(s){V(this,A,it).call(this),L(this,le,s),!(Je||ee(this.options.enabled,u(this,S))===!1||!Rt(u(this,le))||u(this,le)===0)&&L(this,he,setInterval(()=>{(this.options.refetchIntervalInBackground||Fs.isFocused())&&V(this,A,je).call(this)},u(this,le)))},nt=function(){V(this,A,tt).call(this),V(this,A,at).call(this,V(this,A,st).call(this))},rt=function(){u(this,me)&&(clearTimeout(u(this,me)),L(this,me,void 0))},it=function(){u(this,he)&&(clearInterval(u(this,he)),L(this,he,void 0))},ot=function(){const s=u(this,Q).getQueryCache().build(u(this,Q),this.options);if(s===u(this,S))return;const a=u(this,S);L(this,S,s),L(this,Ae,s.state),this.hasListeners()&&(a==null||a.removeObserver(this),s.addObserver(this))},rs=function(s){Wt.batch(()=>{s.listeners&&this.listeners.forEach(a=>{a(u(this,G))}),u(this,Q).getQueryCache().notify({query:u(this,S),type:"observerResultsUpdated"})})},Ut);function Ea(t,s){return ee(s.enabled,t)!==!1&&t.state.data===void 0&&!(t.state.status==="error"&&s.retryOnMount===!1)}function kt(t,s){return Ea(t,s)||t.state.data!==void 0&&lt(t,s,s.refetchOnMount)}function lt(t,s,a){if(ee(s.enabled,t)!==!1&&Re(s.staleTime,t)!=="static"){const n=typeof a=="function"?a(t):a;return n==="always"||n!==!1&&xt(t,s)}return!1}function $t(t,s,a,n){return(t!==s||ee(n.enabled,t)===!1)&&(!a.suspense||t.state.status!=="error")&&xt(t,a)}function xt(t,s){return ee(s.enabled,t)!==!1&&t.isStaleByTime(Re(s.staleTime,t))}function Aa(t,s){return!Ye(t.getCurrentResult(),s)}var is=f.createContext(!1),Ta=()=>f.useContext(is);is.Provider;function ka(){let t=!1;return{clearReset:()=>{t=!1},reset:()=>{t=!0},isReset:()=>t}}var $a=f.createContext(ka()),Oa=()=>f.useContext($a),La=(t,s)=>{(t.suspense||t.throwOnError||t.experimental_prefetchInRender)&&(s.isReset()||(t.retryOnMount=!1))},Ia=t=>{f.useEffect(()=>{t.clearReset()},[t])},Ma=({result:t,errorResetBoundary:s,throwOnError:a,query:n,suspense:i})=>t.isError&&!s.isReset()&&!t.isFetching&&n&&(i&&t.data===void 0||_s(a,[t.error,n])),Pa=t=>{if(t.suspense){const s=n=>n==="static"?n:Math.max(n??1e3,1e3),a=t.staleTime;t.staleTime=typeof a=="function"?(...n)=>s(a(...n)):s(a),typeof t.gcTime=="number"&&(t.gcTime=Math.max(t.gcTime,1e3))}},Fa=(t,s)=>t.isLoading&&t.isFetching&&!s,Va=(t,s)=>(t==null?void 0:t.suspense)&&s.isPending,Ot=(t,s,a)=>s.fetchOptimistic(t).catch(()=>{a.clearReset()});function _a(t,s,a){var h,b,m,N,C;const n=Ta(),i=Oa(),r=Kt(),o=r.defaultQueryOptions(t);(b=(h=r.getDefaultOptions().queries)==null?void 0:h._experimental_beforeQuery)==null||b.call(h,o),o._optimisticResults=n?"isRestoring":"optimistic",Pa(o),La(o,i),Ia(i);const d=!r.getQueryCache().get(o.queryHash),[c]=f.useState(()=>new s(r,o)),x=c.getOptimisticResult(o),y=!n&&t.subscribed!==!1;if(f.useSyncExternalStore(f.useCallback(j=>{const p=y?c.subscribe(Wt.batchCalls(j)):Xe;return c.updateResult(),p},[c,y]),()=>c.getCurrentResult(),()=>c.getCurrentResult()),f.useEffect(()=>{c.setOptions(o)},[o,c]),Va(o,x))throw Ot(o,c,i);if(Ma({result:x,errorResetBoundary:i,throwOnError:o.throwOnError,query:r.getQueryCache().get(o.queryHash),suspense:o.suspense}))throw x.error;if((N=(m=r.getDefaultOptions().queries)==null?void 0:m._experimental_afterQuery)==null||N.call(m,o,x),o.experimental_prefetchInRender&&!Je&&Fa(x,n)){const j=d?Ot(o,c,i):(C=r.getQueryCache().get(o.queryHash))==null?void 0:C.promise;j==null||j.catch(Xe).finally(()=>{c.updateResult()})}return o.notifyOnChangeProps?x:c.trackResult(x)}function Ua(t,s){return _a(t,Ca)}function Ba({data:t,onStageClick:s}){const a=Math.max(...t.map(o=>o.count),1),n=["bg-info","bg-warning","bg-pending","bg-success","bg-destructive","bg-orange-500","bg-cyan-600","bg-muted"],i=o=>o>=1e6?`AED ${(o/1e6).toFixed(1)}M`:o>=1e3?`AED ${(o/1e3).toFixed(0)}K`:`AED ${o}`,r=o=>{s&&s(o)};return e.jsxs(ke,{children:[e.jsx($e,{className:"pb-2 sm:pb-3",children:e.jsx(Oe,{className:"text-lg",children:"Pipeline Funnel"})}),e.jsx(Le,{className:"p-2 sm:p-3",children:e.jsx("div",{className:"space-y-2 sm:space-y-3 md:space-y-4",children:t.map((o,d)=>{const c=a>0?o.count/a*100:0;return e.jsxs("div",{className:"relative cursor-pointer group min-w-0",onClick:()=>r(o.stage),children:[e.jsxs("div",{className:"mb-1.5 sm:mb-2 flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2",children:[e.jsx("span",{className:"text-sm sm:text-base font-medium group-hover:text-primary transition-colors truncate",children:o.stage}),e.jsxs("div",{className:"flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground group-hover:text-foreground transition-colors",children:[e.jsxs("span",{children:[o.count," opps"]}),e.jsx("span",{className:"font-semibold text-foreground",children:i(o.value)}),d>0&&e.jsxs("span",{className:"text-primary",children:[o.conversionRate,"%"]})]})]}),e.jsx("div",{className:"h-6 sm:h-8 bg-muted rounded-lg overflow-hidden ring-1 ring-transparent group-hover:ring-primary/50 transition-all",children:e.jsx("div",{className:`h-full ${n[d%n.length]} transition-all duration-500 rounded-lg flex items-center justify-center group-hover:brightness-110`,style:{width:`${Math.max(c,5)}%`},children:e.jsx("span",{className:"text-xs font-bold text-white",children:o.count})})})]},o.stage)})})})]})}function Wa({data:t,onSelectOpportunity:s}){const a=r=>zt(r,10),n=t.filter(r=>a(r)).sort((r,o)=>{var x,y;const d=((x=Dt(r))==null?void 0:x.getTime())||0,c=((y=Dt(o))==null?void 0:y.getTime())||0;return d-c}).slice(0,8),i=r=>Us(r);return e.jsxs(ke,{className:"flex h-full flex-col",children:[e.jsx($e,{className:"pb-2",children:e.jsxs(Oe,{className:"text-lg flex items-center gap-2",children:[e.jsx(Se,{className:"h-5 w-5 text-pending"}),"Submission in Next 10 Days"]})}),e.jsx(Le,{className:"flex-1 min-h-0",children:e.jsx("div",{className:"h-full space-y-2 overflow-auto scrollbar-thin pr-1",children:n.length===0?e.jsx("p",{className:"text-sm text-muted-foreground text-center py-4",children:"No tenders due within 10 days"}):n.map(r=>{const o=i(r),d=o<=2;return e.jsxs("div",{className:`flex items-center justify-between p-2 rounded-lg transition-colors ${d?"bg-destructive/10":"bg-muted/50"} ${s?"cursor-pointer hover:ring-1 hover:ring-primary/20":""}`,onClick:()=>s==null?void 0:s(r),children:[e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("p",{className:"text-sm font-medium truncate text-primary hover:underline",children:r.tenderName}),e.jsxs("div",{className:"flex items-center gap-2 mt-1",children:[e.jsx("span",{className:"text-xs text-muted-foreground",children:r.clientName}),e.jsx("span",{className:"text-xs text-muted-foreground",children:"•"}),e.jsx("span",{className:"text-xs text-muted-foreground",children:r.internalLead||"Unassigned"})]})]}),e.jsx("div",{className:"flex items-center gap-2 ml-2",children:d?e.jsxs(De,{variant:"destructive",className:"text-xs",children:[e.jsx(fa,{className:"h-3 w-3 mr-1"}),o,"d left"]}):e.jsxs(De,{variant:"outline",className:"text-xs text-pending border-pending",children:[e.jsx(Se,{className:"h-3 w-3 mr-1"}),o,"d left"]})})]},r.id)})})})]})}function Ka({data:t,onClientClick:s}){const[a,n]=Nt.useState("value"),{formatCurrency:i}=Gt(),r=Nt.useMemo(()=>[...t].sort((c,x)=>a==="value"?x.value-c.value:x.count-c.count).slice(0,8),[t,a]),o=Math.max(...r.map(c=>c.value),1),d=Math.max(...r.map(c=>c.count),1);return e.jsxs(ke,{className:"flex flex-col",children:[e.jsx($e,{className:"pb-2 space-y-4",children:e.jsxs("div",{className:"flex items-center justify-between gap-4",children:[e.jsxs(Oe,{className:"text-lg flex items-center gap-2 sm:gap-3",children:[e.jsx(Bs,{className:"h-5 w-5 text-primary"}),"Top Clients"]}),e.jsx(va,{value:a,onValueChange:c=>n(c),className:"h-8",children:e.jsxs(ba,{className:"h-8 p-1 rounded-lg",children:[e.jsxs(At,{value:"value",className:"h-6 text-[10px] px-2 gap-1 rounded-md",children:[e.jsx(Sa,{className:"h-3 w-3"})," Value"]}),e.jsxs(At,{value:"count",className:"h-6 text-[10px] px-2 gap-1 rounded-md",children:[e.jsx(Da,{className:"h-3 w-3"})," Count"]})]})})]})}),e.jsx(Le,{className:"flex-1 overflow-hidden",children:e.jsx("div",{className:"space-y-1 sm:space-y-2",children:r.length===0?e.jsx("p",{className:"text-xs sm:text-sm text-muted-foreground text-center py-8",children:"No client intelligence found"}):r.map((c,x)=>e.jsxs("div",{className:`group space-y-1.5 p-2 sm:p-3 -mx-2 rounded-xl transition-all ${s?"cursor-pointer hover:bg-primary/5":""}`,onClick:()=>s==null?void 0:s(c.name),children:[e.jsxs("div",{className:"flex min-w-0 items-center justify-between gap-2 sm:gap-3",children:[e.jsxs("div",{className:"flex min-w-0 items-center gap-2 sm:gap-3",children:[e.jsx("span",{className:"text-[10px] font-bold text-muted-foreground/60 w-4 shrink-0",children:String(x+1).padStart(2,"0")}),e.jsx("span",{className:`text-xs font-bold truncate max-w-[120px] sm:max-w-[150px] ${s?"text-foreground group-hover:text-primary":""}`,children:c.name})]}),e.jsxs("div",{className:"flex items-center gap-2 text-[10px] sm:text-xs shrink-0",children:[e.jsxs("span",{className:a==="count"?"font-black text-foreground":"text-muted-foreground",children:[c.count," opps"]}),a==="value"?e.jsx("span",{className:"font-black text-primary",children:i(c.value)}):null]})]}),e.jsx(Zt,{value:a==="value"?c.value/o*100:c.count/d*100,className:"h-1.5"})]},c.name))})})]})}function za({healthScore:t,missingRows:s,duplicateTenderRows:a,imputedCount:n,missingFieldCount:i,totalRecords:r,completeRecords:o,duplicateTenderCount:d}){return e.jsxs(ke,{children:[e.jsx($e,{children:e.jsxs(Oe,{className:"flex items-center gap-2",children:[e.jsx(Ht,{className:"h-5 w-5 text-primary"}),"Data Health"]})}),e.jsxs(Le,{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsx("p",{className:"text-sm font-medium",children:"Quality Score"}),e.jsxs("p",{className:"text-sm font-bold",children:[t,"%"]})]}),e.jsx(Zt,{value:t,className:"h-2"})]}),e.jsxs("div",{className:"space-y-2 text-sm",children:[e.jsxs("div",{className:"flex items-center justify-between p-2 bg-muted rounded",children:[e.jsx("span",{className:"text-muted-foreground",children:"Complete Records"}),e.jsxs("span",{className:"font-mono",children:[o,"/",r]})]}),e.jsxs("div",{className:"flex items-center justify-between p-2 bg-muted rounded",children:[e.jsx("span",{className:"text-muted-foreground",children:"Missing Fields"}),e.jsx("span",{className:"font-mono",children:i})]}),e.jsxs("div",{className:"flex items-center justify-between p-2 bg-muted rounded",children:[e.jsx("span",{className:"text-muted-foreground",children:"Imputed Values"}),e.jsx("span",{className:"font-mono",children:n})]}),e.jsxs("div",{className:"flex items-center justify-between p-2 bg-muted rounded",children:[e.jsx("span",{className:"text-muted-foreground",children:"Duplicate Tenders"}),e.jsx("span",{className:"font-mono",children:d})]})]}),s.length>0&&e.jsxs("div",{className:"mt-4 pt-4 border-t space-y-2",children:[e.jsx("p",{className:"text-xs font-medium text-muted-foreground",children:"Records missing mandatory columns:"}),e.jsxs("div",{className:"space-y-1 max-h-[150px] overflow-y-auto",children:[s.slice(0,5).map(c=>e.jsxs("div",{className:"text-xs p-2 bg-warning/10 rounded flex items-start gap-2",children:[e.jsx(Ze,{className:"h-3 w-3 mt-0.5 text-warning flex-shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"font-mono text-xs",children:c.refNo}),e.jsx("p",{className:"text-muted-foreground",children:c.missingFields.join(", ")})]})]},c.id)),s.length>5&&e.jsxs("p",{className:"text-xs text-muted-foreground px-2",children:["+",s.length-5," more records with missing data"]})]})]}),a.length>0&&e.jsxs("div",{className:"mt-4 pt-4 border-t space-y-2",children:[e.jsx("p",{className:"text-xs font-medium text-muted-foreground",children:"Tender names appearing more than once:"}),e.jsxs("div",{className:"space-y-1 max-h-[150px] overflow-y-auto",children:[a.slice(0,5).map(c=>e.jsxs("div",{className:"text-xs p-2 bg-destructive/10 rounded flex items-start gap-2",children:[e.jsx(Ze,{className:"h-3 w-3 mt-0.5 text-destructive flex-shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"font-medium",children:c.tenderName||"Untitled Tender"}),e.jsx("p",{className:"font-mono text-xs",children:c.refNo}),e.jsxs("p",{className:"text-muted-foreground",children:[c.duplicateCount," rows share this tender name"]})]})]},c.id)),a.length>5&&e.jsxs("p",{className:"text-xs text-muted-foreground px-2",children:["+",a.length-5," more duplicate tender names"]})]})]})]})]})}function Ga({data:t}){const{getApprovalStatus:s}=Ws(),a=t.filter(o=>s(o.opportunityRefNo)==="fully_approved").length,n=t.filter(o=>s(o.opportunityRefNo)==="proposal_head_approved").length,i=t.filter(o=>s(o.opportunityRefNo)==="pending").length,r=t.filter(o=>!o.opportunityRefNo||!o.opportunityRefNo.trim()).length;return e.jsxs(ke,{children:[e.jsx($e,{children:e.jsxs(Oe,{className:"flex items-center gap-2",children:[e.jsx(Se,{className:"h-5 w-5 text-primary"}),"Approval Status"]})}),e.jsxs(Le,{className:"space-y-3",children:[e.jsxs("div",{className:"flex items-center justify-between p-3 bg-success/10 rounded-lg",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(Ht,{className:"h-4 w-4 text-success"}),e.jsx("span",{className:"text-sm",children:"Fully Approved"})]}),e.jsx(De,{className:"bg-success/20 text-success",children:a})]}),e.jsxs("div",{className:"flex items-center justify-between p-3 bg-info/10 rounded-lg",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(Se,{className:"h-4 w-4 text-info"}),e.jsx("span",{className:"text-sm",children:"Tender Manager Approved"})]}),e.jsx(De,{className:"bg-info/20 text-info",children:n})]}),e.jsxs("div",{className:"flex items-center justify-between p-3 bg-warning/10 rounded-lg",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(Se,{className:"h-4 w-4 text-warning"}),e.jsx("span",{className:"text-sm",children:"Pending"})]}),e.jsx(De,{className:"bg-warning/20 text-warning",children:i})]}),e.jsxs("div",{className:"text-xs text-muted-foreground mt-2 space-y-1",children:[e.jsxs("div",{children:["Total tracked in card: ",a+n+i]}),e.jsxs("div",{children:["Debug: rows with missing Tender No (opportunityRefNo): ",r]})]})]})]})}var gt="Radio",[Ha,os]=Qt(gt),[Qa,qa]=Ha(gt),ls=f.forwardRef((t,s)=>{const{__scopeRadio:a,name:n,checked:i=!1,required:r,disabled:o,value:d="on",onCheck:c,form:x,...y}=t,[h,b]=f.useState(null),m=ct(s,j=>b(j)),N=f.useRef(!1),C=h?x||!!h.closest("form"):!0;return e.jsxs(Qa,{scope:a,checked:i,disabled:o,children:[e.jsx(Ue.button,{type:"button",role:"radio","aria-checked":i,"data-state":ms(i),"data-disabled":o?"":void 0,disabled:o,value:d,...y,ref:m,onClick:et(t.onClick,j=>{i||c==null||c(),C&&(N.current=j.isPropagationStopped(),N.current||j.stopPropagation())})}),C&&e.jsx(us,{control:h,bubbles:!N.current,name:n,value:d,checked:i,required:r,disabled:o,form:x,style:{transform:"translateX(-100%)"}})]})});ls.displayName=gt;var cs="RadioIndicator",ds=f.forwardRef((t,s)=>{const{__scopeRadio:a,forceMount:n,...i}=t,r=qa(cs,a);return e.jsx(Ks,{present:n||r.checked,children:e.jsx(Ue.span,{"data-state":ms(r.checked),"data-disabled":r.disabled?"":void 0,...i,ref:s})})});ds.displayName=cs;var Ya="RadioBubbleInput",us=f.forwardRef(({__scopeRadio:t,control:s,checked:a,bubbles:n=!0,...i},r)=>{const o=f.useRef(null),d=ct(o,r),c=zs(a),x=Gs(s);return f.useEffect(()=>{const y=o.current;if(!y)return;const h=window.HTMLInputElement.prototype,m=Object.getOwnPropertyDescriptor(h,"checked").set;if(c!==a&&m){const N=new Event("click",{bubbles:n});m.call(y,a),y.dispatchEvent(N)}},[c,a,n]),e.jsx(Ue.input,{type:"radio","aria-hidden":!0,defaultChecked:a,...i,tabIndex:-1,ref:d,style:{...i.style,...x,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});us.displayName=Ya;function ms(t){return t?"checked":"unchecked"}var Xa=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],Be="RadioGroup",[Ja,sr]=Qt(Be,[qt,os]),hs=qt(),ps=os(),[Za,en]=Ja(Be),xs=f.forwardRef((t,s)=>{const{__scopeRadioGroup:a,name:n,defaultValue:i,value:r,required:o=!1,disabled:d=!1,orientation:c,dir:x,loop:y=!0,onValueChange:h,...b}=t,m=hs(a),N=Hs(x),[C,j]=Qs({prop:r,defaultProp:i??null,onChange:h,caller:Be});return e.jsx(Za,{scope:a,name:n,required:o,disabled:d,value:C,onValueChange:j,children:e.jsx(qs,{asChild:!0,...m,orientation:c,dir:N,loop:y,children:e.jsx(Ue.div,{role:"radiogroup","aria-required":o,"aria-orientation":c,"data-disabled":d?"":void 0,dir:N,...b,ref:s})})})});xs.displayName=Be;var gs="RadioGroupItem",fs=f.forwardRef((t,s)=>{const{__scopeRadioGroup:a,disabled:n,...i}=t,r=en(gs,a),o=r.disabled||n,d=hs(a),c=ps(a),x=f.useRef(null),y=ct(s,x),h=r.value===i.value,b=f.useRef(!1);return f.useEffect(()=>{const m=C=>{Xa.includes(C.key)&&(b.current=!0)},N=()=>b.current=!1;return document.addEventListener("keydown",m),document.addEventListener("keyup",N),()=>{document.removeEventListener("keydown",m),document.removeEventListener("keyup",N)}},[]),e.jsx(Ys,{asChild:!0,...d,focusable:!o,active:h,children:e.jsx(ls,{disabled:o,required:r.required,checked:h,...c,...i,name:r.name,ref:y,onCheck:()=>r.onValueChange(i.value),onKeyDown:et(m=>{m.key==="Enter"&&m.preventDefault()}),onFocus:et(i.onFocus,()=>{var m;b.current&&((m=x.current)==null||m.click())})})})});fs.displayName=gs;var tn="RadioGroupIndicator",vs=f.forwardRef((t,s)=>{const{__scopeRadioGroup:a,...n}=t,i=ps(a);return e.jsx(ds,{...i,...n,ref:s})});vs.displayName=tn;var bs=xs,ys=fs,sn=vs;const ws=f.forwardRef(({className:t,...s},a)=>e.jsx(bs,{className:Yt("grid gap-2",t),...s,ref:a}));ws.displayName=bs.displayName;const Ns=f.forwardRef(({className:t,...s},a)=>e.jsx(ys,{ref:a,className:Yt("aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",t),...s,children:e.jsx(sn,{className:"flex items-center justify-center",children:e.jsx(Xs,{className:"h-2.5 w-2.5 fill-current text-current"})})}));Ns.displayName=ys.displayName;const an="/api",Lt=t=>String(t||"").trim().toUpperCase().replace(/\s+/g," "),nn=(t,s)=>{var i;const a=(i=t.rawGraphData)==null?void 0:i.rowSnapshot;if(!a||typeof a!="object")return"";const n=Object.entries(a);for(const r of s){const o=Lt(r),d=n.find(([c])=>Lt(c)===o);if(d)return String(d[1]??"").trim()}return""},rn=t=>String(t.adnocRftNo||nn(t,["ADNOC RFT NO","ADNOC RFT NO."])||"").trim(),on=t=>{if(!t)return null;const s=String(t).replace(/\u00A0/g," ").replace(/[–—]/g,"-").trim();if(!s)return null;const a=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(a){const r=new Date(Number(a[1]),Number(a[2])-1,Number(a[3]));return Number.isNaN(r.getTime())?null:r}if(!(/\b(19|20)\d{2}\b/.test(s)||/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)))return null;const i=new Date(s);return Number.isNaN(i.getTime())?null:i},Ee=[{key:"30d",label:"Last 30 days",description:"Short-term pipeline snapshot based on RFP Received date.",days:30},{key:"90d",label:"Last 90 days",description:"Quarter-style view for recent sales activity.",days:90},{key:"180d",label:"Last 6 months",description:"Balanced trend view across an extended cycle.",days:180},{key:"365d",label:"Last 12 months",description:"Annual report view for broader performance review.",days:365},{key:"all",label:"All available data",description:"Uses the full currently filtered dataset.",days:null}],ln=t=>{var a;const s=[t.dateTenderReceived,t.tenderSubmittedDate,t.tenderPlannedSubmissionDate,typeof((a=t.rawGraphData)==null?void 0:a.rfpReceivedDisplay)=="string"?t.rawGraphData.rfpReceivedDisplay:""];for(const n of s){if(!n)continue;const i=on(n);if(i)return i}return null},cn=(t,s)=>{const a=Ee.find(r=>r.key===s)||Ee[1];if(a.days===null)return t;const n=new Date;n.setHours(23,59,59,999);const i=new Date(n);return i.setDate(i.getDate()-(a.days-1)),i.setHours(0,0,0,0),t.filter(r=>{const o=ln(r);return o?o>=i&&o<=n:!1})},dn=t=>{const s=Ee.find(i=>i.key===t)||Ee[1];if(s.days===null)return{key:s.key,label:s.label,rangeLabel:"All available dates"};const a=new Date,n=new Date;return n.setDate(n.getDate()-(s.days-1)),{key:s.key,label:s.label,rangeLabel:`${n.toLocaleDateString()} to ${a.toLocaleDateString()}`}},un=t=>t==="all"?Number.POSITIVE_INFINITY:12;function mn(t,s,a){const n=t.reduce((o,d)=>o+d,0);let i=0,r="";return t.forEach((o,d)=>{const x=o/n*100/100*360,y=i,h=i+x,b=y*Math.PI/180,m=h*Math.PI/180,N=100+80*Math.cos(b),C=100+80*Math.sin(b),j=100+80*Math.cos(m),p=100+80*Math.sin(m),O=x>180?1:0,ce=`M 100 100 L ${N} ${C} A 80 80 0 ${O} 1 ${j} ${p} Z`;r+=`<path d="${ce}" fill="${a[d]}" stroke="white" stroke-width="2"/>`,i=h}),`<svg viewBox="0 0 200 200" style="width: 100%; height: 250px;">${r}</svg>`}function hn(t,s,a){const n=Math.max(...s),i=200,r=Math.min(40,200/t.length),o=Math.max(10,(200-t.length*r)/(t.length+1));let d="";return t.forEach((c,x)=>{const y=s[x]/n*i,h=o+x*(r+o),b=i-y;d+=`<rect x="${h}" y="${b}" width="${r}" height="${y}" fill="${a}" rx="4" />`,d+=`<text x="${h+r/2}" y="${i+20}" text-anchor="middle" font-size="11" fill="#64748b">${c}</text>`,d+=`<text x="${h+r/2}" y="${b-5}" text-anchor="middle" font-size="10" font-weight="600" fill="#0f172a">${s[x]}</text>`}),`<svg viewBox="0 0 250 250" style="width: 100%; height: 250px;">${d}</svg>`}function pn(t,s,a){var j;const n=wa(s),i=es(s),r=ts(s),o=new Date().toLocaleString(),d=p=>String(p??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"),c=[t.search?`Search: ${t.search}`:"",t.statuses.length?`Statuses: ${t.statuses.join(", ")}`:"",t.groups.length?`Verticals: ${t.groups.join(", ")}`:"",t.leads.length?`Leads: ${t.leads.join(", ")}`:"",t.clients.length?`Clients: ${t.clients.join(", ")}`:"",t.datePreset!=="all"?`Date preset: ${t.datePreset}`:"",t.showAtRisk?"At risk only":"",t.showMissDeadline?"Miss deadline only":""].filter(Boolean),x=s.length,y=[n.workingCount,n.awardedCount,n.lostCount,n.regrettedCount,n.toStartCount],h=["Working","Awarded","Lost","Regretted","To Start"],b=["#3b82f6","#10b981","#ef4444","#f59e0b","#8b5cf6"],m=i.map(p=>p.stage).slice(0,5),N=i.map(p=>p.count).slice(0,5),C=s.slice().sort((p,O)=>new Date(O.dateTenderReceived||O.tenderSubmittedDate||0).getTime()-new Date(p.dateTenderReceived||p.tenderSubmittedDate||0).getTime()).slice(0,un(a.key));return`<!doctype html>
<html>
<head>
<meta charset="UTF-8" />
<title>Sales Pipeline Report</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
  background: #f8fafc; 
  color: #0f172a;
  line-height: 1.6;
}
.container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
header { 
  background:
    radial-gradient(circle at top right, rgba(125,211,252,0.24), transparent 28%),
    linear-gradient(135deg, #082f49 0%, #0f172a 55%, #172554 100%);
  color: white;
  padding: 40px;
  border-radius: 12px;
  margin-bottom: 40px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}
header h1 { font-size: 32px; margin-bottom: 8px; font-weight: 700; }
header p { opacity: 0.85; font-size: 15px; }
.timestamp { font-size: 12px; opacity: 0.6; margin-top: 15px; }
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}
.hero-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.16);
  font-size: 12px;
  letter-spacing: 0.02em;
}

section { 
  background: white;
  padding: 30px;
  margin-bottom: 25px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  border: 1px solid #e2e8f0;
}
h2 { 
  color: #1e293b;
  font-size: 20px;
  margin-bottom: 25px;
  padding-bottom: 12px;
  border-bottom: 3px solid #0c63e4;
  display: inline-block;
}
h3 { 
  color: #334155;
  font-size: 14px;
  margin: 20px 0 12px;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 25px; }
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 25px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }

.metric-card { 
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  padding: 18px;
  text-align: center;
}

.metric-label { 
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 10px;
  letter-spacing: 0.5px;
}
.metric-value { 
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
}
.metric-unit { 
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
}

.chart-container {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}
.chart-title {
  font-weight: 600;
  color: #334155;
  margin-bottom: 15px;
  font-size: 13px;
  text-transform: uppercase;
}

.filters {
  background: #f0fdf4;
  border-left: 4px solid #22c55e;
  padding: 14px;
  border-radius: 6px;
  margin-bottom: 20px;
}
.filters p {
  font-size: 13px;
  color: #166534;
  line-height: 1.6;
}

table { 
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 15px;
}
th { 
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  color: #334155;
  padding: 13px;
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  border-bottom: 2px solid #cbd5e1;
  letter-spacing: 0.5px;
}
td { 
  padding: 12px 13px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
tr:last-child td { border-bottom: none; }
tr:nth-child(even) { background: #f8fafc; }

.highlight { color: #0c63e4; font-weight: 700; }
.positive { color: #16a34a; font-weight: 700; }
.negative { color: #dc2626; font-weight: 700; }
.warning { color: #ea580c; font-weight: 700; }

.summary-box {
  background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
  border-left: 4px solid #0c63e4;
  padding: 16px;
  border-radius: 6px;
  font-size: 13px;
  margin: 15px 0;
  line-height: 1.7;
  border: 1px solid #bfdbfe;
}

.portfolio-caption {
  font-size: 13px;
  color: #475569;
  margin-bottom: 14px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 15px;
  font-size: 12px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

footer {
  text-align: center;
  padding: 25px;
  color: #64748b;
  font-size: 12px;
  border-top: 2px solid #e2e8f0;
  margin-top: 50px;
}

@media print {
  body { background: white; }
  section { box-shadow: none; border: 1px solid #ddd; }
}
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>📊 SALES PIPELINE ANALYTICS REPORT</h1>
    <p>Comprehensive Sales Intelligence & Market Insights</p>
    <div class="hero-meta">
      <div class="hero-chip">Report window: ${d(a.label)}</div>
      <div class="hero-chip">Date span: ${d(a.rangeLabel)}</div>
      <div class="hero-chip">Included opportunities: ${d(x)}</div>
    </div>
    <div class="timestamp">Generated: ${d(o)} | Total Opportunities: ${d(x)}</div>
  </header>

  <section>
    <h2>Report Filters</h2>
    <div class="filters">
      <p><strong>Applied Filters:</strong> ${c.length?c.map(p=>d(p)).join(" • "):"None (all data shown)"}</p>
      <p><strong>Report duration:</strong> ${d(a.label)} (${d(a.rangeLabel)})</p>
    </div>
  </section>

  <section>
    <h2>Key Business Metrics</h2>
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Total Opportunities</div>
        <div class="metric-value">${d(x)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Opportunities Won</div>
        <div class="metric-value positive">${d(n.wonCount)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Opportunities Lost</div>
        <div class="metric-value negative">${d(n.lostCount)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">At Risk Count</div>
        <div class="metric-value warning">${d(n.atRiskCount)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Active Pipeline</div>
        <div class="metric-value highlight">${d(n.totalActive)}</div>
      </div>
    </div>

    <div class="summary-box">
      <strong>📈 Executive Summary:</strong> Currently tracking <span class="highlight">${d(n.totalActive)} active opportunities</span>. Successfully closed <span class="positive">${d(n.wonCount)} deals</span> while <span class="negative">${d(n.lostCount)} opportunities</span> were lost. <span class="warning">${d(n.atRiskCount)} opportunities</span> require immediate attention due to approaching submission deadlines.
    </div>
  </section>

  <section>
    <h2>Visual Analytics Dashboard</h2>
    <div class="grid-2">
      <div class="chart-container">
        <div class="chart-title">📊 Opportunity Status Distribution</div>
        ${mn(y,h,b)}
        <div class="legend">
          ${h.map((p,O)=>`<div class="legend-item"><div class="legend-color" style="background: ${b[O]}"></div>${p}: ${y[O]}</div>`).join("")}
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-title">📈 Sales Funnel Pipeline</div>
        ${hn(m.map(p=>p.substring(0,8)),N,"#3b82f6")}
      </div>
    </div>
  </section>

  <section>
    <h2>Opportunity Status Breakdown</h2>
    <div class="grid-3">
      <div class="metric-card">
        <div class="metric-label">✅ Working</div>
        <div class="metric-value">${d(n.workingCount)}</div>
        <div class="metric-unit">Active Negotiations</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">🏆 Awarded</div>
        <div class="metric-value positive">${d(n.awardedCount)}</div>
        <div class="metric-unit">Won Deals</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">❌ Lost</div>
        <div class="metric-value negative">${d(n.lostCount)}</div>
        <div class="metric-unit">Lost Opportunities</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">📋 Regretted</div>
        <div class="metric-value warning">${d(n.regrettedCount)}</div>
        <div class="metric-unit">Declined Bids</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">🚀 To Start</div>
        <div class="metric-value">${d(n.toStartCount)}</div>
        <div class="metric-unit">Pipeline Queue</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">⏱️ At Risk</div>
        <div class="metric-value negative">${d(n.atRiskCount)}</div>
        <div class="metric-unit">Urgent Action</div>
      </div>
    </div>

    <div class="summary-box" style="margin-top: 20px;">
      <strong>💡 Insights:</strong> Your pipeline shows <span class="positive">${d(n.workingCount)} opportunities in active negotiation</span>. Focus on converting <span class="highlight">${d(n.toStartCount)} pending opportunities</span> and managing the <span class="negative">${d(n.atRiskCount)} at-risk deals</span> to prevent further losses.
    </div>
  </section>

  <section>
    <h2>Sales Funnel Analysis</h2>
    <table>
      <thead>
        <tr>
          <th>Pipeline Stage</th>
          <th>Opportunities</th>
          <th>Total Value</th>
        </tr>
      </thead>
      <tbody>
      ${i.map(p=>`<tr>
        <td><strong>${d(p.stage)}</strong></td>
        <td>${d(p.count)}</td>
        <td class="highlight">$${d((p.value/1e6).toFixed(2))}M</td>
      </tr>`).join("")}
      </tbody>
    </table>

    <div class="summary-box">
      <strong>🔍 Funnel Analysis:</strong> The funnel shows <span class="highlight">${i[0].count} opportunities at the initial stage</span>. Track progression between stages to identify bottlenecks and optimize sales process efficiency.
    </div>
  </section>

  <section>
    <h2>${d(a.key==="all"?"Complete Tender Register":"Portfolio Snapshot")}</h2>
    <p class="portfolio-caption">${d(a.key==="all"?"All opportunities inside the selected report duration, ordered by RFP Received date.":"Most recent opportunities inside the selected report duration, ordered by RFP Received date.")}</p>
    <table>
      <thead>
        <tr>
          <th>Avenir Ref</th>
          <th>ADNOC Ref</th>
          <th>Tender Name</th>
          <th>Client</th>
          <th>Received</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
      ${C.map(p=>`<tr>
        <td><strong>${d(p.opportunityRefNo||"—")}</strong></td>
        <td>${d(rn(p)||"—")}</td>
        <td><strong>${d(p.tenderName||"Untitled Tender")}</strong></td>
        <td>${d(p.clientName||"—")}</td>
        <td>${d(p.dateTenderReceived||"—")}</td>
        <td>${d(P(p)||"UNSPECIFIED")}</td>
      </tr>`).join("")}
      </tbody>
    </table>

    <div class="summary-box">
      <strong>📌 Portfolio View:</strong> This section expands beyond only five tenders and reflects the selected reporting duration so the snapshot feels aligned with the report scope.
    </div>
  </section>

  <section>
    <h2>Top 10 Clients by Pipeline Value</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 40%;">Client Name</th>
          <th>Opportunities</th>
          <th>Submitted Value</th>
          <th>Ranking</th>
        </tr>
      </thead>
      <tbody>
      ${r.map((p,O)=>`<tr>
        <td><strong>${d(p.name)}</strong></td>
        <td>${d(p.count)}</td>
        <td class="highlight">$${d((p.value/1e6).toFixed(2))}M</td>
        <td>#${O+1}</td>
      </tr>`).join("")}
      </tbody>
    </table>

    <div class="summary-box">
      <strong>🎯 Client Strategy:</strong> Your top client <span class="highlight">${d(((j=r[0])==null?void 0:j.name)||"N/A")}</span> represents significant opportunity. Develop targeted engagement strategies for top 5 clients to maximize revenue potential.
    </div>
  </section>

  <footer>
    <p>This report is generated automatically from your Sales Pipeline Management System.</p>
    <p>For data accuracy and strategic questions, please contact your Sales Operations team.</p>
    <p style="margin-top: 10px; font-size: 11px; opacity: 0.7;">© ${new Date().getFullYear()} Sales Intelligence Report</p>
  </footer>
</div>
</body>
</html>`}function xn({data:t,filters:s}){const[a,n]=f.useState(!1),[i,r]=f.useState(!1),[o,d]=f.useState("90d"),{token:c}=dt(),x=f.useMemo(()=>cn(t,o),[t,o]),y=f.useMemo(()=>dn(o),[o]),h=()=>{const m=new Blob([pn(s,x,y)],{type:"text/html;charset=utf-8"}),N=URL.createObjectURL(m),C=document.createElement("a"),j=new Date().toISOString().slice(0,10);C.href=N,C.download=`sales-analytics-report-${j}.html`,document.body.appendChild(C),C.click(),C.remove(),URL.revokeObjectURL(N),n(!1)},b=async()=>{try{if(!c)throw new Error("Missing session token");r(!0);const m=await fetch(`${an}/generate-report`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+c},body:JSON.stringify({data:x,filters:s,reportMeta:y})});if(!m.ok)throw new Error("Failed to generate Word document");const N=await m.blob(),C=URL.createObjectURL(N),j=document.createElement("a"),p=new Date().toISOString().slice(0,10);j.href=C,j.download=`sales-analytics-report-${p}.docx`,document.body.appendChild(j),j.click(),j.remove(),URL.revokeObjectURL(C),n(!1)}catch(m){console.error("Error generating Word document:",m),alert("Failed to generate Word document. Please try again.")}finally{r(!1)}};return e.jsxs(e.Fragment,{children:[e.jsxs(fe,{className:"gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg hover:from-blue-700 hover:to-blue-800",onClick:()=>n(!0),children:[e.jsx(Ct,{className:"h-4 w-4"}),"Report"]}),e.jsx(ut,{open:a,onOpenChange:n,children:e.jsxs(mt,{className:"w-[calc(100vw-2rem)] max-w-xl",children:[e.jsxs(ht,{children:[e.jsx(pt,{children:"Generate sales report"}),e.jsx(Xt,{children:"Choose the report duration first. The report uses your current dashboard filters and then applies the selected time window on top."})]}),e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"rounded-lg border bg-slate-50 p-4",children:[e.jsx("p",{className:"text-sm font-medium text-slate-900",children:"Report duration"}),e.jsx("p",{className:"mt-1 text-sm text-slate-600",children:"Based on RFP Received date where available."})]}),e.jsx(ws,{value:o,onValueChange:m=>d(m),className:"gap-3",children:Ee.map(m=>e.jsxs("label",{htmlFor:`report-duration-${m.key}`,className:"flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/40",children:[e.jsx(Ns,{id:`report-duration-${m.key}`,value:m.key}),e.jsxs("div",{className:"space-y-1",children:[e.jsx(Js,{htmlFor:`report-duration-${m.key}`,className:"cursor-pointer text-sm font-medium",children:m.label}),e.jsx("p",{className:"text-sm text-muted-foreground",children:m.description})]})]},m.key))}),e.jsxs("div",{className:"rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900",children:[e.jsx("div",{className:"font-medium",children:"Selected window"}),e.jsxs("div",{className:"mt-1",children:[y.label," • ",y.rangeLabel]}),e.jsxs("div",{className:"mt-1",children:[x.length," opportunit",x.length===1?"y":"ies"," included after applying the time window."]})]})]}),e.jsxs(Zs,{children:[e.jsx(fe,{type:"button",variant:"outline",onClick:()=>n(!1),children:"Cancel"}),e.jsxs(fe,{type:"button",variant:"outline",onClick:h,disabled:!x.length,children:[e.jsx(Ct,{className:"mr-2 h-4 w-4"}),"HTML Report"]}),e.jsx(fe,{type:"button",onClick:b,loading:i,disabled:!x.length,children:"Word Report"})]})]})})]})}const gn="/api",It=t=>t>=1e6?`AED ${(t/1e6).toFixed(1)}M`:t>=1e3?`AED ${(t/1e3).toFixed(0)}K`:`AED ${t.toLocaleString()}`;function fn({showForAllUsers:t,onToggleShowForAll:s}){const{token:a,isMaster:n}=dt(),[i,r]=f.useState("year"),[o,d]=f.useState(null),[c,x]=f.useState(!1),[y,h]=f.useState(!1),b=f.useCallback(async()=>{if(a){x(!0);try{const m=await fetch(`${gn}/opportunities/top-performer?period=${i}`,{headers:{Authorization:`Bearer ${a}`}});if(!m.ok)return;const N=await m.json();d(N.topPerformer||null)}catch{}finally{x(!1)}}},[a,i]);return f.useEffect(()=>{b()},[b]),e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-slate-100",children:[e.jsxs("div",{className:"flex items-center gap-2.5",children:[e.jsx(Jt,{className:"h-4 w-4 text-amber-500 shrink-0"}),e.jsx("span",{className:"font-semibold text-slate-800 text-sm",children:"Top Performer"}),e.jsxs("div",{className:"flex rounded-full border border-slate-200 overflow-hidden text-xs",children:[e.jsx("button",{onClick:()=>r("year"),className:`px-2.5 py-0.5 transition-colors ${i==="year"?"bg-slate-800 text-white":"text-slate-500 hover:bg-slate-50"}`,children:"This Year"}),e.jsx("button",{onClick:()=>r("all"),className:`px-2.5 py-0.5 transition-colors ${i==="all"?"bg-slate-800 text-white":"text-slate-500 hover:bg-slate-50"}`,children:"All Time"})]})]}),n&&s&&e.jsxs(ea,{children:[e.jsx(ta,{asChild:!0,children:e.jsx(fe,{variant:"ghost",size:"icon",className:"h-7 w-7 text-slate-400 hover:text-slate-700",onClick:()=>s(!t),children:t?e.jsx(sa,{className:"h-4 w-4"}):e.jsx(aa,{className:"h-4 w-4"})})}),e.jsx(na,{children:t?"Visible to all users — click to restrict to Master only":"Master only — click to show for all users"})]})]}),e.jsxs("div",{className:"px-5 py-4",children:[c&&e.jsx("p",{className:"text-sm text-slate-400 animate-pulse",children:"Computing…"}),!c&&!o&&e.jsxs("p",{className:"text-sm text-slate-400",children:["No awarded tenders found ",i==="year"?"this year":"in the database","."]}),!c&&o&&e.jsxs("div",{className:"flex items-center justify-between gap-4",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-lg font-bold text-slate-900 leading-tight",children:o.name}),e.jsxs("p",{className:"text-sm text-slate-500 mt-0.5",children:[o.count," awarded tender",o.count!==1?"s":"",o.totalValue>0&&e.jsxs("span",{children:[" · ",It(o.totalValue)]})]})]}),e.jsx(fe,{variant:"outline",size:"sm",onClick:()=>h(!0),className:"shrink-0",children:"View Tenders"})]})]})]}),e.jsx(ut,{open:y,onOpenChange:h,children:e.jsxs(mt,{className:"max-w-3xl",children:[e.jsx(ht,{children:e.jsxs(pt,{children:[o==null?void 0:o.name," — Awarded Tenders (",i==="year"?"This Year":"All Time",")"]})}),e.jsx("div",{className:"overflow-x-auto max-h-[60vh] overflow-y-auto",children:e.jsxs(ss,{children:[e.jsx(as,{children:e.jsxs(Ce,{children:[e.jsx(re,{children:"Ref No"}),e.jsx(re,{children:"Tender Name"}),e.jsx(re,{children:"Client"}),e.jsx(re,{children:"Awarded Date"}),e.jsx(re,{className:"text-right",children:"Value"})]})}),e.jsx(ns,{children:((o==null?void 0:o.tenders)||[]).map((m,N)=>e.jsxs(Ce,{children:[e.jsx(se,{className:"font-mono text-xs",children:m.opportunityRefNo||"—"}),e.jsx(se,{className:"text-sm",children:m.tenderName||"—"}),e.jsx(se,{className:"text-sm",children:m.clientName||"—"}),e.jsx(se,{className:"text-sm",children:m.awardedDate||"—"}),e.jsx(se,{className:"text-right text-sm",children:m.value>0?It(m.value):"—"})]},N))})]})})]})})]})}const B=t=>String(t||"").trim(),js=t=>B(t).toUpperCase(),vn=t=>B(t).replace(/\s+/g," ").toLowerCase(),bn=t=>{const s=js(t);if(!s)return"";const[a=""]=s.split(/[_\s]+/,1);return a},yn=t=>/_EOI$/i.test(js(t)),Rs=t=>M(t)==="HOLD / CLOSED",Mt=t=>{const s=Number(t.opportunityValue||0),a=Number(t.frameworkTotalValue),n=Number(t.callOffActualValue),i=Number(t.variationDeltaValue||0);return Number.isFinite(n)?n:Number.isFinite(a)?a+(Number.isFinite(i)?i:0):s+(Number.isFinite(i)?i:0)},ae=t=>{if(!t)return"tender";const s=B(t.opportunityClassification).toUpperCase();return s==="TENDER"?"tender":s.includes("EOI")||yn(t.opportunityRefNo)?"eoi":"tender"},wn=t=>{const s=t.map(a=>M(P(a)));return s.includes("AWARDED")?"AWARDED":s.includes("LOST")?"LOST":s.includes("SUBMITTED")?"SUBMITTED":s.includes("REGRETTED")?"REGRETTED":s.some(a=>Rs(a))?"HOLD / CLOSED":"OTHER"},Nn=(t,s)=>{if(!t.length)return null;const a=t.find(i=>M(P(i))===s);if(a)return a;const n=i=>{const r=M(P(i));return r==="AWARDED"?6:r==="LOST"?5:r==="SUBMITTED"?4:r==="REGRETTED"?3:Rs(r)?2:1};return[...t].sort((i,r)=>n(r)-n(i))[0]},Ve=t=>{const s=t.map((c,x)=>({opp:c,index:x,baseRef:bn(c.opportunityRefNo),cleanTenderName:vn(c.tenderName)})),a=new Map;s.forEach(c=>{var x;!c.cleanTenderName||!c.baseRef||(a.has(c.cleanTenderName)||a.set(c.cleanTenderName,new Set),(x=a.get(c.cleanTenderName))==null||x.add(c.baseRef))});const n=new Map;s.forEach(c=>{var b;const x=c.cleanTenderName&&((b=a.get(c.cleanTenderName))==null?void 0:b.size)||0,y=c.baseRef?c.cleanTenderName&&x>1?`name::${c.cleanTenderName}`:`ref::${c.baseRef}`:c.cleanTenderName?`name::${c.cleanTenderName}`:`fallback::${c.opp.id||c.index}`,h=n.get(y)||[];h.push({opp:c.opp,index:c.index}),n.set(y,h)});const i=[],r=Array.from(n.entries()).map(([c,x])=>{const h=[...x].sort((p,O)=>p.index-O.index).map(p=>p.opp),b=wn(h),m=Nn(h,b);m&&h.forEach(p=>{p!==m&&i.push({omitted:p,kept:m,reason:"duplicate_project_grouping"})});const N=h.filter(p=>ae(p)==="tender"),C=N.filter(p=>M(P(p))==="AWARDED"),j=C.length?Math.max(...C.map(p=>Number(p.opportunityValue||0))):0;return{key:c,items:h,primary:m,status:b,hasTender:h.some(p=>ae(p)==="tender"),hasEoi:h.some(p=>ae(p)==="eoi"),hasSubmissionNear:N.some(p=>zt(p,10)),hasSubmittedSignal:N.some(p=>{const O=M(P(p));return O==="SUBMITTED"||O==="AWARDED"||O==="LOST"}),awardedValue:j}}),o=r.filter(c=>c.hasTender).length,d=r.filter(c=>c.hasEoi).length;return{groups:r,totalTenders:o,totalEoi:d,duplicateOmissions:i}},de=(t,s)=>{switch(t){case"received":return{...s,statuses:[],showAtRisk:!1,excludeLostOutcomes:!1};case"submitted":return{...s,statuses:["SUBMITTED","AWARDED","LOST"],showAtRisk:!1,excludeLostOutcomes:!1};case"won":case"value":return{...s,statuses:["AWARDED"],showAtRisk:!1,excludeLostOutcomes:!1};case"lost":return{...s,statuses:["LOST"],showAtRisk:!1,excludeLostOutcomes:!1};case"regretted":return{...s,statuses:["REGRETTED"],showAtRisk:!1,excludeLostOutcomes:!1};case"hold":return{...s,statuses:["HOLD / CLOSED"],showAtRisk:!1,excludeLostOutcomes:!1};case"submission":return{...s,statuses:[],showAtRisk:!0,excludeLostOutcomes:!1};case"winRatio":return{...s,statuses:["AWARDED","LOST"],showAtRisk:!1,excludeLostOutcomes:!1};default:return s}},Qe=(t,s)=>({...de(t,s),statuses:[],showAtRisk:!1}),Pt=(t,s)=>{if(t==="received")return{included:!0,reason:"included: unique project in received scope"};if(t==="submitted"){const i=s.items.filter(h=>ae(h)==="tender");if(!i.length)return{included:!1,reason:"excluded: project has no tender rows (EOI-only project)"};const r=i.map(h=>M(P(h))).filter(Boolean),o=r.reduce((h,b)=>(h[b]=(h[b]||0)+1,h),{}),d=r.includes("SUBMITTED"),c=r.includes("AWARDED"),x=r.includes("LOST");return d||c||x?{included:!0,reason:`included: ${[d?"has SUBMITTED tender row":"",c?"has AWARDED tender row":"",x?"has LOST tender row":""].filter(Boolean).join(", ")}`}:r.length===0?{included:!1,reason:"excluded: tender rows have no status values"}:{included:!1,reason:`excluded: tender status set contains no SUBMITTED/AWARDED/LOST (found ${Object.entries(o).sort((h,b)=>b[1]-h[1]||h[0].localeCompare(b[0])).slice(0,5).map(([h,b])=>`${h}:${b}`).join(", ")||"none"})`}}if(t==="submission")return s.hasSubmissionNear?{included:!0,reason:"included: project has tender submission within 10 days"}:{included:!1,reason:"excluded: no tender submission within 10 days for project"};if(t==="winRatio")return s.status==="AWARDED"||s.status==="LOST"?{included:!0,reason:"included: project has resolved result (awarded/lost)"}:{included:!1,reason:"excluded: project not resolved to awarded/lost"};const n=t==="value"?"AWARDED":{regretted:"REGRETTED",hold:"HOLD / CLOSED",won:"AWARDED",lost:"LOST"}[t];return s.status!==n?{included:!1,reason:`excluded: project status is ${s.status}, expected ${n}`}:{included:!0,reason:`included: project status matched ${n}`}},Z=(t,s,a,n,i)=>({id:String(t.id||`${t.opportunityRefNo}-${t.tenderName}`),refNo:B(t.opportunityRefNo),tenderName:B(t.tenderName),clientName:B(t.clientName),journeyType:ae(t),status:M(P(t)),effectiveValue:Mt(t),rawValue:Number(t.opportunityValue||0),reasonCode:s,reason:a,reasonMeta:n,replacement:i?{id:String(i.id||`${i.opportunityRefNo}-${i.tenderName}`),refNo:B(i.opportunityRefNo),tenderName:B(i.tenderName),status:M(P(i)),effectiveValue:Mt(i),rawValue:Number(i.opportunityValue||0)}:void 0}),Ft=(t,s)=>{const a=String(s.search||"").trim();if(a){const r=a.toLowerCase();if(!ga(t).includes(r))return{reasonCode:"F.SEARCH",reason:"excluded: search filter did not match row text",reasonMeta:{search:a}}}if(s.statuses.length>0){const r=M(P(t));if(!s.statuses.some(d=>r===M(d)))return{reasonCode:"F.STATUS",reason:"excluded: status filter mismatch",reasonMeta:{statuses:s.statuses,displayStatus:r,canonicalStage:t.canonicalStage,tenderResult:t.tenderResult,avenirStatus:t.avenirStatus,rawAvenirStatus:t.rawAvenirStatus,note:"Filter uses getDisplayStatus() (avenirStatus AWARDED overrides everything; otherwise tenderResult wins; otherwise canonicalStage)."}}}if(s.excludeLostOutcomes&&M(P(t))==="LOST")return{reasonCode:"F.EXCLUDE_LOST",reason:"excluded: exclude-lost-outcomes enabled",reasonMeta:{displayStatus:M(P(t)),tenderResult:t.tenderResult,avenirStatus:t.avenirStatus,canonicalStage:t.canonicalStage}};if(s.groups.length>0&&!s.groups.includes(t.groupClassification))return{reasonCode:"F.GROUP",reason:"excluded: group not in selected groups",reasonMeta:{groups:s.groups,group:t.groupClassification}};if(s.leads.length>0){const r=c=>c.trim().toLowerCase(),o=r(String(t.internalLead||""));if(!new Set(s.leads.map(c=>r(c))).has(o))return{reasonCode:"F.LEAD",reason:"excluded: lead not in selected leads",reasonMeta:{leads:s.leads,lead:t.internalLead}}}if(s.clients.length>0){const r=c=>c.trim().toLowerCase(),o=r(String(t.clientName||""));if(!new Set(s.clients.map(c=>r(c))).has(o))return{reasonCode:"F.CLIENT",reason:"excluded: client not in selected clients",reasonMeta:{clients:s.clients,client:t.clientName}}}if(s.clientTypes.length>0&&!s.clientTypes.includes(t.clientType))return{reasonCode:"F.CLIENT_TYPE",reason:"excluded: client type not selected",reasonMeta:{clientTypes:s.clientTypes,clientType:t.clientType}};if(s.qualificationStatuses.length>0&&!s.qualificationStatuses.includes(t.qualificationStatus))return{reasonCode:"F.QUAL",reason:"excluded: qualification status not selected",reasonMeta:{qualificationStatuses:s.qualificationStatuses,qualificationStatus:t.qualificationStatus}};if(s.partnerInvolvement==="yes"&&!t.partnerInvolvement)return{reasonCode:"F.PARTNER",reason:"excluded: partner involvement required (yes)",reasonMeta:{partnerInvolvement:"yes"}};if(s.partnerInvolvement==="no"&&t.partnerInvolvement)return{reasonCode:"F.PARTNER",reason:"excluded: partner involvement required (no)",reasonMeta:{partnerInvolvement:"no"}};const i=t.awardedDate||t.tenderSubmittedDate||t.tenderPlannedSubmissionDate||t.dateTenderReceived||"";if(s.dateRange.from||s.dateRange.to){if(!i)return{reasonCode:"F.DATE",reason:"excluded: date range active but row has no date",reasonMeta:{dateFieldValue:""}};const r=new Date(i);if(Number.isNaN(r.getTime()))return{reasonCode:"F.DATE",reason:"excluded: invalid date value for date range",reasonMeta:{dateFieldValue:i}};if(s.dateRange.from&&r<s.dateRange.from)return{reasonCode:"F.DATE",reason:"excluded: date before range start",reasonMeta:{dateFieldValue:i,from:s.dateRange.from.toISOString()}};if(s.dateRange.to&&r>s.dateRange.to)return{reasonCode:"F.DATE",reason:"excluded: date after range end",reasonMeta:{dateFieldValue:i,to:s.dateRange.to.toISOString()}}}return s.valueRange.min!==void 0&&t.opportunityValue<s.valueRange.min?{reasonCode:"F.VALUE_MIN",reason:"excluded: opportunity value below minimum",reasonMeta:{min:s.valueRange.min,value:t.opportunityValue}}:s.valueRange.max!==void 0&&t.opportunityValue>s.valueRange.max?{reasonCode:"F.VALUE_MAX",reason:"excluded: opportunity value above maximum",reasonMeta:{max:s.valueRange.max,value:t.opportunityValue}}:s.showAtRisk&&!t.isAtRisk?{reasonCode:"F.AT_RISK",reason:"excluded: at-risk filter enabled and row is not at risk",reasonMeta:{isAtRisk:t.isAtRisk}}:s.showMissDeadline&&!t.willMissDeadline?{reasonCode:"F.MISS_DEADLINE",reason:"excluded: miss-deadline filter enabled and row does not miss deadline",reasonMeta:{willMissDeadline:t.willMissDeadline}}:{reasonCode:"F.UNKNOWN",reason:"excluded: did not satisfy active filters",reasonMeta:{}}},Vt=t=>new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:t>=1e3?1:0}).format(t||0),_e="kpi-diagnostics:",_t=2500,jn=()=>{try{const t=[];for(let s=0;s<localStorage.length;s+=1){const a=localStorage.key(s);if(!a||!a.startsWith(_e))continue;const n=Number(a.slice(_e.length).split("-")[0]||0);t.push({key:a,ts:n})}t.sort((s,a)=>s.ts-a.ts),t.slice(0,Math.max(0,t.length-6)).forEach(({key:s})=>localStorage.removeItem(s))}catch{}},Rn=t=>{const s=t.included.slice(0,_t),a=t.omitted.slice(0,_t);return{...t,included:s,omitted:a}},qe=(t,s)=>{const a=`${_e}${t}`;jn();try{localStorage.setItem(a,JSON.stringify(s));return}catch{}try{for(let i=localStorage.length-1;i>=0;i--){const r=localStorage.key(i);r!=null&&r.startsWith(_e)&&localStorage.removeItem(r)}const n=Rn(s);n.truncated=!0,localStorage.setItem(a,JSON.stringify(n))}catch{}},ar=()=>{const{opportunities:t,isLoading:s,error:a,lastSyncTime:n,isLiveRefreshActive:i}=ra(),{status:r}=la(),{isMaster:o,token:d}=dt(),{formatCurrency:c,currency:x,convertValue:y}=Gt(),h=Kt(),[b,m]=f.useState(null),{data:N}=Ua({queryKey:["telecast-config"],queryFn:async()=>{const l=await fetch("/api/telecast/config",{headers:{Authorization:`Bearer ${d}`}});return l.ok?l.json():null},enabled:!!d,staleTime:5*60*1e3,gcTime:10*60*1e3}),C=!!(N!=null&&N.topPerformerCardVisible),j=async l=>{if(!(!d||!o))try{await fetch("/api/telecast/config",{method:"POST",headers:{Authorization:`Bearer ${d}`,"Content-Type":"application/json"},body:JSON.stringify({topPerformerCardVisible:l})}),await h.invalidateQueries({queryKey:["telecast-config"]})}catch{}},[p,O]=f.useState(Et),[ce,pe]=f.useState(!1),[xe,Ie]=f.useState([]),ft=f.useRef({count:0,timer:null}),k=f.useMemo(()=>Pe(t,p),[t,p]),Me=f.useMemo(()=>es(k),[k]),H=f.useMemo(()=>ts(k.filter(l=>M(P(l))==="AWARDED")),[k]),ge=f.useMemo(()=>Na(k),[k]),W=f.useMemo(()=>Ve(k),[k]),q=f.useMemo(()=>k.filter(l=>M(P(l))==="AWARDED"),[k]),We=f.useMemo(()=>k.filter(l=>M(P(l))==="LOST"),[k]),vt=f.useMemo(()=>q.reduce((l,g)=>{const v=Number(g.opportunityValue||0);return!Number.isFinite(v)||v<=0?l:l+v},0),[q]),Y=f.useMemo(()=>{const l=[...W.groups],g=l.filter(R=>R.hasSubmittedSignal),v=l.filter(R=>R.status==="REGRETTED"),I=l.filter(R=>R.status==="AWARDED"),T=l.filter(R=>R.status==="HOLD / CLOSED"),_=l.filter(R=>R.status==="LOST"),w=l.filter(R=>R.hasSubmissionNear);l.filter(R=>R.status==="AWARDED"||R.status==="LOST");const K=R=>R.map(E=>E.primary).filter(Boolean),X=R=>R.reduce((E,J)=>E+Number(J.awardedValue||0),0),ne=g.reduce((R,E)=>{const J=E.primary;return R+Number((J==null?void 0:J.opportunityValue)||0)},0),D=g.filter(R=>R.hasTender).length,$=g.filter(R=>R.hasEoi).length,F=q.length+We.length,te=F?q.length/F:0;return{received:{groups:l,rows:K(l),tender:W.totalTenders,eoi:W.totalEoi},submitted:{groups:g,rows:K(g),submittedOnlyValue:ne,tender:D,eoi:$},regretted:{groups:v,rows:K(v)},hold:{groups:T,rows:K(T)},won:{groups:I,rows:K(I),value:X(I)},lost:{groups:_,rows:K(_)},submission:{groups:w,rows:K(w)},winRatio:{resolvedCount:q.length+We.length,wonCount:q.length,ratio:te}}},[W,q.length,We.length]),bt={totalTenders:Y.received.tender,totalEoi:Y.received.eoi},Ss=f.useMemo(()=>{const l={};return W.duplicateOmissions.forEach(({kept:g,omitted:v,reason:I})=>{const T=String(g.id||`${g.opportunityRefNo}-${g.tenderName}`);l[T]||(l[T]={kept:{id:T,refNo:B(g.opportunityRefNo),tenderName:B(g.tenderName),clientName:B(g.clientName),status:M(P(g)),reason:"primary row kept for canonical project"},omitted:[]}),l[T].omitted.push({id:String(v.id||`${v.opportunityRefNo}-${v.tenderName}`),refNo:B(v.opportunityRefNo),tenderName:B(v.tenderName),clientName:B(v.clientName),status:M(P(v)),reason:I==="duplicate_project_grouping"?"merged under canonical project key (base ref + clean tender name)":"merged under canonical project key"})}),l},[W]),Ds=f.useMemo(()=>{const l=[];return W.groups.forEach(g=>{if(g.status!=="AWARDED")return;const v=g.items.filter(w=>ae(w)==="tender").filter(w=>M(P(w))==="AWARDED").map(w=>({id:String(w.id||`${w.opportunityRefNo}-${w.tenderName}`),refNo:B(w.opportunityRefNo),clientName:B(w.clientName),value:Number(w.opportunityValue||0)})).filter(w=>Number.isFinite(w.value)&&w.value>0);if(v.length<=1)return;const I=Math.max(...v.map(w=>w.value)),T=v.find(w=>w.value===I)||null,_=T?v.filter(w=>w.id!==T.id):v;_.length&&l.push({projectKey:g.key,counted:T,notCounted:_})}),l.sort((g,v)=>v.notCounted.length-g.notCounted.length||g.projectKey.localeCompare(v.projectKey)),l},[W.groups]),Cs=()=>{const l=ft.current;if(l.count+=1,l.timer&&window.clearTimeout(l.timer),l.timer=window.setTimeout(()=>{l.count=0,l.timer=null},700),l.count>=3){l.count=0,l.timer&&window.clearTimeout(l.timer),l.timer=null,Ie(Ds),pe(!0);return}const g=de("won",p);O(g)},Es=(l,g)=>{const v=Qe(l,g),I=Pe(t,v),T=Ve(I),_=[],w=[];T.groups.forEach(D=>{var te;const $=D.primary||D.items[0];if(!$)return;const F=Pt(l,D);if(F.included?_.push(Z($,"K.INCLUDED",F.reason)):w.push(Z($,"K.EXCLUDED",F.reason)),l==="value"&&D.status==="AWARDED"){const R=D.items.filter(E=>ae(E)==="tender").filter(E=>M(P(E))==="AWARDED").map(E=>({opp:E,rawValue:Number(E.opportunityValue||0)})).filter(({rawValue:E})=>Number.isFinite(E)&&E>0);if(R.length>1){const E=Math.max(...R.map(({rawValue:z})=>z)),J=((te=R.find(({rawValue:z})=>z==E))==null?void 0:te.opp)||null;(J?R.filter(({opp:z})=>z!==J):R).forEach(({opp:z})=>{w.push(Z(z,"K.VALUE_NOT_COUNTED","excluded: AWARDED row not counted in value KPI (project group uses max awarded value)",{projectKey:D.key,countedValue:E},J||void 0))})}}}),T.duplicateOmissions.forEach(({omitted:D,kept:$,reason:F})=>{w.push(Z(D,"K.DEDUPE_MERGED",F==="duplicate_project_grouping"?"excluded: merged into canonical project key (base ref/tender-name grouping)":"excluded: merged into canonical project key",void 0,$))});const K=new Set(I.map(D=>String(D.id)));t.forEach(D=>{if(K.has(String(D.id)))return;const $=Ft(D,v);w.push(Z(D,$.reasonCode,$.reason,$.reasonMeta))});const X=`${Date.now()}-${Math.random().toString(36).slice(2,9)}`,ne={reportId:X,generatedAt:new Date().toISOString(),kpiType:l,appliedFilters:{statuses:g.statuses,showAtRisk:g.showAtRisk,excludeLostOutcomes:g.excludeLostOutcomes},counts:{sourceRows:t.length,preKpiScopedRows:I.length,includedRows:_.length,omittedRows:w.length},included:_,omitted:w};qe(X,ne),window.open(`/kpi-diagnostics?report=${encodeURIComponent(X)}`,"_blank","noopener,noreferrer")},As=(l,g)=>{const v=l==="value"?de("value",g):Qe(l,g),I=Pe(t,v),T=Ve(I),_=[],w=[];T.groups.forEach(D=>{var te;const $=D.primary||D.items[0];if(!$)return;const F=Pt(l,D);if(F.included?_.push(Z($,"K.INCLUDED",F.reason)):w.push(Z($,"K.EXCLUDED",F.reason)),l==="value"&&D.status==="AWARDED"){const R=D.items.filter(E=>ae(E)==="tender").filter(E=>M(P(E))==="AWARDED").map(E=>({opp:E,rawValue:Number(E.opportunityValue||0)})).filter(({rawValue:E})=>Number.isFinite(E)&&E>0);if(R.length>1){const E=Math.max(...R.map(({rawValue:z})=>z)),J=((te=R.find(({rawValue:z})=>z==E))==null?void 0:te.opp)||null;(J?R.filter(({opp:z})=>z!==J):R).forEach(({opp:z})=>{w.push(Z(z,"K.VALUE_NOT_COUNTED","excluded: AWARDED row not counted in value KPI (project group uses max awarded value)",{projectKey:D.key,countedValue:E},J||void 0))})}}}),T.duplicateOmissions.forEach(({omitted:D,kept:$,reason:F})=>{w.push(Z(D,"K.DEDUPE_MERGED",F==="duplicate_project_grouping"?"excluded: merged into canonical project key (base ref/tender-name grouping)":"excluded: merged into canonical project key",void 0,$))});const K=new Set(I.map(D=>String(D.id)));t.forEach(D=>{if(K.has(String(D.id))||l==="value"&&M(P(D))!=="AWARDED")return;const $=Ft(D,v);w.push(Z(D,$.reasonCode,$.reason,$.reasonMeta))});const X=`${Date.now()}-${Math.random().toString(36).slice(2,9)}`,ne={reportId:X,generatedAt:new Date().toISOString(),kpiType:l,appliedFilters:{statuses:g.statuses,showAtRisk:g.showAtRisk,excludeLostOutcomes:g.excludeLostOutcomes},counts:{sourceRows:t.length,preKpiScopedRows:I.length,includedRows:_.length,omittedRows:w.length},included:_,omitted:w};qe(X,ne),window.open(`/kpi-diagnostics?report=${encodeURIComponent(X)}&view=omitted`,"_blank","noopener,noreferrer")},yt=(l,g,v)=>{const T=Qe(l,v),_=Pe(t,T),w=Ve(_),K=[],X=[];w.groups.forEach($=>{const F=$.primary||$.items[0];F&&ae(F)===g&&K.push(Z(F,"K.INCLUDED",`included: counted in deduped ${l} ${g} total (primary row kept for project group)`))}),w.duplicateOmissions.forEach(({omitted:$,kept:F,reason:te})=>{ae($)===g&&X.push(Z($,"K.DEDUPE_MERGED",te==="duplicate_project_grouping"?`excluded: merged into canonical project key (counts in ${l} ${g} total)`:`excluded: merged into canonical project key (counts in ${l} ${g} total)`,{section:l,journeyType:g,dedupeReason:te},F))});const ne=`${Date.now()}-${Math.random().toString(36).slice(2,9)}`,D={reportId:ne,generatedAt:new Date().toISOString(),kpiType:`${l}:${g}`,appliedFilters:{statuses:v.statuses,showAtRisk:v.showAtRisk,excludeLostOutcomes:v.excludeLostOutcomes},counts:{sourceRows:t.length,preKpiScopedRows:_.length,includedRows:K.length,omittedRows:X.length},included:K,omitted:X};qe(ne,D),window.open(`/kpi-diagnostics?report=${encodeURIComponent(ne)}&view=omitted`,"_blank","noopener,noreferrer")},Ke=l=>{const g=de(l,p);O(g)},Ts=l=>{const g=de(l,p);if(l==="value"){As(l,g);return}Es(l,g)},ks=l=>{O(g=>({...g,statuses:[l]}))};if(s)return e.jsxs("div",{className:"space-y-6 p-4",children:[e.jsx("div",{className:"grid grid-cols-2 gap-4 sm:grid-cols-4",children:[1,2,3,4].map(l=>e.jsxs("div",{className:"rounded-lg border bg-card p-4 space-y-2",children:[e.jsx(Ne,{className:"h-3 w-1/2 rounded"}),e.jsx(Ne,{className:"h-8 w-3/4 rounded"})]},l))}),e.jsxs("div",{className:"grid grid-cols-1 gap-4 lg:grid-cols-2",children:[e.jsx(Ne,{className:"h-64 rounded-lg"}),e.jsx(Ne,{className:"h-64 rounded-lg"})]}),e.jsx(Ne,{className:"h-80 rounded-lg"})]});if(a||t.length===0)return e.jsx("div",{className:"space-y-4",children:e.jsxs(ia,{variant:"destructive",children:[e.jsx(Ze,{className:"h-4 w-4"}),e.jsxs(oa,{children:[e.jsx("strong",{children:"No Data Available"}),e.jsx("br",{}),a||"No opportunities found in MongoDB.",e.jsx("br",{}),e.jsx("br",{}),e.jsx("strong",{children:"Next Steps:"}),e.jsxs("ol",{className:"list-decimal list-inside mt-2 space-y-1",children:[e.jsx("li",{children:"Go to Master Panel (/master)"}),e.jsx("li",{children:'Upload the latest Excel sheet under "Sheet Upload"'}),e.jsx("li",{children:"Wait for data to load"})]})]})]})});const $s=[{label:"Regretted",value:Y.regretted.groups.length,tone:"text-muted-foreground",glow:"analytics-kpi-glow-amber",icon:da,type:"regretted"},{label:"Hold / Closed",value:Y.hold.groups.length,tone:"text-amber-600",glow:"analytics-kpi-glow-amber",icon:ua,type:"hold"},{label:"Won",value:q.length,tone:"text-emerald-600",glow:"analytics-kpi-glow-emerald",icon:Jt,type:"won"},{label:"Value",value:vt,displayValue:`${x==="AED"?"":"$"}${Vt(y(vt))}`,valuePrefix:x==="AED"?"aed":"text",tone:"text-violet-600",glow:"analytics-kpi-glow-emerald",icon:Fe,chip:"Awarded only",type:"value"},{label:"Lost",value:Y.lost.groups.length,tone:"text-rose-600",glow:"analytics-kpi-glow-rose",icon:ja,type:"lost"},{label:"Submission Near",value:Y.submission.groups.length,tone:"text-orange-600",glow:"analytics-kpi-glow-amber",icon:ma,type:"submission"},{label:"Win Ratio",value:`${Math.round(Y.winRatio.ratio*100)}%`,chip:`Won ${Y.winRatio.wonCount} / Resolved ${Y.winRatio.resolvedCount}`,tone:"text-emerald-700",glow:"analytics-kpi-glow-emerald",icon:Fe,type:"winRatio"}],Os=[{label:"Total Tender",value:bt.totalTenders,tone:"text-sky-600",glow:"analytics-kpi-glow-sky",icon:Fe},{label:"Total EOI",value:bt.totalEoi,tone:"text-amber-600",glow:"analytics-kpi-glow-amber",icon:Fe}],Ls=[{label:"Total Tender",value:Y.submitted.tender,tone:"text-sky-600",glow:"analytics-kpi-glow-sky",icon:Tt},{label:"Total EOI",value:Y.submitted.eoi,tone:"text-amber-600",glow:"analytics-kpi-glow-amber",icon:Tt}];return e.jsxs(e.Fragment,{children:[e.jsx(ca,{status:r}),e.jsxs("div",{className:"space-y-4 sm:space-y-6",children:[e.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 text-xs text-muted-foreground",children:[e.jsxs("div",{className:"flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0",children:[e.jsxs("div",{children:["Last refreshed from MongoDB: ",n==null?void 0:n.toLocaleTimeString()," - ",t.length," opportunities loaded"]}),e.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[e.jsx(Ra,{className:"h-3 w-3"}),"Server auto-sync runs independently of the browser session"]})]}),e.jsx("div",{className:"text-xs",children:i?"✅ Live refresh active":"⏸️ Live refresh inactive"})]}),e.jsx("div",{className:"sticky top-14 z-40 -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",children:e.jsxs("div",{className:"flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 lg:gap-6 min-w-0",children:[e.jsx("div",{className:"flex-1 min-w-0",children:e.jsx(ha,{data:t,filters:p,onFiltersChange:O,onClearFilters:()=>O(Et)})}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0 w-full lg:w-auto",children:[e.jsx(ya,{data:k,filename:"tenders"}),e.jsx(xn,{data:k,filters:p})]})]})}),e.jsxs("section",{className:"space-y-4",children:[e.jsxs("div",{className:"grid grid-cols-1 gap-4 xl:grid-cols-2",children:[e.jsxs("div",{className:"rounded-2xl border-2 border-sky-300/80 bg-sky-50/30 p-3 shadow-[0_0_24px_rgba(56,189,248,0.18)]",children:[e.jsx("p",{className:"px-2 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700",children:"Received"}),e.jsx("div",{className:"grid grid-cols-1 gap-4 sm:grid-cols-2",children:Os.map((l,g)=>e.jsx("button",{type:"button",className:`analytics-card analytics-kpi-card ${l.glow} w-full text-left transition-transform hover:-translate-y-0.5`,style:{animationDelay:`${g*.07}s`},onClick:()=>Ke("received"),children:e.jsxs("div",{className:"relative z-10 flex items-start justify-between p-5",children:[e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("p",{className:"dash-label",children:l.label}),e.jsx("div",{className:"mt-2 analytics-kpi-number flex items-center gap-2 text-foreground",children:e.jsx("span",{children:l.value})})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[o?e.jsx("button",{type:"button",className:"rounded-lg border border-slate-200 bg-background/80 p-1 text-muted-foreground hover:text-foreground","aria-label":`Diagnose omitted rows for ${l.label}`,onClick:v=>{v.preventDefault(),v.stopPropagation();const I=l.label.toLowerCase().includes("eoi")?"eoi":"tender",T=de("received",p);yt("received",I,T)},children:e.jsx(He,{className:"h-4 w-4"})}):null,e.jsx("div",{className:`rounded-2xl border border-white/70 bg-background/80 p-2.5 shadow-sm ${l.tone}`,children:e.jsx(l.icon,{className:"h-5 w-5"})})]})]})},l.label))})]}),e.jsxs("div",{className:"rounded-2xl border-2 border-emerald-300/80 bg-emerald-50/30 p-3 shadow-[0_0_24px_rgba(16,185,129,0.18)]",children:[e.jsxs("div",{className:"flex items-center justify-between px-2 pb-2",children:[e.jsx("p",{className:"text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700",children:"Total Submitted"}),e.jsx("p",{className:"text-sm font-bold text-emerald-800",children:Y.submitted.groups.length})]}),e.jsx("div",{className:"grid grid-cols-1 gap-4 sm:grid-cols-2",children:Ls.map((l,g)=>e.jsx("button",{type:"button",className:`analytics-card analytics-kpi-card ${l.glow} w-full text-left transition-transform hover:-translate-y-0.5`,style:{animationDelay:`${g*.07}s`},onClick:()=>Ke("submitted"),children:e.jsxs("div",{className:"relative z-10 flex items-start justify-between p-5",children:[e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("p",{className:"dash-label",children:l.label}),e.jsx("div",{className:"mt-2 analytics-kpi-number flex items-center gap-2 text-foreground",children:e.jsx("span",{children:l.value})})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[o?e.jsx("button",{type:"button",className:"rounded-lg border border-slate-200 bg-background/80 p-1 text-muted-foreground hover:text-foreground","aria-label":`Diagnose omitted rows for ${l.label}`,onClick:v=>{v.preventDefault(),v.stopPropagation();const I=l.label.toLowerCase().includes("eoi")?"eoi":"tender",T=de("submitted",p);yt("submitted",I,T)},children:e.jsx(He,{className:"h-4 w-4"})}):null,e.jsx("div",{className:`rounded-2xl border border-white/70 bg-background/80 p-2.5 shadow-sm ${l.tone}`,children:e.jsx(l.icon,{className:"h-5 w-5"})})]})]})},l.label))}),e.jsxs("div",{className:"mt-2 px-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700",children:[x==="AED"?e.jsx("img",{src:Ge,alt:"AED",className:"h-3.5 w-3.5 opacity-80"}):null,e.jsx("span",{children:`${x==="AED"?"":"$"}${Vt(y(Y.submitted.submittedOnlyValue||0))}`})]})]})]}),e.jsx("div",{className:"grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",children:$s.map((l,g)=>e.jsx("button",{type:"button",className:"analytics-card analytics-kpi-card w-full text-left transition-transform hover:-translate-y-0.5",style:{animationDelay:`${g*.07}s`},onClick:()=>{if(l.type==="won"){Cs();return}Ke(l.type)},children:e.jsxs("div",{className:"relative z-10 flex items-start justify-between p-5",children:[e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("p",{className:l.emphasizeValue?"dash-label text-muted-foreground":"dash-label",children:l.label}),e.jsxs("div",{className:`mt-2 analytics-kpi-number flex items-center gap-2 ${l.emphasizeValue?"text-foreground text-5xl font-black tracking-tight leading-none":"text-foreground"}`,children:[l.valuePrefix==="aed"?e.jsx("img",{src:Ge,alt:"AED",className:"h-7 w-7"}):null,e.jsx("span",{children:l.displayValue||l.value})]}),l.secondaryDisplayValue?e.jsxs("div",{className:"mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground",children:[l.secondaryValuePrefix==="aed"?e.jsx("img",{src:Ge,alt:"AED",className:"h-3.5 w-3.5 opacity-70"}):null,e.jsx("span",{children:l.secondaryDisplayValue})]}):null,l.meta?e.jsx("div",{className:"mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground",children:l.meta.map(v=>e.jsxs("span",{className:"inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5",children:[e.jsx("span",{className:`h-2 w-2 rounded-full ${v.tone}`}),v.label," ",v.value]},v.label))}):null,l.chip?e.jsx("p",{className:"pt-1 text-[11px] text-muted-foreground",children:l.chip}):null]}),e.jsxs("div",{className:"flex flex-col items-end gap-2",children:[o?e.jsx("button",{type:"button",className:"rounded-lg border border-slate-200 bg-background/80 p-1 text-muted-foreground hover:text-foreground","aria-label":`Diagnose omitted rows for ${l.label}`,onClick:v=>{v.preventDefault(),v.stopPropagation(),Ts(l.type)},children:e.jsx(He,{className:"h-4 w-4"})}):null,e.jsx("div",{className:`rounded-2xl border border-white/70 bg-background/80 p-2.5 shadow-sm ${l.tone}`,children:e.jsx(l.icon,{className:"h-5 w-5"})})]})]})},l.label))})]}),(o||C)&&e.jsx("section",{className:"px-4 sm:px-6 lg:px-8 mt-4",children:e.jsx(fn,{showForAllUsers:C,onToggleShowForAll:o?j:void 0})}),e.jsx(ut,{open:ce,onOpenChange:pe,children:e.jsxs(mt,{className:"max-w-5xl",children:[e.jsxs(ht,{children:[e.jsx(pt,{children:"Awarded Values Not Accounted For"}),e.jsx(Xt,{children:"Triple-click on Won opens this audit. Won Value currently counts one awarded row per project (highest value). This lists the awarded rows that were excluded."})]}),e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"text-xs text-muted-foreground",children:["Projects with excluded awarded rows: ",xe.length]}),e.jsx("div",{className:"overflow-x-auto rounded-md border",children:e.jsxs(ss,{className:"text-xs",children:[e.jsx(as,{children:e.jsxs(Ce,{children:[e.jsx(re,{children:"Project Key"}),e.jsx(re,{children:"Counted Award"}),e.jsx(re,{children:"Excluded Awarded Rows"}),e.jsx(re,{className:"text-right",children:"Excluded Total"})]})}),e.jsxs(ns,{children:[xe.length===0?e.jsx(Ce,{children:e.jsx(se,{colSpan:4,className:"text-center text-muted-foreground",children:"No excluded awarded values found (each awarded project has 0-1 awarded row with value)."})}):null,xe.map(l=>{const g=l.notCounted.reduce((T,_)=>T+Number(_.value||0),0),v=l.counted?`${l.counted.refNo||"—"} | ${l.counted.clientName||"—"} | ${c(l.counted.value)}`:"—",I=l.notCounted.map(T=>`${T.refNo||"—"} | ${T.clientName||"—"} | ${c(T.value)}`).join(" || ");return e.jsxs(Ce,{children:[e.jsx(se,{className:"font-mono",children:l.projectKey}),e.jsx(se,{children:v}),e.jsx(se,{children:I}),e.jsx(se,{className:"text-right font-mono",children:g>0?c(g):"—"})]},`award-audit-${l.projectKey}`)})]})]})})]})]})}),e.jsx(pa,{data:k,searchTerm:p.search,onSelectOpportunity:m,responsiveMode:"dashboard",duplicateTraceByKeptId:Ss}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6",children:[e.jsx(Ba,{data:Me,onStageClick:ks}),e.jsx(Wa,{data:k,onSelectOpportunity:m}),e.jsx(Ka,{data:H,onClientClick:l=>{O(g=>({...g,search:g.search,clients:[l]}))}})]}),e.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6",children:[e.jsx(Ga,{data:k}),e.jsx(za,{...ge})]}),e.jsx(xa,{open:!!b,opportunity:b,onOpenChange:l=>{l||m(null)},formatCurrency:c})]})]})};export{ar as default};
