const DEFAULT_POINTS = [
  { name:'鈴鹿', pref:'三重', lat:34.884, lon:136.606, amp:72, base:132, phase:1.4 },
  { name:'四日市', pref:'三重', lat:34.965, lon:136.642, amp:76, base:135, phase:1.1 },
  { name:'長良川河口', pref:'三重', lat:35.056, lon:136.700, amp:82, base:140, phase:0.9 },
  { name:'名古屋港', pref:'愛知', lat:35.084, lon:136.881, amp:86, base:142, phase:0.5 },
  { name:'新舞子', pref:'愛知', lat:34.951, lon:136.826, amp:74, base:128, phase:0.6 },
  { name:'赤羽港', pref:'愛知', lat:34.612, lon:137.171, amp:58, base:108, phase:-0.1 },
  { name:'伊古部', pref:'愛知', lat:34.621, lon:137.442, amp:54, base:106, phase:-0.5 },
  { name:'浜名湖新居', pref:'静岡', lat:34.695, lon:137.562, amp:48, base:96, phase:-0.8 },
  { name:'天竜川河口', pref:'静岡', lat:34.649, lon:137.818, amp:50, base:100, phase:-1.1 }
];

const $ = id => document.getElementById(id);
const state = {
  points: loadPoints(),
  selectedName: localStorage.getItem('ftbi.selected') || '名古屋港',
  favorites: new Set(JSON.parse(localStorage.getItem('ftbi.favorites') || '["名古屋港"]')),
  dateOffset: 0,
  weather: null,
  marine: null,
  selectedPref: '愛知'
};

function loadPoints(){
  try { return JSON.parse(localStorage.getItem('ftbi.points')) || DEFAULT_POINTS; }
  catch { return DEFAULT_POINTS; }
}
function savePoints(){ localStorage.setItem('ftbi.points', JSON.stringify(state.points)); }
function saveFavs(){ localStorage.setItem('ftbi.favorites', JSON.stringify([...state.favorites])); }
function point(){ return state.points.find(p=>p.name===state.selectedName) || state.points[0] || DEFAULT_POINTS[3]; }
function selectedDate(){ const d = new Date(); d.setDate(d.getDate()+state.dateOffset); d.setHours(0,0,0,0); return d; }
function ymd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function hm(hour){ let h = Math.floor(hour)%24; let m = Math.round((hour-Math.floor(hour))*60); if(m===60){h=(h+1)%24;m=0;} return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function fmtDate(d){ const w = '日月火水木金土'[d.getDay()]; return `${d.getMonth()+1}月${d.getDate()}日(${w})`; }
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }

function moonAge(date){
  const synodic = 29.530588853;
  const ref = Date.UTC(2000,0,6,18,14,0);
  const days = (Date.UTC(date.getFullYear(),date.getMonth(),date.getDate(),12)-ref)/86400000;
  return ((days % synodic) + synodic) % synodic;
}
function tideClass(age){
  const a = age;
  if(a < 1.5 || a > 28 || (a > 13.2 && a < 16.2)) return '大潮';
  if((a >= 9.5 && a < 10.8) || (a >= 24.2 && a < 25.5)) return '長潮';
  if((a >= 10.8 && a < 12.2) || (a >= 25.5 && a < 27)) return '若潮';
  if((a >= 6.7 && a < 9.5) || (a >= 21.4 && a < 24.2)) return '小潮';
  return '中潮';
}
function tideFactor(age){
  const spring = (Math.cos(2*Math.PI*age/14.765)+1)/2;
  return 0.62 + spring*0.55;
}
function tideHeight(p, hour, age){
  const amp = p.amp * tideFactor(age);
  const h = hour + p.phase + age*0.78;
  const semi = Math.sin(2*Math.PI*h/12.42);
  const daily = 0.22*Math.sin(2*Math.PI*(h-2.4)/24);
  return p.base + amp*(semi + daily);
}
function tideSeries(p, date){
  const age = moonAge(date);
  const data=[];
  for(let h=0; h<=24.001; h+=0.25){ data.push({hour:h, height:tideHeight(p,h,age)}); }
  const extrema=[];
  for(let i=1;i<data.length-1;i++){
    const prev=data[i-1].height, cur=data[i].height, next=data[i+1].height;
    if(cur>=prev && cur>=next) extrema.push({...data[i], type:'high'});
    if(cur<=prev && cur<=next) extrema.push({...data[i], type:'low'});
  }
  return {age, data, extrema};
}
function currentHour(){
  if(state.dateOffset !== 0) return 12;
  const d = new Date(); return d.getHours()+d.getMinutes()/60;
}
function sunTimes(date, lon){
  // lightweight seasonal approximation for Japan; display target only, not navigation data
  const start = new Date(date.getFullYear(),0,0);
  const n = Math.floor((date - start)/86400000);
  const latFactor = -0.75*Math.cos((n-172)/365*2*Math.PI);
  const sunrise = 5.02 + latFactor - (lon-136.8)*0.03;
  const sunset = 18.15 - latFactor - (lon-136.8)*0.03;
  return {sunrise:clamp(sunrise,4.4,7.1), sunset:clamp(sunset,16.8,19.3)};
}
function moonTimes(age){
  const rise = ((6 + age*0.82) % 24); const set = ((rise+12.2)%24); return {rise,set};
}
function weatherIcon(code, hour){
  if([0].includes(code)) return hour>=18||hour<5?'🌙':'☀️';
  if([1,2].includes(code)) return hour>=18||hour<5?'🌙':'🌤️';
  if([3].includes(code)) return '☁️';
  if([45,48].includes(code)) return '🌫️';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if([71,73,75,77,85,86].includes(code)) return '❄️';
  if([95,96,99].includes(code)) return '⛈️';
  return '☁️';
}
function weatherText(code){
  if(code===0) return '晴れ'; if([1,2].includes(code)) return '晴れ時々くもり'; if(code===3) return 'くもり';
  if([45,48].includes(code)) return '霧'; if([51,53,55].includes(code)) return '小雨'; if([61,63,65,80,81,82].includes(code)) return '雨';
  if([95,96,99].includes(code)) return '雷雨'; return 'くもり';
}
function compass(deg){
  if(deg == null || Number.isNaN(deg)) return '--';
  const dirs=['北','北北東','北東','東北東','東','東南東','南東','南南東','南','南南西','南西','西南西','西','西北西','北西','北北西'];
  return dirs[Math.round(deg/22.5)%16];
}
function windArrow(deg){ return `rotate(${deg || 0}deg)`; }
function nearestHourly(hourly, key, hour){
  if(!hourly || !hourly.time || !hourly[key]) return null;
  const date = ymd(selectedDate());
  let target = `${date}T${String(Math.min(23, Math.floor(hour))).padStart(2,'0')}:00`;
  let idx = hourly.time.indexOf(target);
  if(idx < 0) idx = Math.min(hourly[key].length-1, Math.max(0, Math.round(hour)));
  return hourly[key][idx];
}
function fallbackWeather(p){
  const hourly = {time:[], temperature_2m:[], relative_humidity_2m:[], precipitation:[], weather_code:[], wind_speed_10m:[], wind_direction_10m:[], wind_gusts_10m:[], surface_pressure:[]};
  const marine = {time:[], wave_height:[], wave_direction:[], sea_surface_temperature:[]};
  const date=ymd(selectedDate());
  for(let h=0;h<24;h++){
    hourly.time.push(`${date}T${String(h).padStart(2,'0')}:00`);
    const temp = 23 + 4*Math.sin((h-7)/24*2*Math.PI) + (p.pref==='静岡'?1:0);
    hourly.temperature_2m.push(+temp.toFixed(1));
    hourly.relative_humidity_2m.push(Math.round(72 - 10*Math.sin((h-8)/24*2*Math.PI)));
    hourly.precipitation.push(0);
    hourly.weather_code.push(h>18||h<5?1:2);
    hourly.wind_speed_10m.push(+(2.6 + 1.6*Math.sin((h-10)/24*2*Math.PI)).toFixed(1));
    hourly.wind_direction_10m.push(140 + 45*Math.sin(h/24*2*Math.PI));
    hourly.wind_gusts_10m.push(+(4.2 + 2*Math.sin((h-10)/24*2*Math.PI)).toFixed(1));
    hourly.surface_pressure.push(1013);
    marine.time.push(hourly.time[h]);
    marine.wave_height.push(+(p.pref==='愛知'?0.25:p.pref==='静岡'?0.45:0.3).toFixed(1));
    marine.wave_direction.push(150);
    marine.sea_surface_temperature.push(+(22.5 + 1.0*Math.sin((h-8)/24*2*Math.PI)).toFixed(1));
  }
  return {weather:{hourly}, marine:{hourly:marine}, fallback:true};
}
async function fetchData(p){
  const date = ymd(selectedDate());
  const weatherParams = new URLSearchParams({
    latitude:p.lat, longitude:p.lon, timezone:'Asia/Tokyo', start_date:date, end_date:date,
    hourly:'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure'
  });
  const marineParams = new URLSearchParams({
    latitude:p.lat, longitude:p.lon, timezone:'Asia/Tokyo', start_date:date, end_date:date,
    hourly:'wave_height,wave_direction,sea_surface_temperature'
  });
  try{
    const [w,m] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, {cache:'no-store'}),
      fetch(`https://marine-api.open-meteo.com/v1/marine?${marineParams}`, {cache:'no-store'})
    ]);
    if(!w.ok || !m.ok) throw new Error('api error');
    state.weather = await w.json(); state.marine = await m.json();
  } catch(e){
    const fb = fallbackWeather(p); state.weather = fb.weather; state.marine = fb.marine;
  }
}
function hourlyValues(hour){
  const wh = state.weather?.hourly || {}; const mh = state.marine?.hourly || {};
  return {
    temp: nearestHourly(wh,'temperature_2m',hour), hum: nearestHourly(wh,'relative_humidity_2m',hour), rain: nearestHourly(wh,'precipitation',hour), code: nearestHourly(wh,'weather_code',hour),
    wind: nearestHourly(wh,'wind_speed_10m',hour), dir: nearestHourly(wh,'wind_direction_10m',hour), gust: nearestHourly(wh,'wind_gusts_10m',hour), pressure: nearestHourly(wh,'surface_pressure',hour),
    wave: nearestHourly(mh,'wave_height',hour), water: nearestHourly(mh,'sea_surface_temperature',hour), waveDir: nearestHourly(mh,'wave_direction',hour)
  };
}
function scoreAt(hour, tideObj){
  const v = hourlyValues(hour);
  const p = point();
  const age = tideObj.age;
  const h1 = tideHeight(p, hour, age), h2 = tideHeight(p, Math.min(24,hour+1), age);
  const move = Math.abs(h2-h1);
  const sun = sunTimes(selectedDate(), p.lon);
  let s = 40;
  s += clamp(move/18,0,1)*22;
  s += Math.max(0, 1-Math.min(Math.abs(hour-sun.sunrise), Math.abs(hour-sun.sunset))/2.2)*18;
  s += (v.wave ?? 0.3) <= 0.6 ? 12 : (v.wave <= 1.0 ? 6 : -6);
  s += (v.wind ?? 3) <= 5 ? 12 : (v.wind <= 8 ? 4 : -10);
  s += (v.rain ?? 0) <= .2 ? 6 : -8;
  s += (['大潮','中潮'].includes(tideClass(age)) ? 8 : 0);
  return Math.round(clamp(s,0,100));
}
function bestWindows(tideObj){
  const arr=[]; for(let h=0;h<24;h+=0.5) arr.push({h,s:scoreAt(h,tideObj)});
  const picks=[];
  for(const row of [...arr].sort((a,b)=>b.s-a.s)){
    if(picks.every(p=>Math.abs(p.h-row.h)>4)){ picks.push(row); }
    if(picks.length===2) break;
  }
  return picks.map(p=>({start:clamp(p.h-1.25,0,23.5), end:clamp(p.h+1.25,0.5,24), score:p.s})).sort((a,b)=>a.start-b.start);
}
function createSvgEl(name, attrs={}){
  const el=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
  return el;
}
function drawTideChart(tideObj){
  const svg=$('tideSvg'); svg.innerHTML='';
  const W=390,H=256, L=44,R=12,T=16,B=31; const plotW=W-L-R, plotH=H-T-B;
  const ys = tideObj.data.map(d=>d.height); let minY=Math.floor((Math.min(...ys)-30)/50)*50; let maxY=Math.ceil((Math.max(...ys)+30)/50)*50; minY=Math.min(minY,0); maxY=Math.max(maxY,250);
  const x=h=>L+(h/24)*plotW; const y=cm=>T+(maxY-cm)/(maxY-minY)*plotH;
  const defs=createSvgEl('defs'); defs.innerHTML=`<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#35e6ff" stop-opacity=".55"/><stop offset="1" stop-color="#117baf" stop-opacity=".1"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`; svg.appendChild(defs);
  for(let cm=Math.ceil(minY/50)*50; cm<=maxY; cm+=50){
    const yy=y(cm); svg.appendChild(createSvgEl('line',{x1:L,y1:yy,x2:W-R,y2:yy,stroke:'rgba(225,245,255,.25)','stroke-dasharray':cm%100===0?'3 6':'2 7'}));
    const t=createSvgEl('text',{x:5,y:yy+4,class:'axisText'}); t.textContent=`${cm}cm`; svg.appendChild(t);
  }
  for(let h=0; h<=24; h+=3){
    const xx=x(h); svg.appendChild(createSvgEl('line',{x1:xx,y1:T,x2:xx,y2:H-B,stroke:'rgba(225,245,255,.19)','stroke-dasharray':'5 5'}));
    const t=createSvgEl('text',{x:xx,y:H-8,class:'axisText','text-anchor':'middle'}); t.textContent=h===0?'0時':h===24?'24時':String(h); svg.appendChild(t);
  }
  const p=point(), sun=sunTimes(selectedDate(),p.lon), moon=moonTimes(tideObj.age);
  [{h:sun.sunrise,c:'rgba(255,216,74,.18)',txt:'☀'}, {h:sun.sunset,c:'rgba(255,128,40,.16)',txt:'🌇'}, {h:moon.rise,c:'rgba(255,255,255,.10)',txt:'☾'}, {h:moon.set,c:'rgba(255,255,255,.10)',txt:'☽'}].forEach(m=>{
    const xx=x(m.h); svg.appendChild(createSvgEl('rect',{x:xx-10,y:T,width:20,height:plotH,fill:m.c}));
    svg.appendChild(createSvgEl('line',{x1:xx,y1:T,x2:xx,y2:H-B,stroke:m.txt==='☀'?'#ffd84a':'#eaf8ff','stroke-dasharray':'3 4'}));
    const tt=createSvgEl('text',{x:xx,y:T+11,'text-anchor':'middle','font-size':'14'}); tt.textContent=m.txt; svg.appendChild(tt);
  });
  // fish silhouettes
  for(const f of [{x:106,y:148},{x:244,y:185},{x:310,y:153},{x:337,y:174}]){
    const g=createSvgEl('g',{class:'fish',transform:`translate(${f.x},${f.y}) scale(.75)`});
    g.appendChild(createSvgEl('ellipse',{cx:0,cy:0,rx:9,ry:4}));
    g.appendChild(createSvgEl('polygon',{points:'9,0 17,-6 17,6'}));
    svg.appendChild(g);
  }
  const linePath = tideObj.data.map((d,i)=>`${i?'L':'M'}${x(d.hour).toFixed(1)},${y(d.height).toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L ${x(24)},${y(minY)} L ${x(0)},${y(minY)} Z`;
  svg.appendChild(createSvgEl('path',{d:fillPath,fill:'url(#fill)'}));
  svg.appendChild(createSvgEl('path',{d:linePath,fill:'none',stroke:'#35e6ff','stroke-width':'3',filter:'url(#glow)','stroke-linecap':'round'}));
  const extrema = tideObj.extrema.slice(0,5);
  extrema.forEach(e=>{
    const xx=x(e.hour), yy=y(e.height);
    svg.appendChild(createSvgEl('circle',{cx:xx,cy:yy,r:5,fill:e.type==='high'?'#1569d8':'#0f7498',stroke:'#fff','stroke-width':'2'}));
    const boxW=55, boxH=30, bx=clamp(xx-boxW/2,L+2,W-R-boxW-2), by=e.type==='high'?Math.max(T+8,yy-50):Math.min(H-B-38,yy+10);
    svg.appendChild(createSvgEl('rect',{x:bx,y:by,width:boxW,height:boxH,rx:5,fill:'#f4fbff',stroke:'#4dbfff','stroke-width':'1.5'}));
    svg.appendChild(createSvgEl('rect',{x:bx,y:by,width:boxW,height:13,rx:4,fill:'#155eba'}));
    let tt=createSvgEl('text',{x:bx+boxW/2,y:by+10,class:'calloutTime','text-anchor':'middle'}); tt.textContent=hm(e.hour); svg.appendChild(tt);
    let cc=createSvgEl('text',{x:bx+boxW/2,y:by+25,class:'calloutCm','text-anchor':'middle'}); cc.textContent=`${Math.round(e.height)}cm`; svg.appendChild(cc);
  });
  const ch=currentHour(), cv=tideHeight(p,ch,tideObj.age); const xx=x(ch), yy=y(cv);
  svg.appendChild(createSvgEl('line',{x1:xx,y1:T,x2:xx,y2:H-B,stroke:'#fff','stroke-dasharray':'4 4','stroke-opacity':'.8'}));
  svg.appendChild(createSvgEl('circle',{cx:xx,cy:yy,r:7,fill:'#ff2929',stroke:'#fff','stroke-width':'3'}));
  const bx=clamp(xx+8,L+2,W-80), by=clamp(yy-38,T+5,H-B-48);
  svg.appendChild(createSvgEl('rect',{x:bx,y:by,width:62,height:42,rx:5,fill:'#fff',stroke:'#ff3030','stroke-width':'2'}));
  svg.appendChild(createSvgEl('rect',{x:bx,y:by,width:62,height:16,rx:4,fill:'#e32222'}));
  let t=createSvgEl('text',{x:bx+31,y:by+12,class:'currentText','text-anchor':'middle'}); t.textContent='現在'; svg.appendChild(t);
  let c=createSvgEl('text',{x:bx+31,y:by+32,class:'calloutCm','text-anchor':'middle'}); c.textContent=`${Math.round(cv)}cm`; svg.appendChild(c);
}
function renderHeader(tideObj){
  const p=point(), date=selectedDate(), age=tideObj.age, cls=tideClass(age), current=tideHeight(p,currentHour(),age), prev=tideHeight(p,Math.max(0,currentHour()-0.5),age), diff=current-prev;
  const sun=sunTimes(date,p.lon), moon=moonTimes(age);
  $('prefName').textContent=p.pref; $('pointName').textContent=p.name; $('dateButton').textContent=fmtDate(date);
  $('tideType').textContent=cls; $('moonAge').textContent=age.toFixed(1); $('currentTide').textContent=`${Math.round(current)}cm`;
  $('tideDiff').textContent=`${diff>=0?'↑':'↓'}${Math.abs(diff).toFixed(1)}`;
  $('sunrise').textContent=hm(sun.sunrise); $('sunset').textContent=hm(sun.sunset); $('moonrise').textContent=hm(moon.rise); $('moonset').textContent=hm(moon.set);
  $('favoriteButton').textContent=state.favorites.has(p.name)?'★':'☆';
}
function renderNow(tideObj){
  const h=currentHour(), v=hourlyValues(h), windows=bestWindows(tideObj), score=scoreAt(h,tideObj);
  $('weatherIcon').textContent=weatherIcon(v.code ?? 2,h); $('weatherText').textContent=weatherText(v.code ?? 2);
  $('temperature').textContent=`${(v.temp ?? 0).toFixed(1)}℃`; $('windDir').textContent=compass(v.dir); $('windSpeed').textContent=`${(v.wind ?? 0).toFixed(1)}m/s`;
  $('waveHeight').textContent=`${(v.wave ?? 0).toFixed(1)}m`; $('waterTemp').textContent=`${(v.water ?? 0).toFixed(1)}℃`;
  $('bestTime1').textContent=windows[0]?`${hm(windows[0].start)}〜${hm(windows[0].end)}`:'--:--〜--:--'; $('bestTime2').textContent=windows[1]?`${hm(windows[1].start)}〜${hm(windows[1].end)}`:'--:--〜--:--';
  $('fishScore').textContent=score; $('scoreBadge').textContent=(score/10).toFixed(1);
}
function renderHourly(){
  const g=$('hourlyGrid'); g.innerHTML='';
  const hours=[0,3,6,9,12,15,18,21,23];
  const rows=[
    ['時間',...hours.map(h=>h===23?'24':String(h))],
    ['天気',...hours.map(h=>weatherIcon(hourlyValues(h).code ?? 2,h))],
    ['気温',...hours.map(h=>`${Math.round(hourlyValues(h).temp ?? 0)}°`)],
    ['風向',...hours.map(h=>compass(hourlyValues(h).dir))],
    ['風速',...hours.map(h=>`${(hourlyValues(h).wind ?? 0).toFixed(1)}`)],
    ['波/水',...hours.map(h=>`${(hourlyValues(h).wave ?? 0).toFixed(1)}m\n${(hourlyValues(h).water ?? 0).toFixed(1)}°`)]
  ];
  rows.forEach((row,ri)=>row.forEach((cell,ci)=>{
    const div=document.createElement('div');
    if(ci===0) div.className='rowHead'; else if(ri===0) div.className='time'; else if(ri===1) div.className='ico'; else div.className=ri===3?'tiny':'val';
    if(String(cell).includes('\n')){ div.innerHTML=String(cell).replace('\n','<br>'); } else div.textContent=cell;
    g.appendChild(div);
  }));
}
function renderPoints(){
  const grid=$('pointGrid'); grid.innerHTML='';
  let visible=[...state.favorites].map(n=>state.points.find(p=>p.name===n)).filter(Boolean);
  state.points.forEach(p=>{ if(!visible.find(v=>v.name===p.name)) visible.push(p); });
  visible = visible.slice(0,9);
  visible.forEach(p=>{
    const btn=document.createElement('button'); btn.className='pointBtn'+(p.name===state.selectedName?' active':'');
    btn.innerHTML=`<span>${p.name}</span><span class="miniStar">${state.favorites.has(p.name)?'★':'☆'}</span>`;
    btn.addEventListener('click',()=>{ state.selectedName=p.name; localStorage.setItem('ftbi.selected',p.name); update(); });
    grid.appendChild(btn);
  });
  while(grid.children.length<9){ const b=document.createElement('button'); b.className='pointBtn'; b.textContent='未登録'; b.addEventListener('click',openManage); grid.appendChild(b); }
}
function renderManage(){
  const tabs=$('prefTabs'); tabs.innerHTML=''; ['三重','愛知','静岡'].forEach(pref=>{
    const b=document.createElement('button'); b.type='button'; b.textContent=pref; b.className=pref===state.selectedPref?'active':'';
    b.onclick=()=>{ state.selectedPref=pref; renderManage(); }; tabs.appendChild(b);
  });
  $('addPref').value=state.selectedPref;
  const list=$('manageList'); list.innerHTML='';
  state.points.filter(p=>p.pref===state.selectedPref).forEach(p=>{
    const row=document.createElement('div'); row.className='manageItem';
    const label=document.createElement('span'); label.textContent=`${p.name} ${state.favorites.has(p.name)?'★':''}`;
    label.onclick=()=>{ if(state.favorites.has(p.name)) state.favorites.delete(p.name); else state.favorites.add(p.name); saveFavs(); renderManage(); renderPoints(); };
    const del=document.createElement('button'); del.type='button'; del.textContent='削'; del.onclick=()=>{
      state.points=state.points.filter(x=>x.name!==p.name); state.favorites.delete(p.name); if(state.selectedName===p.name) state.selectedName=(state.points[0]||DEFAULT_POINTS[0]).name; savePoints(); saveFavs(); renderManage(); update();
    };
    row.append(label,del); list.appendChild(row);
  });
}
function openManage(){ renderManage(); $('manageDialog').showModal(); }
async function update(){
  const p=point(); renderPoints();
  const tideObj=tideSeries(p,selectedDate()); renderHeader(tideObj); drawTideChart(tideObj);
  await fetchData(p); renderNow(tideObj); renderHourly(); renderPoints();
}
$('prevDay').onclick=()=>{state.dateOffset--; update();}; $('nextDay').onclick=()=>{state.dateOffset++; update();}; $('dateButton').onclick=()=>{state.dateOffset=0; update();};
$('favoriteButton').onclick=()=>{ const p=point(); if(state.favorites.has(p.name)) state.favorites.delete(p.name); else state.favorites.add(p.name); saveFavs(); renderHeader(tideSeries(p,selectedDate())); renderPoints(); };
$('manageButton').onclick=openManage;
$('addPoint').onclick=()=>{
  const pref=$('addPref').value, name=$('addName').value.trim(), lat=parseFloat($('addLat').value), lon=parseFloat($('addLon').value);
  if(!name || !Number.isFinite(lat) || !Number.isFinite(lon)){ alert('名称・緯度・経度を入れてください'); return; }
  state.points = state.points.filter(p=>p.name!==name);
  state.points.push({name,pref,lat,lon,amp:60,base:115,phase:0}); savePoints(); state.selectedPref=pref; $('addName').value=''; $('addLat').value=''; $('addLon').value=''; renderManage(); renderPoints();
};
$('resetPoints').onclick=()=>{ state.points=structuredClone(DEFAULT_POINTS); state.selectedName='名古屋港'; state.favorites=new Set(['名古屋港']); savePoints(); saveFavs(); localStorage.setItem('ftbi.selected','名古屋港'); renderManage(); update(); };
setInterval(()=>{ const p=point(); const tideObj=tideSeries(p,selectedDate()); renderHeader(tideObj); drawTideChart(tideObj); renderNow(tideObj); }, 60_000);
update();
