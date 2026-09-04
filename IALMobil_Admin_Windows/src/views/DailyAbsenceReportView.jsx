import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Search,
  Users,
  UserCheck,
  UserX,
  ShieldCheck,
  X,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { io } from 'socket.io-client';
import { db, rtdb } from '../services/firebaseConfig';
import { vdsUserService } from '../services/vdsUserService';
import { soundManager } from '../services/soundManager';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import useAttendanceConfig from '../hooks/useAttendanceConfig';

import { VDS_BASE_URL, VDS_SOCKET_URL } from '../services/vdsConfig';
import {
  evaluatePersonDay,
  normalizeScanRecord,
  sortAndDedupeScans,
  getDateKeyInTimeZone,
  getMinutesInTimeZone,
  isClosedDay as isClosedDayFn,
  isStaffRole,
  sumAbsenceWeight,
  timeToMinutes
} from '../services/attendanceRules';
import {
  Panel,
  PanelHeader,
  Button,
  Input,
  Select,
  Badge,
  Segmented,
  EmptyState
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const STATUS_BADGE_MAP = {
  present: { label: 'Mevcut', tone: 'success' },
  late: { label: 'Geç Giriş', tone: 'warning' },
  absent_full: { label: 'Tam Gün Devamsız', tone: 'danger' },
  absent_half: { label: 'Yarım Gün Devamsız', tone: 'warning' },
  excused: { label: 'İzinli / Raporlu', tone: 'neutral' },
  closed: { label: 'Kurum Kapalı', tone: 'neutral' }
};

const ROLE_FILTERS = [
  { id: 'student', label: 'Öğrenci' },
  { id: 'teacher', label: 'Öğretmen & İdareci' },
  { id: 'personnel', label: 'Personel' }
];

const CLASS_OPTIONS = [
  { id: 'all', label: 'Tüm Kademeler' },
  { id: '12', label: '12. Sınıf' },
  { id: '11', label: '11. Sınıf' },
  { id: '10', label: '10. Sınıf' },
  { id: '9', label: '9. Sınıf' }
];

const DailyAbsenceReportView = () => {
  const { config } = useAttendanceConfig();

  const parseUser = (data) => {
    if (!data) return null;
    const role = (data.role || data.fields?.role?.stringValue || '').toLowerCase().trim();
    const isStudent = role === 'student' || role === 'öğrenci';
    const staff = isStaffRole(role);
    if (!isStudent && !staff) return null;

    const profileImage = data.profile_image || data.fields?.profile_image?.stringValue || data.profileImageUrl || data.photo_url || null;
    const tc = data.tc_kimlik || data.fields?.tc_kimlik?.stringValue || data.tcKimlik || data.tc || '';
    const id = data.id || data._id;
    const aliases = data.aliases || [id, data._id, data.canonical_id, data.firebase_uid, data.school_number ? `std_${data.school_number}` : null].filter(Boolean);

    if (staff) {
      const isTeacherOrAdmin = ['teacher', 'öğretmen', 'admin', 'yönetici', 'superadmin', 'patron'].includes(role);
      return {
        id,
        aliases,
        role,
        isStaff: true,
        roleKind: isTeacherOrAdmin ? 'teacher' : 'personnel',
        name: data.full_name || data.fields?.full_name?.stringValue || data.fullName || (typeof data.name === 'string' && !data.name.startsWith('projects/') ? data.name : '') || data.displayName || 'İsimsiz Personel',
        tc,
        schoolNumber: '—',
        classGrade: '—',
        branch: (data.branch || data.fields?.branch?.stringValue || data.department || (isTeacherOrAdmin ? (['admin', 'yönetici'].includes(role) ? 'Yönetim / İdare' : 'Öğretmen') : 'Departman belirtilmemiş')).toUpperCase(),
        profileImage
      };
    }

    let branch = data.branch || data.fields?.branch?.stringValue || '';
    let classGrade = String(data.class_id || data.fields?.class_id?.stringValue || data.grade || '').trim();
    if (!branch && classGrade) {
      branch = `${classGrade}/${data.section || data.fields?.section?.stringValue || data.sube || 'A'}`;
    }
    if (branch) {
      const match = branch.match(/\d+/);
      if (match) classGrade = match[0];
    } else {
      branch = '12/A';
      classGrade = '12';
    }

    return {
      id,
      aliases,
      role: role || 'student',
      isStaff: false,
      roleKind: 'student',
      name: data.full_name || data.fields?.full_name?.stringValue || data.fullName || (typeof data.name === 'string' && !data.name.startsWith('projects/') ? data.name : '') || data.displayName || 'İsimsiz Öğrenci',
      tc,
      schoolNumber: data.school_number || data.fields?.school_number?.stringValue || data.schoolNumber || data.no || '—',
      classGrade,
      branch: branch.toUpperCase(),
      profileImage
    };
  };

  const [selectedDate, setSelectedDate] = useState(() => getDateKeyInTimeZone(new Date(), 'Europe/Istanbul'));
  const [allStudents, setAllStudents] = useState(() => {
    const initialList = vdsUserService.users || [];
    if (initialList.length > 0) {
      const seen = new Set();
      const uniqueUsers = [];
      for (const u of initialList) {
        const tc = (u.tc_kimlik || u.fields?.tc_kimlik?.stringValue || u.tcKimlik || u.tc || '').trim();
        const schoolNo = (u.school_number || u.fields?.school_number?.stringValue || u.schoolNumber || '').trim();
        const role = (u.role || u.fields?.role?.stringValue || '').toLowerCase();
        const name = (u.full_name || u.fields?.full_name?.stringValue || u.fullName || u.name || '').trim().toLowerCase();

        let key = '';
        if (tc && tc.length >= 10) key = `tc:${tc}`;
        else if (schoolNo && (role === 'student' || role === 'öğrenci' || role === 'ogrenci')) key = `sch:${schoolNo}`;
        else if (u.canonical_id) key = `canon:${u.canonical_id}`;
        else key = `nr:${name}_${role}`;

        if (!seen.has(key)) {
          seen.add(key);
          uniqueUsers.push(u);
        }
      }
      return uniqueUsers.map(parseUser).filter(Boolean);
    }
    return [];
  });
  const [vdsGateStatus, setVdsGateStatus] = useState({});
  const [vdsLogs, setVdsLogs] = useState({});
  const [rtdbLogs, setRtdbLogs] = useState({});
  const [rtdbGateStatus, setRtdbGateStatus] = useState({});
  const [firestoreLogs, setFirestoreLogs] = useState({});
  const [gateStatusMap, setGateStatusMap] = useState({});
  const [manualAttendance, setManualAttendance] = useState({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [loading, setLoading] = useState(() => !(vdsUserService.users && vdsUserService.users.length > 0));
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('student');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  const todayKey = useMemo(() => getDateKeyInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul'), [config.timeZone]);
  const isToday = selectedDate === todayKey;

  // 1. Load users primarily from VDS MongoDB
  useEffect(() => {
    let isMounted = true;
    const processUsers = (users) => {
      if (!users || users.length === 0) return;
      const seen = new Set();
      const uniqueUsers = [];
      for (const u of users) {
        const tc = (u.tc_kimlik || u.fields?.tc_kimlik?.stringValue || u.tcKimlik || u.tc || '').trim();
        const schoolNo = (u.school_number || u.fields?.school_number?.stringValue || u.schoolNumber || '').trim();
        const role = (u.role || u.fields?.role?.stringValue || '').toLowerCase();
        const name = (u.full_name || u.fields?.full_name?.stringValue || u.fullName || u.name || '').trim().toLowerCase();

        let key = '';
        if (tc && tc.length >= 10) key = `tc:${tc}`;
        else if (schoolNo && (role === 'student' || role === 'öğrenci' || role === 'ogrenci')) key = `sch:${schoolNo}`;
        else if (u.canonical_id) key = `canon:${u.canonical_id}`;
        else key = `nr:${name}_${role}`;

        if (!seen.has(key)) {
          seen.add(key);
          uniqueUsers.push(u);
        }
      }
      const parsed = uniqueUsers.map(parseUser).filter(Boolean);
      parsed.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
      if (isMounted && parsed.length > 0) {
        setAllStudents(parsed);
        setLoading(false);
      }
    };

    const loadUsers = async () => {
      try {
        let users = await vdsUserService.fetchAllUsers();
        if (!users || users.length === 0) {
          const res = await fetch(`${VDS_BASE_URL}/api/users?limit=1000`);
          if (res.ok) {
            const data = await res.json();
            users = data.users || [];
          }
        }
        processUsers(users);
      } catch (e) {
        console.warn('VDS Users fetch notice:', e?.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadUsers();

    const unsubVds = vdsUserService.subscribe((users) => {
      processUsers(users);
    });

    return () => {
      isMounted = false;
      unsubVds();
    };
  }, []);

  // 2. Fetch VDS gate status and today's live logs + Socket.io stream
  useEffect(() => {
    const fetchVdsData = async () => {
      try {
        const [statusRes, logsRes] = await Promise.allSettled([
          fetch(`${VDS_BASE_URL}/api/gate-status`),
          fetch(`${VDS_BASE_URL}/api/attendance/live`)
        ]);

        if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
          const data = await statusRes.value.json();
          if (data && data.map) setVdsGateStatus(data.map);
        }

        if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
          const data = await logsRes.value.json();
          if (data && Array.isArray(data.logs)) {
            const logsByStudent = {};
            data.logs.forEach(l => {
              const sid = l.studentId || l.userId;
              if (!sid) return;
              if (!logsByStudent[sid]) logsByStudent[sid] = [];
              const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '09:00';
              logsByStudent[sid].push({
                ...l,
                time: timeStr,
                direction: (l.action === 'entry' || l.status === 'entry') ? 'in' : 'out',
                action: l.action || l.status
              });
            });
            setVdsLogs(logsByStudent);
          }
        }
      } catch (err) {
        console.warn('VDS initial fetch notice:', err?.message);
      }
    };

    fetchVdsData();

    // VDS Real-time Socket.io
    const socket = io(VDS_SOCKET_URL || VDS_BASE_URL || window.location.origin, {
      reconnectionAttempts: 15,
      timeout: 5000
    });

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('new_scan', (data) => {
      const sid = data.studentId || data.userId;
      const allTargetIds = data.aliases || [
        sid,
        data.schoolNumber,
        data.schoolNumber ? `std_${data.schoolNumber}` : null,
        data.tc,
        data.firebaseUid
      ].filter(Boolean);

      if (allTargetIds.length > 0) {
        const timeStr = data.timestamp ? new Date(data.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '09:00';
        const isEntry = data.action === 'entry' || data.status === 'entry';
        const normalized = {
          ...data,
          time: timeStr,
          direction: isEntry ? 'in' : 'out',
          action: isEntry ? 'entry' : 'exit'
        };

        setVdsLogs(prev => {
          const next = { ...prev };
          allTargetIds.forEach(id => {
            next[id] = [normalized, ...(next[id] || [])];
          });
          return next;
        });

        setVdsGateStatus(prev => {
          const next = { ...prev };
          allTargetIds.forEach(id => {
            next[id] = {
              status: isEntry ? 'inside' : 'outside',
              date: todayKey,
              timestamp: data.timestamp || Date.now()
            };
          });
          return next;
        });

        soundManager.playSuccessDing();
      }
    });

    socket.on('gate_status_updated', (data) => {
      const sid = data?.studentId;
      const allTargetIds = data?.aliases || [sid].filter(Boolean);
      if (allTargetIds.length > 0) {
        setVdsGateStatus(prev => {
          const next = { ...prev };
          allTargetIds.forEach(id => {
            next[id] = {
              status: data.targetState || (data.status === 'entry' ? 'inside' : 'outside'),
              date: todayKey,
              timestamp: Date.now()
            };
          });
          return next;
        });
      }
    });

    return () => socket.disconnect();
  }, [todayKey]);

  // Pure VDS: Firebase listeners completely removed to prevent quota errors & stale data leaks

  const analyzedStudents = useMemo(() => {
    const isClosed = isClosedDayFn(selectedDate, config);
    const isPastDay = selectedDate < todayKey;
    const nowMinutes = isPastDay
      ? 1440
      : getMinutesInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul');

    return allStudents.map((student) => {
      const studentAliases = [
        student.id,
        student.canonicalId,
        student.schoolNumber,
        student.schoolNumber ? `std_${student.schoolNumber}` : null,
        student.tc,
        student.firebaseUid,
        student.uid
      ].filter(Boolean);

      let vdsStudentLogs = [];
      if (isToday) {
        for (const a of studentAliases) {
          if (vdsLogs[a] && vdsLogs[a].length > 0) {
            vdsStudentLogs = vdsLogs[a];
            break;
          }
        }
      }

      const scans = sortAndDedupeScans(vdsStudentLogs.map(normalizeScanRecord));

      const evaluation = evaluatePersonDay({
        scans,
        nowMinutes,
        config,
        isClosedDay: isClosed,
        isStaff: student.isStaff
      });

      const excuse = manualAttendance[student.id];

      // STRICT DATE CHECK: Dünden kalma veriyi bugüne ASLA karıştırma!
      let rawVdsStatus = null;
      for (const a of studentAliases) {
        if (vdsGateStatus[a]) {
          rawVdsStatus = vdsGateStatus[a];
          break;
        }
      }
      const validVdsStatus = (rawVdsStatus && (rawVdsStatus.date === selectedDate || (!rawVdsStatus.date && isToday))) ? rawVdsStatus : null;
      const gateStatus = validVdsStatus;
      const liveGateStatus = gateStatus?.status || '';
      const isTurnstileIn = liveGateStatus === 'entry' || liveGateStatus === 'inside' || liveGateStatus === 'in' || scans.some((s) => s.direction === 'in' || s.action === 'entry');

      const morningPresent = Boolean(
        gateStatus?.morningPresent ||
        evaluation.morning?.present ||
        scans.some(s => (s.direction === 'in' || s.action === 'entry') && (s.minutes || 0) <= 730)
      );

      const isGateAbsent = liveGateStatus === 'absent';

      let manualWeight = 0;
      if (excuse) {
        if (typeof excuse.absenceWeight === 'number') {
          manualWeight = excuse.absenceWeight;
        } else if (excuse.type) {
          manualWeight = sumAbsenceWeight(excuse.type);
        } else if (excuse.status === 'absent') {
          manualWeight = excuse.session === 'morning' ? 0.5 : 1.0;
        }
      }

      let status = 'present';
      let statusInfo = STATUS_BADGE_MAP.present;

      if (isClosed) {
        status = 'closed';
        statusInfo = STATUS_BADGE_MAP.closed;
      } else if (excuse?.status === 'excused') {
        status = 'excused';
        statusInfo = STATUS_BADGE_MAP.excused;
      } else if (manualWeight >= 1 || evaluation.absenceWeight >= 1) {
        status = 'absent_full';
        statusInfo = STATUS_BADGE_MAP.absent_full;
      } else if (student.isStaff) {
        // Öğretmen / İdareci / Personel için yoklama değerlendirmesi:
        const hasStaffEntry = isTurnstileIn || evaluation.isPresentToday || liveGateStatus === 'entry' || liveGateStatus === 'inside';
        if (hasStaffEntry) {
          status = 'present';
          statusInfo = STATUS_BADGE_MAP.present;
        } else if (isToday) {
          status = 'present';
          statusInfo = { label: 'Giriş Bekleniyor', tone: 'neutral' };
        } else {
          status = 'absent_full';
          statusInfo = STATUS_BADGE_MAP.absent_full;
        }
      } else if (manualWeight === 0.5 || isGateAbsent) {
        status = 'absent_half';
        statusInfo = STATUS_BADGE_MAP.absent_half;
      } else if (morningPresent || isTurnstileIn) {
        if (evaluation.isLate) {
          status = 'late';
          statusInfo = STATUS_BADGE_MAP.late;
        } else {
          status = 'present';
          statusInfo = STATUS_BADGE_MAP.present;
        }
      } else {
        if (isToday) {
          const halfDayMinutes = timeToMinutes(config.halfDayCutoffHour) || 840;
          if (nowMinutes >= halfDayMinutes) {
            status = 'absent_half';
            statusInfo = STATUS_BADGE_MAP.absent_half;
          } else {
            status = 'present';
            statusInfo = { label: 'Giriş Bekleniyor', tone: 'neutral' };
          }
        } else {
          status = 'absent_full';
          statusInfo = STATUS_BADGE_MAP.absent_full;
        }
      }

      const studentScans = vdsStudentLogs;
      const firstEntryScan = studentScans.find(s => s.action === 'entry' || s.direction === 'in');
      const lastExitScan = studentScans.find(s => s.action === 'exit' || s.direction === 'out');

      const morningEntry = firstEntryScan?.time || (morningPresent ? (gateStatus?.morningEntryTime || gateStatus?.time || '09:00') : null);
      const morningExit = lastExitScan?.time || (gateStatus?.lunchExitTime || (liveGateStatus === 'exit' ? '12:10' : null));
      const afternoonEntry = evaluation.afternoon?.entryTime || '—';
      const staffEntryTime = evaluation.day?.entryTime || firstEntryScan?.time || gateStatus?.time || (liveGateStatus === 'entry' ? '09:00' : null);

      return {
        ...student,
        status,
        statusLabel: statusInfo.label,
        statusTone: statusInfo.tone,
        morningStatus: student.isStaff
          ? (staffEntryTime ? `Giriş: ${staffEntryTime}` : (isToday ? 'Giriş Bekleniyor' : 'Giriş Yok'))
          : (morningPresent ? `Giriş: ${morningEntry || '09:00'}${morningExit ? ` | Çıkış: ${morningExit}` : ''}` : (isToday && nowMinutes < (timeToMinutes(config.halfDayCutoffHour) || 730) ? 'Giriş Bekleniyor' : 'Giriş Yok (Devamsız)')),
        afternoonStatus: student.isStaff
          ? '—'
          : (afternoonEntry !== '—' ? `Giriş: ${afternoonEntry}` : (nowMinutes < 810 ? 'Öğle Arası (Giriş: 13:30)' : 'Giriş Bekleniyor')),
        detailNote: excuse?.courseName || (isGateAbsent ? 'Sabah Girişi Yapılmadı (0.5 Gün)' : (liveGateStatus === 'exit' ? 'Öğle Çıkışı Yapıldı' : 'Düzenli')),
        isLate: student.isStaff ? false : evaluation.isLate,
        isPresent: isTurnstileIn || status === 'present' || status === 'late'
      };
    });
  }, [allStudents, vdsLogs, vdsGateStatus, rtdbLogs, firestoreLogs, manualAttendance, gateStatusMap, rtdbGateStatus, selectedDate, todayKey, isToday, config]);

  // Sayaclar yalnizca secili rolu kapsar; ogrenci ile personel karismaz.
  const scopedPeople = useMemo(
    () => analyzedStudents.filter((s) => s.roleKind === roleFilter),
    [analyzedStudents, roleFilter]
  );

  const roleCounts = useMemo(() => ({
    student: analyzedStudents.filter((s) => s.roleKind === 'student').length,
    teacher: analyzedStudents.filter((s) => s.roleKind === 'teacher').length,
    personnel: analyzedStudents.filter((s) => s.roleKind === 'personnel').length
  }), [analyzedStudents]);

  const totalCount = scopedPeople.length;
  const presentCount = scopedPeople.filter((s) => s.status === 'present' || s.status === 'late').length;
  const fullAbsentCount = scopedPeople.filter((s) => s.status === 'absent_full').length;
  const halfAbsentCount = scopedPeople.filter((s) => s.status === 'absent_half').length;
  const totalAbsentCount = fullAbsentCount + halfAbsentCount;
  const excusedCount = scopedPeople.filter((s) => s.status === 'excused').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

  const statusFilterButtons = useMemo(() => [
    { id: 'all', label: 'Tüm Liste', icon: Users, count: totalCount },
    { id: 'present', label: 'Mevcutlar', icon: UserCheck, count: presentCount },
    { id: 'absent', label: 'Devamsızlar', icon: UserX, count: totalAbsentCount },
    { id: 'excused', label: 'İzinli / Raporlu', icon: ShieldCheck, count: excusedCount }
  ], [totalCount, presentCount, totalAbsentCount, excusedCount]);

  const filteredStudents = useMemo(() => {
    return analyzedStudents.filter((student) => {
      if (student.roleKind !== roleFilter) return false;
      if (roleFilter === 'student' && selectedClassFilter !== 'all' && student.classGrade !== selectedClassFilter) {
        return false;
      }
      if (selectedStatusFilter === 'absent' && !(student.status === 'absent_full' || student.status === 'absent_half')) {
        return false;
      }
      if (selectedStatusFilter === 'present' && !(student.status === 'present' || student.status === 'late')) {
        return false;
      }
      if (selectedStatusFilter === 'excused' && student.status !== 'excused') {
        return false;
      }
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          student.name.toLowerCase().includes(q) ||
          student.schoolNumber.includes(q) ||
          student.tc.includes(q) ||
          student.branch.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analyzedStudents, roleFilter, selectedClassFilter, selectedStatusFilter, searchText]);

  const groupedStudents = useMemo(() => {
    const groups = {};
    filteredStudents.forEach((student) => {
      const groupKey = student.branch || `${student.classGrade}/A`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(student);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      if (numA !== numB) return numB - numA;
      return a.localeCompare(b, 'tr');
    });

    const result = {};
    sortedKeys.forEach((k) => {
      groups[k].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
      result[k] = groups[k];
    });

    return result;
  }, [filteredStudents]);

  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kapatın.');
      return;
    }

    const formattedDate = new Date(selectedDate).toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let tableHtml = '';
    Object.entries(groupedStudents).forEach(([branch, list]) => {
      tableHtml += `
        <div style="margin-top: 18px; margin-bottom: 8px;">
          <div style="background: #0f172a; color: #ffffff; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 4px; display: flex; justify-content: space-between;">
            <span>${branch} ŞUBESİ</span>
            <span>${list.length} Öğrenci</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11.5px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px; width: 30px;">#</th>
                <th style="padding: 6px 8px;">Öğrenci Adı Soyadı</th>
                <th style="padding: 6px 8px; width: 110px;">T.C. Kimlik</th>
                <th style="padding: 6px 8px; width: 70px;">Okul No</th>
                <th style="padding: 6px 8px; width: 90px;">Sabah</th>
                <th style="padding: 6px 8px; width: 90px;">Öğleden Sonra</th>
                <th style="padding: 6px 8px; width: 120px; text-align: right;">Durum</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (s, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fafafa;' : ''}">
                  <td style="padding: 5px 8px;">${idx + 1}</td>
                  <td style="padding: 5px 8px; font-weight: 600;">${s.name}</td>
                  <td style="padding: 5px 8px; font-family: monospace;">${s.tc || '—'}</td>
                  <td style="padding: 5px 8px;">${s.schoolNumber || '—'}</td>
                  <td style="padding: 5px 8px;">${s.morningStatus}</td>
                  <td style="padding: 5px 8px;">${s.afternoonStatus}</td>
                  <td style="padding: 5px 8px; text-align: right; font-weight: 600;">
                    ${s.statusLabel}
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    });

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Boğaziçi Koleji - Günlük Ders ve Devamsızlık Raporu (${selectedDate})</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .header { text-align: center; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .header h1 { margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
          .header h2 { margin: 2px 0 0 0; font-size: 12.5px; font-weight: normal; color: #475569; }
          .stats-bar { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 12px; font-size: 11px; margin-bottom: 12px; font-weight: 600; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11.5px; page-break-inside: avoid; }
          .signature-box { text-align: center; width: 160px; border-top: 1px solid #94a3b8; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BOĞAZİÇİ KOLEJİ</h1>
          <h2>GÜNLÜK DERS VE DEVAMSIZLIK ÇİZELGESİ</h2>
          <div style="margin-top: 4px; font-size: 11.5px; font-weight: 600; color: #0f172a;">${formattedDate}</div>
        </div>

        <div class="stats-bar">
          <span>Toplam: ${totalCount} Öğrenci</span>
          <span>Katılım: %${attendanceRate}</span>
          <span>Mevcut: ${presentCount}</span>
          <span>Devamsız: ${totalAbsentCount}</span>
          <span>İzinli: ${excusedCount}</span>
        </div>

        ${tableHtml}

        <div class="footer">
          <div class="signature-box">Nöbetçi Öğretmen<br><br><br>İmza</div>
          <div class="signature-box">Müdür Yardımcısı<br><br><br>İmza</div>
          <div class="signature-box">Okul Müdürü<br><br><br>Mühür / İmza</div>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  };

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
              Günlük Devamsızlık Raporu
            </h1>
            {isToday && (
              <Badge tone="success">Canlı Gün</Badge>
            )}
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {socketConnected ? 'VDS Gerçek Zamanlı Akış Aktif' : 'VDS Bağlanıyor...'}
            </span>
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {new Date(selectedDate).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Turnike, karekod ve izinlerin anlık çizelgesi
          </p>

          <div className="mt-3">
            <Segmented
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_FILTERS.map((r) => ({ ...r, count: roleCounts[r.id] }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayKey)}
              className="h-9 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-[12.5px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
            >
              Bugüne Dön
            </button>
          )}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 px-3 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/12 text-[13px] font-medium text-slate-800 dark:text-slate-200 outline-none cursor-pointer shadow-none"
          />
          <Button variant="secondary" icon={Printer} onClick={handlePrintPDF}>
            Yazdır / PDF
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {statusFilterButtons.map((filter) => {
          const Icon = filter.icon;
          const isActive = selectedStatusFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setSelectedStatusFilter(filter.id)}
              className={cx(
                'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer',
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-xs'
                  : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
              )}
            >
              <Icon size={14} strokeWidth={1.9} />
              {filter.label}
              <span className={cx('tnum font-semibold', isActive ? 'opacity-70' : 'text-slate-400 dark:text-slate-500')}>
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>

      <Panel>
        <div className={cx('flex flex-col sm:flex-row gap-2.5 px-5 py-3 border-b', hairline)}>
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder={roleFilter === 'student' ? 'Ad soyad, şube (12/A), okul no veya TC ara' : 'Ad soyad, branş/departman veya TC ara'}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {roleFilter === 'student' && (
            <div className="sm:w-48 shrink-0">
              <Select value={selectedClassFilter} onChange={(e) => setSelectedClassFilter(e.target.value)}>
                {CLASS_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-white/[0.01]">
          <span>
            Toplam <strong className="text-slate-900 dark:text-white tnum">{filteredStudents.length}</strong>{' '}
            {roleFilter === 'student' ? 'öğrenci' : roleFilter === 'teacher' ? 'öğretmen' : 'personel'} listeleniyor
          </span>
          <span className="text-[11.5px]">
            Katılım: <strong className="text-emerald-600 dark:text-emerald-400 tnum">%{attendanceRate}</strong>
          </span>
        </div>
      </Panel>

      <div className="flex flex-col gap-5">
        {Object.keys(groupedStudents).length === 0 ? (
          <Panel>
            <EmptyState
              icon={FileText}
              title="Kayıt bulunamadı"
              description="Seçilen filtre kriterlerine ve arama metnine uygun öğrenci kaydı bulunamadı."
              action={
                <Button onClick={() => { setSearchText(''); setSelectedClassFilter('all'); setSelectedStatusFilter('all'); }}>
                  Filtreleri Sıfırla
                </Button>
              }
            />
          </Panel>
        ) : (
          Object.entries(groupedStudents).map(([branchName, studentList]) => {
            const classPresent = studentList.filter((s) => s.status === 'present' || s.status === 'late').length;
            const classAbsent = studentList.filter((s) => s.status === 'absent_full' || s.status === 'absent_half').length;

            return (
              <Panel key={branchName}>
                
                <PanelHeader
                  title={`${branchName} Şubesi`}
                  description={`Toplam ${studentList.length} öğrenci`}
                >
                  <div className="flex items-center gap-1.5">
                    <Badge tone="success">{classPresent} Mevcut</Badge>
                    {classAbsent > 0 && <Badge tone="danger">{classAbsent} Devamsız</Badge>}
                  </div>
                </PanelHeader>

                <div className="overflow-x-auto panel-scroll">
                  <div className="min-w-[760px]">
                    
                    <div
                      className={cx(
                        'grid grid-cols-[minmax(0,1.8fr)_120px_90px_130px_130px_130px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                        hairline
                      )}
                    >
                      <span className={eyebrow}>Öğrenci Ad Soyad</span>
                      <span className={eyebrow}>TC Kimlik</span>
                      <span className={eyebrow}>Okul No</span>
                      <span className={eyebrow}>Sabah</span>
                      <span className={eyebrow}>Öğleden Sonra</span>
                      <span className={cx(eyebrow, 'text-right')}>Günlük Durum</span>
                    </div>

                    <div className={cx('divide-y', divider)}>
                      {studentList.map((student) => (
                        <div
                          key={student.id}
                          className="grid grid-cols-[minmax(0,1.8fr)_120px_90px_130px_130px_130px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                        >
                          
                          <div className="flex items-center gap-2.5 min-w-0">
                            {student.profileImage ? (
                              <img
                                src={student.profileImage}
                                alt=""
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                                className={cx('w-8 h-8 rounded-full object-cover shrink-0 border', hairline)}
                              />
                            ) : (
                              <div
                                className={cx(
                                  'w-8 h-8 rounded-full shrink-0 border flex items-center justify-center bg-slate-100 dark:bg-white/[0.06] text-slate-400',
                                  hairline
                                )}
                              >
                                <span className="text-[11px] font-bold uppercase">
                                  {(student.name || 'ÖĞ').slice(0, 2)}
                                </span>
                              </div>
                            )}
                            <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
                              {student.name}
                            </span>
                          </div>

                          <div className="text-[12px] text-slate-500 dark:text-slate-400 tnum truncate font-mono">
                            {student.tc || '—'}
                          </div>

                          <div className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300 tnum truncate">
                            {student.schoolNumber || '—'}
                          </div>

                          <div className="text-[12px] text-slate-600 dark:text-slate-400 truncate">
                            {student.morningStatus}
                          </div>

                          <div className="text-[12px] text-slate-600 dark:text-slate-400 truncate">
                            {student.afternoonStatus}
                          </div>

                          <div className="flex justify-end">
                            <Badge tone={student.statusTone}>
                              {student.statusLabel}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DailyAbsenceReportView;
