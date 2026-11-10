# 0.9.1: Monomachine host Stop and Play (B-210)

What changes for a user of the Monomachine Editor in a DAW:

- The host's Stop leaves the machine stopped, and LOAD SONG works after it. The page's toast says the song is the machine's
  only after the machine shows it; while the machine is paused by the editor, LOAD SONG is refused.
- The host's Play after the host's Stop is always MIDI Start, so a song just loaded plays from its first row.
- **Decision (Radek, 2026-11-10):** a seek then Play starts the Monomachine from the start. DAW sync after a seek is given up
  for a sure stop. (Before: after a seek, Play sent the song position and Continue, and the machine joined at the host's
  position.) A jump while the host plays (a loop) is unchanged: Stop, song position, Continue.
- The Machinedrum is unchanged.

Proof: `mmHostStopSongFirmwareTest`, `mmHostStopFirmwareTest`, `midiClockTimingTest` (startsAfterStop),
`mdTransportFirmwareTest_mm` section 4, journey `mm-host-stop-song`.
