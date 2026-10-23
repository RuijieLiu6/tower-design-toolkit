# modules / P10: research log

## research: draft saved as `research_P10.json`
  - R1: Replaced the assumed 12-storey BC mass-timber cap with 18 storeys / 76 m (VBBL RTS 16367 Table 3.2.2.91, BCBC 2024 Rev. 1) and kept NBC 2020's 12 storeys as the national baseline (flagged FALSE_ASSUMPTION).
  - R1: Replaced NBC 2015 / VBBL 2019 Vancouver Sa(0.2) = 0.85 g with NBC 2020 X450 values (Table J-2: 1.1, 0.77, 0.44, 0.27, 0.075, 0.033 g; PGA 0.46 g) and recorded that new VBBL seismic rules apply from 15 Sep 2026.
  - R1: Took wind-sensitivity thresholds directly from NBC 2020 4.1.7.1-4.1.7.2 (60 m, H/w 4 and 6, 1 Hz and 0.25 Hz, CFD prohibited) instead of generic slenderness rules of thumb.
  - R1: Took acceleration criteria from NBC Commentary I (1.5-2.5% g 10-year; ISO 10137 1-year curves; damping 0.01 / 0.015 / 0.02) and added its worked example as a unit test.
  - R1: Added SC4 SFRS height restrictions, static-method limits, Ta formulas, irregularity thresholds (130%, 150%, 1.7) and the SFRS equivalence route from NBC 2020 Vol. 1 and Commentary J.
  - R1: Flagged OpenSees / OpenSeesPy licence terms as incompatible with a hosted open-source service; kept PyNite and sectionproperties (MIT) as the default libraries.
  - R1: Marked system-height envelopes, core ratio, net-to-gross, super-slender band and quantity benchmarks as team assumptions because no accessible primary source existed.
  - R1: Corrected organisation naming: CTBUH is now the Council on Vertical Urbanism (verticalurbanism.org).
