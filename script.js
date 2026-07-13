'use strict';
const $=id=>document.getElementById(id);
const CANDIDATES=[
{name:'名古屋港',prefecture:'愛知県',area:'名古屋市',type:'港',lat:35.073,lon:136.881,station:'NG'},
{name:'鈴鹿漁港',prefecture:'三重県',area:'鈴鹿市',type:'港',lat:34.840,lon:136.606,station:'G3'},
{name:'四日市港',prefecture:'三重県',area:'四日市市',type:'港',lat:34.948,lon:136.653,station:'G3'},
{name:'長良川河口',prefecture:'三重県',area:'桑名市',type:'河口',lat:35.049,lon:136.700,station:'G3'},
{name:'新舞子',prefecture:'愛知県',area:'知多市',type:'堤防',lat:34.949,lon:136.825,station:'ZD'},
{name:'赤羽根港',prefecture:'愛知県',area:'田原市',type:'港',lat:34.609,lon:137.198,station:'I4'},
{name:'伊古部海岸',prefecture:'愛知県',area:'豊橋市',type:'サーフ',lat:34.668,lon:137.437,station:'I4'},
{name:'浜名湖新居',prefecture:'静岡県',area:'湖西市',type:'海釣り公園',lat:34.690,lon:137.563,station:'I4'},
{name:'天竜川河口',prefecture:'静岡県',area:'浜松市',type:'河口',lat:34.650,lon:137.817,station:'I4'}
];
const INITIAL=CANDIDATES.map(p=>({...p}));
let points=loadPoints();
let selected=localStorage.getItem('ftbi.selected')||'四日市港';
let offset=0,weather=null,marine=null,chosen=null,mapPref='すべて',mapType='すべて',bestWindows=[];
let audioCtx=null,alarmEnabled=localStorage.getItem('ftbi.alarmEnabled')==='on';
let quakeEnabled=localStorage.getItem('ftbi.quakeAlert')!=='off';
function loadPoints(){try{const p=JSON.parse(localStorage.getItem('ftbi.points')||'null');if(Array.isArray(p)&&p.length)return p}catch(e){}return INITIAL}
function savePoints(){localStorage.setItem('ftbi.points',JSON.stringify(points))}
function point(){return points.find(p=>p.name===selected)||points[0]||INITIAL[0]}
function date(){const d=new Date();d.setDate(d.getDate()+offset);d.setHours(0,0,0,0);return d}
function ymd(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function fmtDate(d){return `${d.getMonth()+1}月${d.getDate()}日(${'日月火水木金土'[d.getDay()]})`}
function moonAge(d){const syn=29.530588853,ref=Date.UTC(2000,0,6,18,14);const days=(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),12)-ref)/86400000;return ((days%syn)+syn)%syn}
function tideType(age){if(age<1.5||age>28||(age>13.2&&age<16.2))return'大潮';if((age>=9.5&&age<10.8)||(age>=24.2&&age<25.5))return'長潮';if((age>=10.8&&age<12.2)||(age>=25.5&&age<27))return'若潮';if((age>=6.7&&age<9.5)||(age>=21.4&&age<24.2))return'小潮';return'中潮'}
function dayData(){return window.JMA_TIDE_DATA?.[point().station]?.days?.[ymd(date())]||null}

function pad2(n){return String(n).padStart(2,'0')}
function hmDate(d){return d instanceof Date&&!Number.isNaN(d.getTime())?`${pad2(d.getHours())}:${pad2(d.getMinutes())}`:'--:--'}
const RAD=Math.PI/180,DAYMS=86400000,J1970=2440588,J2000=2451545;
function toJulian(d){return d.valueOf()/DAYMS-0.5+J1970}
function fromJulian(j){return new Date((j+0.5-J1970)*DAYMS)}
function toDays(d){return toJulian(d)-J2000}
function rightAscension(l,b){const e=RAD*23.4397;return Math.atan2(Math.sin(l)*Math.cos(e)-Math.tan(b)*Math.sin(e),Math.cos(l))}
function declination(l,b){const e=RAD*23.4397;return Math.asin(Math.sin(b)*Math.cos(e)+Math.cos(b)*Math.sin(e)*Math.sin(l))}
function azimuth(H,phi,dec){return Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi))}
function altitude(H,phi,dec){return Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H))}
function siderealTime(d,lw){return RAD*(280.16+360.9856235*d)-lw}
function astroRefraction(h){if(h<0)h=0;return 0.0002967/Math.tan(h+0.00312536/(h+0.08901179))}
function moonCoords(d){const L=RAD*(218.316+13.176396*d),M=RAD*(134.963+13.064993*d),F=RAD*(93.272+13.229350*d);const l=L+RAD*6.289*Math.sin(M),b=RAD*5.128*Math.sin(F);return {ra:rightAscension(l,b),dec:declination(l,b)}}
function moonPosition(date,lat,lon){const lw=RAD*-lon,phi=RAD*lat,d=toDays(date),c=moonCoords(d),H=siderealTime(d,lw)-c.ra;let h=altitude(H,phi,c.dec);h+=astroRefraction(h);return {altitude:h,azimuth:azimuth(H,phi,c.dec)}}
function moonTimes(date,lat,lon){const t=new Date(date);t.setHours(0,0,0,0);const hc=RAD*0.133;let h0=moonPosition(t,lat,lon).altitude-hc,rise=null,set=null;for(let i=1;i<=24;i+=2){const h1=moonPosition(new Date(t.getTime()+i*3600000),lat,lon).altitude-hc,h2=moonPosition(new Date(t.getTime()+(i+1)*3600000),lat,lon).altitude-hc;const a=(h0+h2)/2-h1,b=(h2-h0)/2,xe=-b/(2*a),ye=(a*xe+b)*xe+h1,d=b*b-4*a*h1;let roots=0,x1=0,x2=0;if(d>=0){const dx=Math.sqrt(d)/(Math.abs(a)*2);x1=xe-dx;x2=xe+dx;if(Math.abs(x1)<=1)roots++;if(Math.abs(x2)<=1)roots++;if(x1<-1)x1=x2}if(roots===1){if(h0<0)rise=i+x1;else set=i+x1}else if(roots===2){rise=i+(ye<0?x2:x1);set=i+(ye<0?x1:x2)}if(rise!=null&&set!=null)break;h0=h2}const mk=x=>x==null?null:new Date(t.getTime()+x*3600000);return {rise:mk(rise),set:mk(set)}}
function hourFromIso(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.getHours()+d.getMinutes()/60}
function interp(a,h){if(!a)return null;const i=Math.max(0,Math.min(23,Math.floor(h))),j=Math.min(23,i+1),t=h-i;return a[i]*(1-t)+a[j]*t}
function svgEl(n,a={}){const e=document.createElementNS('http://www.w3.org/2000/svg',n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e}
function daylightBaseScore(h,sunrise,sunset){
  const near=(center,before,after,max)=>{const d=h-center;if(d>=-before&&d<=after)return max*(1-Math.abs(d)/(d<0?before:after));return 0};
  const dawn=near(sunrise,1.5,1.0,50), dusk=near(sunset,1.5,1.0,42);
  const night=(h<sunrise-1.5||h>sunset+1.0)?18:0;
  const day=(h>=sunrise+1&&h<=sunset-1.5)?8:0;
  return Math.max(dawn,dusk,night,day);
}
function weatherBonus(code,rain){
  if([95,96,99].includes(code))return -100;
  if([2,3,45,48].includes(code))return 10;
  if([51,53,55,61].includes(code))return 6;
  if(code===0||code===1)return 3;
  return rain>5?-10:0;
}
function calcBestWindows(d){
  if(!d||!weather||!marine)return [];
  const sunrise=hourFromIso(weather?.daily?.sunrise?.[0])??5.5;
  const sunset=hourFromIso(weather?.daily?.sunset?.[0])??18.5;
  const scores=[];
  for(let h=0;h<24;h+=0.5){
    const wind=val(weather,'wind_speed_10m',h),wave=val(marine,'wave_height',h),code=val(weather,'weather_code',h),rain=val(weather,'precipitation',h)??0;
    if(wind==null||wave==null)continue;
    const move=Math.abs(interp(d.hourly,Math.min(23,h+1))-interp(d.hourly,h));
    const tide=Math.min(25,move*1.35);
    const base=daylightBaseScore(h,sunrise,sunset);
    const wx=weatherBonus(code,rain);
    let s=base+tide+wx;
    let safety='ok';
    if(wind>15||wave>1.5||[95,96,99].includes(code))safety='danger';
    else if(wind>10||wave>1.0||wind>=8||wave>=0.8)safety='caution';
    if(safety==='danger')s-=60; else if(safety==='caution')s-=12;
    scores.push({h,s,safety});
  }
  scores.sort((a,b)=>b.s-a.s);
  const chosen=[];
  for(const c of scores){if(chosen.every(x=>Math.abs(x.h-c.h)>=4)){chosen.push(c);if(chosen.length===2)break}}
  return chosen.sort((a,b)=>a.h-b.h).map(c=>({start:Math.max(0,c.h-1),end:Math.min(24,c.h+1.5),score:Math.max(0,Math.round(c.s)),safety:c.safety}));
}
function updateWeatherWarning(){
  const el=$('weatherWarning'); if(!el)return; el.hidden=true; el.className='weatherWarning';
  if(!weather||!marine)return;
  const now=offset===0?new Date().getHours():0, end=Math.min(23,now+12);
  const winds=[],waves=[],pressures=[],codes=[];
  for(let h=now;h<=end;h++){winds.push(val(weather,'wind_speed_10m',h));waves.push(val(marine,'wave_height',h));pressures.push(val(weather,'surface_pressure',h));codes.push(val(weather,'weather_code',h))}
  const nums=a=>a.filter(Number.isFinite); const w=nums(winds),wv=nums(waves),pr=nums(pressures);
  const maxWind=w.length?Math.max(...w):null,maxWave=wv.length?Math.max(...wv):null;
  const drop=pr.length>=2?pr[0]-pr[pr.length-1]:0, minP=pr.length?Math.min(...pr):null;
  let level='',text='';
  if(codes.some(c=>[95,96,99].includes(c))){level='danger';text='⚠ 雷の可能性　釣行を中止し、建物・車内へ避難'}
  else if((maxWind!=null&&maxWind>15)||(maxWave!=null&&maxWave>1.5)){level='danger';text=`⚠ 強風・高波予報　最大風速${maxWind?.toFixed(1)??'--'}m/s／波${maxWave?.toFixed(1)??'--'}m　釣行非推奨`}
  else if(minP!=null&&minP<=995&&((maxWind??0)>=10||(maxWave??0)>=1.2)){level='danger';text='⚠ 台風・発達した低気圧の影響に注意　公式情報を確認'}
  else if(drop>=4){level='caution';text=`⚠ 低気圧接近の可能性　12時間で気圧約${drop.toFixed(1)}hPa低下`}
  else if((maxWind??0)>10||(maxWave??0)>1.0){level='caution';text=`⚠ 天候悪化注意　今後最大風速${maxWind?.toFixed(1)??'--'}m/s／波${maxWave?.toFixed(1)??'--'}m`}
  if(text){el.textContent=text;el.classList.add(level);el.hidden=false}
}
function fmtWindow(w){const f=h=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h%1)*60)).padStart(2,'0')}`;return w?`${f(w.start)}〜${f(w.end)}`:'--:--〜--:--'}
function drawTide(d,windows=[]){
  const svg=$('tideSvg');svg.innerHTML='';
  if(!d){const t=svgEl('text',{x:195,y:128,'text-anchor':'middle',fill:'#fff'});t.textContent='気象庁潮位データなし';svg.append(t);return}
  const W=390,H=255,L=42,R=16,T=16,B=28,min=Math.floor((Math.min(...d.hourly)-20)/50)*50,max=Math.ceil((Math.max(...d.hourly)+20)/50)*50;
  const x=h=>L+h/24*(W-L-R),y=v=>T+(max-v)/(max-min)*(H-T-B);
  for(let cm=min;cm<=max;cm+=50){svg.append(svgEl('line',{x1:L,y1:y(cm),x2:W-R,y2:y(cm),stroke:'rgba(255,255,255,.18)','stroke-dasharray':'3 4'}));const tx=svgEl('text',{x:5,y:y(cm)+4,class:'axisText'});tx.textContent=`${cm}cm`;svg.append(tx)}
  for(let h=0;h<=24;h+=3){svg.append(svgEl('line',{x1:x(h),y1:T,x2:x(h),y2:H-B,stroke:'rgba(255,255,255,.15)'}));const tx=svgEl('text',{x:x(h)-5,y:H-8,class:'axisText'});tx.textContent=h===24?'24時':h;svg.append(tx)}
  for(const w of windows){const x1=x(w.start),x2=x(w.end);svg.append(svgEl('rect',{x:x1,y:T,width:Math.max(2,x2-x1),height:H-T-B,class:'optimalBand'}));svg.append(svgEl('line',{x1:x1,y1:T,x2:x1,y2:H-B,class:'optimalLine'}));const tx=svgEl('text',{x:x1+3,y:T+12,class:'optimalLabel'});tx.textContent='おすすめ';svg.append(tx)}
  const markers=[
    {h:hourFromIso(weather?.daily?.sunrise?.[0]),c:'#ffd84a',label:'☀'},
    {h:hourFromIso(weather?.daily?.sunset?.[0]),c:'#ff8b2a',label:'🌇'}
  ];
  const mt=moonTimes(date(),point().lat,point().lon);
  if(mt.rise)markers.push({h:mt.rise.getHours()+mt.rise.getMinutes()/60,c:'#dff2ff',label:'☾'});
  if(mt.set)markers.push({h:mt.set.getHours()+mt.set.getMinutes()/60,c:'#a9cfff',label:'☽'});
  for(const m of markers){if(m.h==null)continue;const xx=x(m.h);svg.append(svgEl('rect',{x:xx-10,y:T,width:20,height:H-T-B,fill:m.c,opacity:.12}));svg.append(svgEl('line',{x1:xx,y1:T,x2:xx,y2:H-B,stroke:m.c,'stroke-dasharray':'3 4','stroke-width':1.2}));const tx=svgEl('text',{x:xx-7,y:T+13,class:'axisText'});tx.textContent=m.label;svg.append(tx)}
  const pts=[];for(let h=0;h<=23;h+=.25)pts.push([x(h),y(interp(d.hourly,h))]);pts.push([x(24),y(d.hourly[23])]);const path=pts.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ');
  svg.append(svgEl('path',{d:path+` L${x(24)} ${H-B} L${x(0)} ${H-B}Z`,fill:'rgba(20,205,236,.25)'}));
  for(let i=0;i<8;i++){const fx=L+12+i*38,fy=H-B-18-(i%3)*10;svg.append(svgEl('path',{class:'fish',d:`M${fx} ${fy} q14 -8 28 0 q-14 8 -28 0 M${fx+26} ${fy} l8 -6 v12 z`}))}
  svg.append(svgEl('path',{d:path,fill:'none',stroke:'#35e6ff','stroke-width':4,'stroke-linecap':'round'}));
  for(const e of d.extrema){const [hh,mm]=e.time.split(':').map(Number),xx=x(hh+mm/60),yy=y(e.height);svg.append(svgEl('circle',{cx:xx,cy:yy,r:6,fill:e.type==='high'?'#126ce0':'#eaf6ff',stroke:'#fff','stroke-width':2}));const bx=Math.max(L,Math.min(W-R-58,xx-29)),by=e.type==='high'?Math.max(T,yy-43):Math.min(H-B-35,yy+9),g=svgEl('g');g.append(svgEl('rect',{x:bx,y:by,width:58,height:35,rx:6,fill:e.type==='high'?'#126ce0':'#eaf6ff',stroke:'#70c8ff'}));let t=svgEl('text',{x:bx+29,y:by+14,class:e.type==='high'?'calloutTime':'calloutCm','text-anchor':'middle'});t.textContent=e.time;g.append(t);t=svgEl('text',{x:bx+29,y:by+29,class:e.type==='high'?'calloutTime':'calloutCm','text-anchor':'middle'});t.textContent=`${e.height}cm`;g.append(t);svg.append(g)}
  if(offset===0){const n=new Date(),h=n.getHours()+n.getMinutes()/60,v=interp(d.hourly,h);svg.append(svgEl('circle',{cx:x(h),cy:y(v),r:8,fill:'#ff2e31',stroke:'#fff','stroke-width':3}))}
}
function compass(deg){if(deg==null||!Number.isFinite(Number(deg)))return'--';return['北','北東','東','南東','南','南西','西','北西'][Math.round(Number(deg)/45)%8]}
function windArrow(deg){if(deg==null||!Number.isFinite(Number(deg)))return'--';return['↓','↙','←','↖','↑','↗','→','↘'][Math.round(Number(deg)/45)%8]}
function weatherIcon(c){if(c===0)return'☀️';if([1,2].includes(c))return'🌤️';if(c===3)return'☁️';if([45,48].includes(c))return'🌫️';if([51,53,55,61,63,65,80,81,82].includes(c))return'🌧️';if([95,96,99].includes(c))return'⛈️';return'☁️'}
function weatherText(c){if(c===0)return'晴れ';if([1,2].includes(c))return'晴れ時々くもり';if(c===3)return'くもり';if([51,53,55,61,63,65,80,81,82].includes(c))return'雨';if([95,96,99].includes(c))return'雷雨';return'不明'}
function val(o,k,h){return o?.hourly?.[k]?.[Math.max(0,Math.min(23,Math.round(h)))]??null}
async function fetchWeather(){const p=point(),ds=ymd(date());weather=marine=null;try{const wp=new URLSearchParams({latitude:p.lat,longitude:p.lon,timezone:'Asia/Tokyo',start_date:ds,end_date:ds,hourly:'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure',daily:'sunrise,sunset'});const mp=new URLSearchParams({latitude:p.lat,longitude:p.lon,timezone:'Asia/Tokyo',start_date:ds,end_date:ds,hourly:'wave_height,sea_surface_temperature'});const [wr,mr]=await Promise.all([fetch(`https://api.open-meteo.com/v1/forecast?${wp}`,{cache:'no-store'}),fetch(`https://marine-api.open-meteo.com/v1/marine?${mp}`,{cache:'no-store'})]);if(!wr.ok||!mr.ok)throw Error('API');weather=await wr.json();marine=await mr.json()}catch(e){}renderWeather()}
function safety(el,v,kind){el.classList.remove('safeBlue','safeYellow','safeRed');if(v==null)return;if(kind==='wind')el.classList.add(v<=10?'safeBlue':v<=15?'safeYellow':'safeRed');else el.classList.add(v<=1?'safeBlue':v<=1.5?'safeYellow':'safeRed')}
function renderWeather(){
  const h=offset===0?new Date().getHours():12,c=val(weather,'weather_code',h),temp=val(weather,'temperature_2m',h),wind=val(weather,'wind_speed_10m',h),dir=val(weather,'wind_direction_10m',h),wave=val(marine,'wave_height',h),water=val(marine,'sea_surface_temperature',h);
  $('weatherIcon').textContent=c==null?'--':weatherIcon(c);$('weatherText').textContent=c==null?'取得不能':weatherText(c);$('temperature').textContent=temp==null?'--℃':`${Number(temp).toFixed(1)}℃`;
  $('windDir').innerHTML=dir==null?'--':`<span class="windArrow">${windArrow(dir)}</span>${compass(dir)}`;
  $('windSpeed').textContent=wind==null?'--':`${Number(wind).toFixed(1)}m/s`;$('waveHeight').textContent=wave==null?'--':`${Number(wave).toFixed(1)}m`;$('waterTemp').textContent=water==null?'--':`${Number(water).toFixed(1)}℃`;
  safety($('windSpeed'),wind,'wind');safety($('waveHeight'),wave,'wave');
  const grid=$('hourlyGrid');grid.innerHTML='';const hours=[0,3,6,9,12,15,18,21,23];
  const rows=[['時間',h=>h],['天気',h=>{const v=val(weather,'weather_code',h);return v==null?'--':weatherIcon(v)}],['風向',h=>{const v=val(weather,'wind_direction_10m',h);return v==null?'--':`${windArrow(v)} ${compass(v)}`}],['風速',h=>{const v=val(weather,'wind_speed_10m',h);return v==null?'--':Number(v).toFixed(1)}],['波高',h=>{const v=val(marine,'wave_height',h);return v==null?'--':Number(v).toFixed(1)+'m'}],['水温',h=>{const v=val(marine,'sea_surface_temperature',h);return v==null?'--':Number(v).toFixed(1)}]];
  for(const [label,fn] of rows){const hd=document.createElement('div');hd.className='rowHead';hd.textContent=label;grid.append(hd);for(const hr of hours){const cell=document.createElement('div');cell.textContent=fn(hr);if(label==='天気')cell.className='weatherCell';if(label==='風速'){cell.classList.add('numCell');safety(cell,val(weather,'wind_speed_10m',hr),'wind')}if(label==='波高'){cell.classList.add('waveCell');safety(cell,val(marine,'wave_height',hr),'wave')}grid.append(cell)}}
  const d=dayData();bestWindows=calcBestWindows(d);$('bestTime1').textContent=fmtWindow(bestWindows[0]);$('bestTime2').textContent=fmtWindow(bestWindows[1]);$('scoreBadge').textContent=bestWindows.length?Math.max(...bestWindows.map(w=>w.score)):'--';updateWeatherWarning();drawTide(d,bestWindows);
}
function render(){const p=point(),d=dayData(),dt=date(),age=moonAge(dt);$('dateButton').textContent=fmtDate(dt);$('prefName').textContent=p.prefecture;$('pointName').textContent=p.name;$('tideType').textContent=tideType(age);$('moonAge').textContent=age.toFixed(1);const mt=moonTimes(dt,p.lat,p.lon);$('sunrise').textContent=weather?.daily?.sunrise?.[0]?hmDate(new Date(weather.daily.sunrise[0])):'--:--';$('sunset').textContent=weather?.daily?.sunset?.[0]?hmDate(new Date(weather.daily.sunset[0])):'--:--';$('moonrise').textContent=hmDate(mt.rise);$('moonset').textContent=hmDate(mt.set);if(d&&offset===0){const n=new Date(),h=n.getHours()+n.getMinutes()/60,cur=interp(d.hourly,h),prev=interp(d.hourly,Math.max(0,h-1));$('currentTide').textContent=`${Math.round(cur)}cm`;$('tideDiff').textContent=`${cur-prev>=0?'↑':'↓'}${Math.abs(cur-prev).toFixed(1)}`}else{$('currentTide').textContent='--';$('tideDiff').textContent='--'}$('scoreBadge').textContent='--';$('bestTime1').textContent='--:--〜--:--';$('bestTime2').textContent='--:--〜--:--';drawTide(d,[]);const g=$('pointGrid');g.innerHTML='';for(const q of points.slice(0,9)){const b=document.createElement('button');b.className='pointBtn'+(q.name===selected?' active':'');b.innerHTML=`${q.name}<span class="pin">☆</span><small>${q.prefecture.replace('県','')}</small>`;b.onclick=()=>{selected=q.name;localStorage.setItem('ftbi.selected',selected);render();fetchWeather()};g.append(b)}fetchWeather();renderManage()}
function renderCandidates(){const prefs=['すべて','愛知県','三重県','静岡県'],types=['すべて','サーフ','河口','港','海釣り公園','堤防'];$('prefChips').innerHTML='';prefs.forEach(v=>{const b=document.createElement('button');b.className='chip'+(mapPref===v?' active':'');b.textContent=v==='すべて'?'全県':v.replace('県','');b.onclick=()=>{mapPref=v;renderCandidates()};$('prefChips').append(b)});$('typeChips').innerHTML='';types.forEach(v=>{const b=document.createElement('button');b.className='chip'+(mapType===v?' active':'');b.textContent=v;b.onclick=()=>{mapType=v;renderCandidates()};$('typeChips').append(b)});const list=$('spotList');list.innerHTML='';CANDIDATES.filter(p=>(mapPref==='すべて'||p.prefecture===mapPref)&&(mapType==='すべて'||p.type===mapType)).forEach(p=>{const b=document.createElement('button');b.className='spotItem'+(chosen?.name===p.name?' active':'');b.innerHTML=`<div><b>${p.name}</b><span>${p.prefecture} ${p.area}／${p.type}／潮位基準：${window.JMA_TIDE_DATA?.[p.station]?.name||'--'}</span></div>`;b.onclick=()=>{chosen=p;$('mapSpotName').textContent=p.name;$('mapSpotMeta').textContent=`潮位基準：${window.JMA_TIDE_DATA?.[p.station]?.name||'--'}`;$('registerMapSpot').disabled=false;$('openGoogleMap').disabled=false;renderCandidates()};list.append(b)})}
function registerChosen(){if(!chosen)return;const exists=points.findIndex(p=>p.name===chosen.name);if(exists>=0){selected=chosen.name}else if(points.length<9){points.push({...chosen});selected=chosen.name}else{const idx=Math.max(0,points.findIndex(p=>p.name===selected));points[idx]={...chosen};selected=chosen.name}savePoints();localStorage.setItem('ftbi.selected',selected);$('mapDialog').close();render()}
function renderManage(){const list=$('manageList');if(!list)return;list.innerHTML='';points.forEach((p,i)=>{const row=document.createElement('div');row.className='manageRow';const n=document.createElement('div');n.className='manageName';n.textContent=`${p.name}（潮位：${window.JMA_TIDE_DATA?.[p.station]?.name||'--'}）`;const del=document.createElement('button');del.type='button';del.className='deleteBtn';del.textContent='削除';del.disabled=points.length<=1;del.onclick=()=>{points.splice(i,1);if(!points.some(q=>q.name===selected))selected=points[0].name;savePoints();localStorage.setItem('ftbi.selected',selected);render()};row.append(n,del);list.append(row)})}
async function unlockAlarmAudio(){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass) throw new Error('AudioContext unsupported');
  audioCtx=audioCtx||new AudioContextClass();
  if(audioCtx.state==='suspended') await audioCtx.resume();
  // Safariで音声出力経路を確実に有効化するため、無音に近い短い音を一度再生する。
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  const t=audioCtx.currentTime;
  g.gain.setValueAtTime(0.0001,t);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);o.stop(t+0.02);
  alarmEnabled=true;
  localStorage.setItem('ftbi.alarmEnabled','on');
}
async function enableAlarm(){
  try{
    await unlockAlarmAudio();
    $('quakeStatus').textContent='警報音：この画面で有効';
    beep(3);
  }catch(e){
    $('quakeStatus').textContent='警報音を有効化できません';
  }
}
function beep(n=6){
  if(!alarmEnabled||!audioCtx||audioCtx.state!=='running')return false;
  const start=audioCtx.currentTime+0.03;
  for(let i=0;i<n;i++){
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    const t=start+i*.42;
    o.type='square';
    o.frequency.setValueAtTime(i%2?960:720,t);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.5,t+.025);
    g.gain.exponentialRampToValueAtTime(0.0001,t+.31);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);o.stop(t+.34);
  }
  return true;
}
function alertScreen(title,scale,epi,msg,tsu,test=false){
  $('quakeTitle').textContent=test?'訓練・警報テスト':title;
  $('quakeScale').textContent=scale;
  $('quakeEpicenter').textContent=`震源：${epi}`;
  $('quakeMessage').textContent=msg;
  $('quakeTsunami').textContent=tsu;
  $('quakeAlert').hidden=false;
  beep(8);
}
async function runAlarmTest(){
  try{
    // テストボタン自体がユーザー操作なので、ここでSafariの音声制限を解除する。
    await unlockAlarmAudio();
    $('quakeStatus').textContent='警報音：テスト再生中';
    alertScreen('地震情報','震度3','伊勢湾','海岸・堤防・河口から離れてください','これは訓練表示です',true);
    setTimeout(()=>{if(audioCtx?.state==='running')$('quakeStatus').textContent='警報音：この画面で有効'},3600);
  }catch(e){
    $('quakeStatus').textContent='警報音テストに失敗しました';
  }
}
const TARGET_WORDS=['愛知','三重','静岡','岐阜','長野','滋賀','京都','奈良','和歌山','福井','石川','伊勢湾','三河湾','遠州灘','東海道南方沖','紀伊半島'];
async function checkQuake(){if(!quakeEnabled){$('quakeStatus').textContent='地震情報：OFF';return}try{const [qr,tr]=await Promise.all([fetch('https://api.p2pquake.net/v2/jma/quake?limit=5&min_scale=30',{cache:'no-store'}),fetch('https://api.p2pquake.net/v2/jma/tsunami?limit=3',{cache:'no-store'})]);if(!qr.ok||!tr.ok)throw Error();const qs=await qr.json(),ts=await tr.json();$('quakeStatus').textContent='地震情報：監視中';for(const q of qs){const id=String(q?.id||q?.issue?.time||''),issue=new Date(q?.issue?.time||0),epi=q?.earthquake?.hypocenter?.name||'不明',max=q?.earthquake?.maxScale??0;if(id&&id!==localStorage.getItem('ftbi.lastQuakeId')&&Date.now()-issue<15*60*1000&&max>=30&&TARGET_WORDS.some(w=>epi.includes(w))){localStorage.setItem('ftbi.lastQuakeId',id);alertScreen('地震情報',`震度${max/10}`,epi,'海岸・堤防・河口から離れ、公式情報を確認してください','津波の有無は気象庁・自治体情報で確認してください');break}}for(const t of ts){const id=String(t?.id||t?.issue?.time||'');const issue=new Date(t?.issue?.time||0);if(id&&id!==localStorage.getItem('ftbi.lastTsunamiId')&&Date.now()-issue<90*60*1000){localStorage.setItem('ftbi.lastTsunamiId',id);alertScreen('津波情報','津波警報等','気象庁発表','海岸・河口から直ちに離れてください','Jアラート・気象庁・自治体の指示に従ってください');break}}}catch(e){$('quakeStatus').textContent='地震情報：取得不能'}}
$('prevDay').onclick=()=>{offset=Math.max(0,offset-1);render()};$('nextDay').onclick=()=>{offset=Math.min(14,offset+1);render()};$('mapOpen').onclick=()=>{chosen=null;renderCandidates();$('mapDialog').showModal()};$('mapClose').onclick=()=>$('mapDialog').close();$('registerMapSpot').onclick=registerChosen;$('openGoogleMap').onclick=()=>{if(chosen)window.open(`https://www.google.com/maps?q=${chosen.lat},${chosen.lon}`,'_blank','noopener')};$('nearButton').onclick=()=>alert('現在地による並び替えはHTTPS公開時に使用できます');$('settingsOpen').onclick=()=>{$('settingsDialog').showModal();renderManage()};$('enableAlarm').onclick=enableAlarm;$('testQuakeAlert').onclick=runAlarmTest;$('quakeAlertToggle').checked=quakeEnabled;$('quakeAlertToggle').onchange=e=>{quakeEnabled=e.target.checked;localStorage.setItem('ftbi.quakeAlert',quakeEnabled?'on':'off');checkQuake()};$('quakeClose').onclick=()=>$('quakeAlert').hidden=true;$('resetPoints').onclick=()=>{points=INITIAL.map(p=>({...p}));selected='四日市港';savePoints();localStorage.setItem('ftbi.selected',selected);render()};$('favButton').onclick=()=>{};
if(alarmEnabled&&$('quakeStatus'))$('quakeStatus').textContent='警報音：再有効化が必要';
render();checkQuake();setInterval(checkQuake,60000);
