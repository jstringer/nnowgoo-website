---
title: "47-Foot LED Wall Pipeline"
client: "VTPro Design"
year: 2024
role: "Lead AV Engineer / Systems Designer"
tags: ["TouchDesigner", "Blackmagic", "LED", "SDI", "Smode"]
summary: "End-to-end video pipeline for a 47×6 foot LED wall at 5568×761 resolution, including a seamless test/production source switch architecture and Blackmagic Decklink 8K SDI output."
featured: true
color: "#FF4D1C"
media:
  - type: image
    src: /media/led-wall-full.jpg
    alt: "Full 47-foot LED wall in venue"
  - type: image
    src: /media/led-wall-rack.jpg
    alt: "Server rack with media server and signal routing"
---

Custom 5568×761 raster across a tiled LED wall, driven via SDI over a Blackmagic Decklink 8K Pro. The wall's unusual aspect ratio required a custom pixel-mapping configuration to prevent any processor-side scaling artifacts.

Architecture includes a source switch system that lets the team flip between a test signal generator and the live production server without touching physical cables — critical for rehearsal workflows where you need to verify sections of the wall independently before going to full production signal.

TouchDesigner handles the compositing layer, with Smode as the media server for pre-rendered content playback synced to LTC timecode on RME Babyface Pro channel 4.
