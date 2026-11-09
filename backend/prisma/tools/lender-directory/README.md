# Lender directory extractor

Turns the client's banker workbooks into `../../lender-directory-data.json`, which `seed-lender-directory.ts` loads.

```bash
python3 -m venv .venv && .venv/bin/pip install openpyxl
.venv/bin/python extract.py ~/Downloads /tmp/directory.json
```

The folder must hold the four workbooks (matched by name): *BL & PL - BANKER LIST*, *Code & Payout*, *BANK-SPOC LIST* and *SECURED PAN INDIA BANKER'S LIST*.
Then drop the `review` key and slim empty fields (see how the data file was produced) before replacing the JSON.

Rules the extractor applies: lender spellings are mapped to one name (`lib.py`, `RULES`); numbers ending in `000000` are treated as
incomplete and kept out of the phone field; people on several sheets are merged by phone, then e-mail, then name + city;
`NA` / `-` / `0` cells are ignored; "TBR" (to be recruited) rows are dropped. The "BL - List of Bank and RM Name" workbook is *not*
read here — it was loaded earlier from `../../lender-contacts-data.ts`.
