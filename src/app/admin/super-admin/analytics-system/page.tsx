'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertOctagon, Archive, BarChart3,
  CheckCircle2, Clock, Database, Download, ExternalLink,
  FileUp, FlaskConical, HardDrive, Info, Loader2, MonitorDot,
  Play, RefreshCw, ServerCrash, Square, Timer,
  Trophy, UploadCloud, Users, Wifi, XCircle, Zap,
} from 'lucide-react';
import {
  addDoc, collection, limit, onSnapshot, orderBy, query,
  serverTimestamp, Timestamp, where,
  type DocumentData, type Query, type QuerySnapshot,
} from 'firebase/firestore';
import {
  Area, AreaChart, Bar, BarChart as RechartsBarChart, CartesianGrid,
  Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { isMonitoringDisabled } from '@/lib/monitoring-flags';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MENU_CONFIG } from '@/lib/menu-config';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

type FirestoreRow = Record<string, any> & { id: string };
type SimStatus   = 'idle' | 'confirm' | 'running' | 'completed' | 'stopped';
type SimScenario = 'login_storm' | 'page_access' | 'upload_storm' | 'export_storm' | 'mixed';
type SimMode     = 'visual_demo' | 'synthetic_load_test';
type AnalyticsSnapshotError = { code?: string; message?: string };

interface SimConfig {
  userCount: number;
  durationMinutes: number;
  scenario: SimScenario;
}

interface SimTimePoint {
  label: string;
  online: number;
  logins: number;
  pageViews: number;
  uploads: number;
  exports: number;
  errors: number;
  success: number;
  failed: number;
  avgResponseMs: number;
}

interface ModuleCount { module: string; count: number; }
interface RoleCount   { role: string;   count: number; color: string; }

interface SimStats {
  elapsedSeconds: number;
  onlineCount: number;
  totalEvents: number;
  successCount: number;
  failedCount: number;
  loginCount: number;
  pageViewCount: number;
  uploadCount: number;
  exportCount: number;
  errorCount: number;
  storageGrowthBytes: number;
  responseTimes: number[];
  timeline: SimTimePoint[];
  moduleBreakdown: ModuleCount[];
  roleBreakdown: RoleCount[];
  uploadDetails: { type: string; count: number; failCount: number; totalBytes: number }[];
}

// ── Simulation constants ───────────────────────────────────────────────────────

const TICK_MS     = 1000;
const CONFIRM_WORD = 'SAYA PAHAM';
const BAR_COLORS   = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#16a34a','#9333ea'];
const ANALYTICS_DISABLED = isMonitoringDisabled();

const FAKE_NAMES = [
  'Andi Pratama','Budi Santoso','Citra Dewi','Dian Permata','Eko Nugroho','Fajar Rahman',
  'Gita Kusuma','Hendra Wijaya','Indah Pertiwi','Joko Susilo','Kartini Sari','Lestari Wulan',
  'Mega Putri','Nurul Hidayah','Oka Putra','Putri Anggraini','Rizki Ramadhan','Siti Rahma',
  'Tari Dewi','Usman Fauzi','Vina Rahayu','Wahyu Setiawan','Yani Kurnia','Zahra Amalia',
  'Aris Budiman','Bela Pratiwi','Cahyo Wicaksono','Dita Safitri','Erfan Hidayat','Feli Nuraini',
  'Gunawan Saputra','Hani Sulistya','Imam Santoso','Jeni Marlina','Krisna Yudha','Lina Agustini',
  'Moch Daud','Nanda Permana','Okta Sari','Pandu Wibowo','Rian Kurniawan','Selvi Anggraeni',
  'Teguh Prasetyo','Ulfa Dewi','Vega Saputri','Widi Astuti','Yogi Pratama','Zul Fadli',
  'Agus Supriyanto','Bella Kusumawati','Chandra Priyatno','Devi Astuti','Eko Wahyudi',
  'Fitri Handayani','Galih Prabowo','Halimah Tusadiyah','Indri Lestari','Jati Nugraha',
];

const SIM_ROLES_DIST = ['karyawan','karyawan','karyawan','karyawan','karyawan','hrd','hrd','manager','manager','kandidat'];

const SIM_MODULES_BY_ROLE: Record<string,string[]> = {
  karyawan:     ['Absensi','Rekap Lembur','Cuti & Izin','Dashboard','Profil'],
  hrd:          ['User Management','Absensi','Recruitment','Cuti & Izin','Dashboard'],
  manager:      ['Cuti & Izin','Rekap Lembur','Dashboard','Absensi','Laporan'],
  kandidat:     ['Dashboard','Profil'],
  'super-admin':['Analytics Sistem','Backup & Export','Pengumuman Sistem','Data Integrity'],
};

const UPLOAD_TYPES = [
  { key:'Foto Absen',       exts:['jpg'],      sizeMin:  80_000, sizeMax:  250_000, module:'Absensi'     },
  { key:'Dokumen Kandidat', exts:['pdf'],       sizeMin: 300_000, sizeMax:2_000_000, module:'Recruitment' },
  { key:'Offering Letter',  exts:['pdf'],       sizeMin: 200_000, sizeMax:  800_000, module:'Recruitment' },
  { key:'Attachment Cuti',  exts:['pdf','jpg'], sizeMin: 100_000, sizeMax:  400_000, module:'Cuti & Izin' },
  { key:'Attachment Lembur',exts:['jpg','pdf'], sizeMin:  50_000, sizeMax:  300_000, module:'Rekap Lembur'},
];

const SCENARIO_META: Record<SimScenario,{label:string;desc:string;weights:Record<string,number>;errorRate:number}> = {
  login_storm:  {label:'Login Bersamaan',          desc:'Fokus penuh ke request login, auth, role, session, dan dashboard.',         weights:{login:1,  page:0,    upload:0,  export:0  }, errorRate:.05},
  page_access:  {label:'Akses Halaman Bersamaan',  desc:'Fokus ke page view, route ramai, load time, dan error per route.',          weights:{login:0,  page:1,    upload:0,  export:0  }, errorRate:.03},
  upload_storm: {label:'Upload Dokumen Bersamaan', desc:'Fokus ke upload file, jenis dokumen, ukuran file, dan error upload.',       weights:{login:0,  page:0,    upload:1,  export:0  }, errorRate:.08},
  export_storm: {label:'Export / Backup Bersamaan',desc:'Fokus ke request export/backup, file output, Drive, dan response time.',    weights:{login:0,  page:0,    upload:0,  export:1  }, errorRate:.10},
  mixed:        {label:'Aktivitas Campuran',       desc:'Gabungan login, page view, upload, export, backup, error, modul, dan role.',weights:{login:.2, page:.35,  upload:.25,export:.20}, errorRate:.05},
};

const SCENARIO_PIPELINES: Record<SimScenario,string[]> = {
  login_storm:  ['Request Login','Auth Verification','Role Check','Session Created','Dashboard Loaded'],
  page_access:  ['Route Requested','Permission Check','Data Fetch','Page Rendered'],
  upload_storm: ['Validasi File','Upload Berjalan','File Tersimpan','Metadata Tersimpan','Selesai'],
  export_storm: ['Request','Generate File','Upload Drive','Simpan Log','Selesai'],
  mixed:        ['Login','Page View','Upload','Export / Backup','Error Handling'],
};

const EMPTY_STATS: SimStats = {
  elapsedSeconds:0, onlineCount:0, totalEvents:0,
  successCount:0, failedCount:0, loginCount:0,
  pageViewCount:0, uploadCount:0, exportCount:0, errorCount:0,
  storageGrowthBytes:0, responseTimes:[], timeline:[],
  moduleBreakdown:[], roleBreakdown:[], uploadDetails:[],
};

// ── Utilities ──────────────────────────────────────────────────────────────────

function toDate(v:any):Date|null{
  if(!v)return null; if(v instanceof Date)return v;
  if(typeof v==='string'){const p=new Date(v);return isNaN(p.getTime())?null:p;}
  if(typeof v.toDate==='function')return v.toDate();
  if(typeof v.seconds==='number')return new Date(v.seconds*1000);
  return null;
}
function fmtDateTime(v:any){const d=toDate(v);return d?d.toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'}):'-';}
function fmtBytes(n:number){if(!n||n<=0)return'0 B';const u=['B','KB','MB','GB'];let v=n,i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}return`${v.toFixed(v>=10?0:1)} ${u[i]}`;}
function fmtMsDur(ms:number){if(ms<1000)return`${ms}ms`;return`${(ms/1000).toFixed(1)}s`;}
function fmtElapsed(s:number){const m=Math.floor(s/60),sec=Math.floor(s%60);return`${m}:${String(sec).padStart(2,'0')}`;}
function normalizeRole(r?:string|null){const raw=(r||'Unknown').toLowerCase();if(raw.includes('super'))return'Super Admin';if(raw.includes('hrd'))return'HRD';if(raw.includes('direktur')||raw.includes('director'))return'Direktur';if(raw.includes('manager'))return'Manager';if(raw.includes('kandidat'))return'Kandidat';if(raw.includes('karyawan'))return'Karyawan';return r||'Unknown';}
function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d;}
function minuteAgo(v:any){const d=toDate(v);if(!d)return'-';const diff=Math.round((Date.now()-d.getTime())/1000);if(diff<60)return`${diff}d lalu`;if(diff<3600)return`${Math.round(diff/60)}m lalu`;return`${Math.round(diff/3600)}j lalu`;}
function pct(n:number,t:number){return t>0?Math.round((n/t)*1000)/10:0;}
function p95(arr:number[]){if(!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length*.95)]??s[s.length-1];}
function avg(arr:number[]){return arr.length?Math.round(arr.reduce((a,b)=>a+b,0)/arr.length):0;}
function makeSimulationId(){return`sim_${Date.now()}_${Math.random().toString(16).slice(2,8)}`;}
function slowestStage(pipeline:{step:string;avgMs:number}[]){return pipeline.reduce((slow,item)=>item.avgMs>slow.avgMs?item:slow,pipeline[0]??{step:'-',avgMs:0});}
function loadProfile(userCount:number){
  const intensity=Math.max(0,Math.min(1,(userCount-25)/275));
  if(userCount>=300)return{intensity,activeMin:.72,activeMax:.96,eventFactor:.95,errorMin:.20,errorMax:.45,rtMin:3000,rtMax:8000};
  if(userCount>=100)return{intensity,activeMin:.58,activeMax:.88,eventFactor:.82,errorMin:.08,errorMax:.20,rtMin:1000,rtMax:2500};
  if(userCount>=50)return{intensity,activeMin:.45,activeMax:.75,eventFactor:.72,errorMin:.03,errorMax:.10,rtMin:600,rtMax:1200};
  return{intensity,activeMin:.28,activeMax:.55,eventFactor:.62,errorMin:0,errorMax:.05,rtMin:300,rtMax:700};
}
function randomBetween(min:number,max:number){return min+Math.random()*(max-min);}
function recommendationForScenario(scenario:SimScenario,errorRate:number,p95Ms:number,slowest:string){
  if(errorRate>10)return`Error rate tinggi. Prioritaskan investigasi tahap ${slowest}, cek rules/API, dan jalankan ulang simulasi setelah perbaikan.`;
  if(p95Ms>3000)return`P95 response tinggi. Optimasi tahap ${slowest}, batasi query, dan pertimbangkan batching/cache.`;
  if(scenario==='login_storm')return'Login flow terlihat stabil. Tetap pantau auth verification dan role check saat traffic puncak.';
  if(scenario==='upload_storm')return'Upload terlihat terkendali. Pastikan validasi ukuran file dan retry storage tetap aktif.';
  if(scenario==='export_storm')return'Export/backup terlihat terkendali. Pastikan log backup/export dan Drive upload tetap tercatat.';
  if(scenario==='page_access')return'Page access terlihat stabil. Pantau route paling ramai dan query yang dipakai halaman tersebut.';
  return'Aktivitas campuran terlihat wajar. Pantau modul dengan event paling tinggi dan error sporadis.';
}
function getSystemHealth(successRate:number,errorRate:number,p95Ms:number){
  if(successRate<80||p95Ms>6000||errorRate>20)return{label:'Tidak Stabil',bg:'bg-red-50',text:'text-red-700',border:'border-red-300',dot:'bg-red-500'};
  if(successRate>=95&&p95Ms<2000&&errorRate<=5)return{label:'Aman',bg:'bg-emerald-50',text:'text-emerald-700',border:'border-emerald-300',dot:'bg-emerald-500'};
  if(successRate>=90&&p95Ms<4000&&errorRate<=10)return{label:'Perlu Dipantau',bg:'bg-amber-50',text:'text-amber-700',border:'border-amber-300',dot:'bg-amber-500'};
  if(successRate>=80||(p95Ms>=4000&&p95Ms<=6000)||(errorRate>=10&&errorRate<=20))return{label:'Berat',bg:'bg-orange-50',text:'text-orange-700',border:'border-orange-300',dot:'bg-orange-500'};
  return{label:'Tidak Stabil',bg:'bg-red-50',text:'text-red-700',border:'border-red-300',dot:'bg-red-500'};
}

// ── Simulation engine ──────────────────────────────────────────────────────────

function generateFakeUsers(count:number){
  const used=new Set<string>();
  return Array.from({length:count},(_,i)=>{
    let name=FAKE_NAMES[i%FAKE_NAMES.length];
    if(used.has(name))name=`${name} ${Math.floor(i/FAKE_NAMES.length)+2}`;
    used.add(name);
    const role=SIM_ROLES_DIST[i%SIM_ROLES_DIST.length];
    const modules=SIM_MODULES_BY_ROLE[role]??['Dashboard'];
    return{uid:`sim_${i}`,displayName:name,role,currentModule:modules[Math.floor(Math.random()*modules.length)]};
  });
}

function generateTick(
  config:SimConfig,
  users:{uid:string;displayName:string;role:string;currentModule:string}[],
  moduleMap:Map<string,number>,
  roleMap:Map<string,number>,
  uploadDetailMap:Map<string,{count:number;failCount:number;totalBytes:number}>,
){
  const w=SCENARIO_META[config.scenario].weights;
  const profile=loadProfile(config.userCount);
  const scenarioRisk=SCENARIO_META[config.scenario].errorRate;
  const errRate=Math.min(.55,randomBetween(profile.errorMin,profile.errorMax)+(scenarioRisk*.25));
  const pipeline=SCENARIO_PIPELINES[config.scenario];
  const activeCount=Math.max(1,Math.ceil(users.length*randomBetween(profile.activeMin,profile.activeMax)));
  const eventCount=Math.max(1,Math.ceil(activeCount*profile.eventFactor));
  let logins=0,pageViews=0,uploads=0,exports=0,errors=0,success=0,failed=0,storageBytes=0;
  const rts:number[]=[];

  for(let i=0;i<eventCount;i++){
    const user=users[Math.floor(Math.random()*users.length)];
    const isErr=Math.random()<errRate;
    // For login/export/upload scenarios: track pipeline step names in moduleMap (not user module)
    const trackKey=(config.scenario==='login_storm'||config.scenario==='export_storm'||config.scenario==='upload_storm'||config.scenario==='page_access')
      ?pipeline[Math.floor(Math.random()*pipeline.length)]
      :user.currentModule||'Dashboard';

    if(isErr){
      errors++;failed++;rts.push(Math.round(randomBetween(profile.rtMin*.8,profile.rtMax*1.25)));
      moduleMap.set(trackKey,(moduleMap.get(trackKey)??0)+1);
      roleMap.set(normalizeRole(user.role),(roleMap.get(normalizeRole(user.role))??0)+1);
      continue;
    }

    const r=Math.random();
    if(r<w.login){logins++;rts.push(Math.round(randomBetween(profile.rtMin,profile.rtMax)));}
    else if(r<w.login+w.page){pageViews++;rts.push(Math.round(randomBetween(profile.rtMin*.7,profile.rtMax*.9)));}
    else if(r<w.login+w.page+w.upload){
      uploads++;
      const ut=UPLOAD_TYPES[Math.floor(Math.random()*UPLOAD_TYPES.length)];
      const sz=Math.round(ut.sizeMin+Math.random()*(ut.sizeMax-ut.sizeMin));
      storageBytes+=sz;
      const uf=Math.random()<Math.min(.5,errRate+.03);
      const cur=uploadDetailMap.get(ut.key)??{count:0,failCount:0,totalBytes:0};
      uploadDetailMap.set(ut.key,{count:cur.count+1,failCount:cur.failCount+(uf?1:0),totalBytes:cur.totalBytes+sz});
      if(uf){failed++;errors++;}else success++;
      rts.push(Math.round(randomBetween(profile.rtMin*1.2,profile.rtMax*1.45)));
      // For upload_storm, moduleMap already uses pipeline steps (trackKey above handles it)
      if(config.scenario==='mixed'){moduleMap.set(ut.module,(moduleMap.get(ut.module)??0)+1);}
      roleMap.set(normalizeRole(user.role),(roleMap.get(normalizeRole(user.role))??0)+1);
      continue;
    }else{exports++;rts.push(Math.round(randomBetween(profile.rtMin*1.5,profile.rtMax*1.8)));}

    success++;
    moduleMap.set(trackKey,(moduleMap.get(trackKey)??0)+1);
    roleMap.set(normalizeRole(user.role),(roleMap.get(normalizeRole(user.role))??0)+1);
  }
  return{logins,pageViews,uploads,exports,errors,success,failed,storageBytes,rts,activeUsers:activeCount};
}

// ── Realtime hook ──────────────────────────────────────────────────────────────

function useLimitedCollection(q:Query<DocumentData>|null,enabled:boolean){
  const[rows,setRows]=useState<FirestoreRow[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<AnalyticsSnapshotError|null>(null);
  const[pausedUntil,setPausedUntil]=useState(0);
  useEffect(()=>{
    let alive=true;
    const now=Date.now();
    if(pausedUntil>now){
      setLoading(false);
      const timeout=window.setTimeout(()=>setPausedUntil(0),pausedUntil-now);
      return()=>{alive=false;window.clearTimeout(timeout);};
    }
    if(!enabled||!q){setRows([]);setError(null);setLoading(false);return;}
    setLoading(true);
    setError(null);
    let unsub:(()=>void)|undefined;
    try{
      unsub=onSnapshot(
        q,
        (snap:QuerySnapshot<DocumentData>)=>{
          if(!alive)return;
          setRows(snap.docs.map(d=>({id:d.id,...d.data()})));
          setError(null);
          setLoading(false);
        },
        (err:any)=>{
          if(!alive)return;
          const code=err?.code??'unknown';
          if(code!=='permission-denied'&&code!=='failed-precondition'&&code!=='resource-exhausted')console.warn('[analytics]',code,err?.message);
          setError({code,message:err?.message});
          setRows([]);
          setLoading(false);
          if(code==='resource-exhausted'){
            unsub?.();
            setPausedUntil(Date.now()+60_000);
          }
        },
      );
    }catch(err:any){
      if(alive){
        const code=err?.code??'unknown';
        if(code!=='permission-denied'&&code!=='failed-precondition'&&code!=='resource-exhausted')console.warn('[analytics]',code,err?.message);
        setError({code,message:err?.message});
        setRows([]);
        setLoading(false);
        if(code==='resource-exhausted')setPausedUntil(Date.now()+60_000);
      }
    }
    return()=>{alive=false;unsub?.();};
  },[enabled,q,pausedUntil]);
  return{rows,loading,error,paused:pausedUntil>Date.now()};
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function MetricCard({icon:Icon,label,value,sub,tone='blue',pulse=false}:{icon:any;label:string;value:string|number;sub?:string;tone?:'blue'|'emerald'|'amber'|'red'|'violet'|'slate'|'orange';pulse?:boolean}){
  const t={blue:'border-blue-100 bg-blue-50 text-blue-700',emerald:'border-emerald-100 bg-emerald-50 text-emerald-700',amber:'border-amber-100 bg-amber-50 text-amber-700',red:'border-red-100 bg-red-50 text-red-700',violet:'border-violet-100 bg-violet-50 text-violet-700',slate:'border-slate-200 bg-slate-50 text-slate-700',orange:'border-orange-100 bg-orange-50 text-orange-700'}[tone];
  return(<Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[11px] font-medium text-slate-500 leading-tight">{label}</p><p className="mt-1.5 text-2xl font-bold text-slate-900 leading-none">{value}</p>{sub&&<p className="mt-1 text-[11px] text-slate-400">{sub}</p>}</div><div className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',t)}><Icon className="h-4 w-4"/>{pulse&&<span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"/></span>}</div></div></CardContent></Card>);
}

function SectionTitle({icon:Icon,title,sub}:{icon:any;title:string;sub?:string}){
  return(<div className="flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100"><Icon className="h-4 w-4 text-slate-600"/></div><div><p className="text-base font-semibold text-slate-800">{title}</p>{sub&&<p className="text-[11px] text-slate-400">{sub}</p>}</div></div>);
}

function ChartShell({title,children,empty,emptyMsg}:{title:string;children:React.ReactNode;empty?:boolean;emptyMsg?:string}){
  return(<Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><p className="text-sm font-semibold text-slate-800">{title}</p><div className="mt-4 h-52">{empty?(<div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 text-sm text-slate-400"><BarChart3 className="h-5 w-5 text-slate-300"/>{emptyMsg??'Data akan muncul saat simulasi berjalan.'}</div>):children}</div></CardContent></Card>);
}

function StatusBadge({status}:{status:string}){
  const s=(status??'').toLowerCase();
  if(s==='completed'||s==='success')return<Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]">Selesai</Badge>;
  if(s==='failed'||s==='error')return<Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px]">Gagal</Badge>;
  if(s==='started'||s==='running')return<Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px]">Berjalan</Badge>;
  return<Badge variant="outline" className="border-slate-200 text-slate-500 text-[10px]">{status||'-'}</Badge>;
}

// ── Realtime Monitoring Tab ───────────────────────────────────────────────────

function RealtimeMonitoringTab({enabled=true}:{enabled?:boolean}){
  const firestore=useFirestore();
  const[nowMs,setNowMs]=useState(()=>Date.now());
  useEffect(()=>{const id=window.setInterval(()=>setNowMs(Date.now()),30_000);return()=>window.clearInterval(id);},[]);

  const todayTs=useMemo(()=>Timestamp.fromDate(startOfToday()),[]);

  const onlineQ  =useMemo(()=>query(collection(firestore,'online_sessions'),       orderBy('lastSeen','desc'),limit(100)),[firestore]);
  const eventsQ  =useMemo(()=>query(collection(firestore,'system_analytics_events'),where('createdAt','>=',todayTs),   orderBy('createdAt','desc'),limit(200)),[firestore,todayTs]);
  const sessionsQ=useMemo(()=>query(collection(firestore,'session_logs'),           where('createdAt','>=',todayTs),   orderBy('createdAt','desc'),limit(200)),[firestore,todayTs]);
  const exportsQ =useMemo(()=>query(collection(firestore,'export_logs'),            where('createdAt','>=',todayTs),   orderBy('createdAt','desc'),limit(50)),[firestore,todayTs]);
  const backupsQ =useMemo(()=>query(collection(firestore,'backup_logs'),            where('createdAt','>=',todayTs),   orderBy('createdAt','desc'),limit(50)),[firestore,todayTs]);
  const errorsQ  =useMemo(()=>query(collection(firestore,'system_error_logs'),      where('createdAt','>=',todayTs),   orderBy('createdAt','desc'),limit(100)),[firestore,todayTs]);

  const online  =useLimitedCollection(onlineQ,enabled);
  const events  =useLimitedCollection(eventsQ,enabled);
  const sessions=useLimitedCollection(sessionsQ,enabled);
  const exportsT=useLimitedCollection(exportsQ,enabled);
  const backupsT=useLimitedCollection(backupsQ,enabled);
  const errorsT =useLimitedCollection(errorsQ,enabled);

  const onlineUsers=online.rows.filter(r=>!r.isTest&&!r.isSimulation&&((toDate(r.lastSeen)?.getTime()??0)>=nowMs-2*60*1000));
  const allEvents  =events.rows.filter(r=>!r.isTest&&!r.isSimulation);
  const loginLogs  =sessions.rows;
  const exportLogs =exportsT.rows.filter(r=>!r.isTest&&!r.isSimulation);
  const backupLogs =backupsT.rows.filter(r=>!r.isTest&&!r.isSimulation);
  const errorLogs  =errorsT.rows;
  const uploadLogs =allEvents.filter(r=>r.eventType==='file_uploaded');

  const recentEvents=useMemo(()=>allEvents.filter(r=>(toDate(r.createdAt)?.getTime()??0)>=Date.now()-15*60*1000),[allEvents]);
  const loginCount  =loginLogs.filter(r=>r.action==='login').length;
  const uploadFailed=uploadLogs.filter(r=>r.status==='failed').length;
  const storageBytes=uploadLogs.reduce((s,r)=>s+Number(r.metadata?.fileSize??0),0);

  const onlineTrend=useMemo(()=>
    Array.from({length:20},(_,i)=>{
      const d=new Date(Date.now()-(19-i)*60000);
      const users=new Set(allEvents.filter(r=>Math.abs((toDate(r.createdAt)?.getTime()??0)-d.getTime())<60000).map(r=>r.uid).filter(Boolean)).size;
      return{label:d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}),online:users};
    })
  ,[allEvents]);

  const featureData=useMemo(()=>{
    const m=new Map<string,number>();
    for(const ev of allEvents){const k=ev.module??'Lainnya';m.set(k,(m.get(k)??0)+1);}
    return[...m.entries()].map(([module,count])=>({module,count})).sort((a,b)=>b.count-a.count).slice(0,8);
  },[allEvents]);

  const loginPerHour=useMemo(()=>{
    const pts=Array.from({length:24},(_,h)=>({hour:`${String(h).padStart(2,'0')}:00`,login:0}));
    for(const l of loginLogs){if(l.action!=='login')continue;const d=toDate(l.createdAt);if(d)pts[d.getHours()].login++;}
    return pts;
  },[loginLogs]);

  const errorTrend=useMemo(()=>{
    const pts=Array.from({length:24},(_,h)=>({hour:`${String(h).padStart(2,'0')}:00`,error:0}));
    for(const l of errorLogs){const d=toDate(l.createdAt);if(d)pts[d.getHours()].error++;}
    return pts;
  },[errorLogs]);

  const roleBreakdown=useMemo(()=>{const m=new Map<string,number>();for(const u of onlineUsers)m.set(normalizeRole(u.role),(m.get(normalizeRole(u.role))??0)+1);return[...m.entries()].map(([role,count],i)=>({role,count,color:BAR_COLORS[i%BAR_COLORS.length]}));},[onlineUsers]);
  const moduleHeatmap=useMemo(()=>{const m=new Map<string,number>();for(const u of onlineUsers){const k=u.currentModule??'Lainnya';m.set(k,(m.get(k)??0)+1);}return[...m.entries()].map(([module,count])=>({module,count})).sort((a,b)=>b.count-a.count).slice(0,6);},[onlineUsers]);

  const anyLoading=online.loading||events.loading||sessions.loading;
  const noData    =onlineUsers.length===0&&allEvents.length===0&&loginCount===0;

  if(!enabled)return(
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      Analytics sedang dinonaktifkan sementara untuk mencegah Firestore quota exceeded.
    </div>
  );

  return(
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        {anyLoading
          ?<Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-700 text-[10px]"><Loader2 className="h-2.5 w-2.5 animate-spin"/>Memuat data realtime…</Badge>
          :<Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-flex"/>REALTIME DATA</Badge>
        }
      </div>

      {noData&&!anyLoading&&(
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <MonitorDot className="mx-auto h-8 w-8 text-slate-300"/>
          <p className="mt-3 text-base font-semibold text-slate-700">Belum ada aktivitas tercatat hari ini</p>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">Analytics aktif setelah user login dan membuka halaman. Gunakan tab <strong>Simulation Lab</strong> untuk melihat grafik simulasi.</p>
        </div>
      )}

      {/* Live Overview */}
      <section className="space-y-3">
        <SectionTitle icon={Wifi} title="Live Overview" sub="Snapshot kondisi sistem saat ini"/>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <MetricCard icon={Users}       label="User Online"      value={onlineUsers.length}                       sub="< 2 mnt lalu"       tone="emerald" pulse={onlineUsers.length>0}/>
          <MetricCard icon={Clock}       label="Login Hari Ini"   value={loginCount}                               sub="session_logs"       tone="blue"/>
          <MetricCard icon={Activity}    label="Aktivitas 15 Mnt" value={recentEvents.length}                      sub="page/module events"  tone="slate"/>
          <MetricCard icon={UploadCloud} label="Upload Hari Ini"  value={uploadLogs.length}                        sub="file_uploaded"      tone="violet"/>
          <MetricCard icon={FileUp}      label="Upload Gagal"     value={uploadFailed}                             sub="upload_failed"      tone={uploadFailed>0?'red':'slate'}/>
          <MetricCard icon={ServerCrash} label="Error Hari Ini"   value={errorLogs.length}                         sub="system_error_logs"  tone={errorLogs.length>0?'red':'emerald'}/>
          <MetricCard icon={Archive}     label="Backup/Export"    value={backupLogs.length+exportLogs.length}      sub="hari ini"           tone="amber"/>
          <MetricCard icon={HardDrive}   label="Storage Growth"   value={fmtBytes(storageBytes)}                   sub="upload hari ini"    tone="blue"/>
        </div>
      </section>

      {/* Concurrent Usage */}
      <section className="space-y-3">
        <SectionTitle icon={MonitorDot} title="Concurrent Usage" sub={`${onlineUsers.length} user sedang online`}/>
        <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
          <div className="space-y-3">
            <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
              <p className="text-sm font-semibold text-slate-800 mb-3">Online per Role</p>
              {roleBreakdown.length===0?<p className="text-sm text-slate-400 py-4 text-center">Tidak ada user online.</p>:<div className="space-y-2">{roleBreakdown.map(r=><div key={r.role} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{backgroundColor:r.color}}/><span className="text-sm font-medium text-slate-700">{r.role}</span></div><span className="text-sm font-bold text-slate-900">{r.count}</span></div>)}</div>}
            </CardContent></Card>
            <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
              <p className="text-sm font-semibold text-slate-800 mb-3">Modul Sedang Ramai</p>
              {moduleHeatmap.length===0?<p className="text-sm text-slate-400 py-4 text-center">Belum ada aktivitas.</p>:<div className="space-y-2">{moduleHeatmap.map((m)=><div key={m.module} className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-blue-100 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{width:`${Math.round((m.count/moduleHeatmap[0].count)*100)}%`}}/></div><span className="w-28 shrink-0 truncate text-right text-xs text-slate-600">{m.module}</span><span className="w-5 shrink-0 text-right text-xs font-bold">{m.count}</span></div>)}</div>}
            </CardContent></Card>
          </div>
          <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Tabel User Online</p>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1 text-[11px]"><span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"/>{onlineUsers.length} online</Badge>
            </div>
            {onlineUsers.length===0?<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-12 text-sm text-slate-400"><MonitorDot className="h-6 w-6 text-slate-300"/>Belum ada user online.</div>:(
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <Table><TableHeader><TableRow className="bg-slate-50 text-[11px]"><TableHead>Nama</TableHead><TableHead>Role</TableHead><TableHead>Modul / Halaman</TableHead><TableHead>Last Seen</TableHead><TableHead>Device</TableHead></TableRow></TableHeader>
                <TableBody>{onlineUsers.map(u=><TableRow key={u.id}><TableCell><p className="text-sm font-medium text-slate-800">{u.displayName||u.uid}</p><p className="text-[11px] text-slate-400">{u.email||'-'}</p></TableCell><TableCell className="capitalize text-xs">{u.role||'-'}</TableCell><TableCell><p className="text-xs font-medium text-slate-700">{u.currentModule||'-'}</p><p className="max-w-[160px] truncate text-[10px] text-slate-400">{u.currentPath||'-'}</p></TableCell><TableCell className="text-xs text-slate-500 whitespace-nowrap">{minuteAgo(u.lastSeen)}</TableCell><TableCell className="text-[11px] text-slate-400">{[u.device,u.browser].filter(Boolean).join(' / ')||'-'}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            )}
          </CardContent></Card>
        </div>
      </section>

      {/* Charts */}
      <section className="space-y-3">
        <SectionTitle icon={Activity} title="Grafik Realtime" sub="Tren 20 menit terakhir dan hari ini"/>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartShell title="User Online per Menit" empty={onlineTrend.every(p=>p.online===0)} emptyMsg="Belum ada aktivitas realtime.">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={onlineTrend}><defs><linearGradient id="ug" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={.2}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area type="monotone" dataKey="online" stroke="#2563eb" strokeWidth={2} fill="url(#ug)" name="User Online" dot={false}/></AreaChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Login per Jam Hari Ini" empty={loginPerHour.every(p=>p.login===0)} emptyMsg="Belum ada login hari ini.">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={loginPerHour}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="hour" tick={{fontSize:10}} interval={3}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Line type="monotone" dataKey="login" stroke="#10b981" strokeWidth={2} dot={false} name="Login"/></LineChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Aktivitas Fitur Hari Ini" empty={featureData.every(p=>p.count===0)} emptyMsg="Belum ada aktivitas modul.">
            <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={featureData} layout="vertical" margin={{left:16}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="module" type="category" tick={{fontSize:10}} width={100}/><Tooltip/><Bar dataKey="count" radius={[0,4,4,0]} name="Aktivitas">{featureData.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Error Trend Hari Ini" empty={errorTrend.every(p=>p.error===0)} emptyMsg="Tidak ada error — sistem normal.">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={errorTrend}><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={.2}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="hour" tick={{fontSize:10}} interval={3}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area type="monotone" dataKey="error" stroke="#dc2626" strokeWidth={2} fill="url(#eg)" name="Error" dot={false}/></AreaChart></ResponsiveContainer>
          </ChartShell>
        </div>
      </section>

      {/* Storage & Backup */}
      <section className="space-y-3">
        <SectionTitle icon={Database} title="Storage & Backup" sub="Backup, export, dan storage hari ini"/>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard icon={Archive}      label="Backup Hari Ini"  value={backupLogs.length}                                               sub="backup_logs"  tone="amber"/>
          <MetricCard icon={Download}     label="Export Hari Ini"  value={exportLogs.length}                                               sub="export_logs"  tone="blue"/>
          <MetricCard icon={HardDrive}    label="Storage Growth"   value={fmtBytes(storageBytes)}                                          sub="upload hari ini" tone="violet"/>
          <MetricCard icon={ExternalLink} label="File ke Drive"    value={[...backupLogs,...exportLogs].filter(r=>r.driveUrl||r.driveFileId).length} sub="Google Drive" tone="emerald"/>
        </div>
      </section>
      <p className="text-center text-xs text-slate-400 pb-2">Query dibatasi ke data hari ini dan lastSeen 2 menit terakhir.</p>
    </div>
  );
}

// ── Simulation Lab Tab ─────────────────────────────────────────────────────────

function SimulationLabTab(){
  const{firebaseUser,userProfile}=useAuth();
  const firestore=useFirestore();

  const[status,setStatus]=useState<SimStatus>('idle');
  const[simMode,setSimMode]=useState<SimMode>('visual_demo');
  const[config,setConfig]=useState<SimConfig>({userCount:25,durationMinutes:1,scenario:'login_storm'});
  const[customUsers,setCustomUsers]=useState('');
  const[confirmInput,setConfirmInput]=useState('');
  const[stats,setStats]=useState<SimStats>(EMPTY_STATS);
  const[reportSaved,setReportSaved]=useState(false);
  const[saving,setSaving]=useState(false);
  const[cleanupBusy,setCleanupBusy]=useState(false);
  const[testMessage,setTestMessage]=useState<string|null>(null);

  const statsRef      =useRef<SimStats>(EMPTY_STATS);
  const simulationIdRef=useRef(makeSimulationId());
  const moduleMapRef  =useRef(new Map<string,number>());
  const roleMapRef    =useRef(new Map<string,number>());
  const uploadMapRef  =useRef(new Map<string,{count:number;failCount:number;totalBytes:number}>());
  const startTimeRef  =useRef(0);
  const endTimeRef    =useRef(0);
  const durationMsRef =useRef(0);
  const fakeUsersRef  =useRef<{uid:string;displayName:string;role:string;currentModule:string}[]>([]);
  const intervalRef   =useRef<ReturnType<typeof setInterval>|null>(null);
  const tickInFlightRef=useRef(false);
  const runIdRef      =useRef(0);
  const persistenceWarningRef=useRef<string|null>(null);
  const firestoreCooldownUntilRef=useRef(0);
  const lastSummaryWriteSecondRef=useRef(-5);

  const customUserCount=customUsers.trim()?Math.max(1,Math.round(Number(customUsers))):null;
  const effectiveUserCount=customUserCount&&Number.isFinite(customUserCount)?customUserCount:config.userCount;
  const needsConfirm=effectiveUserCount>=50;
  const aggregateOnlyMode=simMode==='synthetic_load_test'&&effectiveUserCount>100;

  const syncStats=useCallback(()=>{
    const s=statsRef.current;
    const moduleBreakdown=[...moduleMapRef.current.entries()].map(([module,count])=>({module,count})).sort((a,b)=>b.count-a.count).slice(0,8);
    const roleBreakdown=[...roleMapRef.current.entries()].map(([role,count],i)=>({role,count,color:BAR_COLORS[i%BAR_COLORS.length]}));
    const uploadDetails=[...uploadMapRef.current.entries()].map(([type,v])=>({type,...v}));
    setStats({...s,moduleBreakdown,roleBreakdown,uploadDetails});
  },[]);

  const finishSimulation=useCallback(()=>{
    if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null;}
    runIdRef.current+=1;
    tickInFlightRef.current=false;
    statsRef.current.elapsedSeconds=durationMsRef.current/1000;
    syncStats();
    setStatus('completed');
  },[syncStats]);

  const stopSim=useCallback(()=>{
    if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null;}
    runIdRef.current+=1;
    const elapsedMs=startTimeRef.current?Math.max(0,Math.min(Date.now()-startTimeRef.current,durationMsRef.current||config.durationMinutes*60_000)):0;
    statsRef.current.elapsedSeconds=elapsedMs/1000;
    tickInFlightRef.current=false;
    syncStats();
    setStatus('stopped');
  },[config.durationMinutes,syncStats]);

  useEffect(()=>{
    if(status!=='running')return;
    startTimeRef.current=Date.now();
    durationMsRef.current=config.durationMinutes*60_000;
    endTimeRef.current=startTimeRef.current+durationMsRef.current;
    const runConfig={...config,userCount:effectiveUserCount};
    statsRef.current={...EMPTY_STATS,timeline:[]};
    moduleMapRef.current=new Map();
    roleMapRef.current=new Map();
    uploadMapRef.current=new Map();
    simulationIdRef.current=makeSimulationId();
    persistenceWarningRef.current=null;
    firestoreCooldownUntilRef.current=0;
    lastSummaryWriteSecondRef.current=-5;
    fakeUsersRef.current=generateFakeUsers(effectiveUserCount);
    tickInFlightRef.current=false;
    runIdRef.current+=1;
    const activeRunId=runIdRef.current;

    const generateEventTick=async(elapsed:number,total:number)=>{
      if(runIdRef.current!==activeRunId)return;
      if(tickInFlightRef.current)return;
      tickInFlightRef.current=true;
      let res:{
        logins:number;pageViews:number;uploads:number;exports:number;errors:number;
        success:number;failed:number;storageBytes:number;rts:number[];activeUsers?:number;
      };
      try{
        res=generateTick(runConfig,fakeUsersRef.current,moduleMapRef.current,roleMapRef.current,uploadMapRef.current);
      }catch(err:any){
        if(runIdRef.current!==activeRunId)return;
        setTestMessage(err?.message??'Synthetic Load Test gagal berjalan.');
        if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null;}
        setStatus('stopped');
        tickInFlightRef.current=false;
        return;
      }
      if(runIdRef.current!==activeRunId)return;
      const s=statsRef.current;
      s.elapsedSeconds   =elapsed;
      s.totalEvents      +=res.logins+res.pageViews+res.uploads+res.exports+res.errors;
      s.successCount     +=res.success;
      s.failedCount      +=res.failed;
      s.loginCount       +=res.logins;
      s.pageViewCount    +=res.pageViews;
      s.uploadCount      +=res.uploads;
      s.exportCount      +=res.exports;
      s.errorCount       +=res.errors;
      s.storageGrowthBytes+=res.storageBytes;
      s.responseTimes.push(...res.rts);
      s.onlineCount=res.activeUsers??Math.round(effectiveUserCount*(elapsed/total>0.1?0.65:0.4)+Math.random()*effectiveUserCount*.3);

      const timeLabel=fmtElapsed(elapsed);
      const lastPt=s.timeline[s.timeline.length-1];
      // Dynamic slot: 1-min → 5s (12 pts), 5-min → 15s (20 pts), 10-min → 30s (20 pts)
      const slotSec=config.durationMinutes<=1?5:config.durationMinutes<=5?15:30;
      if(!lastPt||elapsed-((s.timeline.length-1)*slotSec)>=slotSec){
        s.timeline.push({
          label:timeLabel,
          online:s.onlineCount,
          logins:res.logins,pageViews:res.pageViews,uploads:res.uploads,exports:res.exports,errors:res.errors,
          success:res.success,failed:res.failed,
          avgResponseMs:avg(res.rts),
        });
      }else{
        lastPt.logins+=res.logins;lastPt.pageViews+=res.pageViews;
        lastPt.uploads+=res.uploads;lastPt.exports+=res.exports;lastPt.errors+=res.errors;
        lastPt.success+=res.success;lastPt.failed+=res.failed;
        lastPt.online=s.onlineCount;
        lastPt.avgResponseMs=Math.round((lastPt.avgResponseMs+avg(res.rts))/2);
      }

      tickInFlightRef.current=false;
    };
    const clockTick=()=>{
      if(runIdRef.current!==activeRunId)return;
      const now=Date.now();
      const elapsedMs=Math.max(0,now-startTimeRef.current);
      const totalMs=durationMsRef.current;
      const elapsed=Math.min(elapsedMs,totalMs)/1000;
      const total=totalMs/1000;

      statsRef.current.elapsedSeconds=elapsed;
      syncStats();

      if(elapsedMs>=totalMs+2_000){
        finishSimulation();
        return;
      }
      if(elapsedMs>=totalMs){
        finishSimulation();
        return;
      }
      void generateEventTick(elapsed,total);
    };
    clockTick();
    intervalRef.current=setInterval(clockTick,TICK_MS);
    return()=>{if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null;}};
  },[status]);// eslint-disable-line react-hooks/exhaustive-deps

  const startSim=()=>{
    setTestMessage(null);
    if(simMode==='synthetic_load_test'&&!firebaseUser){setTestMessage('Sesi Super Admin tidak tersedia. Silakan login ulang.');return;}
    if(needsConfirm){setStatus('confirm');return;}
    setConfig(c=>({...c,userCount:effectiveUserCount}));
    setReportSaved(false);setStatus('running');
  };
  const confirmAndStart=()=>{
    if(confirmInput!==CONFIRM_WORD)return;
    setConfig(c=>({...c,userCount:effectiveUserCount}));
    setTestMessage(null);setConfirmInput('');setReportSaved(false);setStatus('running');
  };
  const resetSim=()=>{
    if(intervalRef.current){clearInterval(intervalRef.current);intervalRef.current=null;}
    runIdRef.current+=1;
    tickInFlightRef.current=false;
    setStatus('idle');setStats(EMPTY_STATS);setReportSaved(false);setTestMessage(null);
    simulationIdRef.current=makeSimulationId();
  };

  const cleanupTestData=async()=>{
    if(!firebaseUser||cleanupBusy)return;
    setCleanupBusy(true);
    try{
      const token=await firebaseUser.getIdToken();
      const response=await fetch('/api/admin/synthetic-test/cleanup',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({simulationId:simulationIdRef.current}),
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.success)throw new Error(data?.message??'Cleanup gagal.');
      setTestMessage(`Data test dibersihkan: ${data.deleted??0} dokumen untuk ${simulationIdRef.current}.`);
    }catch(err:any){
      setTestMessage(err?.message??'Cleanup gagal.');
    }finally{
      setCleanupBusy(false);
    }
  };

  const saveReport=async()=>{
    if(!userProfile||saving)return;
    if(ANALYTICS_DISABLED){
      setTestMessage('Analytics/monitoring sedang dinonaktifkan sementara. Laporan tidak disimpan ke Firestore.');
      return;
    }
    if(process.env.NEXT_PUBLIC_ENABLE_LOAD_TEST!=='true'){
      setTestMessage('Load test dinonaktifkan. Set NEXT_PUBLIC_ENABLE_LOAD_TEST=true untuk mengaktifkan penyimpanan laporan.');
      return;
    }
    if(simMode==='visual_demo'){
      setReportSaved(true);
      setTestMessage('Visual Demo tidak disimpan ke Firestore. Gunakan Synthetic Load Test untuk laporan test yang tercatat.');
      return;
    }
    setSaving(true);
    try{
      const s=stats;const rt=s.responseTimes;
      const avgMs=avg(rt);const p95Ms=p95(rt);
      const successRate=pct(s.successCount,s.totalEvents);
      const errorRate  =pct(s.failedCount, s.totalEvents);
      const requestPerMinute=s.elapsedSeconds>0?Math.round((s.totalEvents/s.elapsedSeconds)*60):0;
      const systemHealth=getSystemHealth(successRate,errorRate,p95Ms);
      const topModule  =s.moduleBreakdown[0]?.module??'-';
      await addDoc(collection(firestore,'load_test_reports'),{
        startedAt:new Date(startTimeRef.current).toISOString(),
        finishedAt:new Date().toISOString(),
        createdByUid:userProfile.uid,
        createdByEmail:userProfile.email??null,
        mode:simMode==='synthetic_load_test'?'synthetic_load_test':'visual_demo',
        isSimulation:true,
        isTest:simMode==='synthetic_load_test',
        simulationId:simulationIdRef.current,
        simulatedUsers:effectiveUserCount,
        userCount:effectiveUserCount,
        durationMinutes:config.durationMinutes,
        scenario:config.scenario,
        scenarioLabel:SCENARIO_META[config.scenario].label,
        totalEvents:s.totalEvents,successCount:s.successCount,failedCount:s.failedCount,
        successRate,errorRate,averageResponseMs:avgMs,p95ResponseMs:p95Ms,
        requestPerMinute,
        systemStatus:systemHealth.label,
        statusBasis:{
          successRate,
          errorRate,
          averageResponseMs:avgMs,
          p95ResponseMs:p95Ms,
          failedEvents:s.failedCount,
          bottleneckStep:topModule,
          requestPerMinute,
        },
        slowestStep:topModule,
        bottleneck:topModule,
        recommendation:recommendationForScenario(config.scenario,errorRate,p95Ms,topModule),
        storageGrowthBytes:s.storageGrowthBytes,
        summary:{topModule,loginCount:s.loginCount,pageViewCount:s.pageViewCount,uploadCount:s.uploadCount,exportCount:s.exportCount,errorCount:s.errorCount,onlinePeak:s.onlineCount},
        createdAt:serverTimestamp(),
      });
      setReportSaved(true);
    }catch(e){console.error(e);}
    finally{setSaving(false);}
  };

  const progress      =status==='completed'?100:Math.min(100,Math.round((stats.elapsedSeconds/(config.durationMinutes*60))*100));
  const avgMs         =avg(stats.responseTimes);
  const p95Ms         =p95(stats.responseTimes);
  const successRate   =pct(stats.successCount,stats.totalEvents);
  const errorRate     =pct(stats.failedCount, stats.totalEvents);
  const steps         =SCENARIO_PIPELINES[config.scenario];
  const meta          =SCENARIO_META[config.scenario];
  const running       =status==='running';
  const completed     =status==='completed';
  const stopped       =status==='stopped';
  const statusTitle   =running?'Simulasi Berjalan':completed?'Simulasi Selesai':stopped?'Dihentikan Manual':'';
  const activeStepIdx =Math.min(steps.length-1,Math.floor((progress/100)*steps.length));
  const activeStepName=steps[activeStepIdx]??'-';
  const timeRemaining =Math.max(0,config.durationMinutes*60-stats.elapsedSeconds);
  const reqPerMin     =stats.elapsedSeconds>0?Math.round((stats.totalEvents/stats.elapsedSeconds)*60):0;

  // Derived chart data
  const requestData=stats.timeline.map(p=>({
    label:p.label,
    requests:config.scenario==='login_storm'?p.logins:config.scenario==='page_access'?p.pageViews:config.scenario==='upload_storm'?p.uploads:config.scenario==='export_storm'?p.exports:p.logins+p.pageViews+p.uploads+p.exports,
    success:p.success,failed:p.failed,online:p.online,avgResponseMs:p.avgResponseMs,
    logins:p.logins,pageViews:p.pageViews,uploads:p.uploads,exports:p.exports,errors:p.errors,
  }));
  const heavyPoint=requestData.find(p=>{
    const total=(p.success??0)+(p.failed??0);
    const failPct=total>0?((p.failed??0)/total)*100:0;
    return p.avgResponseMs>=2000||failPct>=10;
  });
  const heavyPointText=heavyPoint
    ?`Beban mulai terasa setelah sekitar ${heavyPoint.online} user aktif bersamaan (${heavyPoint.label}).`
    :'Selama test ini belum terlihat titik beban yang jelas.';

  const health    =getSystemHealth(successRate,errorRate,p95Ms);
  const slowestSt =slowestStage(steps.map((step,i)=>({step,avgMs:avgMs+i*45})));
  const recommend =recommendationForScenario(config.scenario,errorRate,p95Ms,slowestSt.step);
  const loadConclusion =
    health.label==='Aman'?'Berdasarkan hasil test, sistem masih aman untuk skenario ini.':
    health.label==='Perlu Dipantau'?'Berdasarkan hasil test, sistem masih berjalan tetapi perlu dipantau karena beberapa metrik mulai naik.':
    health.label==='Berat'?'Berdasarkan hasil test, sistem mulai berat dan perlu optimasi.':
    'Berdasarkan hasil test, sistem tidak stabil untuk skenario ini.';
  const friendlyStep =
    slowestSt.step==='Page Rendered'?'halaman selesai dimuat':
    slowestSt.step==='Dashboard Loaded'?'dashboard selesai dimuat':
    slowestSt.step==='Role Check'?'pengecekan hak akses':
    slowestSt.step==='Auth Verification'?'pengecekan login':
    slowestSt.step==='Session Created'?'sesi login dibuat':
    slowestSt.step==='Data Fetch'?'pengambilan data halaman':
    slowestSt.step==='Route Requested'?'permintaan membuka halaman':
    slowestSt.step==='Permission Check'?'pengecekan izin akses':
    slowestSt.step==='Generate File'?'pembuatan file':
    slowestSt.step==='Upload Drive'?'pengiriman file ke Drive':
    slowestSt.step==='Simpan Log'?'pencatatan hasil':
    slowestSt.step.toLowerCase();
  const bottleneckMeaning =
    friendlyStep.includes('dashboard')?'setelah user login, sistem butuh waktu lebih lama untuk menampilkan dashboard, menu, dan data awal':
    friendlyStep.includes('halaman')?'setelah user membuka halaman, sistem butuh waktu lebih lama untuk menampilkan data sepenuhnya':
    friendlyStep.includes('hak akses')||friendlyStep.includes('izin')?'sistem membutuhkan waktu lebih lama untuk memastikan user boleh membuka fitur tersebut':
    friendlyStep.includes('file')?'sistem membutuhkan waktu lebih lama saat membuat atau mengirim file':
    friendlyStep.includes('login')?'sistem membutuhkan waktu lebih lama saat memeriksa proses login':
    `bagian ${friendlyStep} membutuhkan waktu paling lama dibanding bagian lain`;
  const userImpact =
    health.label==='Aman'?'User kemungkinan besar tetap bisa memakai sistem dengan lancar berdasarkan hasil test ini.':
    health.label==='Perlu Dipantau'?'User masih bisa memakai sistem, tetapi sebagian bisa mulai merasakan loading lebih lama.':
    health.label==='Berat'?'User bisa merasakan loading yang cukup lama, terutama saat banyak orang memakai sistem bersamaan.':
    'Sebagian user bisa mengalami proses gagal, loading terlalu lama, atau perlu mengulang aksi.';
  const conclusionRecommendations =
    config.scenario==='login_storm'
      ? ['Pantau proses setelah user berhasil login','Kurangi data yang langsung dimuat di dashboard awal','Pastikan menu dan hak akses tidak dibaca berulang-ulang','Jika user aktif bertambah, ulangi test dengan 50 atau 100 user']
      : config.scenario==='page_access'
        ? ['Pantau halaman yang paling sering dibuka','Kurangi data yang langsung dimuat saat halaman pertama dibuka','Pastikan menu dan hak akses tidak dibaca berulang-ulang','Jika user aktif bertambah, ulangi test dengan 50 atau 100 user']
        : config.scenario==='upload_storm'
          ? ['Batasi ukuran file yang diunggah','Tampilkan pesan jelas jika upload gagal','Pastikan data file test tersimpan di folder khusus test','Ulangi test dengan jumlah user lebih besar di staging']
        : config.scenario==='export_storm'
            ? ['Jalankan export atau backup besar di luar jam ramai','Kurangi jumlah data yang diproses dalam satu kali export','Pastikan hasil export dan backup selalu tercatat','Ulangi test di staging sebelum dipakai banyak user']
            : ['Pantau fitur yang paling sering dipakai','Kurangi data yang dimuat sekaligus saat halaman dibuka','Pastikan proses login, upload, dan export tidak saling membebani','Ulangi test di staging untuk jumlah user lebih besar'];
  const modeResultLabel =
    simMode==='synthetic_load_test'
      ? 'Hasil ini berasal dari synthetic test yang menjalankan alur asli dengan data dummy.'
      : 'Estimasi simulasi berbasis dummy, bukan hasil real server.';
  const resultEvidence =
    `Sistem memproses ${stats.totalEvents.toLocaleString()} event dengan proses berhasil ${successRate}%, proses gagal/terkendala ${errorRate}%, rata-rata waktu respons ${fmtMsDur(avgMs)}, waktu lambat yang masih sering terjadi ${fmtMsDur(p95Ms)}, ${stats.failedCount.toLocaleString()} event gagal, dan ${reqPerMin.toLocaleString()} request per menit.`;
  const userContext =
    effectiveUserCount>=100&&health.label==='Aman'
      ? `Walaupun simulasi menggunakan ${effectiveUserCount} user, sistem tetap dinilai aman karena mayoritas proses berhasil dan waktu respons tetap cepat.`
      : effectiveUserCount<=50&&(health.label==='Berat'||health.label==='Tidak Stabil')
        ? `Walaupun hanya ${effectiveUserCount} user, sistem dinilai bermasalah karena hasil test menunjukkan proses gagal atau waktu respons yang tinggi.`
        : `Jumlah ${effectiveUserCount} user dipakai sebagai konteks beban; status dihitung dari hasil proses, error, waktu respons, event gagal, dan request per menit.`;
  const headlineConclusion =
    health.label==='Aman'
      ? `Kesimpulan: Simulasi ${effectiveUserCount} user selama ${config.durationMinutes} menit berjalan baik berdasarkan hasil aktual test.`
      : health.label==='Perlu Dipantau'
        ? `Kesimpulan: Simulasi ${effectiveUserCount} user masih berjalan, tetapi perlu dipantau karena hasil test mulai menunjukkan kenaikan beban.`
        : health.label==='Berat'
          ? `Kesimpulan: Simulasi ${effectiveUserCount} user menunjukkan sistem mulai berat karena proses gagal ${errorRate}% dan waktu lambat ${fmtMsDur(p95Ms)}.`
          : `Kesimpulan: Simulasi ${effectiveUserCount} user menunjukkan sistem tidak stabil karena proses gagal ${errorRate}% dan waktu lambat ${fmtMsDur(p95Ms)}.`;
  const smoothProcessText =
    successRate>=95?'Sebagian besar proses berhasil tanpa kendala. Sistem masih merespons dengan cepat berdasarkan hasil test ini.':
    successRate>=85?'Sebagian besar proses masih berhasil, tetapi sudah ada sebagian kecil proses yang gagal atau melambat.':
    'Masih ada cukup banyak proses yang gagal atau terkendala, sehingga hasil test perlu diperhatikan.';

  // ── Scenario-specific live charts ──────────────────────────────────────────
  function ScenarioCharts(){
    const empty=requestData.length<2;
    if(config.scenario==='login_storm') return(
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell title="User Aktif per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="ong" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={.2}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area dataKey="online" stroke="#2563eb" strokeWidth={2} fill="url(#ong)" name="User Aktif" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Login Request per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Line dataKey="requests" stroke="#2563eb" strokeWidth={2} dot={false} name="Login request"/></LineChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Login Sukses vs Gagal per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="success" stackId="a" fill="#059669" name="Sukses" radius={[0,0,0,0]}/><Bar dataKey="failed" stackId="a" fill="#dc2626" name="Gagal" radius={[4,4,0,0]}/></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Response Time Login per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="rtg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={.2}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}} unit="ms"/><Tooltip/><Area dataKey="avgResponseMs" stroke="#7c3aed" strokeWidth={2} fill="url(#rtg)" name="Avg response (ms)" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Login per Role" empty={stats.roleBreakdown.length===0}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.roleBreakdown}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="role" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="#2563eb" radius={[4,4,0,0]} name="Login">{stats.roleBreakdown.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Pipeline Login (tahap diproses)" empty={stats.moduleBreakdown.length===0}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.moduleBreakdown} layout="vertical" margin={{left:16}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="module" type="category" width={140} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="#2563eb" radius={[0,4,4,0]} name="Event">{stats.moduleBreakdown.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
      </div>
    );

    if(config.scenario==='upload_storm') return(
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell title="User Aktif per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="ua" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={.2}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area dataKey="online" stroke="#7c3aed" strokeWidth={2} fill="url(#ua)" name="User Aktif" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Upload per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Line dataKey="requests" stroke="#7c3aed" strokeWidth={2} dot={false} name="Upload"/></LineChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Upload Sukses vs Gagal per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="success" stackId="a" fill="#059669" name="Sukses"/><Bar dataKey="failed" stackId="a" fill="#dc2626" name="Gagal"/></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Response Time Upload per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="urt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={.2}/><stop offset="95%" stopColor="#0891b2" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}} unit="ms"/><Tooltip/><Area dataKey="avgResponseMs" stroke="#0891b2" strokeWidth={2} fill="url(#urt)" name="Avg response (ms)" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Pipeline Upload (tahap diproses)" empty={stats.moduleBreakdown.length===0}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.moduleBreakdown} layout="vertical" margin={{left:16}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="module" type="category" width={140} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="#7c3aed" radius={[0,4,4,0]} name="Event">{stats.moduleBreakdown.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Ukuran File Upload" empty={stats.uploadDetails.every(u=>u.totalBytes===0)}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.uploadDetails}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="type" tick={{fontSize:10}}/><YAxis tickFormatter={v=>fmtBytes(Number(v))} tick={{fontSize:11}}/><Tooltip formatter={(v)=>fmtBytes(Number(v))}/><Bar dataKey="totalBytes" fill="#0891b2" radius={[4,4,0,0]} name="Ukuran file"/></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
      </div>
    );

    if(config.scenario==='export_storm') return(
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell title="User Aktif per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="ea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#d97706" stopOpacity={.2}/><stop offset="95%" stopColor="#d97706" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area dataKey="online" stroke="#d97706" strokeWidth={2} fill="url(#ea)" name="User Aktif" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Request Export / Backup per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Line dataKey="requests" stroke="#d97706" strokeWidth={2} dot={false} name="Request"/></LineChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Sukses vs Gagal per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="success" stackId="a" fill="#059669" name="Sukses"/><Bar dataKey="failed" stackId="a" fill="#dc2626" name="Gagal"/></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Response Time Export per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="ert" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={.2}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}} unit="ms"/><Tooltip/><Area dataKey="avgResponseMs" stroke="#7c3aed" strokeWidth={2} fill="url(#ert)" name="Avg response (ms)" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Pipeline Export / Backup (tahap diproses)" empty={stats.moduleBreakdown.length===0}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.moduleBreakdown} layout="vertical" margin={{left:16}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="module" type="category" width={140} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="#d97706" radius={[0,4,4,0]} name="Event">{stats.moduleBreakdown.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Error per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="errt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc2626" stopOpacity={.2}/><stop offset="95%" stopColor="#dc2626" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area dataKey="errors" stroke="#dc2626" strokeWidth={2} fill="url(#errt)" name="Error" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
      </div>
    );

    if(config.scenario==='page_access'){
      const routeData=[
        {route:'/dashboard',count:Math.round(stats.pageViewCount*.34),loadMs:avgMs+40,errors:Math.round(stats.errorCount*.2)},
        {route:'/hrd/absen',count:Math.round(stats.pageViewCount*.28),loadMs:avgMs+110,errors:Math.round(stats.errorCount*.35)},
        {route:'/recruitment',count:Math.round(stats.pageViewCount*.22),loadMs:avgMs+80,errors:Math.round(stats.errorCount*.25)},
        {route:'/karyawan/cuti',count:Math.round(stats.pageViewCount*.16),loadMs:avgMs+30,errors:Math.round(stats.errorCount*.2)},
      ];
      return(
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartShell title="User Aktif per Interval" empty={empty}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="pa" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={.2}/><stop offset="95%" stopColor="#059669" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area dataKey="online" stroke="#059669" strokeWidth={2} fill="url(#pa)" name="User Aktif" dot={false}/></AreaChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Page View per Interval" empty={empty}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Line dataKey="requests" stroke="#059669" strokeWidth={2} dot={false} name="Page view"/></LineChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Route Paling Ramai" empty={routeData.every(r=>r.count===0)}>
            <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={routeData} layout="vertical" margin={{left:12}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="route" type="category" width={130} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="#2563eb" radius={[0,4,4,0]} name="Page view"/></RechartsBarChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Load Time per Route (ms)" empty={routeData.every(r=>r.count===0)}>
            <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={routeData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="route" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}}/><Tooltip/><Bar dataKey="loadMs" fill="#7c3aed" radius={[4,4,0,0]} name="Load time"/></RechartsBarChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Pipeline Halaman (tahap diproses)" empty={stats.moduleBreakdown.length===0}>
            <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.moduleBreakdown} layout="vertical" margin={{left:16}}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="module" type="category" width={140} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="#059669" radius={[0,4,4,0]} name="Event">{stats.moduleBreakdown.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
          </ChartShell>
          <ChartShell title="Error per Route" empty={routeData.every(r=>r.errors===0)} emptyMsg="Tidak ada error route.">
            <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={routeData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="route" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="errors" fill="#dc2626" radius={[4,4,0,0]} name="Error"/></RechartsBarChart></ResponsiveContainer>
          </ChartShell>
        </div>
      );
    }

    // mixed scenario
    return(
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell title="User Aktif per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="mx" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={.2}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Area dataKey="online" stroke="#2563eb" strokeWidth={2} fill="url(#mx)" name="User Aktif" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Aktivitas Campuran per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Line dataKey="logins" stroke="#2563eb" strokeWidth={2} dot={false} name="Login"/><Line dataKey="pageViews" stroke="#059669" strokeWidth={2} dot={false} name="Page view"/><Line dataKey="uploads" stroke="#7c3aed" strokeWidth={2} dot={false} name="Upload"/><Line dataKey="exports" stroke="#d97706" strokeWidth={2} dot={false} name="Export"/><Line dataKey="errors" stroke="#dc2626" strokeWidth={2} dot={false} name="Error"/></LineChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Sukses vs Gagal per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={requestData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="success" stackId="a" fill="#059669" name="Sukses"/><Bar dataKey="failed" stackId="a" fill="#dc2626" name="Gagal"/></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Response Time per Interval" empty={empty}>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={requestData}><defs><linearGradient id="mrt" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={.2}/><stop offset="95%" stopColor="#7c3aed" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:11}} unit="ms"/><Tooltip/><Area dataKey="avgResponseMs" stroke="#7c3aed" strokeWidth={2} fill="url(#mrt)" name="Avg response (ms)" dot={false}/></AreaChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Aktivitas per Modul" empty={stats.moduleBreakdown.length===0}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.moduleBreakdown} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11}}/><YAxis dataKey="module" type="category" width={110} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="#2563eb" radius={[0,4,4,0]} name="Event"/></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
        <ChartShell title="Aktivitas per Role" empty={stats.roleBreakdown.length===0}>
          <ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.roleBreakdown}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="role" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="#7c3aed" radius={[4,4,0,0]} name="Event">{stats.roleBreakdown.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}</Bar></RechartsBarChart></ResponsiveContainer>
        </ChartShell>
      </div>
    );
  }

  // ── Setup panel ─────────────────────────────────────────────────────────────
  if(status==='idle'||status==='confirm') return(
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"/>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-800">Simulation Lab - Visual Demo atau Synthetic Load Test</p>
            <Badge className="bg-amber-500 text-white text-[10px] font-bold">SIMULATION DATA</Badge>
          </div>
          <p className="mt-1 text-sm text-amber-700">Realtime Monitoring hanya membaca data asli. Synthetic berjalan lokal untuk grafik realtime; Firestore hanya dipakai saat user menyimpan report.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          {mode:'visual_demo' as SimMode,title:'Visual Demo',desc:'Dummy visual lokal. Tidak menulis event dan tidak memanggil endpoint test.',tone:'border-amber-200 bg-amber-50 text-amber-800'},
          {mode:'synthetic_load_test' as SimMode,title:'Synthetic Load Test',desc:'Menghitung beban real HRP secara lokal. Tidak menulis event realtime ke Firestore saat test berjalan.',tone:'border-red-200 bg-red-50 text-red-800'},
        ].map(item=>(
          <button key={item.mode} onClick={()=>setSimMode(item.mode)} className={cn('rounded-xl border px-4 py-3 text-left transition-all',simMode===item.mode?item.tone:'border-slate-200 bg-white text-slate-700 hover:border-blue-300')}>
            <p className="text-sm font-bold">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-80">{item.desc}</p>
          </button>
        ))}
      </div>

      {simMode==='synthetic_load_test'&&(
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Jangan jalankan load test berat di production. Saat berjalan, grafik memakai local state; Firestore tidak ditulis sampai user klik Simpan Report.
          {aggregateOnlyMode&&<span className="mt-1 block font-semibold">Aggregate only aktif untuk {effectiveUserCount} user: raw event, tick summary, dan online session dummy tidak disimpan.</span>}
        </div>
      )}
      {testMessage&&<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{testMessage}</div>}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Jumlah User</p>
          <div className="space-y-2">
            {[25,50,100].map(v=><button key={v} onClick={()=>{setCustomUsers('');setConfig(c=>({...c,userCount:v}));}} className={cn('w-full rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-all',!customUsers&&config.userCount===v?'border-blue-400 bg-blue-50 text-blue-800':'border-slate-200 bg-white text-slate-700 hover:border-blue-300')}>{v} user{v>25&&<span className="ml-2 text-[10px] font-bold text-amber-600">Konfirmasi</span>}</button>)}
            <div className="flex items-center gap-2"><Input placeholder="Custom…" value={customUsers} onChange={e=>setCustomUsers(e.target.value)} className="text-sm" type="number" min={1}/><Button size="sm" variant="outline" onClick={()=>{const n=Math.max(1,Math.round(Number(customUsers)||25));setConfig(c=>({...c,userCount:n}));setCustomUsers(String(n));}}>Set</Button></div>
            {customUserCount&&customUserCount>=150&&<p className="text-[11px] font-medium text-red-600">Simulasi {customUserCount} user termasuk beban berat. Hasil synthetic membantu membaca pola, tetapi validasi penuh tetap disarankan di staging.</p>}
          </div>
        </CardContent></Card>

        <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Durasi Simulasi</p>
          <div className="space-y-2">
            {[{v:1,l:'1 menit — Cepat'},{v:5,l:'5 menit — Standar'},{v:10,l:'10 menit — Panjang'}].map(o=><button key={o.v} onClick={()=>setConfig(c=>({...c,durationMinutes:o.v}))} className={cn('w-full rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-all',config.durationMinutes===o.v?'border-blue-400 bg-blue-50 text-blue-800':'border-slate-200 bg-white text-slate-700 hover:border-blue-300')}>{o.l}</button>)}
          </div>
        </CardContent></Card>

        <Card className="border-slate-200 shadow-sm"><CardContent className="p-5">
          <p className="mb-3 text-sm font-semibold text-slate-800">Skenario</p>
          <div className="space-y-2">
            {Object.entries(SCENARIO_META).map(([k,v])=><button key={k} onClick={()=>setConfig(c=>({...c,scenario:k as SimScenario}))} className={cn('w-full rounded-lg border px-4 py-2.5 text-left transition-all',config.scenario===k?'border-blue-400 bg-blue-50':'border-slate-200 bg-white hover:border-blue-300')}><p className={cn('text-sm font-medium',config.scenario===k?'text-blue-800':'text-slate-700')}>{v.label}</p><p className="mt-0.5 text-[11px] text-slate-400">{v.desc}</p></button>)}
          </div>
        </CardContent></Card>
      </div>

      {/* Pipeline preview */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pipeline: {meta.label}</p>
        <div className="flex flex-wrap gap-2">
          {steps.map((step,i)=>(
            <div key={step} className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{i+1}</span>
              <span className="text-xs font-medium text-slate-700">{step}</span>
              {i<steps.length-1&&<span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
      </div>

      <Card className="border-blue-100 bg-blue-50 shadow-sm"><CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-900">Siap: {meta.label}</p>
            <p className="mt-1 text-sm text-blue-700">{effectiveUserCount} user · {config.durationMinutes} menit · Grafik bergerak saat berjalan</p>
          </div>
          <Button onClick={startSim} className={cn('gap-2 text-white shrink-0',simMode==='synthetic_load_test'?'bg-red-600 hover:bg-red-700':'bg-blue-600 hover:bg-blue-700')}><Play className="h-4 w-4"/>{simMode==='synthetic_load_test'?'Mulai Synthetic Load Test':'Mulai Visual Demo'}</Button>
        </div>
      </CardContent></Card>

      <Dialog open={status==='confirm'} onOpenChange={o=>{if(!o)setStatus('idle');}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertOctagon className="h-5 w-5 text-amber-500"/>Konfirmasi Simulasi Berat</DialogTitle><DialogDescription>Anda akan menjalankan simulasi dengan <strong>{effectiveUserCount} user</strong>. Ketik konfirmasi untuk melanjutkan.</DialogDescription></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Ketik <strong className="font-mono">{CONFIRM_WORD}</strong> untuk melanjutkan.</div>
            <Input value={confirmInput} onChange={e=>setConfirmInput(e.target.value)} placeholder={CONFIRM_WORD} className="font-mono text-center tracking-widest"/>
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={()=>setStatus('idle')}>Batal</Button><Button disabled={confirmInput!==CONFIRM_WORD} onClick={confirmAndStart} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white">Lanjutkan</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Running / Completed panel ────────────────────────────────────────────────
  return(
    <div className="space-y-5">
      {/* Header status */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {running&&<span className="flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-blue-400 opacity-75"/><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"/></span>}
              {completed&&<CheckCircle2 className="h-4 w-4 text-emerald-500"/>}
              {stopped&&<Square className="h-4 w-4 fill-amber-500 text-amber-500"/>}
              <p className="text-base font-semibold text-slate-800">{statusTitle}</p>
              <Badge className={cn('text-white text-[10px]',running?'bg-blue-600 animate-pulse':completed?'bg-emerald-600':stopped?'bg-amber-600':'bg-slate-400')}>{progress}%</Badge>
              <Badge className={cn('text-white text-[10px]',simMode==='synthetic_load_test'?'bg-red-600':'bg-amber-500')}>{simMode==='synthetic_load_test'?'SYNTHETIC':'VISUAL DEMO'}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{meta.label} · {effectiveUserCount} user · {fmtElapsed(stats.elapsedSeconds)} / {fmtElapsed(config.durationMinutes*60)}</p>
          </div>
          <div className="flex gap-2">
            {running&&<Button variant="outline" onClick={stopSim} className="gap-2 border-red-200 text-red-600 hover:bg-red-50"><Square className="h-3.5 w-3.5 fill-red-500"/>Stop</Button>}
            {simMode==='synthetic_load_test'&&<Button variant="outline" onClick={cleanupTestData} disabled={cleanupBusy||running} className="gap-2 border-red-200 text-red-600 hover:bg-red-50">{cleanupBusy?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<XCircle className="h-3.5 w-3.5"/>}Bersihkan Data Test</Button>}
            <Button variant="outline" onClick={resetSim} className="gap-2"><RefreshCw className="h-3.5 w-3.5"/>Reset</Button>
          </div>
        </div>
        <div className="px-5 pb-4">
          <Progress value={progress} className="h-2"/>
          {running&&(
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
              <p className="text-sm font-medium text-blue-800">Simulasi berjalan — <strong>{progress}% selesai</strong></p>
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-blue-700">
                <span>{stats.onlineCount} dari {effectiveUserCount} user sedang aktif</span>
                <span>Tahap aktif: <strong>{activeStepName}</strong></span>
                <span>Tersisa: <strong>{fmtElapsed(timeRemaining)}</strong></span>
              </div>
            </div>
          )}
          {stopped&&(
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-800">Dihentikan Manual - simulasi berhenti di {fmtElapsed(stats.elapsedSeconds)} dari {fmtElapsed(config.durationMinutes*60)}.</p>
              <p className="mt-1 text-xs text-amber-700">Report akhir hanya muncul jika simulasi selesai otomatis sesuai durasi.</p>
            </div>
          )}
        </div>
      </div>
      {testMessage&&<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{testMessage}</div>}

      {/* Live metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={Users}        label="User Aktif"     value={stats.onlineCount}       sub={`dari ${effectiveUserCount}`} tone="emerald" pulse={running}/>
        <MetricCard icon={Activity}     label="Total Event"    value={stats.totalEvents}        sub="akumulasi"                    tone="blue"/>
        <MetricCard icon={Activity}     label="Req / Menit"    value={reqPerMin}                sub="event/min"                    tone="orange"/>
        <MetricCard icon={CheckCircle2} label="Sukses"         value={stats.successCount}       sub={`${successRate}%`}            tone="emerald"/>
        <MetricCard icon={XCircle}      label="Gagal"          value={stats.failedCount}        sub={`${errorRate}%`}              tone={stats.failedCount>0?'red':'slate'}/>
        <MetricCard icon={Zap}          label="Avg Response"   value={fmtMsDur(avgMs)}          sub={`P95: ${fmtMsDur(p95Ms)}`}    tone="violet"/>
      </div>

      {/* Pipeline steps */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pipeline {meta.label}</p>
        <div className="flex flex-wrap gap-2">
          {steps.map((step,i)=>{
            const isDone=completed||(running&&i<activeStepIdx);
            const isActive=running&&i===activeStepIdx;
            return(
              <div key={step} className="flex items-center gap-1.5">
                <div className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',isDone?'bg-emerald-500 text-white':isActive?'bg-blue-600 text-white animate-pulse':'bg-slate-200 text-slate-500')}>{i+1}</div>
                <span className={cn('text-xs font-medium',isDone?'text-emerald-700':isActive?'text-blue-700':'text-slate-500')}>{step}</span>
                {i<steps.length-1&&<span className="text-slate-300">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live charts — update every tick while running */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle icon={BarChart3} title={`Grafik ${meta.label}`} sub="Bergerak mengikuti simulasi"/>
          <Badge className="bg-amber-500 text-white text-[10px] font-bold">SIMULATION DATA</Badge>
        </div>
        <ScenarioCharts/>
      </div>

      {/* Report — only after completed */}
      {completed&&(
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle icon={Trophy} title="Laporan Simulasi" sub="Hasil akhir setelah simulasi selesai"/>
            <div className="flex gap-2">
              {!reportSaved&&<Button size="sm" onClick={saveReport} disabled={saving||ANALYTICS_DISABLED||process.env.NEXT_PUBLIC_ENABLE_LOAD_TEST!=='true'} title={ANALYTICS_DISABLED?'Analytics/monitoring dinonaktifkan sementara':process.env.NEXT_PUBLIC_ENABLE_LOAD_TEST!=='true'?'Set NEXT_PUBLIC_ENABLE_LOAD_TEST=true untuk mengaktifkan':undefined} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">{saving?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Archive className="h-3.5 w-3.5"/>}Simpan</Button>}
              {reportSaved&&<Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3"/>Tersimpan</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-[11px] font-medium text-blue-600">Skenario</p><p className="mt-1 text-sm font-bold text-blue-900">{meta.label}</p></div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-[11px] font-medium text-slate-600">User</p><p className="mt-1 text-2xl font-bold text-slate-900">{effectiveUserCount}</p></div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-[11px] font-medium text-slate-600">Durasi</p><p className="mt-1 text-2xl font-bold text-slate-900">{config.durationMinutes}m</p></div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3"><p className="text-[11px] font-medium text-violet-600">Total Event</p><p className="mt-1 text-2xl font-bold text-violet-900">{stats.totalEvents.toLocaleString()}</p></div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3"><p className="text-[11px] font-medium text-emerald-600">Success Rate</p><p className="mt-1 text-2xl font-bold text-emerald-900">{successRate}%</p></div>
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3"><p className="text-[11px] font-medium text-red-600">Error Rate</p><p className="mt-1 text-2xl font-bold text-red-900">{errorRate}%</p></div>
            <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3"><p className="text-[11px] font-medium text-cyan-600">Avg Response</p><p className="mt-1 text-lg font-bold text-cyan-900">{fmtMsDur(avgMs)}</p></div>
            <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3"><p className="text-[11px] font-medium text-orange-600">P95 Response</p><p className="mt-1 text-lg font-bold text-orange-900">{fmtMsDur(p95Ms)}</p></div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3',health.border,health.bg)}>
              <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full',health.dot)}/>
              <div>
                <p className={cn('text-xs font-bold uppercase tracking-wider',health.text)}>Status Sistem: {health.label}</p>
                <p className={cn('mt-1 text-sm leading-relaxed',health.text)}>
                  Dinilai dari proses berhasil {successRate}%, proses gagal {errorRate}%, waktu lambat {fmtMsDur(p95Ms)}, {stats.failedCount.toLocaleString()} event gagal, dan {reqPerMin.toLocaleString()} request/menit.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Rekomendasi</p>
              <p className="mt-1 text-sm text-slate-600">{recommend}</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm font-semibold text-blue-900">Titik Mulai Berat</p>
            <p className="mt-1 text-sm text-blue-700">{heavyPointText}</p>
          </div>

          <Card className={cn('border shadow-sm',health.border,health.bg)}>
            <CardContent className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <SectionTitle icon={CheckCircle2} title="Kesimpulan Hasil Test" sub="Ringkasan bahasa umum untuk Super Admin"/>
                <Badge className={cn('w-fit text-white',health.label==='Aman'?'bg-emerald-600':health.label==='Perlu Dipantau'?'bg-amber-600':health.label==='Berat'?'bg-orange-600':'bg-red-600')}>
                  Status Beban: {health.label}
                </Badge>
              </div>

              <div className="mt-5 rounded-xl border border-white/80 bg-white/85 px-5 py-4">
                <p className="text-lg font-bold leading-snug text-slate-900">{headlineConclusion}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {loadConclusion} {userContext}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-500">{modeResultLabel}</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Total user diuji</p><p className="mt-1 text-xl font-bold text-slate-900">{effectiveUserCount} user</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Proses berhasil</p><p className="mt-1 text-xl font-bold text-emerald-700">{successRate}%</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Proses gagal/terkendala</p><p className="mt-1 text-xl font-bold text-red-700">{errorRate}%</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Rata-rata waktu respons</p><p className="mt-1 text-xl font-bold text-slate-900">{fmtMsDur(avgMs)}</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Waktu terlama yang masih umum terjadi</p><p className="mt-1 text-xl font-bold text-slate-900">{fmtMsDur(p95Ms)}</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Event gagal</p><p className="mt-1 text-xl font-bold text-red-700">{stats.failedCount.toLocaleString()}</p></div>
                <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">Request per menit</p><p className="mt-1 text-xl font-bold text-slate-900">{reqPerMin.toLocaleString()}</p></div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-white/70 bg-white/70 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Hasil Singkat</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Simulasi {effectiveUserCount} user menjalankan {meta.label.toLowerCase()} selama {config.durationMinutes} menit. {resultEvidence} Status beban ditentukan dari angka tersebut, bukan dari jumlah user saja.
                  </p>
                </div>

                <div className="rounded-xl border border-white/70 bg-white/70 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Yang Berjalan Lancar</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{smoothProcessText}</p>
                  <p className="mt-2 text-xs text-slate-400">Detail teknis: proses berhasil {successRate}%.</p>
                </div>

                <div className="rounded-xl border border-white/70 bg-white/70 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Kendala yang Muncul</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Bagian yang paling berat terjadi saat {friendlyStep}. Artinya, {bottleneckMeaning}. {heavyPointText}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Detail teknis: tahap asli {slowestSt.step}, waktu lambat yang masih sering terjadi {fmtMsDur(p95Ms)}.</p>
                </div>

                <div className="rounded-xl border border-white/70 bg-white/70 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Dampak ke User</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{userImpact}</p>
                </div>

                <div className="rounded-xl border border-white/70 bg-white/70 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Saran Tindakan</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {conclusionRecommendations.map(item=><li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"/><span>{item}</span></li>)}
                  </ul>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 px-4 py-3">
                <p className="text-xs leading-relaxed text-slate-500">
                  Catatan: Ini adalah synthetic test dengan data dummy yang mengikuti alur real HRP. Hasil mendekati pola penggunaan asli, tetapi untuk validasi server penuh tetap disarankan test di staging.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Load Test Report Tab ───────────────────────────────────────────────────────

function LoadTestReportTab({enabled=true}:{enabled?:boolean}){
  const firestore=useFirestore();
  const{firebaseUser}=useAuth();
  const[cleaningId,setCleaningId]=useState<string|null>(null);
  const reportsQ=useMemo(()=>query(collection(firestore,'load_test_reports'),orderBy('createdAt','desc'),limit(20)),[firestore]);
  const{rows,loading}=useLimitedCollection(reportsQ,enabled);

  const cleanupReport=async(simulationId?:string)=>{
    if(!firebaseUser||!simulationId)return;
    setCleaningId(simulationId);
    try{
      const token=await firebaseUser.getIdToken();
      await fetch('/api/admin/synthetic-test/cleanup',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({simulationId}),
      });
    }finally{
      setCleaningId(null);
    }
  };

  if(!enabled)return(
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      Analytics sedang dinonaktifkan sementara untuk mencegah Firestore quota exceeded.
    </div>
  );
  if(loading)return<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400"/></div>;
  if(rows.length===0)return(
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
      <Archive className="mx-auto h-8 w-8 text-slate-300"/>
      <p className="mt-3 text-base font-semibold text-slate-700">Belum ada laporan tersimpan</p>
      <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">Jalankan simulasi di tab <strong>Simulation Lab</strong>, lalu klik "Simpan" setelah selesai.</p>
    </div>
  );

  return(
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{rows.length} laporan tersimpan</p>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader><TableRow className="bg-slate-50 text-[11px]"><TableHead>Waktu</TableHead><TableHead>Mode</TableHead><TableHead>Skenario</TableHead><TableHead>User</TableHead><TableHead>Durasi</TableHead><TableHead>Total Event</TableHead><TableHead>Success Rate</TableHead><TableHead>Error Rate</TableHead><TableHead>Avg Response</TableHead><TableHead>P95</TableHead><TableHead>Storage</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(r=>(
              <TableRow key={r.id}>
                <TableCell className="text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell><Badge className={cn('text-[10px] text-white',r.mode==='synthetic_load_test'?'bg-red-600':'bg-amber-500')}>{r.mode==='synthetic_load_test'?'Synthetic':'Visual'}</Badge></TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] border-slate-200">{r.scenarioLabel??r.scenario??'-'}</Badge></TableCell>
                <TableCell className="text-sm font-medium text-slate-800">{r.userCount??r.simulatedUsers??'-'}</TableCell>
                <TableCell className="text-xs text-slate-600">{r.durationMinutes??'-'} mnt</TableCell>
                <TableCell className="text-sm font-medium">{(r.totalEvents??0).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline" className={cn('text-[10px]',(r.successRate??0)>=90?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-amber-200 bg-amber-50 text-amber-700')}>{r.successRate?.toFixed(1)??0}%</Badge></TableCell>
                <TableCell><Badge variant="outline" className={cn('text-[10px]',(r.errorRate??0)>5?'border-red-200 bg-red-50 text-red-700':'border-slate-200 text-slate-500')}>{r.errorRate?.toFixed(1)??0}%</Badge></TableCell>
                <TableCell className="text-xs text-slate-600">{fmtMsDur(r.averageResponseMs??0)}</TableCell>
                <TableCell className="text-xs text-slate-600">{fmtMsDur(r.p95ResponseMs??0)}</TableCell>
                <TableCell className="text-xs text-slate-600">{fmtBytes(r.storageGrowthBytes??0)}</TableCell>
                <TableCell>
                  {r.isTest&&r.simulationId?(
                    <Button size="sm" variant="outline" disabled={cleaningId===r.simulationId} onClick={()=>cleanupReport(r.simulationId)} className="h-7 gap-1 border-red-200 text-red-600">
                      {cleaningId===r.simulationId?<Loader2 className="h-3 w-3 animate-spin"/>:<XCircle className="h-3 w-3"/>}
                      Cleanup
                    </Button>
                  ):(
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AnalyticsSystemPage(){
  const hasAccess=useRoleGuard('super-admin');
  const menuConfig=useMemo(()=>MENU_CONFIG['super-admin']||[],[]);
  const[mainTab,setMainTab]=useState('realtime');
  const realtimeEnabled=!ANALYTICS_DISABLED&&mainTab==='realtime';
  const reportsEnabled=!ANALYTICS_DISABLED&&mainTab==='reports';

  if(!hasAccess)return<div className="flex h-screen w-full items-center justify-center p-4"><Skeleton className="h-[400px] w-full max-w-6xl"/></div>;

  return(
    <DashboardLayout pageTitle="Analytics Sistem" menuConfig={menuConfig}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50"><BarChart3 className="h-5 w-5 text-blue-600"/></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Analytics Sistem</h1>
              <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] font-semibold uppercase tracking-wide text-purple-700">Super Admin Only</Badge>
            </div>
            <p className="text-sm text-slate-500">Pantau aktivitas realtime dari Firestore. Jalankan simulasi load test di tab Simulation Lab tanpa mengganggu data asli.</p>
          </div>
        </div>

        {ANALYTICS_DISABLED&&(
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
            Analytics sedang dinonaktifkan sementara untuk mencegah Firestore quota exceeded.
          </div>
        )}

        <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="realtime"   className="gap-1.5 text-xs"><Wifi         className="h-3.5 w-3.5"/>Realtime</TabsTrigger>
            <TabsTrigger value="simulation" className="gap-1.5 text-xs"><FlaskConical className="h-3.5 w-3.5"/>Simulation Lab</TabsTrigger>
            <TabsTrigger value="reports"    className="gap-1.5 text-xs"><Archive      className="h-3.5 w-3.5"/>Load Test Report</TabsTrigger>
          </TabsList>

          <TabsContent value="realtime" className="mt-6">
            <RealtimeMonitoringTab enabled={realtimeEnabled}/>
          </TabsContent>

          {/* forceMount keeps SimulationLabTab in DOM so simulation state survives tab switches */}
          <TabsContent value="simulation" className="mt-6" forceMount>
            <div className={mainTab!=='simulation'?'hidden':undefined}>
              <SimulationLabTab/>
            </div>
          </TabsContent>

          <TabsContent value="reports" className="mt-6">
            <LoadTestReportTab enabled={reportsEnabled}/>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
