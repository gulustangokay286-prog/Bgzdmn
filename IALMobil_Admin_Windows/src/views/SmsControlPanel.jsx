import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Clock3, Eye, FileWarning, RefreshCw, Search, Smartphone
} from 'lucide-react';
import { netgsmService } from '../services/netgsmService';
import {
  Badge, Button, EmptyState, IconButton, Input, Modal, Panel, PanelHeader,
  Select, Stat, StatStrip
} from '../components/ui/panel';
import { cx, divider, eyebrow, hairline } from '../components/ui/tokens';

const STATUS_OPTIONS = [
  { id: 'all', label: 'Tümü' },
  { id: 'blocked', label: 'Gönderilmedi' },
  { id: 'missing_phone', label: 'Eksik telefon' },
  { id: 'pending', label: 'Bekliyor' },
  { id: 'sent', label: 'Gönderildi' },
  { id: 'failed', label: 'Başarısız' },
];

const STATUS_LABELS = {
  planned: ['Planlandı', 'neutral'],
  blocked: ['Engellendi', 'warning'],
  missing_phone: ['Telefon eksik', 'danger'],
  pending: ['Bekliyor', 'neutral'],
  sent: ['Gönderildi', 'success'],
  failed: ['Başarısız', 'danger'],
};

const SmsControlPanel = ({ balance, onRefreshBalance }) => {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ rows: [], summary: {}, missingPhones: [], historyAvailable: false });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showMissing, setShowMissing] = useState(false);
  const missingPopupShownRef = useRef(false);
  const loadSequenceRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    try {
      const result = await netgsmService.getSmsControl({ date, status, search });
      if (sequence !== loadSequenceRef.current || result.success === false) return;
      setData(result);
      if (!missingPopupShownRef.current && result.missingPhones?.length > 0) {
        missingPopupShownRef.current = true;
        setShowMissing(true);
      }
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [date, status, search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const summary = data.summary || {};
  const total = Number(summary.total || 0);
  const missingCount = data.missingPhones?.length || 0;
  const statusText = (value) => STATUS_LABELS[value] || [value || 'Bilinmiyor', 'neutral'];

  const groupedMissing = useMemo(() => {
    const map = new Map();
    for (const row of data.missingPhones || []) {
      const key = row.parentId || row.parentName;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.values()];
  }, [data.missingPhones]);

  return (
    <div className="flex flex-col gap-5">
      <StatStrip>
        <Stat label="SMS kredisi" value={balance == null ? '—' : new Intl.NumberFormat('tr-TR').format(balance)} hint="salt-okunur" />
        <Stat label="Audit kaydı" value={total} hint="seçili filtre" />
        <Stat label="Gönderilmedi" value={summary.blocked || 0} tone="warning" />
        <Stat label="Eksik telefon" value={missingCount} tone={missingCount ? 'danger' : 'default'} last />
      </StatStrip>

      <Panel>
        <PanelHeader title="SMS günlük kontrolü" description="Alıcı ve mesaj bazında işlem sonucu">
          <div className="flex items-center gap-1.5">
            <Button icon={Smartphone} onClick={onRefreshBalance}>Krediyi yenile</Button>
            <IconButton label="Audit'i yenile" icon={RefreshCw} variant="secondary" onClick={load} />
          </div>
        </PanelHeader>

        <div className={cx('grid grid-cols-1 md:grid-cols-[170px_180px_minmax(0,1fr)] gap-2.5 px-5 py-3 border-b', hairline)}>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Veli veya öğrenci ara" className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-[12.5px] text-slate-500">Kontrol kayıtları yükleniyor…</div>
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={FileWarning}
            title={data.historyAvailable ? 'Filtreye uygun kayıt yok' : 'Yeni audit kaydı yok'}
            description="Bu filtreye uyan SMS kaydı yok."
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className="min-w-[860px]">
              <div className={cx('grid grid-cols-[150px_minmax(0,1.2fr)_minmax(0,1.2fr)_150px_125px_70px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                <span className={eyebrow}>Zaman</span><span className={eyebrow}>Veli</span><span className={eyebrow}>Öğrenci</span><span className={eyebrow}>Telefon / sebep</span><span className={eyebrow}>Durum</span><span />
              </div>
              <div className={cx('divide-y', divider)}>
                {data.rows.map((row) => {
                  const [label, tone] = statusText(row.status);
                  return (
                    <div key={row.id} className="grid grid-cols-[150px_minmax(0,1.2fr)_minmax(0,1.2fr)_150px_125px_70px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                      <span className="text-[11.5px] text-slate-500 tnum">{row.created_at ? new Date(row.created_at).toLocaleString('tr-TR') : '—'}</span>
                      <span className="truncate text-[13px] text-slate-800 dark:text-slate-100">{row.parent_name || 'Özel liste'}</span>
                      <span className="truncate text-[13px] text-slate-600 dark:text-slate-300">{row.student_name || '—'}</span>
                      <span className="min-w-0 text-[11.5px] text-slate-500 dark:text-slate-400 truncate" title={row.reason_code || undefined}>{row.phone || row.reason_code || '—'}</span>
                      <Badge tone={tone}>{label}</Badge>
                      <IconButton label="Detay" icon={Eye} variant="secondary" onClick={async () => {
                        const result = await netgsmService.getSmsDetail(row.id);
                        setSelected(result.row || row);
                      }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Eksik veli telefonları" description="Öğrenci-veli ilişkilerinde telefonu bulunmayan kayıtlar">
          <Badge tone={missingCount ? 'danger' : 'success'}>{missingCount} kayıt</Badge>
        </PanelHeader>
        {missingCount === 0 ? (
          <div className="px-5 py-5 text-[12.5px] text-slate-500">Eksik veli telefonu bulunmuyor.</div>
        ) : (
          <div className={cx('divide-y', divider)}>
            {groupedMissing.slice(0, 8).map((rows) => (
              <div key={rows[0].parentId || rows[0].parentName} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><div className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-100">{rows[0].parentName}</div><div className="truncate text-[11.5px] text-slate-500">{rows.map((row) => row.studentName).join(', ')}</div></div>
                <Badge tone="danger">Telefon eksik</Badge>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal open={showMissing} onClose={() => setShowMissing(false)} title="Eksik veli telefonu uyarısı" description="Bildirim planları bu alıcılar için gönderilmedi olarak auditlenir." width="max-w-lg">
        <div className="p-5 flex flex-col gap-3">
          <div className="flex items-start gap-2 text-[12.5px] text-amber-800 dark:text-amber-200"><AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{missingCount} öğrenci-veli ilişkisinde geçerli telefon bulunamadı.</span></div>
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/10">
            {(data.missingPhones || []).map((row) => <div key={`${row.parentId}-${row.studentId}`} className="px-3 py-2.5"><div className="text-[12.5px] font-medium">{row.parentName}</div><div className="text-[11.5px] text-slate-500">Öğrenci: {row.studentName}</div></div>)}
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="SMS audit detayı" description={selected?.parent_name || 'Alıcı detayı'} width="max-w-xl">
        {selected && (
          <div className="p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-[12px]"><div><span className={eyebrow}>Öğrenci</span><div className="mt-1">{selected.student_name || '—'}</div></div><div><span className={eyebrow}>Durum</span><div className="mt-1"><Badge tone={statusText(selected.status)[1]}>{statusText(selected.status)[0]}</Badge></div></div></div>
            <div><span className={eyebrow}>Mesaj</span><pre className="m-0 mt-1 whitespace-pre-wrap rounded-lg bg-slate-100 dark:bg-white/[0.06] p-3 text-[12px] leading-relaxed">{selected.body}</pre></div>
            <div><span className={eyebrow}>İşlem geçmişi</span><div className="mt-2 flex flex-col gap-2">{(selected.timeline || []).map((event, index) => <div key={`${event.at}-${index}`} className="flex items-start gap-2 text-[12px]"><Clock3 size={14} className="mt-0.5 shrink-0 text-slate-400" /><span>{event.at ? new Date(event.at).toLocaleString('tr-TR') : '—'} · {event.event} {event.reasonCode ? `(${event.reasonCode})` : ''}</span></div>)}</div></div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SmsControlPanel;
