---
title: "Dual LiDAR Performer Tracking"
client: "VTPro Design"
year: 2024
role: "Creative Technologist / Systems Architect"
tags: ["TouchDesigner", "LiDAR", "Live Production", "Python", "GLSL"]
summary: "Real-time performer tracking system using dual Orbbec SL450 LiDAR sensors for a large-format live stage production. Solved IP conflict, coordinate space calibration, and blob deduplication across overlapping sensor zones."
featured: true
color: "#00FFB2"
media:
  - type: image
    src: /media/lidar-stage.jpg
    alt: "LiDAR sensor coverage diagram overlaid on stage plot"
  - type: video
    src: /media/lidar-demo.mp4
    poster: /media/lidar-poster.jpg
---

Two Orbbec SL450 sensors mounted front-of-house, each covering half of a 40-foot stage with overlapping detection zones in the center. The challenge: both sensors ship with the same default IP (`192.168.1.100`), requiring physical network isolation during initial config, then reassignment to a shared subnet.

Point cloud data streams over UDP port 2228 as binary blobs. I built a Python middleware layer in TouchDesigner that deserializes the binary format, projects each sensor's local coordinate space into a shared stage coordinate system via a calibration matrix derived from known reference points, then runs a deduplication pass across the overlap zone using proximity clustering.

The output drives a GLSL POP particle system — performers become attractor points for a field of reactive particles rendered in real-time on a 47-foot LED wall.
