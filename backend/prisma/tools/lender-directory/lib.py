"""Shared helpers for turning the client's banker workbooks into one clean lender directory."""
import re

PLACEHOLDERS = {"", "na", "n/a", "nil", "-", "--", "---", "0", "tbh", "#n/a", "none", "tbd", "yet to join", "designation", "null", "."}


def clean(v):
    """A cell as tidy text, or None when it is empty / a placeholder such as NA, - or 0."""
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).replace("\xa0", " ").replace("​", "").strip()
    s = re.sub(r"\s+", " ", s)
    return None if s.lower() in PLACEHOLDERS else s


def phones(text):
    """Every 10-digit Indian mobile number in a cell, in order. Landlines and short codes are ignored."""
    if text is None:
        return []
    s = str(text).replace("'", " ").replace("’", " ")
    out = []
    for m in re.finditer(r"(?<!\d)(?:\+?\s?91[\s-]*)?0?([6-9](?:[\s-]?\d){9})(?!\d)", s):
        d = re.sub(r"\D", "", m.group(1))
        if len(d) == 10 and d not in out:
            out.append(d)
    return out


def landlines(text):
    """STD landlines such as 02521-230049 or 2625 6325, kept as written."""
    if text is None:
        return []
    s = str(text)
    found = []
    for m in re.finditer(r"(?<!\d)(0\d{2,4}[\s-]?\d{5,8}|\d{4}[\s-]\d{4})(?!\d)", s):
        t = m.group(1).strip()
        if not re.fullmatch(r"[6-9]\d{9}", re.sub(r"\D", "", t)):
            found.append(t)
    return found


def is_masked(number):
    """Numbers on the sheets that end in 000000 are clearly incomplete (e.g. 9717000000)."""
    return bool(number) and number.endswith("000000")


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+'\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")


def emails(text):
    """Valid e-mail addresses in a cell, lower-cased. Fixes a ',com' typo. Malformed ones (a space in the domain) are returned separately."""
    if text is None:
        return [], []
    s = str(text).replace("mailto:", " ")
    bad = []
    if "%20" in s:
        bad.append(s.strip())
        return [], bad
    s = re.sub(r",\s*com\b", ".com", s, flags=re.I)
    good = []
    for m in EMAIL_RE.finditer(s):
        e = m.group(0).strip(".'").lower()
        if e not in good:
            good.append(e)
    return good, bad


ABBREV = {
    "SM": "Sales Manager", "ASM": "Area Sales Manager", "RSM": "Regional Sales Manager", "ZSM": "Zonal Sales Manager",
    "RM": "Relationship Manager", "BM": "Branch Manager", "ABM": "Area Business Manager", "RBM": "Regional Business Manager",
    "ZBM": "Zonal Business Manager", "SSM": "Senior Sales Manager", "CSM": "Cluster Sales Manager",
}


def expand_role(role):
    if not role:
        return None
    r = role.strip(" .,-()")
    return ABBREV.get(r.upper(), r) if r else None


TITLES = re.compile(r"^(mr|mrs|ms|miss|dr|shri|smt)\.?\s+", re.I)


def smart_title(s):
    if not s:
        return s
    if s.isupper() or s.islower():
        s = s.title()
        s = re.sub(r"\b(Mc)([a-z])", lambda m: m.group(1) + m.group(2).upper(), s)
    return s


def person(raw):
    """'SHAILESH AMARE (SM)' -> ('Shailesh Amare', 'Sales Manager'). Also handles 'Surname,First' and 'first.last'."""
    s = clean(raw)
    if not s:
        return None, None
    role = None
    m = re.search(r"\(([^)]{1,40})\)\s*$", s)
    if m and not re.search(r"\d", m.group(1)):
        role = expand_role(m.group(1))
        s = s[: m.start()].strip()
    s = TITLES.sub("", s)
    s = re.sub(r"\s+sir$", "", s, flags=re.I)
    s = re.sub(r"\s*[-–]\s*$", "", s)
    if "," in s and s.count(",") == 1 and len(s.split(",")[0].split()) == 1:
        a, b = [x.strip() for x in s.split(",")]
        if b:
            s = f"{b} {a}"
    if re.fullmatch(r"[A-Za-z]+\.[A-Za-z]+", s):
        s = s.replace(".", " ")
    s = re.sub(r"\s+\.$", "", s).strip(" .,")
    return (smart_title(s) or None), role


def name_from_email(e):
    local = e.split("@")[0]
    local = re.sub(r"\d+", "", local)
    parts = [p for p in re.split(r"[._\-]+", local) if p]
    return " ".join(p.capitalize() for p in parts) if parts else None


CITY_ALIASES = {
    "AHEMDABAD": "Ahmedabad", "AHMEDABAD": "Ahmedabad", "BENGALURU": "Bangalore", "BANGALORE": "Bangalore", "BANGLORE": "Bangalore",
    "GAZIABAD": "Ghaziabad", "GHAZIABAD": "Ghaziabad", "NASIK": "Nashik", "NASHIK": "Nashik", "HYD": "Hyderabad",
    "THIRUVALA": "Thiruvalla", "KOLKATTA": "Kolkata", "KOLKATA": "Kolkata", "BARODA": "Vadodara", "VADODARA": "Vadodara",
    "SAMBHAJINAGAR": "Chhatrapati Sambhajinagar", "AURANGABAD": "Chhatrapati Sambhajinagar", "CHATTISGARH": "Chhattisgarh",
    "TRICHI": "Tiruchirappalli", "TRICHY": "Tiruchirappalli", "VELLOR": "Vellore", "NEW DELHI": "Delhi", "DELHI": "Delhi",
    "VIZAG": "Visakhapatnam", "VISHAKHAPATNAM": "Visakhapatnam", "KERELA": "Kerala", "POONA": "Pune", "BOMBAY": "Mumbai",
    "CALCUTTA": "Kolkata", "MAHABOOB NAGAR": "Mahbubnagar", "MAHBOOB NAGAR": "Mahbubnagar",
}


def city(raw):
    s = clean(raw)
    if not s:
        return None
    s = re.sub(r"\s+", " ", s.replace("\n", " ")).strip(" ,.-")
    key = s.upper()
    if key in CITY_ALIASES:
        return CITY_ALIASES[key]
    t = smart_title(s)
    return re.sub(r"\b(Ncr|Up|Ap|Tn|Mp|Rom|Uk|Hr|Pb|Rj|Hp)\b", lambda m: m.group(1).upper(), t)


def split_places(raw):
    """'Delhi/ Agra/ Gaziabad' -> ['Delhi', 'Agra', 'Ghaziabad']"""
    s = clean(raw)
    if not s:
        return []
    parts = [p for p in re.split(r"\s*[/,&]\s*|\s+and\s+", s) if p.strip()]
    return [city(p) for p in parts if city(p)]


# ---------------------------------------------------------------------------------------------------------
# Lender names. Order matters: the first rule that matches wins. (regex on the upper-cased, tidied text)
# ---------------------------------------------------------------------------------------------------------
BANK, NBFC = "BANK", "NBFC"
OTHER = "Other / unlisted"

RULES = [
    # not lenders / junk
    (r"^(NA|OTHER|DSA|DSA .*|.* DSA|TERRYTORY MANAGER|SMALL FINANCE BANK|LAP HL|INDIA CENTER HL|RTO .*|GARMSEVAK|AGRI CAMPANI|SALCE MANAGER.*|IN LED DSA.*|IN RUPI.*|NJ WEALTH|HDFC ERGO|EYE FINANCE|TRIPOLI.*|SWATNATRA MICRO|MONEYSKAT|SINGULARITY.*|NOCPL.*|BANK/NBFC NAME)$", OTHER, NBFC),
    # existing lenders first
    (r"HDFC.*SALES", "HDFC Sales", NBFC),
    (r"^HDFC|HDFC BANK|HDFC LTD", "HDFC Bank", BANK),
    (r"ICIC.*(HFC|H\.F\.C|HOME)", "ICICI Home Finance", NBFC),
    (r"ICIC", "ICICI Bank", BANK),
    (r"AXIS.*FIN", "Axis Finance", NBFC),
    (r"AXIS", "Axis Bank", BANK),
    (r"BAJAJ.*(MARKET|MARKETING)|BJAJ MARKET", "Bajaj Markets", NBFC),
    (r"BAJAJ.*(HOUS|HSG|AFFORD)|BAJAJ HOUSING", "Bajaj Housing", NBFC),
    (r"BAJAJ.*(\bHL\b|PRIM)", "Bajaj Housing", NBFC),
    (r"B?A?JAJ|BAJAJ", "Bajaj Finserv", NBFC),
    (r"KOTAK|KOTAK BANNK", "Kotak Mahindra", BANK),
    (r"YES BANK|^YES$", "Yes Bank", BANK),
    (r"STANDARD CHART|^SCB", "Standard Chartered", BANK),
    (r"HSBC", "HSBC", BANK),
    (r"IDBI", "IDBI Bank", BANK),
    (r"IDFC|INDAIN BANK IDFC", "IDFC First Bank", BANK),
    (r"PNB HOUS|PNB HSG|PNB HFC", "PNB Housing", NBFC),
    (r"^PNB|PUNJAB NATIONAL", "Punjab National Bank", BANK),
    (r"FED ?FIN|FEDBANK|FED FINANCE", "Fedbank Financial Services", NBFC),
    (r"FED|FEDERAL|FEDRAL|FEDREAL", "Federal Bank", BANK),
    (r"UNION BANK|^UBI", "Union Bank", BANK),
    (r"ADI?TH?Y?A? ?BIR|ADITH|ABFL|ADITYA BIRAL|ADITY BIRLA|AADITYA BIRLA", "Aditya Birla Capital", NBFC),
    (r"BAND?H?A?N|BANDAN", "Bandhan Bank", BANK),
    (r"BANK OF BARODA|BANK OF BORADA|^BOB$", "Bank of Baroda", BANK),
    (r"CENT(RAL)? ?BANK|^CBI$", "Central Bank of India", BANK),
    (r"STATE BANK OF INDIA|^SBI$|SBI BANK", "SBI", BANK),
    (r"BANK OF INDIA|^BOI$", "Bank of India", BANK),
    (r"RBL|RATNAKAR", "RBL Bank", BANK),
    (r"BANK OF MAHARA?SH?TRA", "Bank of Maharashtra", BANK),
    (r"A\.?\s?U\.? ?(SM|SMALL|SMAL|BANK)|AU SMF", "AU Small Finance", BANK),
    (r"AADH?H?AA?R|ADD?H?AR|ADHAR|AADHAAR", "Aadhar Housing", NBFC),
    (r"CHOLL?A|CHOLAMANDL", "Cholamandalam", NBFC),
    (r"DEUTSCH", "Deutsche Bank", BANK),
    (r"^DCB|DCB BANK", "DCB Bank", BANK),
    (r"GOD?O?R?E?J|GOODREJ|GODRAJ", "Godrej Capital", NBFC),
    (r"HERO.*(HOUS|HFL|HFC)", "Hero Housing Finance", NBFC),
    (r"HERO", "Hero FinCorp", NBFC),
    (r"INDU?S ?(IND|UND|LAND|SAND)|INDSAND|INDUSUND|INDUS LAP", "IndusInd Bank", BANK),
    (r"LIC H", "LIC HFL", NBFC),
    (r"MAHI?A?NDRA|MAHINDRA", "Mahindra Finance", NBFC),
    (r"PIRAMAL", "Piramal Finance", NBFC),
    (r"POONAWAL|PHFL", "Poonawalla Fincorp", NBFC),
    (r"SBI HOME", "SBI Home Loans", BANK),
    (r"SHRIRAM HOUS|SHRIRAM HSG|TRU ?HOME|TROUHOME|TRUE HOME", "Truhome Finance", NBFC),
    (r"SHRIRAM", "Shriram Finance", NBFC),
    # distinct group companies we list separately
    (r"TATA|TATACAPITAL", "Tata Capital", NBFC),
    (r"L ?& ?T|L AND T|LNT", "L&T Finance", NBFC),
    (r"FULLERTON|SMFG|GR[IE]H?A?SHAKTI|GIRAHSHAKTI", "Fullerton India", NBFC),
    (r"UGRO|UGROW", "UGRO Capital", NBFC),
    (r"CLIX", "Clix Capital", NBFC),
    (r"EDELW|NIDO", "Edelweiss", NBFC),
    (r"ASHV", "Ashv Finance", NBFC),
    (r"SMC", "SMC Finance", NBFC),
    (r"CREDIT SA|KISTESU|KISETU", "Credit Saison", NBFC),
    (r"AMBIT", "Ambit", NBFC),
    (r"DHANVERSHA", "Dhanversha", NBFC),
    (r"UNITY", "Unity Bank", BANK),
    (r"MAS FIN|^MASS|MAS FINANCIAL", "MAS Finance", NBFC),
    (r"ARKA", "Arka Fincap", NBFC),
    (r"PROTIUM", "Protium", NBFC),
    (r"IIFL SAMASTA", "IIFL Samasta Finance", NBFC),
    (r"IIFL|INDIA INFOLINE", "IIFL Finance", NBFC),
    (r"INDIFI", "Indifi", NBFC),
    (r"M[UO]TH?[OU]+[DT]? ?(HOUS|H\.F|HOME)|MUTHOOT HOMEFIN|MUTHUT HOME", "Muthoot Housing Finance", NBFC),
    (r"M[UO]TH?[OU]+[DT]", "Muthoot Finance", NBFC),
    (r"HDB", "HDB Financial Services", NBFC),
    (r"KRAZYBEE|KREDITBEE", "KrazyBee", NBFC),
    (r"INCRED", "InCred", NBFC),
    (r"NEOGR|NEOGROW", "NeoGrowth", NBFC),
    (r"UTKARSH", "Utkarsh", BANK),
    (r"FLEXI", "FlexiLoans", NBFC),
    (r"RATNAA?FIN", "Ratnaafin", NBFC),
    # new ones seen on the sheets
    (r"LENDINGKART|LENDING CARD", "Lendingkart", NBFC),
    (r"FINABLE|FINABALE", "Finable", NBFC),
    (r"KISSHT", "Kissht", NBFC),
    (r"^HFB$", "HFB", NBFC),
    (r"INFINA", "Infina Finance", NBFC),
    (r"CREDILA", "Credila", NBFC),
    (r"EQUITAS|EQTITAS", "Equitas Small Finance Bank", BANK),
    (r"ORIX", "ORIX Leasing & Financial Services", NBFC),
    (r"CAPRI", "Capri Global Capital", NBFC),
    (r"AGRIM", "Agrim Housing Finance", NBFC),
    (r"SITARA|SITAARA|SGR", "Sitara Housing Finance", NBFC),
    (r"CAPITAL INDIA", "Capital India Home Loans", NBFC),
    (r"KIFS", "KIFS Housing Finance", NBFC),
    (r"RAMKRISHNA", "Ramkrishna", NBFC),
    (r"EASY ?H|^EASY$", "Easy Home Finance", NBFC),
    (r"SOUTH INDIAN", "South Indian Bank", BANK),
    (r"JIO", "Jio Credit", NBFC),
    (r"AAVAS|AVAS|AAWAS", "Aavas Financiers", NBFC),
    (r"ADANI|TYGER", "Adani Housing Finance", NBFC),
    (r"ANAND ?RATHI", "Anand Rathi", NBFC),
    (r"APTUS", "Aptus Home Finance", NBFC),
    (r"BELSTAR", "Belstar Microfinance", NBFC),
    (r"BHARAT FIN", "Bharat Financial Inclusion", NBFC),
    (r"CATHOLIC|^CSB", "CSB Bank", BANK),
    (r"CENTRUM", "Centrum Housing Finance", NBFC),
    (r"CITY UNION", "City Union Bank", BANK),
    (r"^DBS|DSB BANK", "DBS Bank", BANK),
    (r"GIC H", "GIC Housing Finance", NBFC),
    (r"FIVE STAR", "Five Star Business Finance", NBFC),
    (r"HINDUJ", "Hinduja Housing Finance", NBFC),
    (r"HOME FIRST", "Home First Finance", NBFC),
    (r"INDIAN BANK|INDAIN BANK", "Indian Bank", BANK),
    (r"INDIAN OVERSEAS", "Indian Overseas Bank", BANK),
    (r"INDOSTAR", "IndoStar Capital Finance", NBFC),
    (r"INDIABULLS|INDIANBULLS|SAMM?A?N CAPITAL|SANMAN", "Sammaan Capital", NBFC),
    (r"^JM|J\.M", "JM Financial", NBFC),
    (r"JANA|JANN?A SMAL", "Jana Small Finance Bank", BANK),
    (r"JANLAXMI", "Janlaxmi Co-operative Bank", BANK),
    (r"KARNATAKA BANK", "Karnataka Bank", BANK),
    (r"KARUR|^KVB", "Karur Vysya Bank", BANK),
    (r"KOGTA", "Kogta Financial", NBFC),
    (r"MANAPPURAM|MANPURAM", "Manappuram Home Finance", NBFC),
    (r"MONEYWISE", "Moneywise Financial Services", NBFC),
    (r"MOTI?L?ALA? ?O?S?W|MOTILAL|MOTHILAL", "Motilal Oswal Home Finance", NBFC),
    (r"NAMARA", "Namara Finance", NBFC),
    (r"NIVAS|NIWAS", "Nivas Housing Finance", NBFC),
    (r"PROFECTUS", "Profectus Capital", NBFC),
    (r"RATAN INDIA", "RattanIndia Finance", NBFC),
    (r"REPCO", "Repco Home Finance", NBFC),
    (r"SARASWAT|SARSWAT", "Saraswat Co-operative Bank", BANK),
    (r"SBFC", "SBFC Finance", NBFC),
    (r"SBM BANK|STATE BANK OF MAURITIUS", "SBM Bank India", BANK),
    (r"SHINHAM|SHINHAN|SINHAN", "Shinhan Bank", BANK),
    (r"SHUBH?AM|SHUBAM", "Shubham Housing Development Finance", NBFC),
    (r"SOUTH INDIAN BANK", "South Indian Bank", BANK),
    (r"SRG", "SRG Housing Finance", NBFC),
    (r"STAR HOUSING", "Star Housing Finance", NBFC),
    (r"SUNDARAM", "Sundaram Home Finance", NBFC),
    (r"SURYODAY", "Suryoday Small Finance Bank", BANK),
    (r"SVAMAN|SAVAMAN", "Svaman Financial Services", NBFC),
    (r"SVATANTRA|SWAVTATRA|SWATANTRA", "Svatantra Microfin", NBFC),
    (r"SVC|S\.V\.C", "SVC Co-operative Bank", BANK),
    (r"SWAGAT", "Swagat Housing Finance", NBFC),
    (r"UCO", "UCO Bank", BANK),
    (r"UJ+IVAN|UJIVAN|UJJIVAN", "Ujjivan Small Finance Bank", BANK),
    (r"UNICO|UNICORN", "Unico Housing Finance", NBFC),
    (r"VASTU|VASTHU", "Vastu Housing Finance", NBFC),
    (r"VRIDHI", "Vridhi Home Finance", NBFC),
    (r"DHANMUDRA", "Dhanmudra Urban Co-operative Bank", BANK),
    (r"A\.?V\.? BANK|^A V BANK", "A.V. Bank", BANK),
    (r"ITI FIN", "ITI Finance", NBFC),
    (r"GRAMIN", "Gramin (Kota) Finance", NBFC),
    (r"GREEN HOUSING|GEEN FIN|MICRO GREEN", "Green Housing Finance", NBFC),
    (r"SARASWATH", "Saraswat Co-operative Bank", BANK),
    (r"ASHIRWAD", "Ashirwad Finance", NBFC),
    (r"AVANASE", "Avanse Financial Services", NBFC),
    (r"BERAR", "Berar Finance", NBFC),
    (r"CHANAPATNA|ADVAITH|ARVENTO", OTHER, NBFC),
    (r"FINANCE", None, NBFC),   # unknown "... Finance": handled by the caller (kept under its own cleaned name)
]
_COMPILED = [(re.compile(p), name, typ) for p, name, typ in RULES]

NOISE = re.compile(r"\b(LTD|LIMITED|PVT|PRIVATE|CO|COMPANY|NANDED|SM|RM|ASM|RSM|BSM|HL AND LAP|HL & LAP|LAP AND HL|LAP|HL|PRIME|AFFORDABLE|AFFORDALE|BASMAT|KHAR RD|CLUSTER HEAD)\b|[()\"']")


def tidy_bank(raw):
    s = clean(raw)
    if not s:
        return None
    s = s.replace("\n", " ").upper()
    s = re.sub(r"\s+", " ", s).strip(" .,-\"'")
    return s


def canon(raw):
    """(canonical lender name, 'BANK'|'NBFC', original text) for any spelling found on the sheets."""
    s = tidy_bank(raw)
    if not s:
        return None, None, None
    for rx, name, typ in _COMPILED:
        if rx.search(s):
            if name is None:
                base = re.sub(r"\s+", " ", NOISE.sub(" ", s)).strip().title()
                return base or OTHER, typ, raw
            return name, typ, raw
    base = re.sub(r"\s+", " ", NOISE.sub(" ", s)).strip().title()
    return (base or OTHER), NBFC, raw


# ---------------------------------------------------------------------------------------------------------
# Loan types ("Product / Segment" on the sheets)
# ---------------------------------------------------------------------------------------------------------
def segments_from(text):
    """Map 'HL/LAP', 'LAP & OD', 'PL/BL' ... to the CRM's loan-type names. Returns (segments, qualifier)."""
    s = clean(text)
    if not s:
        return [], None
    u = s.upper()
    out = []

    def add(x):
        if x not in out:
            out.append(x)

    if re.search(r"ALL( PRODUCTS)?$", u):
        for x in ("Home Loan", "Loan Against Property"):
            add(x)
    if re.search(r"\bHL\b|HOUSING|\bHL[ ,.+/&]|HL\+|HL-|HL ASHA", u) or u.startswith("HL"):
        add("Home Loan")
    if re.search(r"LAP|STLAP|HAL", u) and "MICRO LAP" not in u:
        add("Loan Against Property")
    if "MICRO LAP" in u or "MICRO HL" in u:
        add("Micro Loan Against Property")
        if "MICRO HL" in u:
            add("Home Loan")
    if re.search(r"(?<![A-Z])PL(?![A-Z])|UBL|PERSONAL", u):
        add("Personal Loan")
    if re.search(r"(?<![A-Z])[SU]?BL(?![A-Z])|BUSINESS|SME", u) and "BLSE" not in u:
        add("Small Business Loan" if "SBL" in u or "SME" in u else "Business Loan")
    if re.search(r"(?<![A-Z])D?OD(?![A-Z])|DOD|OVERDRAFT", u):
        add("Overdraft")
    if re.search(r"(?<![A-Z])WC(?![A-Z])", u):
        add("Working Capital")
    if re.search(r"CAR LOAN|(?<![A-Z])AL(?![A-Z])", u):
        add("Car Loan")
    if re.search(r"(?<![A-Z])EL(?![A-Z])", u):
        add("Education Loan")
    if re.search(r"(?<![A-Z])CL(?![A-Z])", u):
        add("Commercial Loan")
    if "KCC" in u or "AGRI" in u:
        add("Agri Loan")
    if "SOLAR" in u:
        add("Solar Loan")
    qual = []
    if re.search(r"PRIME", u):
        qual.append("Prime")
    if re.search(r"AFF", u):
        qual.append("Affordable")
    return out, ("/".join(qual) or None)


def uniq(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out
