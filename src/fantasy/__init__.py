# -*- coding: utf-8 -*-
"""Basketbol fantezi modülü (Yahoo formatları). Plan: docs/FANTASY_PLAN.md.

Faz 0 bileşenleri:
  fetch.py      — maç logları (son sezonlar) + 2026-27 kadroları
  calendar.py   — 2026-27 fikstüründen fantezi hafta takvimi
  positions.py  — Yahoo tarzı pozisyon uygunluğu (PG/SG/SF/PF/C)
  scoring.py    — maç başı fantezi puanı (points / high score formatları)
  build.py      — hepsini sırayla çalıştıran giriş noktası
"""
