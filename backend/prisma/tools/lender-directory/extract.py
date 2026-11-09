"""Reads the client's banker / SPOC / code-and-payout workbooks and writes one normalised directory as JSON.

usage: extract.py <folder holding the .xlsx files> <output.json>
"""
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

import openpyxl

from lib import (BANK, NBFC, OTHER, ABBREV, canon, city, clean, emails, expand_role, is_masked, landlines, name_from_email,
                 person, phones, segments_from, smart_title, split_places, uniq)

CITY_STATE = {
    "Ahmedabad": "Gujarat", "Rajkot": "Gujarat", "Surat": "Gujarat", "Vadodara": "Gujarat", "Vapi": "Gujarat", "Jamnagar": "Gujarat",
    "Mumbai": "Maharashtra", "Pune": "Maharashtra", "Nashik": "Maharashtra", "Nanded": "Maharashtra", "Dhule": "Maharashtra",
    "Jalgaon": "Maharashtra", "Jalna": "Maharashtra", "Kolhapur": "Maharashtra", "Latur": "Maharashtra", "Sangli": "Maharashtra",
    "Akola": "Maharashtra", "Amravati": "Maharashtra", "Hingoli": "Maharashtra", "Nagpur": "Maharashtra",
    "Chhatrapati Sambhajinagar": "Maharashtra", "Thane": "Maharashtra", "Navi Mumbai": "Maharashtra",
    "Bangalore": "Karnataka", "Mysore": "Karnataka", "Hyderabad": "Telangana", "Warangal": "Telangana", "Kolkata": "West Bengal",
    "Delhi": "Delhi", "Chennai": "Tamil Nadu", "Coimbatore": "Tamil Nadu", "Madurai": "Tamil Nadu", "Jaipur": "Rajasthan",
    "Indore": "Madhya Pradesh", "Bhopal": "Madhya Pradesh", "Raipur": "Chhattisgarh", "Lucknow": "Uttar Pradesh",
    "Visakhapatnam": "Andhra Pradesh", "Vijayawada": "Andhra Pradesh", "Ernakulam": "Kerala",
}

STATES = {x.upper() for x in (
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Chandigarh", "Puducherry",
    "Jammu and Kashmir", "Ladakh", "Kerala", "Haryna", "Tamilnadu", "Pondicherry", "Karnataka (HO)", "Andhra & Telangana", "Telangana & AP",
    "AP & Telangana", "Rest of Telangana", "Rest of Tamilnadu", "Delhi NCR", "NCR", "UP", "Rajasthan", "Gujarat", "Jharkhand / Bihar")}
STATE_NAMES = {"HARYNA": "Haryana", "TAMILNADU": "Tamil Nadu", "PONDICHERRY": "Puducherry", "KERELA": "Kerala"}


def place_fields(raw):
    """A free-text territory ('Rajasthan - Udaipur', 'NCR / UP / Punjab', 'Telangana / Hyderabad') -> (city, state, region text)."""
    r = clean(raw)
    if not r:
        return None, None, None
    toks = [t.strip() for t in re.split(r"\s*[/,&-]\s*|\s+and\s+", r) if t.strip()]
    st = cy = None
    for t in toks:
        tu = t.upper()
        if tu in STATES or tu.rstrip(")") in STATES:
            st = st or STATE_NAMES.get(tu, smart_title(t))
        elif cy is None and len(toks) <= 2 or (cy is None and tu in {k.upper() for k in CITY_STATE}):
            cy = city(t)
    if len(toks) > 2 and not any(city(t) in CITY_STATE for t in toks):
        cy = None
    if st and st.upper() in ("NCR", "DELHI NCR", "UP", "TELANGANA & AP", "AP & TELANGANA", "ANDHRA & TELANGANA", "KARNATAKA (HO)", "JHARKHAND / BIHAR"):
        st = None
    elif st and st.upper() in ("REST OF TELANGANA",):
        st = "Telangana"
    elif st and st.upper() == "REST OF TAMILNADU":
        st = "Tamil Nadu"
    return cy, st, r


CONTACTS = []      # one dict per person-row, merged later
CODES = []         # broker codes and payouts
BRANCHES = []      # branch lists
LENDER_NOTES = defaultdict(list)
LENDER_TYPES = {}
REVIEW = []        # things a human should look at


def lender_of(raw):
    name, typ, _ = canon(raw)
    if not name:
        return None
    LENDER_TYPES.setdefault(name, typ)
    return name


def fixed_lender(name, typ=NBFC):
    LENDER_TYPES.setdefault(name, typ)
    return name


def mk(lender, name, source, *, designation=None, phone=None, alt=None, email=None, segments=None, kind="DIRECTORY", city_=None,
       state=None, region=None, branch=None, coverage=None, employee_code=None, escalation=None, details=None, notes=None,
       active=True, raw_phone=None):
    """Add one person. `phone` may be a cell with several numbers; masked ones are kept out of the phone field."""
    if not lender or not name:
        return None
    nums = phones(phone) if phone is not None else []
    note = [notes] if notes else []
    real = [n for n in nums if not is_masked(n)]
    masked = [n for n in nums if is_masked(n)]
    if masked:
        note.append(f"The number on the sheet ({masked[0]}) looks incomplete — please get the correct one.")
    mail_ok, mail_bad = emails(email) if email is not None else ([], [])
    if mail_bad:
        note.append(f"The e-mail on the sheet looks malformed ({mail_bad[0]}) — please confirm it.")
    det = dict(details or {})
    if len(mail_ok) > 1:
        det["Other e-mail"] = ", ".join(mail_ok[1:])
    ll = landlines(phone) if phone is not None else []
    if ll:
        det["Landline"] = ", ".join(ll)
    if alt:
        real += [n for n in phones(alt) if n not in real and not is_masked(n)]
    cs = city_ if city_ else None
    st = state or (CITY_STATE.get(cs) if cs else None)
    rec = {
        "lender": lender, "name": name, "designation": designation, "phone": real[0] if real else None,
        "altPhone": real[1] if len(real) > 1 else None, "email": mail_ok[0] if mail_ok else None,
        "segments": uniq(segments or []), "kind": kind, "city": cs, "state": st, "region": region, "branch": branch,
        "coverage": uniq([c for c in (coverage or []) if c]), "employeeCode": employee_code,
        "escalation": [e for e in (escalation or []) if e and (e.get("name") or e.get("email"))],
        "details": {k: v for k, v in det.items() if v}, "notes": " ".join(note) or None, "active": active, "sources": [source],
    }
    CONTACTS.append(rec)
    return rec


def esc(role, name, phone=None, email=None):
    nm, rl = person(name) if name else (None, None)
    ph = [p for p in phones(phone) if not is_masked(p)] if phone else []
    em = emails(email)[0] if email else []
    if not nm and em:
        nm = name_from_email(em[0])
    if not nm:
        return None
    return {"role": expand_role(role) or rl or None, "name": nm, "phone": ph[0] if ph else None, "email": em[0] if em else None}


def hdr_map(row):
    out, seen = {}, Counter()
    for i, v in enumerate(row):
        h = clean(v)
        if not h:
            continue
        k = re.sub(r"\s+", " ", h.lower())
        seen[k] += 1
        out[k if seen[k] == 1 else f"{k}#{seen[k]}"] = i
    return out


def dict_rows(ws, header_row=1, stop=None):
    rows = list(ws.iter_rows(values_only=True))
    hm = hdr_map(rows[header_row - 1])
    out = []
    for r in rows[header_row:]:
        if not any(clean(x) for x in r):
            continue
        out.append({k: (r[i] if i < len(r) else None) for k, i in hm.items()})
    return out


def g(d, *keys):
    for k in keys:
        if k in d and clean(d[k]):
            return clean(d[k])
    return None


def ffill(rows, col):
    last = None
    for r in rows:
        if clean(r[col]):
            last = r[col]
        elif last is not None:
            r[col] = last
    return rows


# =============================================================================================================
# 1. BL & PL banker list
# =============================================================================================================
def banker_list(wb, src):
    for ws, seg in ((wb["BL CONTACTS"], "Business Loan"), (wb["PL CONTACTS"], "Personal Loan")):
        for r in ws.iter_rows(min_row=2, values_only=True):
            bank, who, mob = clean(r[1]), r[2], r[3]
            if not bank or not clean(who):
                continue
            lender = lender_of(bank)
            nm, role = person(who)
            segs = [seg] + (["Overdraft"] if re.search(r"DOD|\bOD\b", bank.upper()) else [])
            mk(lender, nm, f"{src} › {ws.title}", designation=role, phone=mob, email=r[4] if len(r) > 4 else None,
               segments=segs, kind="RELATIONSHIP", details={"Bank as written": bank} if bank.upper() != lender.upper() else None)


# =============================================================================================================
# 2. Code & payout
# =============================================================================================================
CODE_PRODUCT_LINK = {
    "new car loan": "New Car Loan", "used car loan": "Used Car Loan", "educational loan": "Education Loan",
    "machinery loan": "Machine Loan", "loan against securities": "Loan Against Securities", "lcv/hcv/ ce loans": "Commercial Vehicle",
}


SEGMENT_OF_PRODUCT = {
    "new car loan": "New Car Loan", "used car loan": "Used Car Loan", "educational loan": "Education Loan",
    "school funding secured": "School Funding", "machinery loan": "Machinery Loan", "medical equipment": "Medical Equipment Loan",
    "loan against securities": "Loan Against Securities", "lcv/hcv/ ce loans": "Commercial Vehicle Loan",
}


def code_sheet(wb, src):
    ws = wb.worksheets[0]
    for r in ws.iter_rows(min_row=3):
        vals = [c.value for c in r]
        product, bank = clean(vals[1]), clean(vals[2])
        if not product or not bank:
            continue
        product = re.sub(r"\s+", " ", product.replace("\xa0", " ")).strip()
        lender = lender_of(bank)
        payout_cell = r[5]
        pv = payout_cell.value
        text, pct = None, None
        if isinstance(pv, (int, float)):
            pct = round(pv * 100, 4) if "%" in (payout_cell.number_format or "") or pv < 1 else float(pv)
            text = f"{pct:g}%"
        elif clean(pv):
            text = clean(pv)
            m = re.fullmatch(r"([\d.]+)\s*%\s*(\(.*\))?", text)
            if m:
                pct = float(m.group(1))
        person_text, phone_text = clean(vals[6]), clean(vals[7])
        CODES.append({
            "lender": lender, "product": product, "productLink": CODE_PRODUCT_LINK.get(product.lower()),
            "code": clean(vals[3]), "registeredName": clean(vals[4]), "payoutText": text, "payoutPercent": pct,
            "contactText": person_text, "contactPhone": phone_text, "specialCondition": clean(vals[8]), "source": f"{src} › {ws.title}",
        })
        # contacts: clean single name + number, or "Name 98..., Name 98..." pairs
        if person_text:
            pairs = re.findall(r"([A-Za-z][A-Za-z .()/\-]*?)\s*(?:[:,-]\s*)?((?:\+?91[\s-]*)?[6-9]\d{9})", person_text)
            seg = [SEGMENT_OF_PRODUCT.get(product.lower(), product)]
            if pairs:
                for nm, ph in pairs:
                    n, role = person(nm.strip(" ,-"))
                    mk(lender, n, f"{src} › {ws.title}", designation=role, phone=ph, segments=seg, kind="RELATIONSHIP")
                if phone_text and phones(phone_text) and phones(phone_text)[0] not in [phones(p)[0] for _, p in pairs]:
                    first = pairs[0][0].strip(" ,-")
                    n, role = person(first)
                    mk(lender, n, f"{src} › {ws.title}", designation=role, phone=phone_text, segments=seg, kind="RELATIONSHIP")
            elif phone_text:
                first = re.split(r",", person_text)[0]
                n, role = person(first)
                mk(lender, n, f"{src} › {ws.title}", designation=role, phone=phone_text, segments=seg, kind="RELATIONSHIP",
                   details={"Listed as": person_text} if "," in person_text else None)


# =============================================================================================================
# 3. Secured banker list (city sheets)
# =============================================================================================================
def secured(wb, src):
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        hi = next((i for i, r in enumerate(rows) if r and r[0] and re.match(r"\s*S(R|\.)\s*\.?\s*NO", str(r[0]), re.I)), None)
        if hi is None:
            continue
        hdr = [(clean(x) or "").lower() for x in rows[hi]]

        def find(prefix, nth=1):
            seen = 0
            for i, h in enumerate(hdr):
                if h.startswith(prefix):
                    seen += 1
                    if seen == nth:
                        return i
            return None

        c_loc, c_bank, c_prod, c_banker = find("location"), find("bank/nbfc"), find("product"), find("banker name")
        c_contact = find("contact")
        c_email = next((i for i, h in enumerate(hdr) if h == "email id"), None)
        hier = [i for i, h in enumerate(hdr) if h.startswith(("1st", "2nd", "3rd"))]
        for r in rows[hi + 1:]:
            bank_raw = clean(r[c_bank]) if c_bank is not None else None
            who = clean(r[c_banker]) if c_banker is not None else None
            if not bank_raw or not who:
                continue
            lender = lender_of(bank_raw)
            if not lender:
                continue
            nm, role = person(who)
            if not nm:
                continue
            loc_raw = clean(r[c_loc]) if c_loc is not None else None
            loc_u = (loc_raw or "").upper()
            is_state = loc_u in ("CHATTISGARH",)
            cityv = None if is_state else city(loc_raw)
            statev = "Chhattisgarh" if is_state else None
            prod = clean(r[c_prod]) if c_prod is not None else None
            segs, qual = segments_from(prod)
            cell = " ".join(str(r[i]) for i in (c_contact, c_email) if i is not None and r[i] is not None)
            det = {}
            if prod:
                det["Product as written"] = prod
            if qual:
                det["Segment"] = qual
            if bank_raw.upper() != lender.upper():
                det["Bank as written"] = bank_raw
            chain = []
            for hi_ in hier:
                nm_cell = clean(r[hi_])
                ct_cell = r[hi_ + 1] if hi_ + 1 < len(r) else None
                if not nm_cell and not clean(ct_cell):
                    continue
                both = f"{nm_cell or ''} {ct_cell or ''}"
                n2, r2 = person(nm_cell) if nm_cell and not phones(nm_cell) and "@" not in nm_cell else (None, None)
                ph2 = [p for p in phones(both) if not is_masked(p)]
                em2 = emails(both)[0]
                if not n2 and em2:
                    n2 = name_from_email(em2[0])
                if not n2:
                    continue
                label = {"1": "1st level", "2": "2nd level", "3": "3rd level"}.get(hdr[hi_][0], "Manager")
                chain.append({"role": r2 or label, "name": n2, "phone": ph2[0] if ph2 else None, "email": em2[0] if em2 else None})
            mk(lender, nm, f"{src} › {ws.title}", designation=role, phone=cell, email=cell, segments=segs, kind="RELATIONSHIP",
               city_=cityv, state=statev, escalation=chain, details=det)
            for e in chain:
                if e["phone"] or e["email"]:
                    mk(lender, e["name"], f"{src} › {ws.title}", designation=e["role"], phone=e["phone"], email=e["email"], segments=segs,
                       kind="DIRECTORY", coverage=[cityv] if cityv else [], details={"Bank as written": bank_raw} if bank_raw.upper() != lender.upper() else None)


# =============================================================================================================
# 4. Bank SPOC workbook, one handler per sheet
# =============================================================================================================
def sheet_krazybee(ws, src):
    L = fixed_lender("KrazyBee")
    for d in dict_rows(ws):
        nm, role = person(g(d, "name"))
        if not nm:
            continue
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "number"), region=g(d, "region"),
           escalation=[esc(g(d, "l1 designation"), g(d, "l1 name"), g(d, "number#2"))], details={"Purpose": g(d, "purpose")})
        l1 = esc(g(d, "l1 designation"), g(d, "l1 name"), g(d, "number#2"))
        if l1 and l1["phone"]:
            mk(L, l1["name"], src, designation=l1["role"], phone=l1["phone"], region=g(d, "region"))


def sheet_boi(ws, src, role_label=None, asof=None):
    L = lender_of("Bank of India")
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if clean(r[0]) and str(r[0]).upper().startswith("S.N"))
    hdr = [(clean(x) or "").lower() for x in rows[hi]]
    asof_txt = None
    for r in rows[:3]:
        for x in r:
            if x and "as on" in str(x).lower():
                asof_txt = clean(x)
    ix = {h: i for i, h in enumerate(hdr) if h}
    mob_i = next(i for i, h in enumerate(hdr) if "mobile" in h)
    ph_i = next((i for i, h in enumerate(hdr) if h.startswith("phone")), None)
    name_i = next(i for i, h in enumerate(hdr) if "branch head" in h)
    desg_i = next((i for i, h in enumerate(hdr) if h.startswith("desgn")), None)
    cat_i = ix.get("category")
    for r in rows[hi + 1:]:
        nm_raw = clean(r[name_i])
        branch = clean(r[1])
        if not nm_raw or not branch:
            continue
        nm, rl = person(nm_raw)
        extra = [clean(x) for x in r[mob_i + 1:] if clean(x) and clean(x) != "*"]
        det = {"Branch category": clean(r[cat_i]) if cat_i is not None else None, "Branch code": clean(r[0]),
               "Branch phone": clean(r[ph_i]) if ph_i is not None else None, "List dated": asof_txt,
               "Also noted on the sheet": "; ".join(extra) if extra else None}
        mk(L, nm, src, designation=role_label or (clean(r[desg_i]) if desg_i is not None else None), phone=r[mob_i],
           branch=branch.title(), coverage=[branch.title()], region="Mumbai North Zone", details=det)


def sheet_capri(ws, src):
    L = fixed_lender("Capri Global Capital")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "emp name"))
        if not nm:
            continue
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "contact no."), city_=city(g(d, "branch name")),
           state=g(d, "region"), region=g(d, "zone"))


def sheet_hero_hfc(ws, src):
    L = fixed_lender("Hero Housing Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "full name"))
        if not nm:
            continue
        chain = []
        rm, fm = g(d, "reporting manager"), g(d, "functional manager")
        if rm:
            chain.append(esc("Reporting manager", rm))
        if fm and fm != rm:
            chain.append(esc("Functional manager", fm))
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "mobile number"), email=g(d, "work email"), city_=city(g(d, "branch")),
           region=g(d, "zone"), escalation=chain, segments=["Home Loan"])


def sheet_hero_hfl(ws, src):
    L = fixed_lender("Hero Housing Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "full name"))
        if not nm:
            continue
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "mobile number"), email=g(d, "work email"),
           city_=city(g(d, "branch")), state=g(d, "state"), region=g(d, "region"), segments=["Home Loan"],
           details={"Department": g(d, "department"), "Channel": g(d, "sub department")})


def sheet_agrim(ws, src):
    L = fixed_lender("Agrim Housing Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "employee name"))
        if not nm:
            continue
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "mobile no"), email=g(d, "email id"), city_=city(g(d, "location")),
           employee_code=g(d, "employee code"), details={"Department": g(d, "department")})


def sheet_ambit(ws, src):
    L = lender_of("Ambit")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    ffill(rows[2:], 0)
    for r in rows[2:]:
        loc = clean(r[0])
        if not loc:
            continue
        places = split_places(loc)
        lv = []
        for idx, lab in ((1, "Level 1 (primary SPOC)"), (4, "Level 2"), (7, "Level 3")):
            n, e, p = r[idx], r[idx + 1], r[idx + 2]
            if clean(n):
                lv.append((lab, esc(lab, n, p, e)))
        if not lv:
            continue
        prim = lv[0][1]
        chain = [e for lab, e in lv[1:] if e and e["name"] != prim["name"]]
        mk(L, prim["name"], src, designation="Primary SPOC (Level 1)", phone=prim["phone"], email=prim["email"], city_=places[0] if places else None,
           region=" / ".join(places), coverage=places, segments=["Loan Against Property"], escalation=chain,
           details={"Scheme": "Vyapar Saksham"})
        for lab, e in lv[1:]:
            if e and e["name"] != prim["name"]:
                mk(L, e["name"], src, designation=lab, phone=e["phone"], email=e["email"], segments=["Loan Against Property"], coverage=places)


def sheet_sitara(ws, src):
    L = fixed_lender("Sitara Housing Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "employee name"))
        if not nm:
            continue
        chain = [esc("ASM/RSM", g(d, "asm/rsm name")), esc("SH/ZSM", g(d, "sh/zsm name"), g(d, "sh/zsm contact no."))]
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "contact no."), email=g(d, "email id"), city_=city(g(d, "branch")),
           state=g(d, "state"), escalation=chain)


def sheet_utkarsh(ws, src):
    L = lender_of("Utkarsh")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "zsm name"))
        if nm:
            mk(L, nm, src, designation="Zonal Sales Manager", phone=g(d, "contact number"), region=g(d, "zones"), segments=["Home Loan"],
               details={"Product as written": "Small-ticket home loan"})


def sheet_idfc_lap(ws, src):
    L = lender_of("IDFC First Bank")
    for r in ws.iter_rows(min_row=4, values_only=True):
        loc, nm_raw, ph = clean(r[1]), clean(r[2]), r[3]
        if not loc or not nm_raw:
            continue
        nm, _ = person(nm_raw)
        region_row = loc.strip().lower() == "west"
        mk(L, nm, src, designation="Regional head (West)" if region_row else None, phone=ph, city_=None if region_row else city(loc),
           region="West" if region_row else None, segments=["Loan Against Property"])


def sheet_capital_india(ws, src):
    L = fixed_lender("Capital India Home Loans")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "name"))
        if not nm:
            continue
        st = g(d, "state")
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "mobile no"), city_=city(g(d, "branch")),
           state=None if st == "PCH" else st, region="PCH" if st == "PCH" else None)


def sheet_pnb_roshni(ws, src):
    L = lender_of("PNB Housing")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "csm"))
        if not nm:
            continue
        chain = [esc("RBH/ZBH", g(d, "rbh/zbh"), g(d, "mobile no.#2"), g(d, "email id#2"))]
        br = city(g(d, "branch"))
        mk(L, nm, src, designation="CSM", phone=g(d, "mobile no."), email=g(d, "email id"), city_=br, state=g(d, "state"),
           coverage=[br], escalation=chain)
        c = chain[0]
        if c and (c["phone"] or c["email"]):
            mk(L, c["name"], src, designation=c["role"], phone=c["phone"], email=c["email"], state=g(d, "state"))


def sheet_kifs(ws, src):
    L = fixed_lender("KIFS Housing Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "employee name"))
        if not nm:
            continue
        active = (g(d, "employee status") or "Active").lower() == "active"
        mk(L, nm, src, phone=g(d, "phone"), email=g(d, "email"), city_=city(g(d, "curr.location")), state=g(d, "curr.state"), active=active,
           details={"Employee status": g(d, "employee status")})


def sheet_chola(ws, src):
    L = lender_of("Cholamandalam")
    rows = list(ws.iter_rows(values_only=True))
    hm = hdr_map(rows[0])
    stop = next(i for i, r in enumerate(rows) if i > 0 and clean(r[0]) == "Zone")
    for r in rows[1:stop]:
        d = {k: r[i] for k, i in hm.items()}
        nm, _ = person(g(d, "employee name"))
        if not nm:
            continue
        loc = city(g(d, "location"))
        l1 = esc("L1 manager", g(d, "l1 manager"))
        if l1:
            l1["code"] = g(d, "l1 manager code")
        mk(L, nm, src, designation=smart_title(g(d, "business designation") or ""), phone=g(d, "mobile number"),
           email=g(d, "office email address"), city_=loc, state=g(d, "state"), region=" › ".join(x for x in (g(d, "zone"), g(d, "region")) if x),
           branch=loc, employee_code=g(d, "employee code"), escalation=[l1],
           details={"Area": g(d, "area"), "Location code": g(d, "location code")})
    # second table: branch master
    hdr2 = hdr_map(rows[stop])
    for r in rows[stop + 1:]:
        d = {k: r[i] for k, i in hdr2.items()}
        b = g(d, "branch")
        if not b:
            continue
        BRANCHES.append({"lender": L, "name": smart_title(b), "city": None, "state": g(d, "state"), "region": g(d, "region"),
                         "zone": g(d, "zone"), "area": g(d, "area"), "dsaSourcing": None,
                         "details": {"Theme Pro code": g(d, "theme pro code"), "Oracle code": g(d, "oracle code")}, "source": src})


def sheet_smfg(ws, src):
    L = lender_of("Fullerton India")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    by_email = {}
    for r in rows:
        if clean(r[0]) and clean(r[6]) and "@" in str(r[6]):
            by_email[str(r[6]).strip().lower()] = clean(r[0])
    for r in rows[1:]:
        nm_raw, em = clean(r[0]), clean(r[6])
        esc_mail = clean(r[9]) if len(r) > 9 else None
        if nm_raw and nm_raw.lower() == "employee name":
            continue
        if not nm_raw and esc_mail:
            n = by_email.get(esc_mail.lower()) or name_from_email(esc_mail)
            mk(L, n, src, designation="Escalation contact", email=esc_mail, notes="Listed only under the escalation matrix on the sheet.")
            continue
        if not nm_raw:
            continue
        nm, _ = person(nm_raw)
        chain = []
        if esc_mail:
            chain.append({"role": "Escalation", "name": by_email.get(esc_mail.lower()) or name_from_email(esc_mail), "phone": None, "email": esc_mail.lower()})
        prod = clean(r[2])
        mk(L, nm, src, designation=clean(r[1]), email=em, city_=city(r[3]), state=clean(r[4]), region=clean(r[5]),
           segments=["Loan Against Property"], escalation=chain, details={"Product line": f"{prod} LAP" if prod else None})


def sheet_ramkrishna(ws, src):
    L = fixed_lender("Ramkrishna")
    LENDER_NOTES[L].append("The sheet is titled RAMKRISHNA but every e-mail is @purefinance.in — please confirm the lender's proper name.")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "rm name"))
        if nm:
            mk(L, nm, src, designation="Relationship Manager", phone=g(d, "contact number"), email=g(d, "e-mail i'd"), city_=city(g(d, "location")))


def sheet_deutsche(ws, src):
    L = lender_of("Deutsche Bank")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    blocks = [("LAP", 1), ("BIL", 7), ("TWC", 13)]
    for r in rows[2:]:
        loc = clean(r[0])
        if not loc:
            continue
        for prod, c0 in blocks:
            mgr, mail, mob = r[c0], r[c0 + 1], r[c0 + 2]
            rsm, rmail, rmob = r[c0 + 3], r[c0 + 4], r[c0 + 5]
            if not clean(mgr):
                continue
            nm, _ = person(mgr)
            chain = [esc("RSM", rsm, rmob, rmail)]
            seg = "Loan Against Property" if prod == "LAP" else prod
            mk(L, nm, src, designation="Manager / City Head", phone=mob, email=mail, city_=city(loc), segments=[seg], escalation=chain)
            if chain[0] and (chain[0]["phone"] or chain[0]["email"]):
                mk(L, chain[0]["name"], src, designation="RSM", phone=chain[0]["phone"], email=chain[0]["email"], segments=[seg], city_=city(loc))


def sheet_easy(ws, src):
    L = fixed_lender("Easy Home Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "location head"))
        if not nm:
            continue
        c = city(g(d, "city"))
        mk(L, nm, src, designation="Location Head", phone=g(d, "number"), city_=c, state=g(d, "region"), region=g(d, "zone"),
           branch=smart_title(g(d, "branch") or ""), coverage=[smart_title(g(d, "branch") or "")])


def sheet_kotak_agri(ws, src):
    L = lender_of("Kotak Mahindra")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    tbl2 = next(i for i, r in enumerate(rows) if clean(r[0]) == "Sr. No.")
    for r in rows[1:tbl2]:
        nm, _ = person(r[0])
        if nm and clean(r[1]):
            mk(L, nm, src, designation=clean(r[1]), phone=r[2], segments=["Agri & SME"])
    for r in rows[tbl2 + 1:]:
        loc = city(r[1])
        if not loc:
            continue
        people = []
        for ci, role in ((2, "ABM"), (4, "RBM / Sr. ABM"), (6, "ZBM"), (8, "UH")):
            nm, em = person(r[ci])[0], clean(r[ci + 1])
            if nm and em:
                people.append({"role": role, "name": nm, "phone": None, "email": em.lower()})
        if not people:
            continue
        mk(L, people[0]["name"], src, designation=people[0]["role"], email=people[0]["email"], city_=loc, coverage=[loc],
           segments=["Agri & SME"], escalation=people[1:])
        for p in people[1:]:
            mk(L, p["name"], src, designation=p["role"], email=p["email"], segments=["Agri & SME"])


def sheet_union(ws, src):
    L = lender_of("Union Bank")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "rlp head name"))
        if nm:
            rlp = g(d, "rlp name")
            mk(L, nm, src, designation="RLP Head", phone=g(d, "contact no."), branch=rlp,
               city_=city(re.sub(r"^RLP\s+", "", rlp or "")), state="Maharashtra")


def sheet_federal(ws, src):
    L = lender_of("Federal Bank")
    for d in dict_rows(ws):
        nm_raw = g(d, "name")
        nm, _ = person(nm_raw)
        if not nm:
            continue
        dept = g(d, "dept")
        is_role = bool(dept and re.search(r"head|zonal|manager", dept, re.I))
        shared = bool(re.search(r"support|retail sales", nm_raw or "", re.I))
        mk(L, nm, src, designation=dept if is_role else ("Shared mailbox" if shared else None), phone=g(d, "contact#"), email=g(d, "mail id"),
           city_=None if is_role else city(dept), segments=["Home Loan"] if g(d, "product") == "HL" else [],
           notes="Shared mailbox, not a person." if shared else None)


def sheet_lt(ws, src):
    L = lender_of("L&T Finance")
    for r in ws.iter_rows(min_row=3, values_only=True):
        for ni, pi, role in ((0, 1, "RSM"), (2, 3, "ASM")):
            names = [x.strip() for x in str(r[ni] or "").split("/") if x.strip()]
            nums = [x.strip() for x in str(r[pi] or "").split("/") if x.strip()]
            for i, n in enumerate(names):
                ph = nums[i] if i < len(nums) else None
                nm, _ = person(n)
                if nm and ph:
                    mk(L, nm, src, designation=expand_role(role), phone=ph, city_="Mumbai", region="Mumbai")


def sheet_tata(ws, src):
    L = lender_of("Tata Capital")
    for r in ws.iter_rows(min_row=4, values_only=True):
        if not clean(r[1]):
            continue
        chain = [esc("RSM", r[4], r[5], r[6]), esc("ZSM", r[7], r[8], r[9])]
        mk(L, person(r[1])[0], src, designation="Sales Manager", phone=r[2], email=r[3], city_="Mumbai", region="Mumbai", escalation=chain)
        for e, role in zip(chain, ("RSM", "ZSM")):
            if e and (e["phone"] or e["email"]):
                mk(L, e["name"], src, designation=role, phone=e["phone"], email=e["email"], city_="Mumbai", region="Mumbai")


def sheet_kotak_wc(ws, src):
    L = lender_of("Kotak Mahindra")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    cur = None
    for r in rows[1:]:
        if clean(r[0]):
            cur = r[0]
            cur_nm = re.sub(r"\s*\(.*$", "", str(cur)).strip()
            cur_area = re.search(r"\(([^)]*)\)?", str(cur))
            cur_area = cur_area.group(1) if cur_area else None
            cur_ph = r[1]
            head = person(cur_nm)[0]
            if head and phones(cur_ph):
                mk(L, head, src, designation="Region Head", phone=cur_ph, region=cur_area, segments=["Working Capital"])
        if clean(r[2]) and cur:
            nm, _ = person(r[2])
            chain = [esc("Region Head", re.sub(r"\s*\(.*$", "", str(cur)), cur_ph)]
            cy, st, _ = place_fields(r[4])
            mk(L, nm, src, designation="Area Head", phone=r[3], city_=cy, state=st, region=clean(r[4]), segments=["Working Capital"], escalation=chain)


def sheet_piramal(ws, src):
    L = lender_of("Piramal Finance")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    section = None
    i = 0
    hdr_cols = None
    nat = zone = None
    for idx, r in enumerate(rows):
        a = clean(r[0])
        if a and a.startswith("HL Team"):
            section = "Home Loan"; mode = "tree"; nat = zone = None; continue
        if a and a.startswith("LAP Team"):
            section = "Loan Against Property"; mode = "tree"; nat = zone = None; continue
        if a == "National":
            continue
        if a == "Name":
            mode = "flat"; continue
        if section is None:
            continue
        if mode == "tree":
            if clean(r[1]):
                nat = (r[1], r[2], r[3], clean(r[0]))
            if clean(r[5]):
                zone = (r[5], r[6], r[7], clean(r[4]))
            if clean(r[9]):
                chain = [e for e in (esc("Zonal head", zone[0], zone[1], zone[2]) if zone else None,
                                      esc("National head", nat[0], nat[1], nat[2]) if nat else None) if e]
                mk(L, person(r[9])[0], src, designation="Geo Head", phone=r[10], email=r[11], region=" › ".join(x for x in (zone[3] if zone else None, clean(r[8])) if x),
                   city_=None, segments=[section], escalation=chain)
            if clean(r[5]) and zone:
                mk(L, person(r[5])[0], src, designation="Zonal Head", phone=r[6], email=r[7], region=clean(r[4]), segments=[section])
            if clean(r[1]):
                mk(L, person(r[1])[0], src, designation="National Head", phone=r[2], email=r[3], segments=[section])
        elif mode == "flat" and clean(r[0]):
            seg = "Loan Against Property" if "Loan Against" in str(r[3]) else ("Home Loan" if "Housing" in str(r[3]) else None)
            chain = [esc("Reporting manager", r[8])]
            loc = city(r[4])
            mk(L, person(r[0])[0], src, designation=clean(r[1]), phone=r[10], email=r[9], city_=loc, region=" › ".join(x for x in (clean(r[7]), clean(r[6])) if x),
               branch=clean(r[5]), segments=[seg] if seg else [], escalation=chain, details={"Vertical": clean(r[2]), "Cluster": clean(r[5])})


def sheet_jio(ws, src):
    L = lender_of("Jio Credit")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    ffill(rows[1:], 0)
    for r in rows[1:]:
        loc = clean(r[2])
        lead = person(r[3])[0]
        if lead:
            chain = [esc("RSM", r[5], r[6], r[7]), esc("ZSM", r[8], r[9], r[10])]
            cy, st, _ = place_fields(loc)
            mk(L, lead, src, designation="Pan-India leader", phone=r[4], city_=cy, state=st,
               region=" › ".join(x for x in (clean(r[0]), loc) if x), coverage=[cy] if cy else [], escalation=chain)
            for e, role in zip(chain, ("RSM", "ZSM")):
                if e and (e["phone"] or e["email"]):
                    mk(L, e["name"], src, designation=role, phone=e["phone"], email=e["email"], region=clean(r[0]))
        side = clean(r[12]) if len(r) > 12 else None
        if side:
            m = re.match(r"^(BH|PH|NSM)\s*-\s*(.+?)\s*-\s*(\S+@\S+)$", side)
            if m:
                role = {"BH": "Business Head", "PH": "Product Head", "NSM": "National Sales Manager"}[m.group(1)]
                prod = ROW_PRODUCT.get(r[12]) or JIO_SECTION[0]
                mk(L, person(m.group(2))[0], src, designation=role, email=m.group(3), segments=[JIO_SECTION[0]] if JIO_SECTION[0] else [])
            elif side.rstrip(":").upper() in ("LAP", "HL"):
                JIO_SECTION[0] = "Loan Against Property" if side.upper().startswith("LAP") else "Home Loan"


JIO_SECTION = [None]
ROW_PRODUCT = {}


def sheet_sib(ws, src):
    L = fixed_lender("South Indian Bank", BANK)
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    last = None
    zone_mode = False
    for i, r in enumerate(rows[1:], start=1):
        n, loc, mob = clean(r[1]), clean(r[2]), r[3]
        if n and n.lower().startswith("reporting authorities"):
            zone_mode = True
            continue
        if not n and mob and last is not None and not zone_mode:
            last["altPhone"] = last["altPhone"] or (phones(mob) or [None])[0]
            continue
        if zone_mode:
            if loc and loc.startswith("(") and last is not None:
                last["region"] = (last["region"] or "") + " " + loc.strip("() ")
                last["coverage"] = split_places(re.sub(r"^Regions?:\s*", "", loc.strip("() "), flags=re.I))
                continue
        if not n or not mob:
            continue
        nm, _ = person(n)
        if zone_mode:
            last = mk(L, nm, src, designation=loc, phone=mob, region=loc)
        else:
            sm = loc and loc.upper().startswith("SM-")
            last = mk(L, nm, src, designation="Sales Manager" if sm else None, phone=mob, city_=city(loc.split("-", 1)[1] if sm else loc))


def sheet_pnb_hfc(ws, src):
    L = lender_of("PNB Housing")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "branch head name"))
        if not nm:
            continue
        br = city(g(d, "branch"))
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "contact no."), email=g(d, "email id"), city_=br, coverage=[br],
           region=" › ".join(x for x in (g(d, "zone"), g(d, "region")) if x), details={"Market": g(d, "prime/ emerging flag")})


def sheet_fedfina(ws, src):
    L = lender_of("Fedbank Financial Services")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "contact person"))
        if not nm:
            continue
        places = split_places(g(d, "location"))
        mk(L, nm, src, designation=g(d, "designation"), phone=g(d, "contact number"), city_=places[0] if places else None,
           region=g(d, "vertical"), coverage=places)


def sheet_aadhar(ws, src):
    L = lender_of("Aadhar Housing")
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    for r in rows[1:]:
        nm, _ = person(r[1])
        if nm:
            mk(L, nm, src, designation=clean(r[2]), phone=r[3], city_=city(r[0]), region=f"{city(r[0])} cluster")
    state = None
    blocked, nonserv = [], []
    for r in rows[1:]:
        if clean(r[5]):
            state = clean(r[5])
        b = clean(r[6])
        if not b:
            continue
        flag = clean(r[7])
        bm = person(r[8])[0]
        BRANCHES.append({"lender": L, "name": smart_title(b), "city": city(b), "state": state, "region": None, "zone": None, "area": None,
                         "dsaSourcing": flag, "details": {"Branch manager": bm, "Branch manager phone": (phones(r[9]) or [None])[0]}, "source": src})
        if bm:
            mk(L, bm, src, designation="Branch Manager", phone=r[9], city_=city(b), state=state, branch=smart_title(b),
               details={"DSA sourcing": flag})
        if flag and flag.lower().startswith("not"):
            blocked.append(smart_title(b))
        elif flag and "serviceable" in flag.lower():
            nonserv.append(smart_title(b))
    if blocked:
        LENDER_NOTES[L].append("DSA sourcing not allowed at: " + ", ".join(blocked) + ".")
    if nonserv:
        LENDER_NOTES[L].append("Non-serviceable branches: " + ", ".join(nonserv) + ".")


def sheet_iifl_samasta(ws, src):
    L = fixed_lender("IIFL Samasta Finance")
    for d in dict_rows(ws):
        nm, _ = person(g(d, "csm name"))
        br = smart_title(g(d, "branch name") or "")
        chain = [esc("SSM", g(d, "ssm name"), g(d, "ssm contact no"), g(d, "ssm mail id")),
                 esc("ZSM", g(d, "zsm name"), g(d, "zsm contact no"), g(d, "zsm mail id"))]
        if nm:
            mk(L, nm, src, designation="CSM", phone=g(d, "csm contact no"), email=g(d, "csm mail id"), city_=city(br), branch=br, coverage=[br],
               region=" › ".join(x for x in (g(d, "revised zone"), g(d, "revised state"), g(d, "revised clsuter")) if x), employee_code=g(d, "csm emp id"),
               escalation=chain, details={"Branch code": g(d, "branch code")})
        for e, role in zip(chain, ("SSM", "ZSM")):
            if e and (e["phone"] or e["email"]):
                mk(L, e["name"], src, designation=role, phone=e["phone"], email=e["email"], region=g(d, "revised zone"))


SPOC_HANDLERS = {
    "KRAZYBEE": sheet_krazybee,
    "BOI NORTH ZONE BRANCH HEAD": lambda ws, s: sheet_boi(ws, s),
    "BOI NORTH ZONE ADMIN INCHARGE": lambda ws, s: sheet_boi(ws, s, "Admin In-charge (second line)"),
    "BOI NORTH ZONE CREDIT INCHARGE": lambda ws, s: sheet_boi(ws, s, "Credit In-charge (second line)"),
    "CAPRI GLOBAL": sheet_capri, "HERO HFC": sheet_hero_hfc, "AGRIM": sheet_agrim, "AMBIT": sheet_ambit, "Sitara Hsg": sheet_sitara,
    "Utkarsh Small HL": sheet_utkarsh, "IDFC First Bank LAP": sheet_idfc_lap, "CAPITAL INDIA": sheet_capital_india,
    "PNB HOUSING-Roshni": sheet_pnb_roshni, "KIFS": sheet_kifs, "CHOLA": sheet_chola, "SMFG INDIA": sheet_smfg,
    "RAMKRISHNA": sheet_ramkrishna, "DEUTSCHE": sheet_deutsche, "EASY HOME FINANCE": sheet_easy, "KOTAK AGRI SME": sheet_kotak_agri,
    "HERO HFL": sheet_hero_hfl, "UNION BANK OF INDIA (MUMBAI)": sheet_union, "FEDERAL": sheet_federal, "L & T (MUMBAI)": sheet_lt,
    "TATA CAPITAL (MUMBAI)": sheet_tata, "KOTAK WC": sheet_kotak_wc, "PIRAMAL": sheet_piramal, "JIO CREDIT": sheet_jio,
    "SOUTH INDIAN BANK": sheet_sib, "PNB HFC": sheet_pnb_hfc, "FED FINA": sheet_fedfina, "AADHAR": sheet_aadhar,
    "IIFL SAMASTA": sheet_iifl_samasta,
}


# =============================================================================================================
# merge people who appear on several sheets
# =============================================================================================================
def key_of(c):
    if c["phone"]:
        return (c["lender"], "p", c["phone"])
    if c["email"]:
        return (c["lender"], "e", c["email"])
    return (c["lender"], "n", c["name"].lower(), (c["city"] or "").lower())


def better_name(a, b):
    return a if len(a) >= len(b) else b


STATE_FIX = {
    "UP": "Uttar Pradesh", "RJ": "Rajasthan", "MP": "Madhya Pradesh", "MH": "Maharashtra", "GJ": "Gujarat", "DL": "Delhi", "UK": "Uttarakhand",
    "HR": "Haryana", "CG": "Chhattisgarh", "DELHI/NCR": "Delhi", "WEST MAHA": "Maharashtra", "VIDHARBHA": "Maharashtra", "MMR": "Maharashtra",
    "MUMBAI": "Maharashtra", "TAMILNADU": "Tamil Nadu", "TELANGANA & AP": None, "UP/UK": None,
}


def tidy_places(c):
    st = c["state"]
    if st and st.upper() in STATE_FIX:
        fixed = STATE_FIX[st.upper()]
        if st not in (c["region"] or "") and st.upper() in ("WEST MAHA", "VIDHARBHA", "MMR", "UP/UK"):
            c["region"] = " › ".join(x for x in (c["region"], st) if x)
        c["state"] = fixed
    cy = c["city"]
    if cy:
        m = re.match(r"^(.+?)\s*\((.+)\)$", cy)
        if m:
            outer = city(m.group(2))
            if outer in CITY_STATE:
                c["city"], c["branch"] = outer, c["branch"] or m.group(1).strip()
            else:
                c["city"], c["branch"] = city(m.group(1)), c["branch"] or m.group(2).strip()


def merge(recs):
    out = {}
    for c in recs:
        k = key_of(c)
        if k not in out:
            out[k] = json.loads(json.dumps(c))
            continue
        m = out[k]
        m["name"] = better_name(m["name"], c["name"])
        for f in ("designation", "altPhone", "email", "city", "state", "region", "branch", "employeeCode"):
            if not m[f] and c[f]:
                m[f] = c[f]
        m["segments"] = uniq(m["segments"] + c["segments"])
        m["coverage"] = uniq(m["coverage"] + c["coverage"])
        seen = {(e["name"], e["role"]) for e in m["escalation"]}
        for e in c["escalation"]:
            if (e["name"], e["role"]) not in seen:
                m["escalation"].append(e)
                seen.add((e["name"], e["role"]))
        for dk, dv in c["details"].items():
            m["details"].setdefault(dk, dv)
        if c["notes"] and c["notes"] not in (m["notes"] or ""):
            m["notes"] = " ".join(filter(None, [m["notes"], c["notes"]]))
        if c["kind"] == "RELATIONSHIP":
            m["kind"] = "RELATIONSHIP"
        m["active"] = m["active"] or c["active"]
        m["sources"] = uniq(m["sources"] + c["sources"])
    res = [m for m in out.values() if not re.match(r"^TBR\b", m["name"])]
    for m in res:
        tidy_places(m)
        if m["city"] and m["city"] not in m["coverage"]:
            m["coverage"].insert(0, m["city"])
        if m["branch"] and m["branch"] not in m["coverage"]:
            m["coverage"].append(m["branch"])
        if not m["state"] and m["city"]:
            m["state"] = CITY_STATE.get(m["city"])
    return res


def main(folder, outp):
    files = {k: [f for f in glob.glob(os.path.join(folder, "*.xlsx")) if k in os.path.basename(f)][0]
             for k in ("BL & PL", "Code & Payout", "BANK-SPOC", "SECURED PAN")}
    wb = openpyxl.load_workbook(files["BL & PL"], data_only=True)
    banker_list(wb, "BL & PL - BANKER LIST")
    code_sheet(openpyxl.load_workbook(files["Code & Payout"], data_only=False), "Code & Payout")
    secured(openpyxl.load_workbook(files["SECURED PAN"], data_only=True), "SECURED PAN INDIA BANKER'S LIST July'26")
    wb = openpyxl.load_workbook(files["BANK-SPOC"], data_only=True)
    for ws in wb.worksheets:
        h = SPOC_HANDLERS.get(ws.title.strip())
        if h:
            h(ws, f"Pan India BANK-SPOC LIST › {ws.title.strip()}")
        elif ws.title.strip() != "Sheet1":
            REVIEW.append(f"No handler for sheet {ws.title!r}")
    merged = merge(CONTACTS)
    lenders = {}
    for c in merged:
        lenders.setdefault(c["lender"], LENDER_TYPES.get(c["lender"], NBFC))
    for c in CODES:
        lenders.setdefault(c["lender"], LENDER_TYPES.get(c["lender"], NBFC))
    for b in BRANCHES:
        lenders.setdefault(b["lender"], LENDER_TYPES.get(b["lender"], NBFC))
    json.dump({"lenders": [{"name": n, "type": t, "notes": " ".join(LENDER_NOTES.get(n, [])) or None} for n, t in sorted(lenders.items())],
               "contacts": merged, "codes": CODES, "branches": BRANCHES, "review": REVIEW},
              open(outp, "w"), indent=1, ensure_ascii=False)
    print(f"{len(CONTACTS)} raw rows -> {len(merged)} people; {len(CODES)} codes; {len(BRANCHES)} branches; {len(lenders)} lenders")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
