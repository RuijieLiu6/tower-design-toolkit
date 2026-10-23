"""Wind rose for the pedestrian wind screen (research P03-M01, reduced): ECCC hourly CSVs for Vancouver Intl A
(climate ID 1108395, station 51442), downloaded from the ECCC bulk-data endpoint into context-data/raw/eccc-wind-2026/.

Rules from research P03-M01 r3:
- calm = speed 0 whatever the direction field holds (the CSV leaves it empty); kept in every denominator;
- direction empty with speed above 0 goes to a 'variable' class, also kept in the denominator;
- each 10-degree direction code is spread over the 16 sectors of 22.5 degrees by overlap (team choice);
- directions are true north (ECCC); times are LST (UTC-8), the comfort window is 06:00-23:00 LST (team choice: the
  analog guides give the hours without a time zone); seasons May-Oct and Nov-Apr (Hamilton 2026, RWDI);
- station wind at 10 m at the airport, no exposure transfer to the site (that is the rest of M01, roadmap).

Usage: python -I tools/build_wind_rose.py <raw dir> <out json>
"""
import csv, glob, json, os, sys

EDGES = [10, 20, 30, 40]  # km/h: bins 1-9, 10-19, 20-29, 30-39, 40+


def overlap(lo1, hi1, lo2, hi2):
    return max(0.0, min(hi1, hi2) - max(lo1, lo2))


def spread(deg):
    """Fractions of a 10-degree code centred on deg over the 16 sectors."""
    out = [0.0] * 16
    lo, hi = deg - 5, deg + 5
    for k in range(16):
        c = k * 22.5
        for shift in (-360, 0, 360):
            out[k] += overlap(lo, hi, c - 11.25 + shift, c + 11.25 + shift) / 10
    return out


def main(raw, out_path):
    files = sorted(glob.glob(os.path.join(raw, '*.csv')))
    blank = lambda: {'hours': 0, 'calm': 0, 'variable': 0, 'bins': [[0.0] * (len(EDGES) + 1) for _ in range(16)]}
    acc = {(s, w): blank() for s in ('summer', 'winter', 'year') for w in ('comfort', 'all')}
    years, rows, missing = set(), 0, 0
    for f in files:
        with open(f, encoding='utf-8-sig', newline='') as fh:
            for r in csv.DictReader(fh):
                rows += 1
                spd, d = (r.get('Wind Spd (km/h)') or '').strip(), (r.get('Wind Dir (10s deg)') or '').strip()
                if spd == '':
                    missing += 1
                    continue
                v = float(spd)
                y, m, hh = int(r['Year']), int(r['Month']), int(r['Time (LST)'][:2])
                years.add(y)
                season = 'summer' if 5 <= m <= 10 else 'winter'
                windows = ['all'] + (['comfort'] if 6 <= hh <= 23 else [])
                b = sum(v >= e for e in EDGES)
                for s in (season, 'year'):
                    for w in windows:
                        a = acc[(s, w)]
                        a['hours'] += 1
                        if v == 0:
                            a['calm'] += 1
                        elif d == '':
                            a['variable'] += 1
                        else:
                            for k, fr in enumerate(spread(int(d) * 10 % 360)):
                                if fr:
                                    a['bins'][k][b] += fr
    for a in acc.values():
        a['bins'] = [[round(x, 2) for x in row] for row in a['bins']]
    out = {
        'station': 'VANCOUVER INTL A', 'climateId': '1108395', 'stationId': 51442,
        'source': {'label': 'Environment and Climate Change Canada, historical hourly climate data (bulk CSV), Vancouver Intl A', 'url': 'https://climate.weather.gc.ca/climate_data/bulk_data_e.html?format=csv&stationID=51442&timeframe=1', 'licence': 'Open Government Licence - Canada'},
        'years': [min(years), max(years)], 'files': len(files), 'rows': rows, 'missingSpeed': missing,
        'speedEdgesKmh': EDGES, 'sectors': 16, 'sectorDeg': 22.5, 'direction': 'from, degrees clockwise from true north',
        'comfortWindow': '06:00-23:00 LST (team choice)', 'seasons': {'summer': 'May-Oct', 'winter': 'Nov-Apr'},
        'notes': 'Airport anemometer at 10 m, hourly sampled 2-minute means; calms and variable hours kept in every denominator; no exposure transfer to the site (research P03-M01 rest is roadmap). Fewer than the 30 years Toronto and Hamilton ask for.',
        'rose': {f'{s}.{w}': v for (s, w), v in acc.items()},
    }
    with open(out_path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    y = acc[('year', 'all')]
    print(f"{len(files)} files, years {min(years)}-{max(years)}, {y['hours']} populated hours, calm {y['calm'] / y['hours']:.1%}, variable {y['variable']}, missing {missing}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
