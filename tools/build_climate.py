"""Washington climate for duct energy savings, from NOAA 1991-2020 U.S. Climate Normals.

Writes research/wa-climate-verified.json (the record) and app/src/data/waClimate.ts.
    python3 tools/build_climate.py
NOAA downloads are cached in tools/.cache/noaa (public data; fetched when missing).

Per station: the normal temperature for every hour of the day in every month (12 x 24,
averaged over the month's days from the hourly normals), monthly heating degree days
(base 65 F) and the annual mean. Each county uses the nearest station that publishes
hourly normals.
"""
import json, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools/.cache/noaa"
API = "https://www.ncei.noaa.gov/access/services/data/v1"

STATIONS = {
    "USW00024233": "Seattle-Tacoma Intl",
    "USW00024227": "Olympia",
    "USW00024217": "Bellingham Intl",
    "USW00094240": "Quillayute (coast)",
    "USW00024229": "Portland Intl, OR",
    "USW00094239": "Wenatchee Pangborn",
    "USW00024243": "Yakima",
    "USW00024160": "Walla Walla",
    "USW00024157": "Spokane Intl",
}
# Nearest station with hourly normals (Tri-Cities and Ellensburg publish none).
COUNTY = {
    "King": "USW00024233", "Pierce": "USW00024233", "Snohomish": "USW00024233", "Kitsap": "USW00024233", "Island": "USW00024233",
    "Thurston": "USW00024227", "Mason": "USW00024227", "Lewis": "USW00024227",
    "Whatcom": "USW00024217", "Skagit": "USW00024217", "San Juan": "USW00024217",
    "Clallam": "USW00094240", "Jefferson": "USW00094240", "Grays Harbor": "USW00094240", "Pacific": "USW00094240",
    "Clark": "USW00024229", "Cowlitz": "USW00024229", "Wahkiakum": "USW00024229", "Skamania": "USW00024229",
    "Chelan": "USW00094239", "Douglas": "USW00094239", "Okanogan": "USW00094239", "Grant": "USW00094239",
    "Yakima": "USW00024243", "Kittitas": "USW00024243", "Klickitat": "USW00024243",
    "Walla Walla": "USW00024160", "Benton": "USW00024160", "Franklin": "USW00024160", "Columbia": "USW00024160", "Garfield": "USW00024160", "Asotin": "USW00024160",
    "Spokane": "USW00024157", "Stevens": "USW00024157", "Pend Oreille": "USW00024157", "Ferry": "USW00024157", "Lincoln": "USW00024157", "Whitman": "USW00024157", "Adams": "USW00024157",
}
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def fetch(name, query):
    f = CACHE / name
    if not f.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f"{API}?{query}", timeout=120) as r:
            f.write_bytes(r.read())
    return json.loads(f.read_text())


def main():
    out = {}
    monthly = fetch("monthly.json", "dataset=normals-monthly-1991-2020&stations=" + ",".join(STATIONS) +
                    "&format=json&dataTypes=MLY-HTDD-NORMAL,MLY-CLDD-NORMAL,MLY-TAVG-NORMAL&startDate=0001-01-01&endDate=9996-12-31")
    for sid, name in STATIONS.items():
        hourly = fetch(f"{sid}.json", f"dataset=normals-hourly-1991-2020&stations={sid}&format=json&dataTypes=HLY-TEMP-NORMAL&startDate=0001-01-01&endDate=9996-12-31")
        sums = [[0.0] * 24 for _ in range(12)]
        counts = [[0] * 24 for _ in range(12)]
        for r in hourly:
            m, h = int(r["DATE"][0:2]) - 1, int(r["DATE"][6:8])
            sums[m][h] += float(r["HLY-TEMP-NORMAL"])
            counts[m][h] += 1
        assert all(c == DAYS[m] for m in range(12) for c in counts[m]), sid
        mh = [[round(sums[m][h] / counts[m][h], 1) for h in range(24)] for m in range(12)]
        wind = fetch(f"{sid}-wind.json", f"dataset=normals-hourly-1991-2020&stations={sid}&format=json&dataTypes=HLY-WIND-AVGSPD&startDate=0001-01-01&endDate=9996-12-31")
        ws = [[0.0] * 24 for _ in range(12)]
        wc = [[0] * 24 for _ in range(12)]
        for r in wind:
            v = r.get("HLY-WIND-AVGSPD", "").strip()
            if not v or float(v) < 0:
                continue
            m, h = int(r["DATE"][0:2]) - 1, int(r["DATE"][6:8])
            ws[m][h] += float(v)
            wc[m][h] += 1
        assert all(wc[m][h] > 0 for m in range(12) for h in range(24)), sid
        mw = [[round(ws[m][h] / wc[m][h], 1) for h in range(24)] for m in range(12)]
        rows = sorted((r for r in monthly if r["STATION"] == sid), key=lambda r: r["DATE"])
        assert len(rows) == 12, sid
        hdd = [float(r["MLY-HTDD-NORMAL"]) for r in rows]
        tavg = [float(r["MLY-TAVG-NORMAL"]) for r in rows]
        annual = round(sum(t * d for t, d in zip(tavg, DAYS)) / 365, 1)
        out[sid] = {"name": name, "annualF": annual, "hdd": hdd, "tavg": tavg, "monthHourF": mh, "monthHourWindMph": mw}

    record = {
        "dataset": "Washington outdoor temperatures for duct energy savings: NOAA 1991-2020 U.S. Climate Normals (hourly temperature normals averaged to 12 months x 24 hours; monthly heating degree days base 65 F; monthly mean temperature). Counties map to the nearest station that publishes hourly normals.",
        "generated": "2026-10-12",
        "sources": [
            {"id": "N1", "title": "U.S. Climate Normals 1991-2020: Hourly Normals (HLY-TEMP-NORMAL, HLY-WIND-AVGSPD)", "publisher": "NOAA National Centers for Environmental Information", "url": "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals", "accessed": "2026-10-12", "retrieval": f"{API}?dataset=normals-hourly-1991-2020"},
            {"id": "N2", "title": "U.S. Climate Normals 1991-2020: Monthly Normals (MLY-HTDD-NORMAL, MLY-TAVG-NORMAL)", "publisher": "NOAA National Centers for Environmental Information", "url": "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals", "accessed": "2026-10-12", "retrieval": f"{API}?dataset=normals-monthly-1991-2020"},
            {"id": "N3", "title": "Technical Background for Default Values used for Forced Air Systems in Proposed ASHRAE Standard 152P (LBNL-40588; ASHRAE Transactions 104, Pt. 1)", "publisher": "Lawrence Berkeley National Laboratory (I. S. Walker), via OSTI", "url": "https://www.osti.gov/servlets/purl/821316", "accessed": "2026-10-12", "retrieval": "curl + pdftotext",
             "quotes": ["The Heating season is December, January and February (2160 hours) and the cooling season is June through September (2928 hours).",
                        "from a base of 65°F (18°C), a heating month was assumed if there were more than 150 HDD (in °F).",
                        "Therefore, there is no differentiation between vented and unvented attics for heating conditions.",
                        "Table 2 Heating Seasonal attic-to-ambient: 0 [0], 1 [2], 2 [4], 2 [4] °C [°F]",
                        "t crawlspace ≈ (t in + 8t out)/9 (13b: uninsulated walls, insulated floor, 5 ACH vented)",
                        "A simple approach is to assume that the ground temperature is the average outdoor air temperature for the year"]},
            {"id": "N4", "title": "ASHRAE Standard 152 & Duct Leaks in Houses (ASHRAE Journal, March 2005)", "publisher": "ASHRAE Journal (M. Modera, chair of SPC 152), hosted by Aeroseal", "url": "https://aerosealtech.ca/wp-content/uploads/2015/02/Duct-Leaks-In-Houses-ASHRAE-JOURNAL.pdf", "accessed": "2026-10-12", "retrieval": "WebFetch + pdftotext",
             "quotes": ["Standard 152 temperatures for a well-vented attic are Tdesign + 22°F at design conditions, and + 13°F for seasonal efficiency calculations.",
                        "Typical regain values are 10% for a vented attic, 50% for an uninsulated basement, 75% for a basement with insulated walls"]},
        ],
        "stations": out,
        "county_station": COUNTY,
    }
    (ROOT / "research/wa-climate-verified.json").write_text(json.dumps(record, indent=1) + "\n")

    ts = ["// Generated by tools/build_climate.py from NOAA 1991-2020 U.S. Climate Normals [N1, N2]. Do not edit.",
          "export interface ClimateStation {",
          "  id: string",
          "  name: string",
          "  /** Annual mean outdoor temperature, °F. */",
          "  annualF: number",
          "  /** Heating degree days (base 65°F) by month, Jan–Dec. */",
          "  hdd: number[]",
          "  /** Normal outdoor temperature, °F, by month (Jan–Dec) and hour of day (0–23). */",
          "  monthHourF: number[][]",
          "  /** Normal wind speed, mph, measured at the airport (open ground, about 33 ft up), by month and hour. */",
          "  monthHourWindMph: number[][]",
          "}", "",
          "export const WA_STATIONS: Record<string, ClimateStation> = {"]
    for sid, st in out.items():
        ts.append(f"  {sid}: {{ id: '{sid}', name: '{st['name']}', annualF: {st['annualF']}, hdd: {json.dumps(st['hdd'])}, monthHourF: [")
        for row in st["monthHourF"]:
            ts.append(f"    {json.dumps(row)},")
        ts.append("  ], monthHourWindMph: [")
        for row in st["monthHourWindMph"]:
            ts.append(f"    {json.dumps(row)},")
        ts.append("  ] },")
    ts.append("}")
    ts.append("")
    ts.append("/** Each Washington county's nearest NOAA station with hourly normals. */")
    ts.append("export const COUNTY_STATION: Record<string, string> = " + json.dumps(COUNTY, indent=2).replace('"', "'") + "")
    ts.append("")
    (ROOT / "app/src/data/waClimate.ts").write_text("\n".join(ts))
    for sid, st in out.items():
        heat = [i + 1 for i, h in enumerate(st["hdd"]) if h > 150]
        wind = sum(sum(r) for r in st["monthHourWindMph"]) / 288
        print(f"{st['name']:24s} annual {st['annualF']:5.1f}  heating months {heat}  Jun-Sep mean {sum(st['tavg'][5:9])/4:.1f}  wind {wind:.1f} mph")


main()
