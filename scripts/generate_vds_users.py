import pandas as pd
import re
import json
import unicodedata

def clean_tr(s):
    if not s:
        return ''
    mapping = {
        'ı': 'i', 'İ': 'i', 'I': 'i',
        'ş': 's', 'Ş': 's',
        'ç': 'c', 'Ç': 'c',
        'ğ': 'g', 'Ğ': 'g',
        'ö': 'o', 'Ö': 'o',
        'ü': 'u', 'Ü': 'u'
    }
    for k, v in mapping.items():
        s = s.replace(k, v)
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    s = re.sub(r'[^a-zA-Z0-9]', '', s).lower()
    return s

def parse_class_section(class_info):
    if not class_info:
        return '', '', ''
    m = re.search(r'(\d{1,2})\s*\.?\s*SINIF\s*([A-ZÇĞİÖŞÜa-zçğıöşü])', class_info, re.IGNORECASE)
    if m:
        c_id = m.group(1)
        sec = m.group(2).upper()
        return c_id, sec, f"{c_id}{sec}"
    return '', '', ''

df = pd.read_excel('/Users/fookay/Desktop/IAL/GÖKAY.xls', header=None)

raw_students = []
current = None

for idx, row in df.iterrows():
    val0 = row[0]
    is_start = False
    if pd.notna(val0):
        s0 = str(val0).strip()
        if re.match(r'^\d+$', s0):
            is_start = True
    
    if is_start:
        if current:
            raw_students.append(current)
        current = {
            'school_number': str(int(val0) if isinstance(val0, float) else val0).strip(),
            'first_name': str(row[1]).strip() if pd.notna(row[1]) else '',
            'last_name': str(row[3]).strip() if pd.notna(row[3]) else '',
            'parent_name': str(row[6]).strip() if pd.notna(row[6]) else '',
            'tc_kimlik': str(int(row[8]) if isinstance(row[8], float) else row[8]).strip() if pd.notna(row[8]) else '',
            'address': str(row[15]).strip() if pd.notna(row[15]) else '',
            'class_info': '',
            'parent_phone': '',
            'student_phone': '',
            'mother_phone': '',
            'father_phone': '',
            'parent_profession': ''
        }
    elif current:
        if pd.notna(row[1]):
            s1 = str(row[1]).strip()
            if 'SINIF' in s1.upper():
                current['class_info'] = s1
        if pd.notna(row[6]):
            s6 = str(row[6]).strip()
            if s6 and not current['parent_profession']:
                current['parent_profession'] = s6
        if pd.notna(row[9]):
            s9 = str(int(row[9]) if isinstance(row[9], float) else row[9]).strip()
            if s9 and not current['parent_phone']:
                current['parent_phone'] = s9
        if pd.notna(row[10]):
            s10 = str(int(row[10]) if isinstance(row[10], float) else row[10]).strip()
            if s10 and not current['student_phone']:
                current['student_phone'] = s10
        if pd.notna(row[11]):
            s11 = str(int(row[11]) if isinstance(row[11], float) else row[11]).strip()
            if s11 and not current['mother_phone']:
                current['mother_phone'] = s11
        if pd.notna(row[14]):
            s14 = str(int(row[14]) if isinstance(row[14], float) else row[14]).strip()
            if s14 and not current['father_phone']:
                current['father_phone'] = s14

if current:
    raw_students.append(current)

users = []
parent_map = {}

for s in raw_students:
    full_name = f"{s['first_name']} {s['last_name']}".strip()
    c_id, sec, branch = parse_class_section(s['class_info'])
    fn_clean = clean_tr(s['first_name'].split()[0])
    pwd = f"{fn_clean}19" if fn_clean else f"{s['school_number']}19"
    
    std_id = f"std_{s['school_number']}"
    
    best_parent_phone = s['parent_phone'] or s['mother_phone'] or s['father_phone'] or ''
    if best_parent_phone.startswith('0'):
        best_parent_phone = best_parent_phone[1:]
    
    std_user = {
        "_id": std_id,
        "role": "student",
        "school_number": s['school_number'],
        "tc_kimlik": s['tc_kimlik'],
        "first_name": s['first_name'],
        "last_name": s['last_name'],
        "full_name": full_name,
        "name": full_name,
        "email": f"ogr{s['school_number']}@corumbogazici.com",
        "initial_password": pwd,
        "class_info": s['class_info'],
        "class_id": c_id,
        "section": sec,
        "sube": sec,
        "branch": branch,
        "address": s['address'],
        "phone": s['student_phone'],
        "student_phone": s['student_phone'],
        "parent_name": s['parent_name'],
        "parent_phone": best_parent_phone,
        "mother_phone": s['mother_phone'],
        "father_phone": s['father_phone'],
        "parent_profession": s['parent_profession'],
        "status": "approved",
        "qrCodeUsed": False,
        "registeredDeviceId": None,
        "deviceName": None,
        "deviceModel": None,
        "profile_image": None,
        "created_at": "2026-09-04T00:00:00.000Z"
    }
    users.append(std_user)

    p_name = s['parent_name'].strip()
    if p_name:
        p_key = best_parent_phone if best_parent_phone else p_name.lower()
        if p_key not in parent_map:
            p_clean = clean_tr(p_name.split()[0])
            p_pwd = f"{p_clean}19" if p_clean else "veli19"
            p_id = f"prt_{best_parent_phone if best_parent_phone else s['school_number']}"
            parent_map[p_key] = {
                "_id": p_id,
                "role": "parent",
                "full_name": p_name,
                "name": p_name,
                "phone": best_parent_phone,
                "parent_phone": best_parent_phone,
                "tc_kimlik": "",
                "email": f"veli{best_parent_phone}@corumbogazici.com" if best_parent_phone else f"veli_{s['school_number']}@corumbogazici.com",
                "initial_password": p_pwd,
                "status": "approved",
                "child_name": full_name,
                "child_names": [full_name],
                "child_school_number": s['school_number'],
                "child_school_numbers": [s['school_number']],
                "linked_student_ids": [std_id],
                "registeredDeviceId": None,
                "profile_image": None,
                "created_at": "2026-09-04T00:00:00.000Z"
            }
        else:
            p = parent_map[p_key]
            if full_name not in p["child_names"]:
                p["child_names"].append(full_name)
                p["child_name"] = ", ".join(p["child_names"])
            if s['school_number'] not in p["child_school_numbers"]:
                p["child_school_numbers"].append(s['school_number'])
                p["child_school_number"] = ", ".join(p["child_school_numbers"])
            if std_id not in p["linked_student_ids"]:
                p["linked_student_ids"].append(std_id)

for p in parent_map.values():
    users.append(p)

teachers_data = [
    {"name": "Seher Şanlı", "branch": "İdare / Kurucu", "contract_end": "21.07.2029", "title": "Kurucu / İdareci", "admin": True, "custom_email": "sehersanli@corumbogazici.com"},
    {"name": "Yaman Öztürk", "branch": "Fizik", "contract_end": "18.09.2030", "title": "Ders Öğretmeni"},
    {"name": "Seçil Özkan", "branch": "Görsel Sanatlar", "contract_end": "06.11.2026", "title": "Ders Öğretmeni"},
    {"name": "Nezaket Çelik", "branch": "Kimya", "contract_end": "29.08.2027", "title": "Ders Öğretmeni"},
    {"name": "Muharrem Yavuz", "branch": "Tarih", "contract_end": "03.12.2026", "title": "Ders Öğretmeni"},
    {"name": "İlhami Doğan", "branch": "Ders Öğretmeni", "contract_end": "18.10.2026", "title": "Ders Öğretmeni"},
    {"name": "Sultan Yılmaz", "branch": "Matematik", "contract_end": "29.08.2027", "title": "Ders Öğretmeni"},
    {"name": "Yasemin Özkaya", "branch": "Matematik", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Mesut Çolak", "branch": "Matematik", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Şeyma Nur Aker", "branch": "Türk Dili ve Edebiyatı", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Niyazi Kaya", "branch": "Coğrafya", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Büşra Kökcü Öksüz", "branch": "Rehberlik", "contract_end": "01.09.2027", "title": "Rehber Öğretmen"},
    {"name": "Fatih Özpiçakcı", "branch": "Kimya", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Hasan Barış Karataş", "branch": "Biyoloji", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Beyza Bulut", "branch": "Biyoloji", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Oya Sadıç Erocağı", "branch": "İngilizce", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Ceylan Bal", "branch": "Din Kültürü ve Ahlak Bilgisi", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Serpil Satı Ceylan", "branch": "Eğitim Kadrosu", "contract_end": "SINIRSIZ", "title": "Ders Öğretmeni"},
    {"name": "Muharrem Kodaz", "branch": "Eğitim Kadrosu", "contract_end": "SINIRSIZ", "title": "Ders Öğretmeni"},
    {"name": "Hüseyin Arman", "branch": "Matematik", "contract_end": "30.06.2027", "title": "Ders Öğretmeni"},
    {"name": "Selim Kurtaran", "branch": "Fizik", "contract_end": "30.06.2027", "title": "Ders Öğretmeni"},
    {"name": "Erman Gürbüz", "branch": "Matematik", "contract_end": "30.06.2027", "title": "Ders Öğretmeni"},
    {"name": "Mustafa Yalçın", "branch": "Matematik", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Altın Bolat Emil", "branch": "Felsefe", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"},
    {"name": "Hüseyin Bilir", "branch": "Matematik", "contract_end": "01.09.2027", "title": "Ders Öğretmeni"}
]

for t in teachers_data:
    t_slug = clean_tr(t["name"])
    t_fn = clean_tr(t["name"].split()[0])
    email = t.get("custom_email") or f"{t_slug}@corumbogazici.com"
    users.append({
        "_id": f"tch_{t_slug}",
        "role": "teacher",
        "full_name": t["name"],
        "name": t["name"],
        "branch": t["branch"],
        "teacherTitle": t.get("title", "Ders Öğretmeni"),
        "contract_end": t["contract_end"],
        "email": email,
        "initial_password": f"{t_fn}19",
        "status": "approved",
        "admin": t.get("admin", False),
        "created_at": "2026-09-04T00:00:00.000Z"
    })

personnel_data = [
    {"name": "Merve Üstün", "title": "Destek / İdari Personel", "contract_end": "SINIRSIZ"},
    {"name": "Muharrem Özkan", "title": "Destek / İdari Personel", "contract_end": "SINIRSIZ"}
]

for pr in personnel_data:
    p_slug = clean_tr(pr["name"])
    p_fn = clean_tr(pr["name"].split()[0])
    users.append({
        "_id": f"prs_{p_slug}",
        "role": "personnel",
        "full_name": pr["name"],
        "name": pr["name"],
        "branch": "",
        "teacherTitle": pr["title"],
        "contract_end": pr["contract_end"],
        "email": f"{p_slug}@corumbogazici.com",
        "initial_password": f"{p_fn}19",
        "status": "approved",
        "created_at": "2026-09-04T00:00:00.000Z"
    })

users.append({
    "_id": "adm_patron",
    "role": "patron",
    "full_name": "Boğaziçi Yönetim",
    "name": "Boğaziçi Yönetim",
    "email": "patron@corumbogazici.com",
    "initial_password": "bogazici19",
    "status": "approved",
    "admin": True,
    "created_at": "2026-09-04T00:00:00.000Z"
})

with open('/Users/fookay/Desktop/IAL/scripts/vds_users.json', 'w', encoding='utf-8') as f:
    json.dump(users, f, ensure_ascii=False, indent=2)

print("Saved updated vds_users.json with clean transliteration!")
