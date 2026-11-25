import io
p = "flyer-fill.ts"
s = io.open(p, encoding="utf-8", newline="").read()
def rep(a, b):
    global s
    assert a in s, a[:60]
    s = s.replace(a, b, 1)
rep('    if (/turnover|rent|land value|\bgross\b/i.test(`${m[0]}`)) continue;\n',
    '    if (/turnover|rent|land value|\bgross\b/i.test(`${m[0]}`)) continue;\n    // "Low LTV" names a special program with its own, tighter share.\n    if (/low\s*$/i.test(text.slice(Math.max(0, m.index! - 6), m.index!))) continue;\n')
rep('  const ok = within(found, 30, 90);', '  // Below 50% is a special program or a land or industrial case, not the lender\'s usual share.\n  const ok = within(found, 50, 90);')
rep('/** The share of income that may go to EMIs. Figures over 100% (a lender\'s special programs) are not the usual rule. */', '/** The share of income that may go to EMIs. Figures over 80% belong to special programs (banking, bureau), not the usual rule. */')
rep('  const ok = within(found, 40, 100);', '  const ok = within(found, 40, 80);')
io.open(p, "w", encoding="utf-8", newline="").write(s)
