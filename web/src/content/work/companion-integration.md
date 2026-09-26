---
title: "TouchDesigner ↔ Bitfocus Companion Integration"
client: "VTPro Design"
year: 2024
role: "Software Engineer"
tags: ["TouchDesigner", "OSC", "Python", "Bitfocus Companion", "Live Production"]
summary: "Bidirectional OSC bridge between TouchDesigner and Bitfocus Companion, with programmatic config generation from a TD cue list — eliminating manual button programming for large shows."
featured: false
color: "#C8FF00"
media:
  - type: image
    src: /media/companion-config.jpg
    alt: "Bitfocus Companion button grid configured for live show"
---

For large live productions, manually programming a Companion button grid for every cue is error-prone and slow. This system generates the entire `.companionconfig` JSON from a TouchDesigner cue list — buttons, actions, feedback states, page layout — so the control surface is always in sync with the show file.

Bidirectional OSC handles runtime communication: Companion sends cue triggers to TD, TD sends state back (active cue, system health, timecode) to drive button feedback colors and labels.

The Python layer in TD serializes the cue table into Companion's config schema, handling page/bank/button addressing math automatically. A full 200-cue show can be regenerated and hot-loaded in under two seconds.
